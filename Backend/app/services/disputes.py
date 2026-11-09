"""Dispute workflow (Business & Legals/settlement-disputes.md, overall_flow §15).

OPEN → EVIDENCE_COLLECTION → UNDER_REVIEW ⇄ REINSPECTION_REQUESTED → RESOLVED → CLOSED.
A dispute pauses the order. Only a reviewer's verified outcome can affect AgriTrust; an open dispute never does.
"""

from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Contract, Dispute

CATEGORIES = {
    "NO_PICKUP": "ผู้ซื้อไม่มารับสินค้า",
    "CANCELLED_AFTER_CONFIRMATION": "ยกเลิกหลังยืนยันสัญญา",
    "PRICE_CHANGED": "เปลี่ยนราคาจากที่ตกลง",
    "SHORT_DELIVERY": "ส่งมอบน้อยกว่าที่ตกลง",
    "GRADE_DISPUTE": "โต้แย้งผลการคัดเกรด",
    "UNSUPPORTED_REJECTION": "ปฏิเสธสินค้าโดยไม่มีหลักฐานเพียงพอ",
    "LATE_PAYMENT": "ชำระเงินล่าช้า",
}
OUTCOMES = {
    "BUYER_RESPONSIBLE": "ผู้ซื้อเป็นฝ่ายรับผิดชอบ",
    "FARMER_RESPONSIBLE": "เกษตรกรเป็นฝ่ายรับผิดชอบ",
    "SHARED": "รับผิดชอบร่วมกัน",
    "NO_FAULT": "ไม่มีฝ่ายใดผิด",
}
OPEN_STATES = {"OPEN", "EVIDENCE_COLLECTION", "UNDER_REVIEW", "REINSPECTION_REQUESTED"}
RESPONSE_HOURS = 48


def active_dispute(db: Session, contract: Contract) -> Dispute | None:
    return db.scalar(select(Dispute).where(Dispute.contract_id == contract.id, Dispute.status.in_(OPEN_STATES)))


def deadline() -> datetime:
    return datetime.now(timezone.utc) + timedelta(hours=RESPONSE_HOURS)


def held_amount(contract: Contract, disputed: Decimal) -> Decimal:
    s = contract.settlement
    if s is None:
        return Decimal(0)
    return max(Decimal(0), min(disputed, s.net_amount - s.paid_amount))


def buyer_at_fault(db: Session, contract: Contract) -> bool:
    return db.scalar(select(Dispute.id).where(
        Dispute.contract_id == contract.id, Dispute.outcome.in_(("BUYER_RESPONSIBLE", "SHARED"))
    )) is not None
