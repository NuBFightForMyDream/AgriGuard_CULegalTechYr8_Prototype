import uuid
from datetime import date

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from app.deps import DB, CurrentUser, get_or_404, next_code, require_role
from app.models import Farm, Offer, ProduceListing, PurchaseRequest
from app.schemas import OfferCreate, Reason
from app.services import sourcing
from app.services.inventory import listing_inventory
from app.services.orders import audit
from app.views import TrustCache, offer_out

router = APIRouter(prefix="/offers", tags=["offers"])


@router.get("")
def list_offers(db: DB, user: CurrentUser):
    q = select(Offer).order_by(Offer.created_at.desc())
    if user.role == "BUYER":
        q = q.where(Offer.buyer_org_id == user.organization_id)
    elif user.role == "FARMER":
        q = q.join(ProduceListing).join(Farm).where(Farm.organization_id == user.organization_id)
    trusts = TrustCache(db)
    return [offer_out(o, trusts) for o in db.scalars(q)]


@router.post("", status_code=201)
def create_offer(payload: OfferCreate, db: DB, user: CurrentUser):
    require_role(user, "BUYER")
    listing = get_or_404(db, ProduceListing, payload.listing_id, "ประกาศผลผลิต")
    unknown = set(payload.grade_prices) - set(listing.expected_grades)
    if unknown:
        raise HTTPException(422, f"สวนนี้ไม่ได้คาดว่าจะมีเกรด {', '.join(sorted(unknown))}")
    if payload.quantity_kg > listing.estimated_qty_kg:
        raise HTTPException(422, "ปริมาณที่เสนอซื้อเกินปริมาณประมาณการของสวน")
    if payload.purchase_request_id:
        req = get_or_404(db, PurchaseRequest, payload.purchase_request_id, "คำขอซื้อ")
        if req.buyer_org_id != user.organization_id or req.product_type != listing.product_type:
            raise HTTPException(422, "คำขอซื้อไม่ตรงกับประกาศนี้")
        open_, why = sourcing.accepting_offers(db, req)
        if not open_:
            raise HTTPException(409, why)
        if req.sourcing_mode == "SINGLE":
            if payload.quantity_kg != req.quantity_kg:
                raise HTTPException(422, f"คำขอนี้ซื้อจากผู้ขายรายเดียว ข้อเสนอต้องเป็น {req.quantity_kg:,.0f} กก. เต็มจำนวน")
            if listing_inventory(listing)["available_kg"] < req.quantity_kg:
                raise HTTPException(422, "สวนนี้มีผลผลิตว่างไม่พอส่งครบตามคำขอที่ซื้อจากผู้ขายรายเดียว")
            payload.min_quantity_kg = req.quantity_kg  # the farm cannot allocate a partial amount
        else:
            remaining = sourcing.fill(db, req)["remaining_kg"]
            if payload.quantity_kg > remaining:
                raise HTTPException(422, f"เสนอซื้อได้ไม่เกินปริมาณที่ยังขาดอยู่ {remaining:,.0f} กก.")
    duplicate = db.scalar(select(Offer.id).where(
        Offer.listing_id == listing.id, Offer.buyer_org_id == user.organization_id, Offer.status == "PENDING"))
    if duplicate:
        raise HTTPException(409, "คุณมีข้อเสนอที่รอพิจารณาสำหรับประกาศนี้อยู่แล้ว")
    data = payload.model_dump()
    data["grade_prices"] = {k: float(v) for k, v in payload.grade_prices.items()}
    o = Offer(code=next_code(db, Offer, f"OF-{date.today().year}-"), buyer_org_id=user.organization_id, status="PENDING", **data)
    db.add(o)
    db.flush()
    audit(db, entity_type="offer", entity_id=o.id, entity_code=o.code, action="OFFER_SUBMITTED", actor=user,
          farmer_org_id=listing.farm.organization_id, buyer_org_id=user.organization_id,
          message=f"เสนอซื้อ {o.quantity_kg:,.0f} กก. จากประกาศ {listing.code}")
    db.commit()
    db.refresh(o)
    return offer_out(o, TrustCache(db))


def _change(db, user, offer_id, role, to, action, message, reason):
    require_role(user, role)
    o = get_or_404(db, Offer, offer_id, "ข้อเสนอ")
    owner = o.listing.farm.organization_id if role == "FARMER" else o.buyer_org_id
    if owner != user.organization_id:
        raise HTTPException(403, "ข้อเสนอนี้ไม่เกี่ยวข้องกับคุณ")
    if o.status != "PENDING":
        raise HTTPException(409, "ข้อเสนอนี้ไม่อยู่ในสถานะรอพิจารณา")
    o.status = to
    audit(db, entity_type="offer", entity_id=o.id, entity_code=o.code, action=action, actor=user,
          farmer_org_id=o.listing.farm.organization_id, buyer_org_id=o.buyer_org_id,
          from_status="PENDING", to_status=to, message=reason or message)
    db.commit()
    return offer_out(o, TrustCache(db))


@router.post("/{offer_id}/reject")
def reject_offer(offer_id: uuid.UUID, payload: Reason, db: DB, user: CurrentUser):
    return _change(db, user, offer_id, "FARMER", "REJECTED", "OFFER_REJECTED", "เกษตรกรปฏิเสธข้อเสนอ", payload.reason)


@router.post("/{offer_id}/withdraw")
def withdraw_offer(offer_id: uuid.UUID, payload: Reason, db: DB, user: CurrentUser):
    return _change(db, user, offer_id, "BUYER", "WITHDRAWN", "OFFER_WITHDRAWN", "ผู้ซื้อถอนข้อเสนอ", payload.reason)
