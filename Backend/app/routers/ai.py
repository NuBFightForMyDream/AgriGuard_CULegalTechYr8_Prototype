import uuid

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.deps import DB, CurrentUser, get_or_404
from app.models import ProduceListing, ProduceLot
from agriguard_ai import forecast as fc
from agriguard_ai.providers import providers_in_order

from app.routers.contracts import load_contract
from app.services import ai_bridge as ai
from app.services.inventory import listing_inventory
from app.views import TrustCache

router = APIRouter(tags=["ai"])


class ChatTurn(BaseModel):
    role: str = Field(pattern="^(user|assistant)$")
    text: str = Field(max_length=2000)


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=500)
    history: list[ChatTurn] = Field(default=[], max_length=20)
    current_path: str | None = Field(default=None, max_length=200)


class Question(BaseModel):
    question: str = Field(min_length=3, max_length=1000)
    contract_id: uuid.UUID | None = None


@router.get("/ai/status")
def status(user: CurrentUser):
    return {
        "available": ai.available(),
        "provider": ai.provider(),
        "model": ai.model_name(),
        "failover": providers_in_order()[1:],
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
    out = ai.review_contract(db, c, user, TrustCache(db).summary(c.buyer_org_id), refresh=refresh)
    db.commit()
    return out


@router.post("/legal/ask")
def ask(payload: Question, db: DB, user: CurrentUser):
    c = load_contract(db, user, payload.contract_id) if payload.contract_id else None
    out = ai.ask(db, payload.question, user, c)
    db.commit()
    return out


@router.post("/lots/{lot_id}/ai-grade")
def ai_grade(lot_id: uuid.UUID, db: DB, user: CurrentUser):
    lot = get_or_404(db, ProduceLot, lot_id, "ล็อต")
    c = load_contract(db, user, lot.contract_id)
    if not (user.role == "INSPECTOR" or (user.role == "BUYER" and user.organization_id == c.buyer_org_id)):
        raise HTTPException(403, "เฉพาะผู้ตรวจคุณภาพหรือผู้ซื้อของสัญญานี้")
    try:
        out = ai.photo_assist(db, lot, user)
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


@router.post("/assistant/chat")
def nav_chat(payload: ChatIn, db: DB, user: CurrentUser):
    """Navigation chatbot: reply + up to 3 links, drawn only from this user's allowed pages and pending tasks."""
    out = ai.nav_chat(db, user, payload.message, [t.model_dump() for t in payload.history], payload.current_path)
    db.commit()
    return out
