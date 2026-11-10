"""Direct chat between a farm and a buyer. One thread per pair; the pair's deals are shown alongside it."""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select

from app.deps import DB, CurrentUser, get_or_404, require_role
from app.models import (
    ChatMessage,
    Contract,
    Conversation,
    Farm,
    Offer,
    Organization,
    ProduceListing,
    User,
)
from app.services.inventory import expire_reservations
from app.services.orders import INACTIVE
from app.views import TrustCache, contract_brief, org_brief

router = APIRouter(prefix="/chats", tags=["chats"])
MAX_MESSAGES = 200


class ChatStart(BaseModel):
    organization_id: uuid.UUID


class MessageIn(BaseModel):
    body: str = Field(min_length=1, max_length=2000)

    @field_validator("body")
    @classmethod
    def _strip(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("ข้อความว่าง")
        return v


def _side(user: User) -> str:
    require_role(user, "FARMER", "BUYER")
    return "farmer" if user.role == "FARMER" else "buyer"


def _mine(user: User):
    return Conversation.farmer_org_id if user.role == "FARMER" else Conversation.buyer_org_id


def _load(db, user: User, chat_id: uuid.UUID) -> Conversation:
    _side(user)
    c = get_or_404(db, Conversation, chat_id, "ห้องแชท")
    if user.organization_id not in (c.farmer_org_id, c.buyer_org_id):
        raise HTTPException(403, "ห้องแชทนี้ไม่ใช่ของคุณ")
    return c


def _read_at(c: Conversation, user: User) -> datetime | None:
    return c.farmer_read_at if user.role == "FARMER" else c.buyer_read_at


def _unread(db, c: Conversation, user: User) -> int:
    q = select(func.count()).select_from(ChatMessage).where(
        ChatMessage.conversation_id == c.id, ChatMessage.sender_org_id != user.organization_id)
    seen = _read_at(c, user)
    if seen is not None:
        q = q.where(ChatMessage.created_at > seen)
    return db.scalar(q) or 0


def _pair_contracts(db, c: Conversation) -> list[Contract]:
    return list(db.scalars(select(Contract).where(
        Contract.farmer_org_id == c.farmer_org_id, Contract.buyer_org_id == c.buyer_org_id).order_by(Contract.created_at.desc())))


def _pair_offers(db, c: Conversation) -> list[Offer]:
    return list(db.scalars(select(Offer).join(ProduceListing).join(Farm).where(
        Farm.organization_id == c.farmer_org_id, Offer.buyer_org_id == c.buyer_org_id).order_by(Offer.created_at.desc())))


def _deal(db, c: Conversation) -> dict | None:
    """The pair's deal for the status chip: an ongoing contract first, then a pending offer, then the latest finished one."""
    contracts = _pair_contracts(db, c)
    offers = _pair_offers(db, c)
    ongoing = [k for k in contracts if k.order_status not in INACTIVE and k.order_status != "COMPLETED"]
    pending = [o for o in offers if o.status == "PENDING"]
    active = len(ongoing) + len(pending)
    if ongoing:
        k = ongoing[0]
    elif pending:
        o = pending[0]
        return {"kind": "offer", "id": o.id, "code": o.code, "status": o.status, "active": active}
    elif contracts:
        k = contracts[0]
    elif offers:
        o = offers[0]
        return {"kind": "offer", "id": o.id, "code": o.code, "status": o.status, "active": active}
    else:
        return None
    return {"kind": "contract", "id": k.id, "code": k.code, "status": k.order_status, "active": active}


def _counterpart(c: Conversation, user: User) -> Organization:
    return c.buyer_org if user.role == "FARMER" else c.farmer_org


def _message_out(m: ChatMessage, user: User) -> dict:
    return {"id": m.id, "body": m.body, "created_at": m.created_at, "mine": m.sender_org_id == user.organization_id,
            "sender": {"id": m.sender.id, "name": m.sender.name, "role": m.sender.role}}


def _summary(db, c: Conversation, user: User, trusts: TrustCache) -> dict:
    last = db.scalar(select(ChatMessage).where(ChatMessage.conversation_id == c.id).order_by(ChatMessage.created_at.desc()).limit(1))
    other = _counterpart(c, user)
    return {
        "id": c.id,
        "counterpart": org_brief(other),
        "counterpart_trust": trusts.summary(other.id) if other.kind == "BUYER" else None,
        "last_message": _message_out(last, user) if last else None,
        "unread": _unread(db, c, user),
        "deal": _deal(db, c),
        "updated_at": c.last_message_at or c.created_at,
    }


@router.get("")
def list_chats(db: DB, user: CurrentUser):
    _side(user)
    rows = db.scalars(select(Conversation).where(_mine(user) == user.organization_id)).all()
    trusts = TrustCache(db)
    out = [_summary(db, c, user, trusts) for c in rows]
    out.sort(key=lambda x: x["updated_at"], reverse=True)
    return out


@router.get("/unread")
def unread_total(db: DB, user: CurrentUser):
    if user.role not in ("FARMER", "BUYER"):
        return {"unread": 0}
    rows = db.scalars(select(Conversation).where(_mine(user) == user.organization_id)).all()
    return {"unread": sum(_unread(db, c, user) for c in rows)}


@router.get("/contacts")
def contacts(db: DB, user: CurrentUser):
    """Organizations on the other side that this user can start a chat with, deal partners first."""
    _side(user)
    kind = "BUYER" if user.role == "FARMER" else "FARM"
    partners = set(db.scalars(select(Contract.buyer_org_id if user.role == "FARMER" else Contract.farmer_org_id).where(
        (Contract.farmer_org_id if user.role == "FARMER" else Contract.buyer_org_id) == user.organization_id)))
    orgs = db.scalars(select(Organization).where(Organization.kind == kind).order_by(Organization.name)).all()
    return sorted(({**org_brief(o), "partner": o.id in partners} for o in orgs), key=lambda o: not o["partner"])


@router.post("", status_code=201)
def start_chat(payload: ChatStart, db: DB, user: CurrentUser):
    side = _side(user)
    other = get_or_404(db, Organization, payload.organization_id, "องค์กร")
    if other.kind != ("BUYER" if side == "farmer" else "FARM"):
        raise HTTPException(422, "แชทได้เฉพาะระหว่างสวนกับผู้ซื้อ")
    farmer_id, buyer_id = (user.organization_id, other.id) if side == "farmer" else (other.id, user.organization_id)
    c = db.scalar(select(Conversation).where(Conversation.farmer_org_id == farmer_id, Conversation.buyer_org_id == buyer_id))
    if c is None:
        c = Conversation(farmer_org_id=farmer_id, buyer_org_id=buyer_id)
        db.add(c)
        db.commit()
    return {"id": c.id}


@router.get("/{chat_id}")
def get_chat(chat_id: uuid.UUID, db: DB, user: CurrentUser):
    expire_reservations(db)
    c = _load(db, user, chat_id)
    msgs = db.scalars(select(ChatMessage).where(ChatMessage.conversation_id == c.id)
                      .order_by(ChatMessage.created_at.desc()).limit(MAX_MESSAGES)).all()
    other = _counterpart(c, user)
    trusts = TrustCache(db)
    now = datetime.now(timezone.utc)
    if user.role == "FARMER":
        c.farmer_read_at = now
    else:
        c.buyer_read_at = now
    db.commit()
    return {
        "id": c.id,
        "counterpart": org_brief(other),
        "counterpart_trust": trusts.summary(other.id) if other.kind == "BUYER" else None,
        "deal": _deal(db, c),
        "messages": [_message_out(m, user) for m in reversed(msgs)],
        "contracts": [contract_brief(k) for k in _pair_contracts(db, c)],
        "offers": [{"id": o.id, "code": o.code, "status": o.status, "quantity_kg": o.quantity_kg,
                    "listing_id": o.listing_id, "listing_code": o.listing.code, "created_at": o.created_at}
                   for o in _pair_offers(db, c) if o.status == "PENDING"],
    }


@router.post("/{chat_id}/messages", status_code=201)
def send_message(chat_id: uuid.UUID, payload: MessageIn, db: DB, user: CurrentUser):
    c = _load(db, user, chat_id)
    m = ChatMessage(conversation_id=c.id, sender_user_id=user.id, sender_org_id=user.organization_id, body=payload.body)
    db.add(m)
    db.flush()
    c.last_message_at = m.created_at
    if user.role == "FARMER":
        c.farmer_read_at = m.created_at
    else:
        c.buyer_read_at = m.created_at
    db.commit()
    db.refresh(m)
    return _message_out(m, user)

