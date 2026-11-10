"""Bridge between the Backend and the AI package (AI/agriguard_ai).

The AI package holds prompts, schemas, providers, retrieval and rules but never touches the database. This module
loads what it needs (contracts, tasks, lot photos, grading standards), calls it, and records every AI call in the
ai_runs table (model, prompt version, input hash, output) for audit.
"""

import uuid

from agriguard_ai import AIRefused, AIUnavailable, available, generate, model_name, provider
from agriguard_ai import legal, navigator, vision
from agriguard_ai.providers import input_hash, redact
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models import AiRun, Contract, Dispute, EvidenceFile, Farm, ProduceListing, ProduceLot, QualityStandard, User
from app.services.storage import storage

__all__ = ["AIRefused", "AIUnavailable", "available", "model_name", "provider", "review_contract", "ask", "nav_chat", "photo_assist"]


def run(db: Session, *, task: str, prompt_version: str, system: str, content: list[dict], schema: dict,
        entity_type: str | None = None, entity_id: uuid.UUID | None = None, user_id: uuid.UUID | None = None,
        hash_parts: tuple = ()) -> AiRun:
    g = generate(system, content, schema)
    record = AiRun(task=task, model=g.model, prompt_version=prompt_version, input_hash=input_hash(*hash_parts),
                   entity_type=entity_type, entity_id=entity_id, user_id=user_id, output=g.data,
                   input_tokens=g.input_tokens, output_tokens=g.output_tokens)
    db.add(record)
    db.flush()
    return record


# --- Legal AI ----------------------------------------------------------------------------------

def review_contract(db: Session, c: Contract, user: User, buyer_trust: dict, refresh: bool = False) -> dict:
    terms = c.terms
    rules = legal.rule_findings(terms, buyer_trust)
    base = {"contract_id": c.id, "version": c.current_version, "rule_findings": rules,
            "disclaimer": legal.DISCLAIMER, "ai": None, "ai_error": None}
    if not available():
        return {**base, "ai_error": legal.NO_AI_REVIEW, "human_review_required": legal.needs_human_review(rules, None)}
    sources = legal.review_sources(terms)
    key = (legal.PROMPT_VERSION, c.id, terms, [r["code"] for r in rules], [s.id for s in sources])
    cached = None if refresh else db.scalar(
        select(AiRun).where(AiRun.task == "CONTRACT_REVIEW", AiRun.entity_id == c.id, AiRun.input_hash == input_hash(*key))
        .order_by(AiRun.created_at.desc()))
    try:
        record = cached or run(db, task="CONTRACT_REVIEW", prompt_version=legal.PROMPT_VERSION, system=legal.SYSTEM,
                               schema=legal.REVIEW_SCHEMA, content=legal.review_content(sources, rules),
                               entity_type="contract", entity_id=c.id, user_id=user.id, hash_parts=key)
    except (AIUnavailable, AIRefused) as e:
        return {**base, "ai_error": str(e), "human_review_required": legal.needs_human_review(rules, None)}
    out = legal.review_result(record.output, sources)
    return {**base, "human_review_required": legal.needs_human_review(rules, out),
            "ai": {**out, "model": record.model, "prompt_version": record.prompt_version, "run_id": record.id,
                   "generated_at": record.created_at, "cached": cached is not None, "label": "AI-generated"}}


def ask(db: Session, question: str, user: User, c: Contract | None = None) -> dict:
    question = redact(question.strip())
    sources = legal.ask_sources(question, c.terms if c else None)
    base = {"disclaimer": legal.DISCLAIMER}
    if not available():
        return {**base, "answer": None, "found": False, "citations": legal.related_documents(sources), "ai_error": legal.NO_AI_ANSWER}
    try:
        record = run(db, task="LEGAL_QA", prompt_version=legal.PROMPT_VERSION, system=legal.SYSTEM, schema=legal.ANSWER_SCHEMA,
                     content=legal.ask_content(sources, user.role, question),
                     entity_type="contract" if c else None, entity_id=c.id if c else None, user_id=user.id,
                     hash_parts=(legal.PROMPT_VERSION, question, [s.id for s in sources]))
    except (AIUnavailable, AIRefused) as e:
        return {**base, "answer": None, "found": False, "citations": [], "ai_error": str(e)}
    return {**base, **legal.ask_result(record.output, sources), "model": record.model, "run_id": record.id,
            "label": "AI-generated", "ai_error": None}


# --- navigation chatbot -------------------------------------------------------------------------

