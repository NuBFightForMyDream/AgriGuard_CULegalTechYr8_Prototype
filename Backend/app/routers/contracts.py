import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from app.catalog import PRODUCTS
from app.deps import DB, CurrentUser, get_or_404, next_code
from app.models import Contract, ContractAcceptance, Dispute, ProduceLot, User
from app.schemas import AmendmentCreate, AmendmentResponse, HarvestCreate, Reason, Signature
from app.services import amendments as amend
from app.services.contracts import record_trust_events
from app.services.inventory import aware, expire_reservations
from app.services.disputes import OPEN_STATES
from app.services.orders import DISPUTABLE, InvalidTransition, audit, transition
from app.views import TrustCache, contract_brief, contract_timeline, inspection_out, listing_out, lot_out, settlement_out

router = APIRouter(prefix="/contracts", tags=["contracts"])


def visible_contracts(user: User):
    q = select(Contract)
    if user.role == "FARMER":
        q = q.where(Contract.farmer_org_id == user.organization_id)
    elif user.role == "BUYER":
        q = q.where(Contract.buyer_org_id == user.organization_id)
    return q


def load_contract(db, user: User, contract_id: uuid.UUID) -> Contract:
    c = get_or_404(db, Contract, contract_id, "สัญญา")
    if user.role == "FARMER" and c.farmer_org_id != user.organization_id:
        raise HTTPException(403, "สัญญานี้ไม่เกี่ยวข้องกับคุณ")
    if user.role == "BUYER" and c.buyer_org_id != user.organization_id:
        raise HTTPException(403, "สัญญานี้ไม่เกี่ยวข้องกับคุณ")
    return c


def dispute_ref(d: Dispute) -> dict:
    return {"id": d.id, "code": d.code, "status": d.status, "category": d.category,
            "previous_order_status": d.previous_order_status, "outcome": d.outcome}


def is_party(user: User, c: Contract, role: str) -> bool:
    org = c.farmer_org_id if role == "FARMER" else c.buyer_org_id
    return user.role == role and user.organization_id == org


def actions_for(c: Contract, user: User) -> list[str]:
    s, farmer, buyer = c.order_status, is_party(user, c, "FARMER"), is_party(user, c, "BUYER")
    lot_states = {lot.status for lot in c.lots}
    harvested = sum((lot.harvested_kg for lot in c.lots), Decimal(0))
    room = harvested < c.quantity_kg  # tolerance covers weighing differences, not extra lots
    rules = [
        (s == "AWAITING_CONFIRMATION" and buyer, ["ACCEPT_HARVESTLOCK", "DECLINE_HARVESTLOCK"]),
        # Several lots may be harvested before the first one ships (multiple deliveries per contract).
        (s in ("CONFIRMED", "HARVESTED") and farmer and room, ["RECORD_HARVEST"]),
        (s in ("HARVESTED", "IN_TRANSIT") and farmer and "READY_FOR_PICKUP" in lot_states, ["DISPATCH_LOT"]),
        (s == "IN_TRANSIT" and buyer and "IN_TRANSIT" in lot_states, ["RECEIVE_LOT"]),
        (s == "QC_PENDING" and (user.role == "INSPECTOR" or buyer) and "INSPECTION_PENDING" in lot_states, ["RECORD_QC"]),
        (s in ("PAYMENT_PENDING", "PAYMENT_OVERDUE") and buyer, ["RECORD_PAYMENT"]),
        (s == "PAID" and farmer, ["CONFIRM_PAYMENT_RECEIVED"]),
        (s in amend.AMENDABLE and (farmer or buyer) and c.proposed_version is None, ["PROPOSE_AMENDMENT"]),
        (c.proposed_version is not None and (farmer or buyer) and _proposer(c) != user.organization_id, ["RESPOND_AMENDMENT"]),
    ]
    return [a for ok, acts in rules if ok for a in acts]


def _proposer(c: Contract):
    return next((v.proposed_by_org_id for v in c.versions if v.version == c.proposed_version), None)


def risks_for(c: Contract, trust: dict) -> list[str]:
    risks = []
    terms = c.terms
    if c.order_status == "AWAITING_CONFIRMATION" and c.reservation_expires_at:
        risks.append("การจองจะหมดอายุหากผู้ซื้อไม่ยืนยันภายในเวลาที่กำหนด แล้วระบบจะคืนผลผลิต")
    if trust["insufficient_data"]:
        risks.append("ผู้ซื้อยังมีประวัติธุรกรรมที่ตรวจสอบแล้วไม่เพียงพอ (ไม่ได้แปลว่าความเสี่ยงสูง)")
    elif trust["band"] == "HIGH_RISK":
        risks.append("AgriTrust ของผู้ซื้ออยู่ในระดับต้องระวัง ควรพิจารณาเงินมัดจำ")
    tolerance = terms["tolerance_pct"] / 100
    for lot in c.lots:
        if float(lot.harvested_kg) < terms["quantity_kg"] * (1 - tolerance):
            risks.append(f"ล็อต {lot.code} เก็บเกี่ยวได้ต่ำกว่าปริมาณที่ตกลงเกินค่าคลาดเคลื่อน")
        for insp in lot.inspections:
            risks.extend(f["message"] for f in insp.flags)
    s = c.settlement
    if s and s.status != "PAID" and date.today() > s.due_date:
        risks.append("เลยกำหนดชำระเงินแล้ว")
    return risks


