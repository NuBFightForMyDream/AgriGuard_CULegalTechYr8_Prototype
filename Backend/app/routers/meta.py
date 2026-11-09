from fastapi import APIRouter
from sqlalchemy import select

from app.catalog import PRODUCTS, PROVINCES, REJECTION_REASONS
from app.deps import DB, CurrentUser
from app.models import User
from app.seed import reset
from app.views import user_out

router = APIRouter(tags=["meta"])


@router.get("/catalog")
def catalog():
    return {
        "products": [{"key": k, **v} for k, v in PRODUCTS.items()],
        "provinces": list(PROVINCES),
        "rejection_reasons": [{"key": k, "label": v} for k, v in REJECTION_REASONS.items()],
    }


@router.get("/demo/users")
def demo_users(db: DB):
    """Phase 1 only: the list behind the demo sign-in screen."""
    order = {"FARMER": 0, "BUYER": 1, "INSPECTOR": 2, "ADMIN": 3}
    users = db.scalars(select(User)).all()
    return [user_out(u) for u in sorted(users, key=lambda u: (order.get(u.role, 9), u.email))]


@router.post("/demo/reset")
def demo_reset(db: DB):
    reset(db)
    db.commit()
    return {"status": "reset"}


@router.get("/me")
def me(user: CurrentUser):
    return user_out(user)
