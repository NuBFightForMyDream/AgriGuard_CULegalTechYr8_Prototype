import uuid
from typing import Annotated

from fastapi import Depends, Header, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User

DB = Annotated[Session, Depends(get_db)]


def current_user(db: DB, x_demo_user: Annotated[str | None, Header()] = None) -> User:
    """Phase 1 demo sign-in: the client sends the selected demo user's id.

    Phase 2 replaces this with Supabase JWT verification (Technical/deployment.md).
    """
    if not x_demo_user:
        raise HTTPException(401, "กรุณาเข้าสู่ระบบ")
    try:
        user = db.get(User, uuid.UUID(x_demo_user))
    except ValueError:
        user = None
    if user is None:
        raise HTTPException(401, "ไม่พบผู้ใช้ กรุณาเข้าสู่ระบบใหม่")
    return user


CurrentUser = Annotated[User, Depends(current_user)]


def require_role(user: User, *roles: str) -> None:
    if user.role not in roles:
        raise HTTPException(403, "บทบาทของคุณไม่มีสิทธิ์ทำรายการนี้")


def get_or_404(db: Session, model, obj_id, label: str = "รายการ"):
    obj = db.get(model, obj_id)
    if obj is None:
        raise HTTPException(404, f"ไม่พบ{label}")
    return obj


def next_code(db: Session, model, prefix: str) -> str:
    count = db.scalar(select(func.count()).select_from(model).where(model.code.like(f"{prefix}%"))) or 0
    return f"{prefix}{count + 1:03d}"
