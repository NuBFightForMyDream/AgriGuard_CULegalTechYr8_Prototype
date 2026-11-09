import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import or_, select

from app.deps import DB, CurrentUser, get_or_404, next_code, require_role
from app.models import AuditLog, Dispute, DisputeStatement, QcGradeItem, QcInspection, User
from app.routers.contracts import _apply, load_contract
from app.schemas import InspectionCreate
from app.services import settlement as calc
from app.services.disputes import CATEGORIES, OPEN_STATES, OUTCOMES, active_dispute, deadline, held_amount
from app.services.orders import DISPUTABLE, audit
from app.views import audit_out, contract_brief, inspection_out, org_brief

router = APIRouter(tags=["disputes"])


class DisputeCreate(BaseModel):
    category: Literal[tuple(CATEGORIES)]  # type: ignore[valid-type]
    description: str = Field(min_length=10, max_length=4000)
    disputed_amount: Decimal = Field(default=Decimal(0), ge=0)
    evidence_note: str | None = Field(default=None, max_length=2000)


class StatementCreate(BaseModel):
    body: str = Field(min_length=5, max_length=4000)
    evidence_note: str | None = Field(default=None, max_length=2000)


class ReviewAction(BaseModel):
    action: Literal["START_REVIEW", "REQUEST_REINSPECTION", "RESOLVE"]
    notes: str | None = Field(default=None, max_length=4000)
    outcome: Literal[tuple(OUTCOMES)] | None = None  # type: ignore[valid-type]
    resolution: str | None = Field(default=None, max_length=4000)
    settlement_adjustment: Decimal | None = None


def _party(user: User, d: Dispute) -> bool:
    c = d.contract
    return user.role in ("FARMER", "BUYER") and user.organization_id in (c.farmer_org_id, c.buyer_org_id)


def _load(db, user: User, dispute_id: uuid.UUID) -> Dispute:
    d = get_or_404(db, Dispute, dispute_id, "ข้อพิพาท")
    if user.role in ("FARMER", "BUYER") and not _party(user, d):
        raise HTTPException(403, "ข้อพิพาทนี้ไม่เกี่ยวข้องกับคุณ")
    return d


def _actions(d: Dispute, user: User) -> list[str]:
    acts = []
    if _party(user, d) and d.status in ("EVIDENCE_COLLECTION", "UNDER_REVIEW"):
        acts.append("ADD_STATEMENT")
    if user.role == "ADMIN":
        if d.status == "EVIDENCE_COLLECTION":
            acts.append("START_REVIEW")
        if d.status == "UNDER_REVIEW":
            acts += ["REQUEST_REINSPECTION", "RESOLVE"]
    if user.role == "INSPECTOR" and d.status == "REINSPECTION_REQUESTED":
        acts.append("RECORD_REINSPECTION")
    return acts


def dispute_brief(d: Dispute) -> dict:
    return {
        "id": d.id,
        "code": d.code,
        "category": d.category,
        "category_label": CATEGORIES[d.category],
        "status": d.status,
        "contract_id": d.contract_id,
        "contract_code": d.contract.code,
        "opened_by_org": org_brief(d.opened_by_org),
        "against_org": org_brief(d.against_org),
        "disputed_amount": d.disputed_amount,
        "held_amount": d.held_amount,
        "response_deadline": d.response_deadline,
        "outcome": d.outcome,
        "created_at": d.created_at,
        "resolved_at": d.resolved_at,
    }


def dispute_detail(db, d: Dispute, user: User) -> dict:
    c = d.contract
    logs = db.scalars(select(AuditLog).where(AuditLog.entity_id == d.id).order_by(AuditLog.created_at)).all()
    inspections = [inspection_out(i) for lot in c.lots for i in lot.inspections]
    return {
        **dispute_brief(d),
        "description": d.description,
        "previous_order_status": d.previous_order_status,
        "contract": contract_brief(c),
        "opened_by": {"id": d.opened_by.id, "name": d.opened_by.name},
        "reviewer": {"id": d.reviewer.id, "name": d.reviewer.name} if d.reviewer else None,
        "reviewer_notes": d.reviewer_notes,
        "proposed_adjustment": d.proposed_adjustment,
        "resolution": d.resolution,
        "settlement_adjustment": d.settlement_adjustment,
        "outcome_label": OUTCOMES.get(d.outcome or ""),
        "statements": [
            {"id": s.id, "organization": org_brief(s.organization), "user_name": s.user.name, "body": s.body,
             "evidence_note": s.evidence_note, "created_at": s.created_at,
             "side": "FARMER" if s.organization_id == c.farmer_org_id else "BUYER"}
            for s in d.statements
        ],
        "inspections": inspections,
        "settlement": None if not c.settlement else {
            "net_amount": c.settlement.net_amount, "paid_amount": c.settlement.paid_amount, "status": c.settlement.status},
        "timeline": [audit_out(a) for a in logs],
        "actions": _actions(d, user),
    }