def contract_files(db, contract_id):
    from app.routers.files import contract_files as _files  # local import avoids a cycle

    return _files(db, contract_id)


@router.get("")
def list_contracts(db: DB, user: CurrentUser):
    expire_reservations(db)
    return [contract_brief(c) for c in db.scalars(visible_contracts(user).order_by(Contract.created_at.desc()))]


@router.get("/{contract_id}")
def get_contract(contract_id: uuid.UUID, db: DB, user: CurrentUser):
    expire_reservations(db)
    c = load_contract(db, user, contract_id)
    current = next(v for v in c.versions if v.version == c.current_version)
    proposed = next((v for v in c.versions if v.version == c.proposed_version), None)
    trust = TrustCache(db).summary(c.buyer_org_id)
    disputes = db.scalars(select(Dispute).where(Dispute.contract_id == c.id).order_by(Dispute.created_at)).all()
    active = next((d for d in disputes if d.status in OPEN_STATES), None)
    party = user.role in ("FARMER", "BUYER") and user.organization_id in (c.farmer_org_id, c.buyer_org_id)
    can_dispute = party and active is None and c.order_status in DISPUTABLE
    lots = [lot_out(lot) for lot in c.lots]
    inspections = [inspection_out(i) for lot in c.lots for i in lot.inspections]
    return {
        **contract_brief(c),
        "terms": current.terms,
        "terms_hash": current.terms_hash,
        "current_version": c.current_version,
        "versions": [
            {"version": v.version, "terms_hash": v.terms_hash, "status": v.status, "reason": v.reason,
             "proposed_by_org_id": v.proposed_by_org_id, "created_at": v.created_at, "terms": v.terms}
            for v in c.versions
        ],
        "proposed": None if proposed is None else {
            "version": proposed.version, "terms": proposed.terms, "terms_hash": proposed.terms_hash,
            "reason": proposed.reason, "proposed_by_org_id": proposed.proposed_by_org_id,
            "created_at": proposed.created_at, "diff": amend.diff(current.terms, proposed.terms),
        },
        "acceptances": [
            {"organization_id": a.organization_id, "user_name": a.user.name, "version": a.version,
             "terms_hash": a.terms_hash, "accepted_at": a.accepted_at, "signature_name": a.signature_name,
             "method": a.method}
            for a in c.acceptances
        ],
        "confirmed_at": c.confirmed_at,
        "completed_at": c.completed_at,
        "purchase_request_code": c.offer.purchase_request.code if c.offer.purchase_request else None,
        "offer_code": c.offer.code,
        "listing": listing_out(c.listing),
        "buyer_trust": trust,
        "lots": lots,
        "inspection": inspections[-1] if inspections else None,
        "inspections": inspections,
        "files": contract_files(db, c.id),
        "settlement": settlement_out(c.settlement) if c.settlement else None,
        "timeline": contract_timeline(db, c),
        "actions": actions_for(c, user) + (["OPEN_DISPUTE"] if can_dispute else []),
        "risks": risks_for(c, trust),
        "active_dispute": dispute_ref(active) if active else None,
        "disputes": [dispute_ref(d) for d in disputes],
    }


def _require(c: Contract, user: User, action: str) -> None:
    if action not in actions_for(c, user):
        raise HTTPException(409, "ทำรายการนี้ไม่ได้ในสถานะปัจจุบัน หรือคุณไม่มีสิทธิ์")


def _apply(db, c, to, user, message):
    try:
        transition(db, c, to, user, message)
    except InvalidTransition as e:
        raise HTTPException(409, str(e)) from e


@router.post("/{contract_id}/accept")
def accept(contract_id: uuid.UUID, payload: Signature, db: DB, user: CurrentUser):
    expire_reservations(db)
    c = load_contract(db, user, contract_id)
    _require(c, user, "ACCEPT_HARVESTLOCK")
    current = next(v for v in c.versions if v.version == c.current_version)
    current.status = "ACCEPTED"
    c.acceptances.append(ContractAcceptance(
        version=c.current_version, organization_id=user.organization_id, user_id=user.id, terms_hash=current.terms_hash,
        signature_name=payload.signature_name, method="TYPED_NAME"))
    c.status = "CONFIRMED"
    c.confirmed_at = datetime.now(timezone.utc)
    _apply(db, c, "CONFIRMED", user,
           f"ผู้ซื้อยืนยัน HarvestLock ฉบับที่ {c.current_version} (hash {current.terms_hash[:12]}…) ทั้งสองฝ่ายยอมรับฉบับเดียวกันแล้ว")
    db.commit()
    return get_contract(contract_id, db, user)


