import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, HTTPException
from sqlalchemy import func, select

from app.deps import DB, CurrentUser, get_or_404
from app.models import Contract, EvidenceFile, ProduceLot, QcGradeItem, QcInspection, Settlement
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
    if lot.status != "READY_FOR_PICKUP":
        raise HTTPException(409, "ล็อตนี้ส่งไปแล้ว")
    lot.vehicle, lot.transport_operator = payload.vehicle, payload.transport_operator
    lot.gross_kg, lot.tare_kg = payload.gross_kg, payload.tare_kg
    lot.net_kg = payload.gross_kg - payload.tare_kg
    lot.dispatched_at = datetime.now(timezone.utc)
    lot.status = "IN_TRANSIT"
    message = f"ส่งล็อต {lot.code} น้ำหนักสุทธิ {lot.net_kg:,.0f} กก. ทะเบียนรถ {payload.vehicle}"
    if c.order_status == "HARVESTED":
        _apply(db, c, "IN_TRANSIT", user, message)
    else:
        audit(db, entity_type="lot", entity_id=lot.id, entity_code=lot.code, action="LOT_DISPATCHED", actor=user, contract=c, message=message)
    db.commit()
    return get_contract(c.id, db, user)


@router.post("/lots/{lot_id}/receive")
def receive(lot_id: uuid.UUID, payload: ReceiveIn, db: DB, user: CurrentUser):
    lot, c = _lot(db, user, lot_id)
    _require(c, user, "RECEIVE_LOT")
    if lot.status != "IN_TRANSIT":
        raise HTTPException(409, "ล็อตนี้ยังไม่ได้ส่งหรือรับไปแล้ว")
    lot.received_kg = payload.received_kg
    lot.received_at = datetime.now(timezone.utc)
    lot.status = "INSPECTION_PENDING"
    message = f"ผู้ซื้อรับล็อต {lot.code} ชั่งได้ {payload.received_kg:,.0f} กก."
    if any(other.status in ("READY_FOR_PICKUP", "IN_TRANSIT") for other in c.lots):
        audit(db, entity_type="lot", entity_id=lot.id, entity_code=lot.code, action="LOT_RECEIVED", actor=user, contract=c,
              message=message + " — รอล็อตที่เหลือ")
    else:
        _apply(db, c, "DELIVERED", user, message)
        _apply(db, c, "QC_PENDING", None, "รับครบทุกล็อตแล้ว รอผู้ตรวจบันทึกผล GradeProof")
    db.commit()
    return get_contract(c.id, db, user)


