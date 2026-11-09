import uuid
from datetime import date

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from app.deps import DB, CurrentUser, get_or_404
from app.models import Organization, TrustEvent
from app.services import trust
from app.views import org_brief, trust_events

router = APIRouter(tags=["agritrust"])


@router.get("/buyers")
def list_buyers(db: DB, user: CurrentUser):
    out = []
    for o in db.scalars(select(Organization).where(Organization.kind == "BUYER").order_by(Organization.name)):
        p = trust.compute(trust_events(db, o.id))
        out.append({**org_brief(o), "trust": {k: p[k] for k in ("score", "band", "insufficient_data", "transactions")}})
    return out


@router.get("/organizations/{org_id}/trust")
def trust_profile(org_id: uuid.UUID, db: DB, user: CurrentUser):
    org = get_or_404(db, Organization, org_id, "องค์กร")
    if org.kind != "BUYER":
        raise HTTPException(404, "AgriTrust ใช้กับผู้ซื้อเท่านั้น")
    events = trust_events(db, org.id)
    recent = db.scalars(
        select(TrustEvent).where(TrustEvent.buyer_org_id == org.id).order_by(TrustEvent.occurred_at.desc()).limit(15)
    ).all()
    return {
        "organization": org_brief(org),
        "profile": trust.compute(events),
        "history": trust.monthly_history(events, date.today()),
        "min_transactions": trust.MIN_TRANSACTIONS,
        "recent_events": [
            {"id": e.id, "dimension": e.dimension, "success": e.success, "verified": e.verified,
             "transaction_ref": e.transaction_ref, "contract_id": e.contract_id, "note": e.note,
             "occurred_at": e.occurred_at}
            for e in recent
        ],
    }
