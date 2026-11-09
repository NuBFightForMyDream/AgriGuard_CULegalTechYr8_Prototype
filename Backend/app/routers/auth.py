"""Google sign-in via Supabase: session status and first-time onboarding (Technical/deployment.md)."""

import uuid
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select

from app.catalog import PROVINCES
from app.config import settings
from app.deps import DB, Claims
from app.models import Farm, Organization, User
from app.services.orders import audit
from app.views import user_out

router = APIRouter(tags=["auth"])


def _identity(claims: dict) -> tuple[uuid.UUID, str, str]:
    meta = claims.get("user_metadata") or {}
    email = claims.get("email") or meta.get("email") or ""
    name = meta.get("full_name") or meta.get("name") or email.split("@")[0]
    return uuid.UUID(claims["sub"]), email, name


@router.get("/auth/config")
def auth_config():
    return {"google": bool(settings.supabase_url), "demo_login": settings.demo_login}


@router.get("/auth/session")
def session(db: DB, claims: Claims):
    if claims is None:
        raise HTTPException(401, "กรุณาเข้าสู่ระบบ")
    sub, email, name = _identity(claims)
    user = db.scalar(select(User).where(User.auth_user_id == sub))
    return {"onboarding_required": user is None, "email": email, "name": name, "user": user_out(user) if user else None}


class Onboarding(BaseModel):
    # Inspector and Admin roles are granted by an Admin, never self-selected.
    role: Literal["FARMER", "BUYER"]
    organization_name: str = Field(min_length=2, max_length=120)
    province: str
    business_type: Literal["EXPORTER", "PROCESSOR", "WHOLESALER"] | None = None
    phone: str | None = Field(default=None, max_length=32)

    @field_validator("province")
    @classmethod
    def check_province(cls, v: str) -> str:
        if v not in PROVINCES:
            raise ValueError("ไม่รู้จักจังหวัดนี้")
        return v


@router.post("/onboarding", status_code=201)
def onboard(payload: Onboarding, db: DB, claims: Claims):
    if claims is None:
        raise HTTPException(401, "ต้องเข้าสู่ระบบด้วย Google ก่อน")
    sub, email, name = _identity(claims)
    if db.scalar(select(User.id).where(User.auth_user_id == sub)):
        raise HTTPException(409, "บัญชีนี้ลงทะเบียนแล้ว")
    if db.scalar(select(User.id).where(User.email == email)):
        raise HTTPException(409, "อีเมลนี้ถูกใช้กับบัญชีอื่นแล้ว")
    org = Organization(
        name=payload.organization_name,
        kind="FARM" if payload.role == "FARMER" else "BUYER",
        business_type=payload.business_type if payload.role == "BUYER" else None,
        province=payload.province,
        verified=False,  # business verification is an Admin step
    )
    db.add(org)
    db.flush()
    if payload.role == "FARMER":
        db.add(Farm(organization_id=org.id, name=payload.organization_name, province=payload.province))
    user = User(name=name, email=email, role=payload.role, title=None, organization_id=org.id, auth_user_id=sub)
    db.add(user)
    db.flush()
    audit(db, entity_type="user", entity_id=user.id, entity_code=None, action="USER_ONBOARDED", actor=user,
          farmer_org_id=org.id if payload.role == "FARMER" else None,
          buyer_org_id=org.id if payload.role == "BUYER" else None,
          message=f"ลงทะเบียนผ่าน Google เป็น{'เกษตรกร' if payload.role == 'FARMER' else 'ผู้ซื้อ'} ({org.name})")
    db.commit()
    db.refresh(user)
    return user_out(user)
