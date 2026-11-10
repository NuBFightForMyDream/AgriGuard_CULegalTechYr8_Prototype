"""Legal AI assistant (Business & Legals/legal-ai.md): deterministic rule engine + LLM over approved sources.

Guardrails: answers only from the contract's own terms and approved policy documents, every claim cites a source id,
"not found" instead of guessing, personal data redacted before the call, output labelled AI-generated and logged with
model/prompt/document versions, high-risk findings require human review. It is not a lawyer and gives no legal advice.
"""

from datetime import date

from agriguard_ai.providers import redact
from agriguard_ai.retrieval import Source, search

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
    return [Source(i, title, redact(text), "contract") for i, title, text in rows]


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


def sources_block(sources: list[Source]) -> str:
    return "\n".join(f"[{s.id}] {s.title}: {s.text}" for s in sources)


def cite(source_ids: list[str], sources: list[Source]) -> list[dict]:
    by_id = {s.id: s for s in sources}
    seen, out = set(), []
    for sid in source_ids:
        if sid in by_id and sid not in seen:  # drop any id the model invented
            seen.add(sid)
            s = by_id[sid]
            out.append({"id": s.id, "title": s.title, "kind": s.kind, "quote": s.text[:240]})
    return out


NO_AI_REVIEW = "ยังไม่ได้ตั้งค่า AI (GEMINI_API_KEY หรือ ANTHROPIC_API_KEY) — แสดงเฉพาะผลตรวจจากกฎ"
NO_AI_ANSWER = "ยังไม่ได้ตั้งค่า AI (GEMINI_API_KEY หรือ ANTHROPIC_API_KEY) — แสดงเอกสารที่เกี่ยวข้องแทน"


# --- contract review -----------------------------------------------------------------------------

def review_sources(terms: dict) -> list[Source]:
    policies = search("สัญญา ราคา ส่งมอบ ตรวจคุณภาพ ปฏิเสธ ชำระเงิน ยกเลิก ข้อพิพาท ผลผลิตขาด แก้ไขสัญญา", k=6)
    return contract_clauses(terms) + policies


def review_content(sources: list[Source], rules: list[dict]) -> list[dict]:
    return [{"type": "text", "text": (
        f"SOURCES:\n{sources_block(sources)}\n\n"
        f"RULE-ENGINE FINDINGS (already shown to the user, do not repeat them as new risks): "
        f"{'; '.join(r['message'] for r in rules) or 'none'}\n\n"
        "Review this HarvestLock agreement for both parties. Give: a 2-3 sentence summary; a plain-language "
        "explanation a farmer can follow; the key terms with their clause ids; risks or unclear points with "
        "who they affect and what to check (cite ids); and questions each party should confirm before signing "
        "or delivering.")}]


def review_result(output: dict, sources: list[Source]) -> dict:
    """Attach validated citations; ids the model invented are dropped."""
    out = dict(output)
    out["key_terms"] = [{**k, "citations": cite(k["source_ids"], sources)} for k in out.get("key_terms", [])]
    out["risks"] = [{**r, "citations": cite(r["source_ids"], sources)} for r in out.get("risks", [])]
    return out


def needs_human_review(rules: list[dict], ai_output: dict | None) -> bool:
    return any(r["severity"] == "high" for r in rules) or any(
        r["severity"] == "high" for r in (ai_output or {}).get("risks", []))


# --- questions -------------------------------------------------------------------------------------

def ask_sources(question: str, terms: dict | None) -> list[Source]:
    return (contract_clauses(terms) if terms else []) + search(question, k=5)


def ask_content(sources: list[Source], role: str, question: str) -> list[dict]:
    return [{"type": "text", "text": (
        f"SOURCES:\n{sources_block(sources) or '(none)'}\n\nQUESTION from a {role.lower()}: {question}\n\n"
        "Answer in Thai in at most 6 sentences using only SOURCES, citing ids. If the sources do not cover it, "
        "set found=false and say what document or person could answer it.")}]


def ask_result(output: dict, sources: list[Source]) -> dict:
    citations = cite(output.get("source_ids", []), sources)
    return {"answer": output.get("answer"), "found": bool(output.get("found")) and bool(citations), "citations": citations}


def related_documents(sources: list[Source], k: int = 3) -> list[dict]:
    """What to show when no AI is configured: the best-matching approved policy sections."""
    return [cite([s.id], sources)[0] for s in sources if s.kind == "policy"][:k]
