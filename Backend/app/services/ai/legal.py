"""Legal AI assistant (Business & Legals/legal-ai.md): deterministic rule engine + LLM over approved sources.

Guardrails: answers only from the contract's own terms and approved policy documents, every claim cites a source id,
"not found" instead of guessing, personal data redacted before the call, output labelled AI-generated and logged with
model/prompt/document versions, high-risk findings require human review. It is not a lawyer and gives no legal advice.
"""

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AiRun, Contract, User
from app.services.ai import client as ai
from app.services.ai.knowledge import Source, search

PROMPT_VERSION = "legal-v1"
DISCLAIMER = "สร้างโดย AI จากเงื่อนไขสัญญาและเอกสารนโยบายที่อนุมัติเท่านั้น ไม่ใช่คำปรึกษาทางกฎหมาย ควรให้ผู้เชี่ยวชาญตรวจทานก่อนตัดสินใจ"

REJECTION_TH = {"ROT": "เน่าเสีย", "PEST_DAMAGE": "แมลงทำลาย", "BRUISING": "ช้ำ/บอบช้ำ", "UNDERSIZE": "ขนาดเล็กกว่าเกณฑ์"}


# --- contract as citable clauses ------------------------------------------------------------

def contract_clauses(terms: dict) -> list[Source]:
    t = terms
    prices = ", ".join(f"เกรด {g} {p:,.2f} บาท/กก." for g, p in sorted(t.get("grade_prices", {}).items()))
    rows = [
        ("C-parties", "คู่สัญญา", f"ผู้ขาย: {t.get('farmer')} ผู้ซื้อ: {t.get('buyer')}"),
        ("C-product", "ผลผลิต", f"{t.get('product_type')} พันธุ์ {t.get('variety') or '-'} (ประกาศ {t.get('listing_code')})"),
        ("C-quantity", "ปริมาณ", f"{t.get('quantity_kg'):,.0f} กก. ค่าคลาดเคลื่อน ±{t.get('tolerance_pct')}%"),
        ("C-price", "ราคา", prices or "ไม่ระบุ"),
        ("C-harvest", "ช่วงเก็บเกี่ยว", " ถึง ".join(t.get("harvest_window", []))),
        ("C-delivery", "การส่งมอบ", f"{' ถึง '.join(t.get('delivery_window', []))} ปลายทาง {t.get('destination_province')}"),
        ("C-payment", "การชำระเงิน", f"ภายใน {t.get('payment_due_days')} วันหลังตรวจรับ เงินมัดจำ {t.get('deposit_thb', 0):,.0f} บาท"),
        ("C-qc", "การตรวจคุณภาพ", t.get("sampling_method") or "ไม่ระบุ"),
        ("C-rejection", "เหตุที่ปฏิเสธสินค้าได้", ", ".join(REJECTION_TH.get(r, r) for r in t.get("rejection_conditions", [])) or "ไม่ระบุ"),
        ("C-shortfall", "กรณีผลผลิตขาด", "ลดปริมาณตามสัดส่วนให้ผู้ซื้อทุกราย" if t.get("shortfall_policy") == "PROPORTIONAL_REDUCTION" else (t.get("shortfall_policy") or "ไม่ระบุ")),
        ("C-cancellation", "การยกเลิก", t.get("cancellation") or "ไม่ระบุ"),
        ("C-dispute", "การระงับข้อพิพาท", t.get("dispute_procedure") or "ไม่ระบุ"),
        ("C-law", "กฎหมายที่ใช้บังคับ", t.get("governing_law") or "ไม่ระบุ"),
    ]
    return [Source(i, title, ai.redact(text), "contract") for i, title, text in rows]


# --- deterministic rule engine ----------------------------------------------------------------

