import uuid

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.config import settings
from app.deps import DB, CurrentUser, get_or_404
from app.models import ProduceListing, ProduceLot
from app.routers.contracts import load_contract
from app.services import forecast as fc
from app.services.ai import client as ai
from app.services.ai import legal, vision
from app.services.inventory import listing_inventory
from app.views import TrustCache

router = APIRouter(tags=["ai"])


class Question(BaseModel):
    question: str = Field(min_length=3, max_length=1000)
    contract_id: uuid.UUID | None = None


@router.get("/ai/status")
def status(user: CurrentUser):
    return {
        "available": ai.available(),
        "model": settings.ai_model if ai.available() else None,
        "features": {
            "contract_review": "rule engine always; AI summary when available",
            "legal_qa": "answers only from contract clauses and approved policy documents",
            "qc_photo_assist": "suggestion only; the inspector decides",
            "harvest_forecast": f"{fc.MODEL_VERSION} (baseline, not a trained model)",
        },
    }


@router.post("/legal/contracts/{contract_id}/review")
def review_contract(contract_id: uuid.UUID, db: DB, user: CurrentUser, refresh: bool = False):
    c = load_contract(db, user, contract_id)
    out = legal.review(db, c, user, TrustCache(db).summary(c.buyer_org_id), refresh=refresh)
    db.commit()
    return out


@router.post("/legal/ask")
def ask(payload: Question, db: DB, user: CurrentUser):
    c = load_contract(db, user, payload.contract_id) if payload.contract_id else None
    out = legal.ask(db, payload.question, user, c)
    db.commit()
    return out


@router.post("/lots/{lot_id}/ai-grade")
def ai_grade(lot_id: uuid.UUID, db: DB, user: CurrentUser):
    lot = get_or_404(db, ProduceLot, lot_id, "ล็อต")
    c = load_contract(db, user, lot.contract_id)
    if not (user.role == "INSPECTOR" or (user.role == "BUYER" and user.organization_id == c.buyer_org_id)):
        raise HTTPException(403, "เฉพาะผู้ตรวจคุณภาพหรือผู้ซื้อของสัญญานี้")
    try:
        out = vision.assess(db, lot, user)
    except ValueError as e:
        raise HTTPException(422, str(e)) from e
    except (ai.AIUnavailable, ai.AIRefused) as e:
        raise HTTPException(503, str(e)) from e
    db.commit()
    return out


@router.get("/listings/{listing_id}/forecast")
def listing_forecast(listing_id: uuid.UUID, db: DB, user: CurrentUser):
    listing = get_or_404(db, ProduceListing, listing_id, "ประกาศผลผลิต")
    inv = listing_inventory(listing)
    return fc.forecast(listing.product_type, listing.farm.area_rai, listing.estimated_qty_kg,
                       inv["contracted_kg"] + inv["reserved_kg"])
