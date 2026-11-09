import uuid
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from app.catalog import PRODUCTS
from app.deps import DB, CurrentUser, get_or_404, next_code, require_role
from app.models import AllocationItem, AllocationPlan, Farm, Offer, ProduceListing
from app.schemas import AllocationConfirm, AllocationPreview, ListingCreate
from app.services import allocation
from app.services.contracts import create_contract
from app.services.inventory import expire_reservations, listing_inventory
from app.services.orders import audit
from app.views import TrustCache, contract_brief, listing_out, offer_out, top_price

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
    allowed = PRODUCTS[payload.product_type]["grades"]
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


def _demands(listing: ProduceListing) -> list[allocation.OfferDemand]:
    return [
        allocation.OfferDemand(str(o.id), o.quantity_kg, o.min_quantity_kg, Decimal(str(top_price(o))))
        for o in listing.offers
        if o.status == "PENDING"
    ]


def _plan(listing: ProduceListing, strategy: str, items_in):
    demands = _demands(listing)
    available = listing_inventory(listing)["available_kg"]
    warnings: list[str] = []
    if strategy == "PROPORTIONAL":
        items, warnings = allocation.proportional(available, demands)
    else:
        items = {str(i.offer_id): i.quantity_kg for i in items_in}
    errors = allocation.validate(available, demands, items)
    summary = allocation.summarize(available, demands, items)
    return {"strategy": strategy, "available_kg": available, "errors": errors, "warnings": warnings, **summary}


@router.post("/{listing_id}/allocation/preview")
def preview_allocation(listing_id: uuid.UUID, payload: AllocationPreview, db: DB, user: CurrentUser):
    require_role(user, "FARMER")
    expire_reservations(db)
    return _plan(_own_listing(db, user, listing_id), payload.strategy, payload.items)


@router.post("/{listing_id}/allocation/confirm", status_code=201)
def confirm_allocation(listing_id: uuid.UUID, payload: AllocationConfirm, db: DB, user: CurrentUser):
    require_role(user, "FARMER")
    expire_reservations(db)
    # Lock the listing row so concurrent confirmations cannot overbook (no-op on SQLite).
    db.execute(select(ProduceListing).where(ProduceListing.id == listing_id).with_for_update())
    listing = _own_listing(db, user, listing_id)
    plan = _plan(listing, "MANUAL", payload.items)
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
