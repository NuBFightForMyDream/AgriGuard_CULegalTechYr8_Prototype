import uuid
from datetime import date

from fastapi import APIRouter, HTTPException
from sqlalchemy import func, select

from app.deps import DB, CurrentUser, get_or_404, next_code, require_role
from app.models import Contract, Farm, ProduceListing, PurchaseRequest
from app.schemas import PurchaseRequestCreate, Reason
from app.services import matching, trust
from app.services.inventory import expire_reservations, listing_inventory
from app.services.orders import audit
from app.views import TrustCache, listing_out, offer_out, request_out

router = APIRouter(prefix="/purchase-requests", tags=["purchase-requests"])


def _supply(db, listing: ProduceListing, reliability_cache: dict) -> matching.Supply:
    org_id = listing.farm.organization_id
    if org_id not in reliability_cache:
        done = db.scalar(select(func.count()).select_from(Contract).where(
            Contract.farmer_org_id == org_id, Contract.order_status == "COMPLETED")) or 0
        reliability_cache[org_id] = None if done < trust.MIN_TRANSACTIONS else trust.smoothed(done, done)
    return matching.Supply(
        product_type=listing.product_type, variety=listing.variety, harvest_start=listing.harvest_start,
        harvest_end=listing.harvest_end, grades=listing.expected_grades,
        available_kg=float(listing_inventory(listing)["available_kg"]), province=listing.farm.province,
        reliability=reliability_cache[org_id],
    )


def _demand(r: PurchaseRequest) -> matching.Demand:
    return matching.Demand(
        product_type=r.product_type, variety=r.variety, delivery_start=r.delivery_start, delivery_end=r.delivery_end,
        grades=r.accepted_grades, quantity_kg=float(r.quantity_kg),
        min_quantity_kg=float(r.min_quantity_kg) if r.min_quantity_kg else None,
        destination_province=r.destination_province,
    )


def _visible(user, r: PurchaseRequest) -> None:
    if user.role == "BUYER" and r.buyer_org_id != user.organization_id:
        raise HTTPException(403, "คำขอซื้อนี้ไม่ใช่ของบริษัทคุณ")


@router.get("")
def list_requests(db: DB, user: CurrentUser):
    q = select(PurchaseRequest).order_by(PurchaseRequest.delivery_start)
    if user.role == "BUYER":
        q = q.where(PurchaseRequest.buyer_org_id == user.organization_id)
    else:
        q = q.where(PurchaseRequest.status == "OPEN")
    rows = db.scalars(q).all()
    trusts = TrustCache(db)
    out = []
    my_listings = []
    if user.role == "FARMER":
        my_listings = db.scalars(select(ProduceListing).join(Farm).where(Farm.organization_id == user.organization_id)).all()
    cache: dict = {}
    for r in rows:
        item = request_out(r)
        item["buyer_trust"] = trusts.summary(r.buyer_org_id)
        if user.role == "FARMER":
            # Farmer marketplace: how well does this request fit one of my listings?
            best = None
            for listing in my_listings:
                ev = matching.evaluate(_supply(db, listing, cache), _demand(r))
                if ev["eligible"] and (best is None or ev["score"] > best["score"]):
                    best = {"score": ev["score"], "listing_code": listing.code, "listing_id": listing.id}
            item["best_match"] = best
        out.append(item)
    return out


@router.post("", status_code=201)
def create_request(payload: PurchaseRequestCreate, db: DB, user: CurrentUser):
    require_role(user, "BUYER")
    r = PurchaseRequest(
        code=next_code(db, PurchaseRequest, f"PR-{date.today().year}-"),
        buyer_org_id=user.organization_id,
        status="OPEN",
        **payload.model_dump(),
    )
    db.add(r)
    db.flush()
    audit(db, entity_type="purchase_request", entity_id=r.id, entity_code=r.code, action="REQUEST_CREATED",
          actor=user, buyer_org_id=user.organization_id, message=f"สร้างคำขอซื้อ {r.quantity_kg:,.0f} กก.")
    db.commit()
    db.refresh(r)
    return request_out(r)


@router.get("/{request_id}")
def get_request(request_id: uuid.UUID, db: DB, user: CurrentUser):
    r = get_or_404(db, PurchaseRequest, request_id, "คำขอซื้อ")
    _visible(user, r)
    trusts = TrustCache(db)
    out = request_out(r)
    out["buyer_trust"] = trusts.summary(r.buyer_org_id)
    out["offers"] = [offer_out(o, trusts) for o in r.offers] if user.role == "BUYER" else []
    return out


@router.get("/{request_id}/matches")
def get_matches(request_id: uuid.UUID, db: DB, user: CurrentUser):
    expire_reservations(db)
    r = get_or_404(db, PurchaseRequest, request_id, "คำขอซื้อ")
    _visible(user, r)
    demand = _demand(r)
    cache: dict = {}
    offered = {o.listing_id for o in r.offers}
    recs, excluded = [], []
    for listing in db.scalars(select(ProduceListing)):
        ev = matching.evaluate(_supply(db, listing, cache), demand)
        if ev["eligible"]:
            recs.append({"listing": listing_out(listing), "already_offered": listing.id in offered, **ev})
        elif listing.product_type == r.product_type:
            excluded.append({"listing_code": listing.code, "farm_name": listing.farm.name, "unmet": ev["unmet"]})
    recs.sort(key=lambda x: x["score"], reverse=True)
    return {"model_version": matching.MODEL_VERSION, "weights": matching.WEIGHTS, "recommendations": recs, "excluded": excluded}


@router.post("/{request_id}/cancel")
def cancel_request(request_id: uuid.UUID, payload: Reason, db: DB, user: CurrentUser):
    require_role(user, "BUYER")
    r = get_or_404(db, PurchaseRequest, request_id, "คำขอซื้อ")
    _visible(user, r)
    if r.status != "OPEN":
        raise HTTPException(409, "ยกเลิกได้เฉพาะคำขอที่เปิดอยู่")
    r.status = "CANCELLED"
    audit(db, entity_type="purchase_request", entity_id=r.id, entity_code=r.code, action="REQUEST_CANCELLED",
          actor=user, buyer_org_id=user.organization_id, from_status="OPEN", to_status="CANCELLED",
          message=payload.reason or "ผู้ซื้อยกเลิกคำขอซื้อ")
    db.commit()
    return request_out(r)
