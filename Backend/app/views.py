"""JSON shapes returned by the API. FastAPI encodes Decimal as number, UUID/date as string."""

import uuid
from datetime import date

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models import (
    AuditLog,
    Contract,
    Offer,
    Organization,
    ProduceListing,
    ProduceLot,
    PurchaseRequest,
    QcInspection,
    Settlement,
    TrustEvent,
    User,
)
from app.services import trust
from app.services.inventory import listing_inventory


def org_brief(o: Organization) -> dict:
    return {
        "id": o.id,
        "name": o.name,
        "kind": o.kind,
        "business_type": o.business_type,
        "province": o.province,
        "verified": o.verified,
    }


def user_out(u: User) -> dict:
    return {
        "id": u.id,
        "name": u.name,
        "email": u.email,
        "role": u.role,
        "title": u.title,
        "organization": org_brief(u.organization),
    }


def trust_events(db: Session, org_id: uuid.UUID) -> list[trust.Event]:
    rows = db.scalars(
        select(TrustEvent).where(TrustEvent.buyer_org_id == org_id, TrustEvent.verified.is_(True))
    ).all()
    return [trust.Event(r.dimension, r.success, r.transaction_ref, r.occurred_at) for r in rows]


class TrustCache:
    """Avoid recomputing the same buyer's profile within one request."""

    def __init__(self, db: Session):
        self.db = db
        self._cache: dict[uuid.UUID, dict] = {}

    def summary(self, org_id: uuid.UUID) -> dict:
        if org_id not in self._cache:
            p = trust.compute(trust_events(self.db, org_id))
            self._cache[org_id] = {k: p[k] for k in ("score", "band", "insufficient_data", "transactions")}
        return self._cache[org_id]


def top_price(offer: Offer) -> float:
    return max(float(p) for p in offer.grade_prices.values())


def listing_out(listing: ProduceListing) -> dict:
    return {
        "id": listing.id,
        "code": listing.code,
        "product_type": listing.product_type,
        "variety": listing.variety,
        "estimated_qty_kg": listing.estimated_qty_kg,
        "harvest_start": listing.harvest_start,
        "harvest_end": listing.harvest_end,
        "expected_grades": listing.expected_grades,
        "price_min": listing.price_min,
        "price_max": listing.price_max,
        "notes": listing.notes,
        "created_at": listing.created_at,
        "farm": {
            "id": listing.farm.id,
            "name": listing.farm.name,
            "province": listing.farm.province,
            "organization_id": listing.farm.organization_id,
        },
        "inventory": listing_inventory(listing),
        "pending_offers": sum(1 for o in listing.offers if o.status == "PENDING"),
    }


def request_out(r: PurchaseRequest, fill: dict | None = None) -> dict:
    return {
        "sourcing_mode": r.sourcing_mode,
        "max_suppliers": r.max_suppliers,
        "fill": fill,
        "id": r.id,
        "code": r.code,
        "buyer": org_brief(r.buyer_org),
        "product_type": r.product_type,
        "variety": r.variety,
        "quantity_kg": r.quantity_kg,
        "min_quantity_kg": r.min_quantity_kg,
        "target_price": r.target_price,
        "accepted_grades": r.accepted_grades,
        "quality_notes": r.quality_notes,
        "delivery_start": r.delivery_start,
        "delivery_end": r.delivery_end,
        "destination_province": r.destination_province,
        "payment_terms_days": r.payment_terms_days,
        "expires_on": r.expires_on,
        "status": r.status,
        "offers_count": len(r.offers),
        "created_at": r.created_at,
    }


def offer_out(o: Offer, trusts: TrustCache) -> dict:
    return {
        "id": o.id,
        "code": o.code,
        "status": o.status,
        "quantity_kg": o.quantity_kg,
        "min_quantity_kg": o.min_quantity_kg,
        "grade_prices": o.grade_prices,
        "top_price": top_price(o),
        "payment_terms_days": o.payment_terms_days,
        "deposit_thb": o.deposit_thb,
        "message": o.message,
        "created_at": o.created_at,
        "buyer": org_brief(o.buyer_org),
        "buyer_trust": trusts.summary(o.buyer_org_id),
        "purchase_request_code": o.purchase_request.code if o.purchase_request else None,
        "listing": {
            "id": o.listing.id,
            "code": o.listing.code,
            "product_type": o.listing.product_type,
            "variety": o.listing.variety,
            "farm_name": o.listing.farm.name,
            "harvest_start": o.listing.harvest_start,
            "harvest_end": o.listing.harvest_end,
        },
    }


