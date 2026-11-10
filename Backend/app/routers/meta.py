from fastapi import APIRouter
from sqlalchemy import select

from app.catalog import PRODUCTS, PROVINCES, REJECTION_REASONS
from app.config import settings
from app.deps import DB, CurrentUser
from app.models import QualityStandard, User
from app.seed import reset
from app.views import user_out

router = APIRouter(tags=["meta"])


@router.get("/catalog")
def catalog(db: DB):
    stds = {s.product_type: s for s in db.scalars(select(QualityStandard))}
    return {
        "products": [
            {"key": k, **v, "grades": [g["grade"] for g in stds[k].grades] if k in stds else v["grades"],
             "grade_criteria": stds[k].grades if k in stds else []}
            for k, v in PRODUCTS.items()
        ],
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
def demo_reset(db: DB, scenarios: bool = True):
    """Re-seed the demo. `scenarios=false` keeps only the small base data (used by scripted walkthroughs)."""
    reset(db)
    db.commit()
    if scenarios and settings.demo_scenarios:
        from app.demo_scenarios import build  # local import: it imports the app

        build()
    return {"status": "reset"}


@router.get("/me")
def me(user: CurrentUser):
    return user_out(user)