@router.post("/{contract_id}/decline")
def decline(contract_id: uuid.UUID, payload: Reason, db: DB, user: CurrentUser):
    expire_reservations(db)
    c = load_contract(db, user, contract_id)
    _require(c, user, "DECLINE_HARVESTLOCK")
    c.status = "TERMINATED"
    c.offer.status = "DECLINED"
    _apply(db, c, "CANCELLED", user, payload.reason or "ผู้ซื้อปฏิเสธ HarvestLock ระบบคืนผลผลิตที่จองไว้")
    db.commit()
    return get_contract(contract_id, db, user)


@router.post("/{contract_id}/lots", status_code=201)
def record_harvest(contract_id: uuid.UUID, payload: HarvestCreate, db: DB, user: CurrentUser):
    c = load_contract(db, user, contract_id)
    _require(c, user, "RECORD_HARVEST")
    product = c.listing.product_type.upper()
    year = payload.harvest_date.year
    lot = ProduceLot(
        code=next_code(db, ProduceLot, f"LOT-{year}-{product}-"),
        contract_id=c.id, harvest_date=payload.harvest_date, harvested_kg=payload.harvested_kg,
        status="READY_FOR_PICKUP",
    )
    c.lots.append(lot)  # keep the already-loaded collection in sync
    db.flush()
    message = f"บันทึกการเก็บเกี่ยว {payload.harvested_kg:,.0f} กก. สร้างล็อต {lot.code} ({PRODUCTS[c.listing.product_type]['th']})"
    if c.order_status == "CONFIRMED":
        _apply(db, c, "HARVESTED", user, message)
    else:
        audit(db, entity_type="lot", entity_id=lot.id, entity_code=lot.code, action="LOT_ADDED", actor=user, contract=c,
              message=message + " (ล็อตเพิ่มเติม)")
    db.commit()
    return get_contract(contract_id, db, user)


@router.post("/{contract_id}/complete")
def complete(contract_id: uuid.UUID, db: DB, user: CurrentUser):
    c = load_contract(db, user, contract_id)
    _require(c, user, "CONFIRM_PAYMENT_RECEIVED")
    c.status = "COMPLETED"
    c.completed_at = datetime.now(timezone.utc)
    for d in db.scalars(select(Dispute).where(Dispute.contract_id == c.id, Dispute.status == "RESOLVED")):
        d.status = "CLOSED"
    _apply(db, c, "COMPLETED", user, "เกษตรกรยืนยันได้รับเงินครบ ปิดธุรกรรม")
    events = record_trust_events(db, c)
    good = sum(e.success for e in events)
    audit(db, entity_type="contract", entity_id=c.id, entity_code=c.code, action="TRUST_UPDATED", actor=None,
          contract=c, message=f"บันทึกเหตุการณ์ AgriTrust ที่ตรวจสอบแล้ว {len(events)} รายการ (ผ่าน {good}/{len(events)})")
    db.commit()
    return get_contract(contract_id, db, user)


@router.post("/{contract_id}/amendments", status_code=201)
def propose_amendment(contract_id: uuid.UUID, payload: AmendmentCreate, db: DB, user: CurrentUser):
    c = load_contract(db, user, contract_id)
    _require(c, user, "PROPOSE_AMENDMENT")
    changes = payload.changes.model_dump(exclude_none=True)
    if "delivery_window" in changes:
        changes["delivery_window"] = [d.isoformat() for d in changes["delivery_window"]]
    if "grade_prices" in changes:
        changes["grade_prices"] = {k.strip().upper(): float(v) for k, v in changes["grade_prices"].items()}
    if "quantity_kg" in changes:
        from app.services.inventory import listing_inventory  # local import keeps module load light

        extra = Decimal(str(changes["quantity_kg"])) - c.quantity_kg
        if extra > listing_inventory(c.listing)["available_kg"]:
            raise HTTPException(422, "เพิ่มปริมาณเกินผลผลิตที่ยังไม่ผูกพันของสวน")
    try:
        amend.propose(db, c, user, changes, payload.reason)
    except ValueError as e:
        raise HTTPException(422, str(e)) from e
    db.commit()
    return get_contract(contract_id, db, user)


@router.post("/{contract_id}/amendments/respond")
def respond_amendment(contract_id: uuid.UUID, payload: AmendmentResponse, db: DB, user: CurrentUser):
    c = load_contract(db, user, contract_id)
    _require(c, user, "RESPOND_AMENDMENT")
    if payload.accept and (not payload.consent or not (payload.signature_name or "").strip()):
        raise HTTPException(422, "การยอมรับต้องลงชื่อและยืนยันความยินยอม")
    amend.respond(db, c, user, payload.accept, payload.signature_name)
    db.commit()
    return get_contract(contract_id, db, user)


__all__ = ["router", "load_contract", "visible_contracts", "aware"]