def rule_findings(terms: dict, buyer_trust: dict | None = None) -> list[dict]:
    """Required-clause and risk checks that do not need AI. Same input, same output."""
    f: list[dict] = []

    def add(code, severity, clause, message):
        f.append({"code": code, "severity": severity, "clause": clause, "message": message, "source": "RULE_ENGINE"})

    if not terms.get("grade_prices"):
        add("MISSING_PRICE", "high", "C-price", "ไม่ได้ระบุราคาตามเกรด")
    if not terms.get("quantity_kg"):
        add("MISSING_QUANTITY", "high", "C-quantity", "ไม่ได้ระบุปริมาณ")
    if not terms.get("delivery_window") or not terms.get("destination_province"):
        add("MISSING_DELIVERY", "high", "C-delivery", "ไม่ได้ระบุช่วงส่งมอบหรือปลายทาง")
    if not terms.get("sampling_method"):
        add("MISSING_QC", "high", "C-qc", "ไม่ได้ระบุวิธีตรวจคุณภาพ")
    if not terms.get("rejection_conditions"):
        add("NO_REJECTION_CONDITIONS", "high", "C-rejection", "ไม่ได้จำกัดเหตุที่ปฏิเสธสินค้าได้ ผู้ซื้ออาจปฏิเสธได้กว้างเกินไป")
    if terms.get("payment_due_days") is None:
        add("MISSING_PAYMENT", "high", "C-payment", "ไม่ได้ระบุกำหนดชำระเงิน")
    elif terms["payment_due_days"] > 30:
        add("LONG_PAYMENT_TERM", "medium", "C-payment", f"กำหนดชำระ {terms['payment_due_days']} วัน นานกว่า 30 วัน เพิ่มความเสี่ยงด้านกระแสเงินสดของเกษตรกร")
    if not terms.get("cancellation"):
        add("MISSING_CANCELLATION", "medium", "C-cancellation", "ไม่ได้ระบุเงื่อนไขการยกเลิก")
    if not terms.get("dispute_procedure"):
        add("MISSING_DISPUTE", "medium", "C-dispute", "ไม่ได้ระบุวิธีระงับข้อพิพาท")
    if not terms.get("shortfall_policy"):
        add("MISSING_SHORTFALL", "medium", "C-shortfall", "ไม่ได้ระบุวิธีจัดการกรณีผลผลิตขาด")
    if not terms.get("governing_law"):
        add("MISSING_GOVERNING_LAW", "low", "C-law", "ไม่ได้ระบุกฎหมายที่ใช้บังคับ (สัญญาฉบับก่อนเพิ่มข้อนี้)")
    if (terms.get("tolerance_pct") or 0) > 10:
        add("WIDE_TOLERANCE", "low", "C-quantity", f"ค่าคลาดเคลื่อน ±{terms['tolerance_pct']}% กว้างกว่าปกติ")
    dw, hw = terms.get("delivery_window") or [], terms.get("harvest_window") or []
    if len(dw) == 2 and len(hw) == 2 and date.fromisoformat(dw[1]) < date.fromisoformat(hw[0]):
        add("DELIVERY_BEFORE_HARVEST", "high", "C-delivery", "ช่วงส่งมอบสิ้นสุดก่อนเริ่มเก็บเกี่ยว")
    if buyer_trust and (terms.get("deposit_thb") or 0) == 0:
        if buyer_trust.get("insufficient_data"):
            add("NO_DEPOSIT_NEW_BUYER", "medium", "C-payment", "ไม่มีเงินมัดจำ และผู้ซื้อยังมีประวัติไม่เพียงพอ")
        elif buyer_trust.get("band") == "HIGH_RISK":
            add("NO_DEPOSIT_HIGH_RISK", "medium", "C-payment", "ไม่มีเงินมัดจำ และ AgriTrust ของผู้ซื้ออยู่ในระดับต้องระวัง")
    return f


# --- LLM tasks ---------------------------------------------------------------------------------

def _ids() -> dict:
    return {"type": "array", "items": {"type": "string"}}


REVIEW_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["summary", "plain_language", "key_terms", "risks", "questions_to_ask"],
    "properties": {
        "summary": {"type": "string"},
        "plain_language": {"type": "string"},
        "key_terms": {"type": "array", "items": {
            "type": "object", "additionalProperties": False, "required": ["label", "value", "source_ids"],
            "properties": {"label": {"type": "string"}, "value": {"type": "string"}, "source_ids": _ids()}}},
        "risks": {"type": "array", "items": {
            "type": "object", "additionalProperties": False,
            "required": ["issue", "severity", "who_is_affected", "suggestion", "source_ids"],
            "properties": {
                "issue": {"type": "string"},
                "severity": {"type": "string", "enum": ["low", "medium", "high"]},
                "who_is_affected": {"type": "string", "enum": ["FARMER", "BUYER", "BOTH"]},
                "suggestion": {"type": "string"},
                "source_ids": _ids()}}},
        "questions_to_ask": {"type": "array", "items": {"type": "string"}},
    },
}

ANSWER_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["answer", "found", "source_ids"],
    "properties": {"answer": {"type": "string"}, "found": {"type": "boolean"}, "source_ids": _ids()},
}

SYSTEM = """You are the contract-reading assistant inside AgriGuard, a Thai B2B agricultural procurement platform.
Your readers are Thai farmers and buyers; many are not lawyers. Write in clear, plain Thai.

Ground rules:
- Use only the SOURCES you are given: the contract's own clauses (ids starting with "C-") and approved platform
  policy documents (other ids). Do not rely on outside knowledge of law, prices or market practice.
- Cite the ids of the sources that support each point. Only cite ids that appear in SOURCES.
- If the sources do not answer something, say so plainly and suggest who to ask; never guess or invent clauses,
  law sections or numbers.
- You are not a lawyer and this is not legal advice. Do not tell a party to sign or not sign; explain what the
  terms mean and what to check.
- The platform's payments, deposits and e-signatures are simulated in this prototype; the policy documents say so."""


def _sources_block(sources: list[Source]) -> str:
    return "\n".join(f"[{s.id}] {s.title}: {s.text}" for s in sources)


