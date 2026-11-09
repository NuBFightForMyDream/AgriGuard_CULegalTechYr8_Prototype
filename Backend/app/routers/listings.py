import uuid
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from app.catalog import PRODUCTS
from app.deps import DB, CurrentUser, get_or_404, next_code, require_role
from app.models import AllocationItem, AllocationPlan, Farm, Offer, ProduceListing, PurchaseRequest
from app.schemas import AllocationConfirm, AllocationPreview, ListingCreate, ShortfallIn
from app.services import amendments as amend
from app.services import allocation, matching
from app.services.standards import grades_for
from app.services.matching import distance_km
from app.services.contracts import create_contract
from app.services.inventory import expire_reservations, listing_inventory
from app.services.orders import audit
from app.views import TrustCache, contract_brief, listing_out, offer_out, request_out, top_price

router = APIRouter(prefix="/listings", tags=["listings"])


def _own_listing(db, user, listing_id: uuid.UUID) -> ProduceListing:
    listing = get_or_404(db, ProduceListing, listing_id, "ประกาศผลผลิต")
    if user.role == "FARMER" and listing.farm.organization_id != user.organization_id:
        raise HTTPException(403, "ประกาศนี้ไม่ใช่ของสวนคุณ")
    return listing


@router.get("")
def list_listings(db: DB, user: CurrentUser):
    expire_reservations(db)
    q = select(ProduceListing).join(Farm).order_by(ProduceListing.harvest_start)
    if user.role == "FARMER":
        q = q.where(Farm.organization_id == user.organization_id)
    return [listing_out(listing) for listing in db.scalars(q)]


@router.post("", status_code=201)
def create_listing(payload: ListingCreate, db: DB, user: CurrentUser):
    require_role(user, "FARMER")
    farm = db.scalars(select(Farm).where(Farm.organization_id == user.organization_id)).first()
    if farm is None:
        raise HTTPException(409, "ยังไม่มีข้อมูลสวน")
    allowed = grades_for(db, payload.product_type)
    if not set(payload.expected_grades) <= set(allowed):
        raise HTTPException(422, f"เกรดของ{PRODUCTS[payload.product_type]['th']}ต้องเป็น {', '.join(allowed)}")
    listing = ProduceListing(
        code=next_code(db, ProduceListing, f"PL-{date.today().year}-"),
        farm_id=farm.id,
        **payload.model_dump(),
    )
    db.add(listing)
    db.flush()
    audit(db, entity_type="listing", entity_id=listing.id, entity_code=listing.code, action="LISTING_CREATED",
          actor=user, farmer_org_id=user.organization_id,
          message=f"ลงประกาศผลผลิต {listing.estimated_qty_kg:,.0f} กก. (ประมาณการ)")
    db.commit()
    db.refresh(listing)
    return listing_out(listing)


@router.get("/{listing_id}")
def get_listing(listing_id: uuid.UUID, db: DB, user: CurrentUser):
    expire_reservations(db)
    listing = _own_listing(db, user, listing_id)
    trusts = TrustCache(db)
    offers = listing.offers if user.role != "BUYER" else [o for o in listing.offers if o.buyer_org_id == user.organization_id]
    out = listing_out(listing)
    out["offers"] = [offer_out(o, trusts) for o in sorted(offers, key=lambda o: o.created_at)]
    out["contracts"] = [contract_brief(c) for c in listing.contracts] if user.role != "BUYER" else []
    return out


def _demands(db, listing: ProduceListing) -> list[allocation.OfferDemand]:
    trusts = TrustCache(db)
    out = []
    for o in listing.offers:
        if o.status != "PENDING":
            continue
        destination = o.purchase_request.destination_province if o.purchase_request else (o.buyer_org.province or "")
        out.append(allocation.OfferDemand(
            offer_id=str(o.id), quantity_kg=o.quantity_kg, min_quantity_kg=o.min_quantity_kg,
            price=Decimal(str(top_price(o))),
            logistics_cost=allocation.logistics_cost(distance_km(listing.farm.province, destination)),
            trust_band=trusts.summary(o.buyer_org_id)["band"], label=o.buyer_org.name,
        ))
    return out


def _plan(db, listing: ProduceListing, strategy: str, items_in):
    demands = _demands(db, listing)
    available = listing_inventory(listing)["available_kg"]
    warnings: list[str] = []
    if strategy == "PROPORTIONAL":
        items, warnings = allocation.proportional(available, demands)
    elif strategy in ("MAX_NET_REVENUE", "RISK_AWARE"):
        items, warnings = allocation.optimize(available, demands, risk_aware=strategy == "RISK_AWARE")
    else:
        items = {str(i.offer_id): i.quantity_kg for i in items_in}
    errors = allocation.validate(available, demands, items)
    summary = allocation.summarize(available, demands, items)
    return {"strategy": strategy, "available_kg": available, "errors": errors, "warnings": warnings, **summary}


@router.post("/{listing_id}/allocation/preview")
def preview_allocation(listing_id: uuid.UUID, payload: AllocationPreview, db: DB, user: CurrentUser):
    require_role(user, "FARMER")
    expire_reservations(db)
    return _plan(db, _own_listing(db, user, listing_id), payload.strategy, payload.items)