def tasks_for(db: Session, user: User) -> list[navigator.Dest]:
    """The user's own pending work, as chatbot destinations (role-scoped, from the database)."""
    from app.routers.contracts import actions_for, visible_contracts  # local import avoids a cycle

    tasks: list[navigator.Dest] = []
    if user.role != "ADMIN":
        for c in db.scalars(visible_contracts(user).order_by(Contract.created_at)):
            acts = [a for a in actions_for(c, user) if a in navigator.ACTION_TH]
            if acts:
                other = c.buyer_org.name if user.role != "BUYER" else c.farmer_org.name
                tasks.append(navigator.Dest(f"task:{c.code}", f"/contracts/{c.id}", f"{navigator.ACTION_TH[acts[0]]} · {c.code}",
                                            f"สัญญา {c.code} {other} รอคุณ{navigator.ACTION_TH[acts[0]]}"))
    if user.role == "FARMER":
        for listing in db.scalars(select(ProduceListing).join(Farm).where(Farm.organization_id == user.organization_id)):
            pending = [o for o in listing.offers if o.status == "PENDING"]
            if pending:
                tasks.append(navigator.Dest(f"task:{listing.code}", f"/allocation/{listing.id}", f"จัดสรร {listing.code} ({len(pending)} ข้อเสนอ)",
                                            f"มีข้อเสนอ {len(pending)} รายการรอจัดสรรผลผลิต {listing.code}"))
    q = select(Dispute).where(Dispute.status.in_(("EVIDENCE_COLLECTION", "UNDER_REVIEW", "REINSPECTION_REQUESTED")))
    if user.role in ("FARMER", "BUYER"):
        q = q.where(or_(Dispute.opened_by_org_id == user.organization_id, Dispute.against_org_id == user.organization_id),
                    Dispute.status == "EVIDENCE_COLLECTION")
    elif user.role == "INSPECTOR":
        q = q.where(Dispute.status == "REINSPECTION_REQUESTED")
    for d in db.scalars(q):
        tasks.append(navigator.Dest(f"task:{d.code}", f"/disputes/{d.id}", f"ข้อพิพาท {d.code}", f"ข้อพิพาท {d.code} รอการดำเนินการของคุณ"))
    return tasks[:8]


def nav_chat(db: Session, user: User, message: str, history: list[dict], current_path: str | None) -> dict:
    dests, tasks = navigator.catalog_for(user.role, str(user.organization_id)), tasks_for(db, user)
    if not available():
        return {**navigator.rule_reply(redact(message), dests, tasks), "mode": "rules", "suggestions": []}
    all_dests = tasks + dests
    try:
        record = run(db, task="NAV_CHAT", prompt_version=navigator.PROMPT_VERSION, system=navigator.SYSTEM, schema=navigator.SCHEMA,
                     content=navigator.nav_content(user.role, current_path, all_dests, history, message), user_id=user.id,
                     hash_parts=(navigator.PROMPT_VERSION, user.id, message, history[-6:], sorted(d.id for d in all_dests)))
    except (AIUnavailable, AIRefused) as e:
        return {**navigator.rule_reply(redact(message), dests, tasks), "mode": "rules", "suggestions": [], "ai_error": str(e)}
    return {**navigator.nav_result(record.output, all_dests), "mode": "ai", "model": record.model}


# --- QC photo assist ---------------------------------------------------------------------------

def photo_assist(db: Session, lot: ProduceLot, user: User) -> dict:
    c = lot.contract
    files = [f for f in db.scalars(select(EvidenceFile).where(EvidenceFile.entity_type == "lot", EvidenceFile.entity_id == lot.id)
                                   .order_by(EvidenceFile.created_at.desc())) if f.content_type in vision.SUPPORTED][:vision.MAX_IMAGES]
    if not files:
        raise ValueError("ยังไม่มีภาพของล็อตนี้ (JPG/PNG/WebP) — แนบภาพที่การ์ดล็อตก่อน")
    std = db.scalar(select(QualityStandard).where(QualityStandard.product_type == c.listing.product_type))
    criteria = std.grades if std else []
    grades = sorted(c.terms["grade_prices"])
    received = lot.received_kg or lot.harvested_kg
    content = vision.photo_content([vision.to_jpeg_b64(storage().get(f.storage_key)) for f in files],
                                   product_type=c.listing.product_type, variety=c.listing.variety, lot_code=lot.code,
                                   received_kg=received, grades=grades, criteria=criteria,
                                   rejection_conditions=c.terms.get("rejection_conditions", []))
    record = run(db, task="QC_PHOTO_ASSIST", prompt_version=vision.PROMPT_VERSION, system=vision.SYSTEM, schema=vision.SCHEMA,
                 content=content, entity_type="lot", entity_id=lot.id, user_id=user.id,
                 hash_parts=(vision.PROMPT_VERSION, lot.id, [f.sha256 for f in files], criteria))
    return {**record.output, "run_id": record.id, "model": record.model, "label": "AI-suggested", "images_used": len(files),
            "suggested_kg": vision.suggested_kg(record.output, received, grades), "disclaimer": vision.DISCLAIMER}
