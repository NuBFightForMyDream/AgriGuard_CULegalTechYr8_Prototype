import uuid
from datetime import datetime, timezone

from fastapi import APIRouter
from sqlalchemy import func, select, update

from app.deps import DB, CurrentUser, get_or_404
from app.models import Notification

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("")
def list_notifications(db: DB, user: CurrentUser):
    rows = db.scalars(select(Notification).where(Notification.organization_id == user.organization_id)
                      .order_by(Notification.created_at.desc()).limit(30)).all()
    unread = db.scalar(select(func.count()).select_from(Notification).where(
        Notification.organization_id == user.organization_id, Notification.read_at.is_(None))) or 0
    return {"unread": unread, "items": [
        {"id": n.id, "title": n.title, "body": n.body, "link": n.link, "read": n.read_at is not None, "created_at": n.created_at}
        for n in rows]}


@router.post("/read-all")
def read_all(db: DB, user: CurrentUser):
    db.execute(update(Notification).where(Notification.organization_id == user.organization_id, Notification.read_at.is_(None))
               .values(read_at=datetime.now(timezone.utc)))
    db.commit()
    return {"ok": True}


@router.post("/{notification_id}/read")
def read_one(notification_id: uuid.UUID, db: DB, user: CurrentUser):
    n = get_or_404(db, Notification, notification_id, "การแจ้งเตือน")
    if n.organization_id == user.organization_id and n.read_at is None:
        n.read_at = datetime.now(timezone.utc)
        db.commit()
    return {"ok": True}
