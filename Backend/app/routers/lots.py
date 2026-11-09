import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from app.deps import DB, CurrentUser, get_or_404
from app.models import Contract, ProduceLot, QcGradeItem, QcInspection, Settlement
from app.routers.contracts import _apply, _require, get_contract, load_contract, visible_contracts
from app.schemas import DispatchIn, InspectionCreate, ReceiveIn
from app.services import settlement as calc
from app.services.orders import audit
from app.views import inspection_out, lot_out

router = APIRouter(tags=["lots"])


def _lot(db, user, lot_id: uuid.UUID) -> tuple[ProduceLot, Contract]:
    lot = get_or_404(db, ProduceLot, lot_id, "ล็อต")
    return lot, load_contract(db, user, lot.contract_id)


@router.get("/lots")
def list_lots(db: DB, user: CurrentUser):
    contract_ids = select(visible_contracts(user).subquery().c.id)
    rows = db.scalars(select(ProduceLot).where(ProduceLot.contract_id.in_(contract_ids)).order_by(ProduceLot.created_at.desc()))
    return [lot_out(lot) for lot in rows]


@router.post("/lots/{lot_id}/dispatch")
def dispatch(lot_id: uuid.UUID, payload: DispatchIn, db: DB, user: CurrentUser):
    lot, c = _lot(db, user, lot_id)
    _require(c, user, "DISPATCH_LOT")
    lot.vehicle, lot.transport_operator = payload.vehicle, payload.transport_operator
    lot.gross_kg, lot.tare_kg = payload.gross_kg, payload.tare_kg
    lot.net_kg = payload.gross_kg - payload.tare_kg
    lot.dispatched_at = datetime.now(timezone.utc)
    lot.status = "IN_TRANSIT"
    _apply(db, c, "IN_TRANSIT", user, f"ส่งล็อต {lot.code} น้ำหนักสุทธิ {lot.net_kg:,.0f} กก. ทะเบียนรถ {payload.vehicle}")
    db.commit()
    return get_contract(c.id, db, user)


@router.post("/lots/{lot_id}/receive")
def receive(lot_id: uuid.UUID, payload: ReceiveIn, db: DB, user: CurrentUser):
    lot, c = _lot(db, user, lot_id)
    _require(c, user, "RECEIVE_LOT")
    lot.received_kg = payload.received_kg
    lot.received_at = datetime.now(timezone.utc)
    lot.status = "INSPECTION_PENDING"
    _apply(db, c, "DELIVERED", user, f"ผู้ซื้อรับล็อต {lot.code} ชั่งได้ {payload.received_kg:,.0f} กก.")
    _apply(db, c, "QC_PENDING", None, "รอผู้ตรวจบันทึกผล GradeProof")
    db.commit()
    return get_contract(c.id, db, user)


@router.post("/lots/{lot_id}/inspections", status_code=201)
def inspect(lot_id: uuid.UUID, payload: InspectionCreate, db: DB, user: CurrentUser):
    lot, c = _lot(db, user, lot_id)
    _require(c, user, "RECORD_QC")
    received = lot.received_kg or Decimal(0)
    grade_qty: dict[str, Decimal] = {}
    for g in payload.grades:
        key = g.grade.strip().upper()
        grade_qty[key] = grade_qty.get(key, Decimal(0)) + g.quantity_kg
    accepted = sum(grade_qty.values(), Decimal(0))
    if abs(accepted + payload.rejected_kg - received) > 1:
        raise HTTPException(422, f"ผลรวมแต่ละเกรด + ที่ปฏิเสธ ({accepted + payload.rejected_kg:,.0f} กก.) "
                                 f"ต้องเท่ากับน้ำหนักที่รับ ({received:,.0f} กก.)")
    terms = c.terms
    flags = calc.discrepancy_flags(terms, received, grade_qty, payload.rejected_kg,
                                   payload.rejection_reason, payload.evidence_note)
    insp = QcInspection(
        lot_id=lot.id, contract_id=c.id, inspector_user_id=user.id, received_kg=received, accepted_kg=accepted,
        rejected_kg=payload.rejected_kg, rejection_reason=payload.rejection_reason,
        sampling_method=payload.sampling_method, evidence_note=payload.evidence_note, notes=payload.notes, flags=flags,
        grade_items=[QcGradeItem(grade=g, quantity_kg=q) for g, q in grade_qty.items()],
    )
    db.add(insp)
    lot.status = "INSPECTED"
    db.flush()

    result = calc.compute(grade_qty, terms["grade_prices"], payload.rejected_kg, Decimal(str(terms["deposit_thb"])))
    lines = [{k: (float(v) if isinstance(v, Decimal) else v) for k, v in line.items()} for line in result["lines"]]
    s = Settlement(
        contract_id=c.id, inspection_id=insp.id, lines=lines, gross_amount=result["gross"],
        deposit_amount=result["deposit"], net_amount=result["net"], paid_amount=Decimal(0),
        due_date=datetime.now(timezone.utc).date() + timedelta(days=terms["payment_due_days"]),
        status="PAYMENT_PENDING",
    )
    db.add(s)
    flag_note = f" พบประเด็นต้องตรวจทาน {len(flags)} รายการ" if flags else ""
    _apply(db, c, "QC_ACCEPTED", user, f"บันทึก GradeProof ล็อต {lot.code}: รับ {accepted:,.0f} กก. ปฏิเสธ {payload.rejected_kg:,.0f} กก.{flag_note}")
    _apply(db, c, "PAYMENT_PENDING", None, f"คำนวณยอดชำระสุทธิ {result['net']:,.2f} บาท ครบกำหนด {s.due_date.isoformat()}")
    if result["net"] == 0:
        s.status = "PAID"
        _apply(db, c, "PAID", None, "ยอดสุทธิเป็น 0 (หักมัดจำครบแล้ว)")
    db.commit()
    return get_contract(c.id, db, user)


@router.get("/inspections")
def list_inspections(db: DB, user: CurrentUser):
    contract_ids = select(visible_contracts(user).subquery().c.id)
    rows = db.scalars(select(QcInspection).where(QcInspection.contract_id.in_(contract_ids)).order_by(QcInspection.inspected_at.desc()))
    return [inspection_out(i) for i in rows]


__all__ = ["router", "audit"]