def _log(db, d: Dispute, user, action: str, message: str, frm=None, to=None):
    audit(db, entity_type="dispute", entity_id=d.id, entity_code=d.code, action=action, actor=user,
          contract=d.contract, from_status=frm, to_status=to, message=message)


@router.get("/disputes")
def list_disputes(db: DB, user: CurrentUser):
    q = select(Dispute).order_by(Dispute.created_at.desc())
    if user.role in ("FARMER", "BUYER"):
        q = q.where(or_(Dispute.opened_by_org_id == user.organization_id, Dispute.against_org_id == user.organization_id))
    return [dispute_brief(d) for d in db.scalars(q)]


@router.get("/disputes/{dispute_id}")
def get_dispute(dispute_id: uuid.UUID, db: DB, user: CurrentUser):
    return dispute_detail(db, _load(db, user, dispute_id), user)


@router.post("/contracts/{contract_id}/disputes", status_code=201)
def open_dispute(contract_id: uuid.UUID, payload: DisputeCreate, db: DB, user: CurrentUser):
    require_role(user, "FARMER", "BUYER")
    c = load_contract(db, user, contract_id)
    if c.order_status not in DISPUTABLE:
        raise HTTPException(409, "เปิดข้อพิพาทได้หลังยืนยันสัญญาและก่อนปิดธุรกรรม")
    if active_dispute(db, c):
        raise HTTPException(409, "สัญญานี้มีข้อพิพาทที่ยังไม่ยุติอยู่แล้ว")
    against = c.buyer_org_id if user.organization_id == c.farmer_org_id else c.farmer_org_id
    d = Dispute(
        code=next_code(db, Dispute, f"DSP-{date.today().year}-"), contract_id=c.id, category=payload.category,
        description=payload.description, opened_by_user_id=user.id, opened_by_org_id=user.organization_id,
        against_org_id=against, disputed_amount=payload.disputed_amount,
        held_amount=held_amount(c, payload.disputed_amount), status="EVIDENCE_COLLECTION",
        previous_order_status=c.order_status, response_deadline=deadline(),
    )
    d.statements.append(DisputeStatement(organization_id=user.organization_id, user_id=user.id,
                                         body=payload.description, evidence_note=payload.evidence_note))
    db.add(d)
    db.flush()
    _apply(db, c, "DISPUTED", user, f"เปิดข้อพิพาท {d.code}: {CATEGORIES[d.category]} — ระงับขั้นตอนถัดไปจนกว่าจะมีผลพิจารณา")
    _log(db, d, user, "DISPUTE_OPENED", f"เปิดข้อพิพาท ({CATEGORIES[d.category]}) ยอดโต้แย้ง {d.disputed_amount:,.2f} บาท กันไว้ {d.held_amount:,.2f} บาท", to="EVIDENCE_COLLECTION")
    db.commit()
    return dispute_detail(db, d, user)


@router.post("/disputes/{dispute_id}/statements", status_code=201)
def add_statement(dispute_id: uuid.UUID, payload: StatementCreate, db: DB, user: CurrentUser):
    d = _load(db, user, dispute_id)
    if "ADD_STATEMENT" not in _actions(d, user):
        raise HTTPException(409, "ส่งคำชี้แจงไม่ได้ในสถานะนี้")
    d.statements.append(DisputeStatement(organization_id=user.organization_id, user_id=user.id,
                                         body=payload.body, evidence_note=payload.evidence_note))
    db.flush()
    _log(db, d, user, "STATEMENT_ADDED", "ส่งคำชี้แจงและหลักฐาน")
    sides = {s.organization_id for s in d.statements}
    if d.status == "EVIDENCE_COLLECTION" and {d.opened_by_org_id, d.against_org_id} <= sides:
        d.status = "UNDER_REVIEW"
        _log(db, d, None, "STATUS_CHANGED", "ทั้งสองฝ่ายชี้แจงแล้ว ส่งให้ผู้ตรวจทานพิจารณา", "EVIDENCE_COLLECTION", "UNDER_REVIEW")
    db.commit()
    return dispute_detail(db, d, user)


