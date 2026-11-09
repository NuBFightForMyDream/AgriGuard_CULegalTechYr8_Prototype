import uuid
from functools import lru_cache
from typing import Annotated

import jwt
from fastapi import Depends, Header, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.models import User

DB = Annotated[Session, Depends(get_db)]
ONBOARDING_REQUIRED = "ONBOARDING_REQUIRED"


@lru_cache
def jwks_client() -> jwt.PyJWKClient:
    return jwt.PyJWKClient(f"{settings.supabase_url}/auth/v1/.well-known/jwks.json", cache_keys=True)


def verify_supabase_token(token: str) -> dict:
    """Verify a Supabase Auth access token: signature, expiry, issuer and audience."""
    if not settings.supabase_url:
        raise HTTPException(401, "ยังไม่ได้ตั้งค่า Supabase Auth")
    issuer = f"{settings.supabase_url}/auth/v1"
    try:
        if settings.supabase_jwt_secret and jwt.get_unverified_header(token).get("alg") == "HS256":
            key, algorithms = settings.supabase_jwt_secret, ["HS256"]
        else:
            key, algorithms = jwks_client().get_signing_key_from_jwt(token).key, ["ES256", "RS256"]
        return jwt.decode(token, key, algorithms=algorithms, audience="authenticated", issuer=issuer)
    except jwt.PyJWTError as e:
        raise HTTPException(401, "โทเคนไม่ถูกต้องหรือหมดอายุ กรุณาเข้าสู่ระบบใหม่") from e


def token_claims(authorization: Annotated[str | None, Header()] = None) -> dict | None:
    if not authorization:
        return None
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(401, "รูปแบบ Authorization ไม่ถูกต้อง")
    return verify_supabase_token(token)


Claims = Annotated[dict | None, Depends(token_claims)]


def current_user(db: DB, claims: Claims, x_demo_user: Annotated[str | None, Header()] = None) -> User:
    """Supabase JWT (Google sign-in) first; the demo picker header only when DEMO_LOGIN is on."""
    if claims is not None:
        user = db.scalar(select(User).where(User.auth_user_id == uuid.UUID(claims["sub"])))
        if user is None:
            raise HTTPException(409, ONBOARDING_REQUIRED)
        return user
    if x_demo_user and settings.demo_login:
        try:
            user = db.get(User, uuid.UUID(x_demo_user))
        except ValueError:
            user = None
        if user is None or user.auth_user_id is not None:
            raise HTTPException(401, "ไม่พบผู้ใช้เดโม กรุณาเข้าสู่ระบบใหม่")
        return user
    raise HTTPException(401, "กรุณาเข้าสู่ระบบ")


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
