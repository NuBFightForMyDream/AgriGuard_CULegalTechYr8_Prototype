import uuid
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Header, HTTPException
from sqlalchemy import select

from app.deps import DB, CurrentUser, get_or_404
from app.models import Payment, Settlement
from app.routers.contracts import _apply, _require, get_contract, load_contract, visible_contracts
from app.schemas import PaymentCreate
from app.services.orders import audit
from app.views import settlement_out

router = APIRouter(prefix="/settlements", tags=["settlements"])


@router.get("")
def list_settlements(db: DB, user: CurrentUser):
    contract_ids = select(visible_contracts(user).subquery().c.id)
    rows = db.scalars(select(Settlement).where(Settlement.contract_id.in_(contract_ids)).order_by(Settlement.created_at.desc()))
    return [settlement_out(s) for s in rows]


@router.post("/{settlement_id}/payments", status_code=201)
def record_payment(
    settlement_id: uuid.UUID,
    payload: PaymentCreate,
    db: DB,
    user: CurrentUser,
    idempotency_key: Annotated[str | None, Header()] = None,
):
    s = get_or_404(db, Settlement, settlement_id, "รายการชำระเงิน")
    c = load_contract(db, user, s.contract_id)
    if idempotency_key and db.scalar(select(Payment.id).where(Payment.idempotency_key == idempotency_key)):
        return get_contract(c.id, db, user)  # replayed request: no second payment
    _require(c, user, "RECORD_PAYMENT")
    outstanding = s.net_amount - s.paid_amount
    if payload.amount > outstanding + Decimal("0.01"):
        raise HTTPException(422, f"ยอดชำระเกินยอดค้าง ({outstanding:,.2f} บาท)")
    db.add(Payment(settlement_id=s.id, amount=payload.amount, reference=payload.reference,
                   idempotency_key=idempotency_key, recorded_by=user.id))
    s.paid_amount += payload.amount
    audit(db, entity_type="settlement", entity_id=s.id, entity_code=c.code, action="PAYMENT_RECORDED", actor=user,
          contract=c, message=f"บันทึกการชำระเงิน {payload.amount:,.2f} บาท (อ้างอิง {payload.reference}) — จำลอง ไม่ใช่การโอนเงินจริง")
    if s.paid_amount >= s.net_amount:
        s.status = "PAID"
        _apply(db, c, "PAID", user, "ชำระครบตามยอดสุทธิ รอเกษตรกรยืนยันการได้รับเงิน")
    else:
        s.status = "PARTIALLY_PAID"
    db.commit()
    return get_contract(c.id, db, user)