def contract_brief(c: Contract) -> dict:
    s = c.settlement
    return {
        "id": c.id,
        "code": c.code,
        "status": c.status,
        "order_status": c.order_status,
        "quantity_kg": c.quantity_kg,
        "product_type": c.listing.product_type,
        "variety": c.listing.variety,
        "listing_code": c.listing.code,
        "farmer": org_brief(c.farmer_org),
        "buyer": org_brief(c.buyer_org),
        "top_price": top_price(c.offer),
        "delivery_window": c.terms["delivery_window"],
        "reservation_expires_at": c.reservation_expires_at,
        "created_at": c.created_at,
        "settlement_net": s.net_amount if s else None,
        "settlement_status": s.status if s else None,
        "sourcing": _sourcing_brief(c),
    }


def _sourcing_brief(c: Contract) -> dict | None:
    r = c.offer.purchase_request
    if r is None:
        return None
    return {"request_code": r.code, "mode": r.sourcing_mode, "max_suppliers": r.max_suppliers,
            "request_kg": r.quantity_kg}


def inspection_out(i: QcInspection) -> dict:
    return {
        "id": i.id,
        "lot_id": i.lot_id,
        "lot_code": i.lot.code,
        "contract_id": i.contract_id,
        "contract_code": i.lot.contract.code,
        "inspector": {"id": i.inspector.id, "name": i.inspector.name, "role": i.inspector.role},
        "inspected_at": i.inspected_at,
        "received_kg": i.received_kg,
        "accepted_kg": i.accepted_kg,
        "rejected_kg": i.rejected_kg,
        "rejection_reason": i.rejection_reason,
        "sampling_method": i.sampling_method,
        "evidence_note": i.evidence_note,
        "notes": i.notes,
        "flags": i.flags,
        "ai_assisted": i.ai_run_id is not None,
        "grades": [{"grade": g.grade, "quantity_kg": g.quantity_kg} for g in i.grade_items],
    }


def lot_out(lot: ProduceLot) -> dict:
    c = lot.contract
    return {
        "id": lot.id,
        "code": lot.code,
        "trace_token": lot.trace_token,
        "status": lot.status,
        "contract_id": c.id,
        "contract_code": c.code,
        "order_status": c.order_status,
        "product_type": c.listing.product_type,
        "variety": c.listing.variety,
        "farmer": org_brief(c.farmer_org),
        "buyer": org_brief(c.buyer_org),
        "contract_qty_kg": c.quantity_kg,
        "harvest_date": lot.harvest_date,
        "harvested_kg": lot.harvested_kg,
        "vehicle": lot.vehicle,
        "transport_operator": lot.transport_operator,
        "gross_kg": lot.gross_kg,
        "tare_kg": lot.tare_kg,
        "net_kg": lot.net_kg,
        "dispatched_at": lot.dispatched_at,
        "received_kg": lot.received_kg,
        "received_at": lot.received_at,
        "destination_province": c.terms["destination_province"],
        "inspections": [inspection_out(i) for i in lot.inspections],
    }


def settlement_out(s: Settlement) -> dict:
    c = s.contract
    overdue = s.status not in ("PAID",) and date.today() > s.due_date
    return {
        "id": s.id,
        "contract_id": c.id,
        "contract_code": c.code,
        "order_status": c.order_status,
        "product_type": c.listing.product_type,
        "variety": c.listing.variety,
        "farmer": org_brief(c.farmer_org),
        "buyer": org_brief(c.buyer_org),
        "lines": s.lines,
        "gross_amount": s.gross_amount,
        "deposit_amount": s.deposit_amount,
        "net_amount": s.net_amount,
        "paid_amount": s.paid_amount,
        "outstanding": max(s.net_amount - s.paid_amount, 0),
        "due_date": s.due_date,
        "status": "OVERDUE" if overdue else s.status,
        "created_at": s.created_at,
        "payments": [
            {"id": p.id, "amount": p.amount, "reference": p.reference, "paid_at": p.paid_at}
            for p in s.payments
        ],
    }


def audit_out(a: AuditLog) -> dict:
    return {
        "id": a.id,
        "entity_type": a.entity_type,
        "entity_id": a.entity_id,
        "entity_code": a.entity_code,
        "action": a.action,
        "from_status": a.from_status,
        "to_status": a.to_status,
        "actor": {"id": a.actor.id, "name": a.actor.name} if a.actor else None,
        "actor_role": a.actor_role,
        "contract_id": a.contract_id,
        "message": a.message,
        "created_at": a.created_at,
    }


def contract_timeline(db: Session, c: Contract) -> list[dict]:
    related = [c.id, c.offer_id, c.listing_id]
    if c.offer.purchase_request_id:
        related.append(c.offer.purchase_request_id)
    rows = db.scalars(
        select(AuditLog)
        .where(or_(AuditLog.contract_id == c.id, AuditLog.entity_id.in_(related)))
        .order_by(AuditLog.created_at)
    ).all()
    # Listing creation and request creation are shared by several contracts; keep them, drop other contracts' events.
    return [audit_out(a) for a in rows if a.contract_id in (None, c.id)]
