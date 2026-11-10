"""Buyer sourcing mode on a purchase request: one supplier (SINGLE) or several (MULTI, optionally capped).

Fill is computed from the HarvestLocks that came from the request's offers. When the buyer signs, this module
closes what the chosen mode no longer allows: in SINGLE mode every other offer and reservation for the request;
in MULTI mode the rest once the quantity is covered or the supplier cap is reached. Nothing already signed is
touched, and every automatic step is written to the audit trail.
"""

from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Contract, Offer, PurchaseRequest
from app.services.orders import INACTIVE, RESERVED, audit, transition

MODE_TH = {"SINGLE": "ผู้ขายรายเดียว", "MULTI": "หลายผู้ขาย"}
ZERO = Decimal(0)


def _contracts(db: Session, r: PurchaseRequest) -> list[Contract]:
    return list(db.scalars(select(Contract).join(Offer, Contract.offer_id == Offer.id).where(Offer.purchase_request_id == r.id)))


def fill(db: Session, r: PurchaseRequest) -> dict:
    contracts = [c for c in _contracts(db, r) if c.order_status not in INACTIVE]
    confirmed = [c for c in contracts if c.order_status not in RESERVED]
    reserved = [c for c in contracts if c.order_status in RESERVED]
    confirmed_kg = sum((c.quantity_kg for c in confirmed), ZERO)
    return {
        "confirmed_kg": confirmed_kg,
        "reserved_kg": sum((c.quantity_kg for c in reserved), ZERO),
        "remaining_kg": max(r.quantity_kg - confirmed_kg, ZERO),
        "suppliers": len({c.farmer_org_id for c in confirmed}),
        "supplier_names": sorted({c.farmer_org.name for c in confirmed}),
    }


def accepting_offers(db: Session, r: PurchaseRequest) -> tuple[bool, str | None]:
    if r.status in ("FULFILLED", "CANCELLED"):
        return False, "คำขอซื้อนี้ปิดรับข้อเสนอแล้ว"
    f = fill(db, r)
    if r.sourcing_mode == "SINGLE" and f["suppliers"] >= 1:
        return False, "คำขอนี้เลือกซื้อจากผู้ขายรายเดียวและได้ลงนามสัญญาแล้ว"
    if r.max_suppliers and f["suppliers"] >= r.max_suppliers:
        return False, f"ได้ผู้ขายครบ {r.max_suppliers} รายตามที่กำหนดแล้ว"
    return True, None


def _close_others(db: Session, r: PurchaseRequest, keep_farms: set, reason: str) -> int:
    """Withdraw pending offers and release unsigned reservations for this request, except from keep_farms."""
    closed = 0
    for o in r.offers:
        if o.status == "PENDING" and o.listing.farm.organization_id not in keep_farms:
            o.status = "WITHDRAWN"
            audit(db, entity_type="offer", entity_id=o.id, entity_code=o.code, action="OFFER_WITHDRAWN", actor=None,
                  farmer_org_id=o.listing.farm.organization_id, buyer_org_id=o.buyer_org_id,
                  from_status="PENDING", to_status="WITHDRAWN", message=f"ถอนข้อเสนออัตโนมัติ: {reason}")
            closed += 1
    for c in _contracts(db, r):
        if c.order_status in RESERVED and c.farmer_org_id not in keep_farms:
            transition(db, c, "CANCELLED", None, f"ปล่อยการจองอัตโนมัติ: {reason}")
            c.status = "TERMINATED"
            c.offer.status = "DECLINED"
            closed += 1
    return closed


def refresh(db: Session, r: PurchaseRequest) -> None:
    """Recompute status after a signature and close what the sourcing mode no longer allows."""
    if r.status == "CANCELLED":
        return
    f = fill(db, r)
    confirmed_farms = {c.farmer_org_id for c in _contracts(db, r)
                       if c.order_status not in INACTIVE and c.order_status not in RESERVED}
    new_status = "FULFILLED" if (f["confirmed_kg"] >= r.quantity_kg or (r.sourcing_mode == "SINGLE" and confirmed_farms)) \
        else "PARTIALLY_FILLED" if confirmed_farms else "OPEN"
    if new_status != r.status:
        audit(db, entity_type="purchase_request", entity_id=r.id, entity_code=r.code, action="REQUEST_STATUS_CHANGED", actor=None,
              buyer_org_id=r.buyer_org_id, from_status=r.status, to_status=new_status,
              message=f"ได้รับสินค้าตามสัญญาแล้ว {f['confirmed_kg']:,.0f} จาก {r.quantity_kg:,.0f} กก. ({len(confirmed_farms)} ผู้ขาย)")
        r.status = new_status
    if r.sourcing_mode == "SINGLE" and confirmed_farms:
        _close_others(db, r, confirmed_farms, "ผู้ซื้อเลือกซื้อจากผู้ขายรายเดียวและลงนามสัญญาแล้ว")
    elif new_status == "FULFILLED":
        _close_others(db, r, confirmed_farms, "คำขอซื้อได้ปริมาณครบแล้ว")
    elif r.max_suppliers and len(confirmed_farms) >= r.max_suppliers:
        _close_others(db, r, confirmed_farms, f"ได้ผู้ขายครบ {r.max_suppliers} รายตามที่ผู้ซื้อกำหนด")
