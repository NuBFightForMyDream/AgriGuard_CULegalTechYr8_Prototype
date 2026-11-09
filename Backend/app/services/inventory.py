from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Contract, ProduceListing
from app.services.orders import INACTIVE, RESERVED, transition

ZERO = Decimal(0)


def aware(dt: datetime | None) -> datetime | None:
    """SQLite returns naive datetimes; everything is stored in UTC."""
    if dt is None or dt.tzinfo is not None:
        return dt
    return dt.replace(tzinfo=timezone.utc)


def listing_inventory(listing: ProduceListing) -> dict:
    """Separate estimated, reserved, contracted and actual quantities (overall_flow §6)."""
    est = listing.estimated_qty_kg
    reserved = contracted = harvested = delivered = accepted = rejected = ZERO
    active = [c for c in listing.contracts if c.order_status not in INACTIVE]
    for c in active:
        if c.order_status in RESERVED:
            reserved += c.quantity_kg
        else:
            contracted += c.quantity_kg
        for lot in c.lots:
            harvested += lot.harvested_kg
            delivered += lot.received_kg or ZERO
            for insp in lot.inspections:
                accepted += insp.accepted_kg
                rejected += insp.rejected_kg
    available = max(est - reserved - contracted, ZERO)
    committed = reserved + contracted
    if active and available == 0 and all(c.order_status == "COMPLETED" for c in active):
        status = "CLOSED"
    elif committed == 0:
        status = "AVAILABLE"
    elif contracted >= est:
        status = "CONTRACTED"
    elif committed >= est:
        status = "FULLY_RESERVED"
    else:
        status = "PARTIALLY_RESERVED"
    return {
        "estimated_kg": est,
        "available_kg": available,
        "reserved_kg": reserved,
        "contracted_kg": contracted,
        "harvested_kg": harvested,
        "delivered_kg": delivered,
        "accepted_kg": accepted,
        "rejected_kg": rejected,
        "status": status,
    }


def expire_reservations(db: Session) -> None:
    """Release reservations the buyer did not confirm in time (lazy expiry on read)."""
    now = datetime.now(timezone.utc)
    rows = db.scalars(
        select(Contract).where(
            Contract.order_status == "AWAITING_CONFIRMATION", Contract.reservation_expires_at < now
        )
    ).all()
    for c in rows:
        transition(db, c, "RESERVATION_EXPIRED", None, "ผู้ซื้อไม่ยืนยัน HarvestLock ภายในเวลาที่กำหนด ระบบคืนผลผลิตที่จองไว้")
        c.status = "TERMINATED"
        c.offer.status = "EXPIRED"
    if rows:
        db.commit()