def _cite(source_ids: list[str], sources: list[Source]) -> list[dict]:
    by_id = {s.id: s for s in sources}
    seen, out = set(), []
    for sid in source_ids:
        if sid in by_id and sid not in seen:  # drop any id the model invented
            seen.add(sid)
            s = by_id[sid]
            out.append({"id": s.id, "title": s.title, "kind": s.kind, "quote": s.text[:240]})
    return out


def review(db: Session, c: Contract, user: User, buyer_trust: dict, refresh: bool = False) -> dict:
    terms = c.terms
    rules = rule_findings(terms, buyer_trust)
    base = {
        "contract_id": c.id, "version": c.current_version, "rule_findings": rules,
        "disclaimer": DISCLAIMER, "ai": None, "ai_error": None,
    }
    if not ai.available():
        base["ai_error"] = "ยังไม่ได้ตั้งค่า AI (ANTHROPIC_API_KEY) — แสดงเฉพาะผลตรวจจากกฎ"
        base["human_review_required"] = any(r["severity"] == "high" for r in rules)
        return base

    clauses = contract_clauses(terms)
    policies = search("สัญญา ราคา ส่งมอบ ตรวจคุณภาพ ปฏิเสธ ชำระเงิน ยกเลิก ข้อพิพาท ผลผลิตขาด แก้ไขสัญญา", k=6)
    sources = clauses + policies
    key = (PROMPT_VERSION, c.id, terms, [r["code"] for r in rules], [s.id for s in policies])
    cached = None if refresh else db.scalar(
        select(AiRun).where(AiRun.task == "CONTRACT_REVIEW", AiRun.entity_id == c.id, AiRun.input_hash == ai.input_hash(*key))
        .order_by(AiRun.created_at.desc()))
    try:
        run = cached or ai.run(
            db, task="CONTRACT_REVIEW", prompt_version=PROMPT_VERSION, system=SYSTEM, schema=REVIEW_SCHEMA,
            entity_type="contract", entity_id=c.id, user_id=user.id, hash_parts=key,
            content=[{"type": "text", "text": (
                f"SOURCES:\n{_sources_block(sources)}\n\n"
                f"RULE-ENGINE FINDINGS (already shown to the user, do not repeat them as new risks): "
                f"{'; '.join(r['message'] for r in rules) or 'none'}\n\n"
                "Review this HarvestLock agreement for both parties. Give: a 2-3 sentence summary; a plain-language "
                "explanation a farmer can follow; the key terms with their clause ids; risks or unclear points with "
                "who they affect and what to check (cite ids); and questions each party should confirm before signing "
                "or delivering.")}],
        )
    except (ai.AIUnavailable, ai.AIRefused) as e:
        base["ai_error"] = str(e)
        base["human_review_required"] = any(r["severity"] == "high" for r in rules)
        return base
    out = dict(run.output)
    out["key_terms"] = [{**k, "citations": _cite(k["source_ids"], sources)} for k in out.get("key_terms", [])]
    out["risks"] = [{**r, "citations": _cite(r["source_ids"], sources)} for r in out.get("risks", [])]
    base["ai"] = {**out, "model": run.model, "prompt_version": run.prompt_version, "run_id": run.id,
                  "generated_at": run.created_at, "cached": cached is not None, "label": "AI-generated"}
    base["human_review_required"] = any(r["severity"] == "high" for r in rules) or any(
        r["severity"] == "high" for r in out.get("risks", []))
    return base


def ask(db: Session, question: str, user: User, c: Contract | None = None) -> dict:
    question = ai.redact(question.strip())
    clauses = contract_clauses(c.terms) if c else []
    policies = search(question, k=5)
    sources = clauses + policies
    if not ai.available():
        return {"answer": None, "found": False, "citations": [_cite([s.id], sources)[0] for s in policies[:3]],
                "ai_error": "ยังไม่ได้ตั้งค่า AI (ANTHROPIC_API_KEY) — แสดงเอกสารที่เกี่ยวข้องแทน", "disclaimer": DISCLAIMER}
    try:
        run = ai.run(
            db, task="LEGAL_QA", prompt_version=PROMPT_VERSION, system=SYSTEM, schema=ANSWER_SCHEMA,
            entity_type="contract" if c else None, entity_id=c.id if c else None, user_id=user.id,
            hash_parts=(PROMPT_VERSION, question, [s.id for s in sources]),
            content=[{"type": "text", "text": (
                f"SOURCES:\n{_sources_block(sources) or '(none)'}\n\nQUESTION from a {user.role.lower()}: {question}\n\n"
                "Answer in Thai in at most 6 sentences using only SOURCES, citing ids. If the sources do not cover it, "
                "set found=false and say what document or person could answer it.")}],
        )
    except (ai.AIUnavailable, ai.AIRefused) as e:
        return {"answer": None, "found": False, "citations": [], "ai_error": str(e), "disclaimer": DISCLAIMER}
    out = run.output
    citations = _cite(out.get("source_ids", []), sources)
    return {"answer": out.get("answer"), "found": bool(out.get("found")) and bool(citations), "citations": citations,
            "model": run.model, "run_id": run.id, "label": "AI-generated", "disclaimer": DISCLAIMER, "ai_error": None}