@router.post("/lots/{lot_id}/inspections", status_code=201)
def inspect(lot_id: uuid.UUID, payload: InspectionCreate, db: DB, user: CurrentUser):
    lot, c = _lot(db, user, lot_id)
    _require(c, user, "RECORD_QC")
    if lot.status != "INSPECTION_PENDING":
        raise HTTPException(409, "ล็อตนี้ไม่ได้รอตรวจ")
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
    files = db.scalar(select(func.count()).select_from(EvidenceFile).where(
        EvidenceFile.entity_type == "lot", EvidenceFile.entity_id == lot.id)) or 0
    evidence = payload.evidence_note or (f"ไฟล์แนบ {files} ไฟล์" if files else None)
    # Quantity is judged per contract (all lots), the rest per lot.
    flags = [f for f in calc.discrepancy_flags(terms, received, grade_qty, payload.rejected_kg, payload.rejection_reason, evidence)
             if f["code"] not in calc.QUANTITY_FLAGS]
    insp = QcInspection(
        lot_id=lot.id, contract_id=c.id, inspector_user_id=user.id, received_kg=received, accepted_kg=accepted,
        rejected_kg=payload.rejected_kg, rejection_reason=payload.rejection_reason,
        sampling_method=payload.sampling_method, evidence_note=evidence, notes=payload.notes, flags=flags,
        grade_items=[QcGradeItem(grade=g, quantity_kg=q) for g, q in grade_qty.items()],
    )
    db.add(insp)
    lot.status = "INSPECTED"
    db.flush()
    if any(other.status != "INSPECTED" for other in c.lots):
        audit(db, entity_type="lot", entity_id=lot.id, entity_code=lot.code, action="LOT_INSPECTED", actor=user, contract=c,
              message=f"บันทึก GradeProof ล็อต {lot.code}: รับ {accepted:,.0f} กก. ปฏิเสธ {payload.rejected_kg:,.0f} กก. — รอตรวจล็อตที่เหลือ")
        db.commit()
        return get_contract(c.id, db, user)

    # All lots inspected: settle on the latest inspection of every lot.
    latest = [lt.inspections[-1] for lt in c.lots]
    grade_qty, rejected_total, received_total = {}, Decimal(0), Decimal(0)
    for i in latest:
        received_total += i.received_kg
        rejected_total += i.rejected_kg
        for g in i.grade_items:
            grade_qty[g.grade] = grade_qty.get(g.grade, Decimal(0)) + g.quantity_kg
    accepted = sum(grade_qty.values(), Decimal(0))
    insp.flags = [*insp.flags, *[f for f in calc.discrepancy_flags(terms, received_total, grade_qty, Decimal(0), None, "x")
                                 if f["code"] in calc.QUANTITY_FLAGS]]
    flags = insp.flags
    result = calc.compute(grade_qty, terms["grade_prices"], rejected_total, Decimal(str(terms["deposit_thb"])))
    lines = [{k: (float(v) if isinstance(v, Decimal) else v) for k, v in line.items()} for line in result["lines"]]
    s = Settlement(
        contract_id=c.id, inspection_id=insp.id, lines=lines, gross_amount=result["gross"],
        deposit_amount=result["deposit"], net_amount=result["net"], paid_amount=Decimal(0),
        due_date=datetime.now(timezone.utc).date() + timedelta(days=terms["payment_due_days"]),
        status="PAYMENT_PENDING",
    )
    db.add(s)
    flag_note = f" พบประเด็นต้องตรวจทาน {len(flags)} รายการ" if flags else ""
    lots_note = f" (รวม {len(c.lots)} ล็อต)" if len(c.lots) > 1 else f" ล็อต {lot.code}"
    _apply(db, c, "QC_ACCEPTED", user, f"บันทึก GradeProof{lots_note}: รับ {accepted:,.0f} กก. ปฏิเสธ {rejected_total:,.0f} กก.{flag_note}")
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


@router.get("/trace/{token}")
def trace(token: str, db: DB):
    """Public lot trace behind the QR code: product, origin, timeline and grade summary only.
    No personal names, buyer identity or prices."""
    lot = db.scalar(select(ProduceLot).where(ProduceLot.trace_token == token))
    if lot is None:
        raise HTTPException(404, "ไม่พบล็อตนี้")
    c = lot.contract
    insp = lot.inspections[-1] if lot.inspections else None
    steps = [("เก็บเกี่ยว", lot.created_at), ("ออกจากสวน", lot.dispatched_at), ("ถึงปลายทาง", lot.received_at),
             ("ตรวจคุณภาพ", insp.inspected_at if insp else None)]
    return {
        "lot_code": lot.code,
        "product_type": c.listing.product_type,
        "variety": c.listing.variety,
        "farm_name": c.farmer_org.name,
        "farm_province": c.listing.farm.province,
        "farm_verified": c.farmer_org.verified,
        "harvest_date": lot.harvest_date,
        "net_kg": lot.net_kg or lot.harvested_kg,
        "destination_province": c.terms["destination_province"],
        "status": lot.status,
        "steps": [{"label": label, "at": at} for label, at in steps],
        "grades": [{"grade": g.grade, "quantity_kg": g.quantity_kg} for g in insp.grade_items] if insp else [],
        "rejected_kg": insp.rejected_kg if insp else None,
    }


__all__ = ["router", "audit"]