@router.post("/disputes/{dispute_id}/review")
def review(dispute_id: uuid.UUID, payload: ReviewAction, db: DB, user: CurrentUser):
    require_role(user, "ADMIN")
    d = _load(db, user, dispute_id)
    if payload.action not in _actions(d, user):
        raise HTTPException(409, "ทำรายการนี้ไม่ได้ในสถานะปัจจุบัน")
    c = d.contract
    d.reviewer_user_id = user.id
    if payload.notes:
        d.reviewer_notes = payload.notes
    if payload.action == "START_REVIEW":
        d.status = "UNDER_REVIEW"
        _log(db, d, user, "STATUS_CHANGED", "เริ่มพิจารณาข้อพิพาท", "EVIDENCE_COLLECTION", "UNDER_REVIEW")
    elif payload.action == "REQUEST_REINSPECTION":
        if not any(lot.received_kg for lot in c.lots):
            raise HTTPException(409, "ยังไม่มีล็อตที่รับแล้วให้ตรวจซ้ำ")
        d.status = "REINSPECTION_REQUESTED"
        _log(db, d, user, "REINSPECTION_REQUESTED", payload.notes or "ขอให้ผู้ตรวจคุณภาพตรวจซ้ำ", "UNDER_REVIEW", "REINSPECTION_REQUESTED")
    else:
        if not payload.outcome or not payload.resolution:
            raise HTTPException(422, "ต้องระบุผลการพิจารณาและเหตุผล")
        adj = payload.settlement_adjustment or Decimal(0)
        s = c.settlement
        if adj and not s:
            raise HTTPException(422, "ยังไม่มีรายการชำระเงินให้ปรับยอด")
        d.outcome, d.resolution, d.settlement_adjustment = payload.outcome, payload.resolution, adj
        d.held_amount = Decimal(0)
        d.status = "RESOLVED"
        d.resolved_at = datetime.now(timezone.utc)
        target = d.previous_order_status
        if s:
            if adj:
                s.net_amount = max(Decimal(0), s.net_amount + adj)
                s.lines = [*s.lines, {"grade": "ADJUSTMENT", "quantity_kg": 0, "price": 0, "amount": float(adj)}]
            if s.paid_amount >= s.net_amount:
                s.status = "PAID"
                if target in ("PAYMENT_PENDING", "PAYMENT_OVERDUE"):
                    target = "PAID"
            elif s.paid_amount > 0:
                s.status = "PARTIALLY_PAID"
                if target == "PAID":
                    target = "PAYMENT_PENDING"
        _log(db, d, user, "DISPUTE_RESOLVED",
             f"ผลพิจารณา: {OUTCOMES[d.outcome]} · ปรับยอด {adj:+,.2f} บาท — {d.resolution}", "UNDER_REVIEW", "RESOLVED")
        _apply(db, c, target, user, f"ยุติข้อพิพาท {d.code} กลับสู่ขั้นตอนเดิม")
        if s and s.paid_amount > s.net_amount:
            _log(db, d, None, "REFUND_DUE", f"ชำระเกินยอดใหม่ {s.paid_amount - s.net_amount:,.2f} บาท ต้องคืนเงิน (จำลอง)")
    db.commit()
    return dispute_detail(db, d, user)


@router.post("/disputes/{dispute_id}/reinspection", status_code=201)
def reinspect(dispute_id: uuid.UUID, payload: InspectionCreate, db: DB, user: CurrentUser):
    require_role(user, "INSPECTOR")
    d = _load(db, user, dispute_id)
    if "RECORD_REINSPECTION" not in _actions(d, user):
        raise HTTPException(409, "ไม่มีคำขอตรวจซ้ำ")
    c = d.contract
    lot = next(lot for lot in reversed(c.lots) if lot.received_kg)
    received = lot.received_kg
    grade_qty: dict[str, Decimal] = {}
    for g in payload.grades:
        grade_qty[g.grade.strip().upper()] = grade_qty.get(g.grade.strip().upper(), Decimal(0)) + g.quantity_kg
    accepted = sum(grade_qty.values(), Decimal(0))
    if abs(accepted + payload.rejected_kg - received) > 1:
        raise HTTPException(422, f"ผลรวมต้องเท่ากับน้ำหนักที่รับ ({received:,.0f} กก.)")
    terms = c.terms
    flags = calc.discrepancy_flags(terms, received, grade_qty, payload.rejected_kg, payload.rejection_reason, payload.evidence_note)
    db.add(QcInspection(
        lot_id=lot.id, contract_id=c.id, inspector_user_id=user.id, received_kg=received, accepted_kg=accepted,
        rejected_kg=payload.rejected_kg, rejection_reason=payload.rejection_reason, sampling_method=payload.sampling_method,
        evidence_note=payload.evidence_note, notes=f"ตรวจซ้ำตามข้อพิพาท {d.code}. {payload.notes or ''}".strip(), flags=flags,
        grade_items=[QcGradeItem(grade=g, quantity_kg=q) for g, q in grade_qty.items()],
    ))
    result = calc.compute(grade_qty, terms["grade_prices"], payload.rejected_kg, Decimal(str(terms["deposit_thb"])))
    d.proposed_adjustment = (result["net"] - c.settlement.net_amount) if c.settlement else None
    d.status = "UNDER_REVIEW"
    note = f" ยอดสุทธิใหม่ {result['net']:,.2f} บาท (ต่าง {d.proposed_adjustment:+,.2f})" if d.proposed_adjustment is not None else ""
    _log(db, d, user, "REINSPECTION_RECORDED", f"ตรวจซ้ำ: รับ {accepted:,.0f} กก. ปฏิเสธ {payload.rejected_kg:,.0f} กก.{note}", "REINSPECTION_REQUESTED", "UNDER_REVIEW")
    db.commit()
    return dispute_detail(db, d, user)


__all__ = ["router", "OPEN_STATES"]
