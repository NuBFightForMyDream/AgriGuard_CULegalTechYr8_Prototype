from fastapi import APIRouter, Query
from sqlalchemy import or_, select

from app.deps import DB, CurrentUser
from app.models import AuditLog
from app.views import audit_out

router = APIRouter(tags=["history"])


@router.get("/history")
def history(db: DB, user: CurrentUser, limit: int = Query(200, le=500)):
    q = select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit)
    if user.role in ("FARMER", "BUYER"):
        q = q.where(or_(AuditLog.farmer_org_id == user.organization_id, AuditLog.buyer_org_id == user.organization_id))
    return [audit_out(a) for a in db.scalars(q)]
