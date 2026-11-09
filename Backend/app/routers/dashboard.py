from datetime import date
from decimal import Decimal

from fastapi import APIRouter
from sqlalchemy import or_, select

from app.deps import DB, CurrentUser
from app.models import AuditLog, Contract, Dispute, Farm, Offer, Organization, ProduceListing, ProduceLot, PurchaseRequest
from app.routers.contracts import visible_contracts
from app.routers.purchase_requests import _demand, _supply
from app.services import matching, trust
from app.services.disputes import OPEN_STATES
from app.services.inventory import expire_reservations, listing_inventory
from app.services.orders import INACTIVE
from app.views import TrustCache, audit_out, contract_brief, lot_out, offer_out, top_price, trust_events

router = APIRouter(tags=["dashboard"])

PIPELINE = [
    ("รอยืนยัน", {"AWAITING_CONFIRMATION"}),
    ("ยืนยันแล้ว", {"CONFIRMED"}),
    ("เก็บเกี่ยว/ขนส่ง", {"HARVESTED", "IN_TRANSIT", "DELIVERED"}),
    ("รอตรวจคุณภาพ", {"QC_PENDING"}),
    ("รอชำระเงิน", {"QC_ACCEPTED", "PAYMENT_PENDING", "PAYMENT_OVERDUE", "PAID"}),
    ("เสร็จสิ้น", {"COMPLETED"}),
    ("ข้อพิพาท", {"DISPUTED"}),
]
Z = Decimal(0)


def _recent(db, user, limit=8):
    q = select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit)
    if user.role in ("FARMER", "BUYER"):
        q = q.where(or_(AuditLog.farmer_org_id == user.organization_id, AuditLog.buyer_org_id == user.organization_id))
    return [audit_out(a) for a in db.scalars(q)]


def _pipeline(contracts):
    return [{"stage": label, "count": sum(1 for c in contracts if c.order_status in states)} for label, states in PIPELINE]


def _outstanding(contracts):
    return sum((c.settlement.net_amount - c.settlement.paid_amount for c in contracts
                if c.settlement and c.settlement.status != "PAID"), Z)


@router.get("/dashboard")
def dashboard(db: DB, user: CurrentUser):
    expire_reservations(db)
    contracts = [c for c in db.scalars(visible_contracts(user)) if c.order_status not in INACTIVE]
    active = [c for c in contracts if c.order_status != "COMPLETED"]
    trusts = TrustCache(db)
    base = {"role": user.role, "recent_activity": _recent(db, user), "pipeline": _pipeline(contracts)}

    if user.role == "FARMER":
        listings = db.scalars(select(ProduceListing).join(Farm).where(Farm.organization_id == user.organization_id)
                              .order_by(ProduceListing.harvest_start)).all()
        inv = [(listing, listing_inventory(listing)) for listing in listings]
        offers = db.scalars(select(Offer).join(ProduceListing).join(Farm).where(
            Farm.organization_id == user.organization_id, Offer.status == "PENDING").order_by(Offer.created_at.desc())).all()
        return {
            **base,
            "kpis": {
                "estimated_kg": sum((i["estimated_kg"] for _, i in inv), Z),
                "available_kg": sum((i["available_kg"] for _, i in inv), Z),
                "reserved_kg": sum((i["reserved_kg"] for _, i in inv), Z),
                "contracted_kg": sum((i["contracted_kg"] for _, i in inv), Z),
                "pending_offers": len(offers),
                "active_orders": sum(1 for c in active if c.order_status != "AWAITING_CONFIRMATION"),
                "expected_revenue": sum((c.quantity_kg * Decimal(str(top_price(c.offer))) for c in contracts), Z),
                "payments_pending": _outstanding(contracts),
            },
            "allocation_chart": [
                {"code": listing.code, "product_type": listing.product_type, "variety": listing.variety,
                 "available": i["available_kg"], "reserved": i["reserved_kg"], "contracted": i["contracted_kg"]}
                for listing, i in inv
            ],
            "upcoming_harvests": [
                {"id": listing.id, "code": listing.code, "product_type": listing.product_type, "variety": listing.variety,
                 "harvest_start": listing.harvest_start, "harvest_end": listing.harvest_end, "estimated_kg": listing.estimated_qty_kg}
                for listing, _ in inv if listing.harvest_end >= date.today()
            ][:5],
            "recent_offers": [offer_out(o, trusts) for o in offers[:5]],
            "orders": [contract_brief(c) for c in active[:8]],
        }

    if user.role == "BUYER":
        requests = db.scalars(select(PurchaseRequest).where(
            PurchaseRequest.buyer_org_id == user.organization_id, PurchaseRequest.status == "OPEN")).all()
        listings = db.scalars(select(ProduceListing)).all()
        cache: dict = {}
        matched = {listing.id for r in requests for listing in listings
                   if matching.evaluate(_supply(db, listing, cache), _demand(r))["eligible"]}
        lots = db.scalars(select(ProduceLot).where(ProduceLot.contract_id.in_([c.id for c in contracts]))).all()
        profile = trust.compute(trust_events(db, user.organization_id))
        return {
            **base,
            "kpis": {
                "open_requests": len(requests),
                "matched_farms": len(matched),
                "pending_offers": db.query(Offer).filter(Offer.buyer_org_id == user.organization_id, Offer.status == "PENDING").count(),
                "confirmed_orders": sum(1 for c in active if c.order_status != "AWAITING_CONFIRMATION"),
                "awaiting_my_confirmation": sum(1 for c in active if c.order_status == "AWAITING_CONFIRMATION"),
                "incoming_deliveries": sum(1 for lot in lots if lot.status == "IN_TRANSIT"),
                "pending_inspections": sum(1 for c in active if c.order_status == "QC_PENDING"),
                "payment_obligations": _outstanding(contracts),
            },
            "trust": {k: profile[k] for k in ("score", "band", "insufficient_data", "transactions")},
            "orders": [contract_brief(c) for c in active[:8]],
            "incoming": [lot_out(lot) for lot in lots if lot.status in ("READY_FOR_PICKUP", "IN_TRANSIT")],
        }

    if user.role == "INSPECTOR":
        queue = [c for c in active if c.order_status == "QC_PENDING"]
        return {
            **base,
            "kpis": {"queue": len(queue), "in_transit": sum(1 for c in active if c.order_status == "IN_TRANSIT")},
            "queue": [lot_out(c.lots[-1]) for c in queue if c.lots],
        }

    farms = db.query(Organization).filter(Organization.kind == "FARM").count()
    buyers = db.query(Organization).filter(Organization.kind == "BUYER").count()
    completed = sum(1 for c in contracts if c.order_status == "COMPLETED")
    disputes = db.scalars(select(Dispute)).all()
    return {
        **base,
        "kpis": {
            "open_disputes": sum(1 for d in disputes if d.status in OPEN_STATES),
            "dispute_rate": round(100 * len({d.contract_id for d in disputes}) / len(contracts), 1) if contracts else None,
            "transactions": len(contracts),
            "contract_value": sum((c.quantity_kg * Decimal(str(top_price(c.offer))) for c in contracts), Z),
            "farmers": farms,
            "buyers": buyers,
            "completion_rate": round(100 * completed / len(contracts), 1) if contracts else None,
        },
        "orders": [contract_brief(c) for c in active[:10]],
    }