@router.post("/{listing_id}/allocation/confirm", status_code=201)
def confirm_allocation(listing_id: uuid.UUID, payload: AllocationConfirm, db: DB, user: CurrentUser):
    require_role(user, "FARMER")
    expire_reservations(db)
    # Lock the listing row so concurrent confirmations cannot overbook (no-op on SQLite).
    db.execute(select(ProduceListing).where(ProduceListing.id == listing_id).with_for_update())
    listing = _own_listing(db, user, listing_id)
    plan = _plan(db, listing, "MANUAL", payload.items)
    if plan["errors"]:
        raise HTTPException(422, plan["errors"])
    chosen = [(i.offer_id, i.quantity_kg) for i in payload.items if i.quantity_kg > 0]
    if not chosen:
        raise HTTPException(422, "ยังไม่ได้จัดสรรให้ผู้ซื้อรายใด")

    record = AllocationPlan(
        listing_id=listing.id, strategy=payload.strategy, total_kg=plan["total_kg"],
        expected_revenue=plan["expected_revenue"], created_by=user.id,
    )
    db.add(record)
    db.flush()
    contracts = []
    for offer_id, qty in chosen:
        offer = db.get(Offer, offer_id)
        db.add(AllocationItem(plan_id=record.id, offer_id=offer_id, quantity_kg=qty))
        contracts.append(create_contract(db, listing=listing, offer=offer, qty=qty, plan=record, farmer=user))
    audit(db, entity_type="allocation_plan", entity_id=record.id, entity_code=listing.code, action="ALLOCATION_CONFIRMED",
          actor=user, farmer_org_id=user.organization_id,
          message=f"ยืนยันแผนจัดสรร {plan['total_kg']:,.0f} กก. ให้ผู้ซื้อ {len(contracts)} ราย")
    db.commit()
    return {"plan_id": record.id, "contracts": [contract_brief(c) for c in contracts]}


@router.get("/{listing_id}/reallocation")
def reallocation(listing_id: uuid.UUID, db: DB, user: CurrentUser):
    """Dynamic reallocation (overall_flow §16 scenario A): supply released by cancelled or expired
    reservations, the best plan over pending offers, and open purchase requests that could take the rest."""
    require_role(user, "FARMER")
    expire_reservations(db)
    listing = _own_listing(db, user, listing_id)
    inv = listing_inventory(listing)
    released = [c for c in listing.contracts if c.order_status in ("CANCELLED", "RESERVATION_EXPIRED")]
    plan = _plan(db, listing, "MAX_NET_REVENUE", [])
    offered_by = {o.buyer_org_id for o in listing.offers if o.status == "PENDING"}
    from app.routers.purchase_requests import _demand, _supply  # local import avoids a cycle
    supply = _supply(db, listing, {})
    requests = []
    for r in db.scalars(select(PurchaseRequest).where(PurchaseRequest.status == "OPEN")):
        if r.buyer_org_id in offered_by:
            continue
        ev = matching.evaluate(supply, _demand(r))
        if ev["eligible"]:
            requests.append({"request": request_out(r), "buyer_trust": TrustCache(db).summary(r.buyer_org_id), "score": ev["score"], "reasons": ev["reasons"]})
    requests.sort(key=lambda x: x["score"], reverse=True)
    return {
        "available_kg": inv["available_kg"],
        "released": [contract_brief(c) for c in released],
        "recommended_plan": plan,
        "matching_requests": requests[:5],
    }


def _shortfall_contracts(listing: ProduceListing):
    return [c for c in listing.contracts if c.order_status == "CONFIRMED" and c.proposed_version is None]


@router.post("/{listing_id}/shortfall/preview")
def shortfall_preview(listing_id: uuid.UUID, payload: ShortfallIn, db: DB, user: CurrentUser):
    """Harvest shortfall (overall_flow §16 scenario B): impact of the agreed PROPORTIONAL_REDUCTION policy."""
    require_role(user, "FARMER")
    listing = _own_listing(db, user, listing_id)
    contracts = _shortfall_contracts(listing)
    committed = sum((c.quantity_kg for c in contracts), Decimal(0))
    reserved = sum((c.quantity_kg for c in listing.contracts if c.order_status == "AWAITING_CONFIRMATION"), Decimal(0))
    return {"committed_kg": committed, "reserved_kg": reserved, "actual_kg": payload.actual_kg, "policy": "PROPORTIONAL_REDUCTION",
            "plan": amend.shortfall_plan(contracts, payload.actual_kg)}


@router.post("/{listing_id}/shortfall")
def apply_shortfall(listing_id: uuid.UUID, payload: ShortfallIn, db: DB, user: CurrentUser):
    require_role(user, "FARMER")
    listing = _own_listing(db, user, listing_id)
    contracts = {c.id: c for c in _shortfall_contracts(listing)}
    plan = amend.shortfall_plan(list(contracts.values()), payload.actual_kg)
    if not plan:
        raise HTTPException(422, "ผลผลิตจริงไม่น้อยกว่าที่ทำสัญญาไว้ หรือไม่มีสัญญาที่ปรับได้")
    old = listing.estimated_qty_kg
    listing.estimated_qty_kg = max(payload.actual_kg, Decimal(1))
    audit(db, entity_type="listing", entity_id=listing.id, entity_code=listing.code, action="ESTIMATE_REVISED", actor=user,
          farmer_org_id=user.organization_id, message=f"ปรับประมาณการผลผลิต {old:,.0f} → {payload.actual_kg:,.0f} กก. (ผลผลิตขาด)")
    reason = f"ผลผลิตขาด: คาดว่าจะได้ {payload.actual_kg:,.0f} กก. ใช้นโยบายลดตามสัดส่วนที่ตกลงในสัญญา" + (f" — {payload.reason}" if payload.reason else "")
    for item in plan:
        amend.propose(db, contracts[item["contract_id"]], user, {"quantity_kg": float(item["new_kg"])}, reason)
    db.commit()
    return {"proposed": len(plan), "plan": plan}
