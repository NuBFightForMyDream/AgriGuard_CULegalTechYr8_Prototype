import io
from decimal import Decimal as D

import pytest
from PIL import Image

from app.config import settings
from app.services import forecast as fc
from app.services.ai import client as ai
from app.services.ai import knowledge, legal
from app.seed import sid
from tests.conftest import BUYER_B, FARMER, INSPECTOR

LISTING = str(sid("PL-2026-001"))
SIGN = {"signature_name": "ผู้ลงนาม", "consent": True}


def ok(resp, code=200):
    assert resp.status_code == code, resp.text
    return resp.json()


@pytest.fixture()
def fake_ai(monkeypatch):
    """Stand-in for the Claude call: records what would be sent and returns a canned JSON answer."""
    calls = []
    answers = {}

    def fake_call(system, content, schema):
        calls.append({"system": system, "content": content, "schema": schema})
        key = "review" if "risks" in schema["properties"] else "photo" if "grade_shares" in schema["properties"] else "ask"
        return answers[key], "claude-opus-5-5", 1000, 200

    monkeypatch.setattr(settings, "anthropic_api_key", "test-key")
    monkeypatch.setattr(ai, "_call", fake_call)
    return calls, answers


def contract(client, accept=True):
    offer = next(o for o in ok(client.get(f"/api/listings/{LISTING}", headers=FARMER))["offers"] if o["buyer"]["name"] == "FreshFruit Export Co.")
    cid = ok(client.post(f"/api/listings/{LISTING}/allocation/confirm", headers=FARMER,
                         json={"items": [{"offer_id": offer["id"], "quantity_kg": 2000}]}), 201)["contracts"][0]["id"]
    if accept:
        ok(client.post(f"/api/contracts/{cid}/accept", json=SIGN, headers=BUYER_B))
    return cid


# --- rule engine and retrieval (no AI) ------------------------------------------------------

def test_rule_engine_flags_missing_and_risky_terms():
    terms = {"grade_prices": {"A": 45}, "quantity_kg": 1000, "tolerance_pct": 5, "delivery_window": ["2026-12-01", "2026-12-05"],
             "harvest_window": ["2026-12-10", "2026-12-12"], "destination_province": "ชลบุรี", "payment_due_days": 45,
             "deposit_thb": 0, "sampling_method": "สุ่ม 10%", "rejection_conditions": [], "cancellation": "x",
             "dispute_procedure": "y", "shortfall_policy": "PROPORTIONAL_REDUCTION"}
    codes = {f["code"] for f in legal.rule_findings(terms, {"insufficient_data": True})}
    assert {"NO_REJECTION_CONDITIONS", "LONG_PAYMENT_TERM", "DELIVERY_BEFORE_HARVEST", "MISSING_GOVERNING_LAW", "NO_DEPOSIT_NEW_BUYER"} <= codes


def test_thai_retrieval_finds_relevant_policy():
    assert knowledge.search("ลายมือชื่ออิเล็กทรอนิกส์ใช้ได้ไหม", 1)[0].id.startswith("electronic-transactions")
    assert any(s.id.startswith("dispute-policy") for s in knowledge.search("เปิดข้อพิพาทแล้วคะแนนลดไหม", 3))


def test_review_without_key_still_returns_rule_findings(client):
    cid = contract(client)
    r = ok(client.post(f"/api/legal/contracts/{cid}/review", headers=FARMER))
    assert r["ai"] is None and "GEMINI_API_KEY" in r["ai_error"]
    assert all(f["source"] == "RULE_ENGINE" for f in r["rule_findings"])
    assert ok(client.get("/api/ai/status", headers=FARMER))["available"] is False


# --- Legal AI with the stand-in model ------------------------------------------------------------

def test_review_filters_invented_citations_caches_and_logs(client, fake_ai):
    calls, answers = fake_ai
    answers["review"] = {
        "summary": "สัญญาซื้อมะม่วง 2,000 กก.", "plain_language": "ผู้ซื้อจ่ายภายใน 3 วัน",
        "key_terms": [{"label": "ราคา", "value": "A 45 บาท", "source_ids": ["C-price", "X-made-up"]}],
        "risks": [{"issue": "ไม่มีหลักประกันเพิ่ม", "severity": "high", "who_is_affected": "FARMER", "suggestion": "ตรวจมัดจำ",
                   "source_ids": ["C-payment", "harvestlock-policy#4"]}],
        "questions_to_ask": ["ใครออกค่าขนส่ง"],
    }
    cid = contract(client)
    r = ok(client.post(f"/api/legal/contracts/{cid}/review", headers=FARMER))
    assert r["ai"]["label"] == "AI-generated" and r["ai"]["model"] == "claude-opus-5-5"
    assert [c["id"] for c in r["ai"]["key_terms"][0]["citations"]] == ["C-price"]  # invented id dropped
    assert [c["id"] for c in r["ai"]["risks"][0]["citations"]] == ["C-payment", "harvestlock-policy#4"]
    assert r["human_review_required"] is True  # a high risk needs a human
    assert "C-law" in calls[0]["content"][0]["text"] and calls[0]["schema"]["additionalProperties"] is False
    again = ok(client.post(f"/api/legal/contracts/{cid}/review", headers=BUYER_B))
    assert again["ai"]["cached"] is True and len(calls) == 1
    ok(client.post(f"/api/legal/contracts/{cid}/review?refresh=true", headers=FARMER))
    assert len(calls) == 2


def test_ask_redacts_personal_data_and_requires_citations(client, fake_ai):
    calls, answers = fake_ai
    answers["ask"] = {"answer": "ผู้ซื้อต้องยืนยันภายใน 72 ชั่วโมง", "found": True, "source_ids": ["harvestlock-policy#2"]}
    r = ok(client.post("/api/legal/ask", headers=BUYER_B, json={"question": "ถ้าไม่ยืนยันสัญญาจะเป็นอย่างไร ติดต่อ anan@freshfruit.example 081-234-5678"}))
    sent = calls[0]["content"][0]["text"]
    assert "anan@freshfruit.example" not in sent and "[อีเมล]" in sent and "[เบอร์โทร]" in sent
    assert r["found"] is True and r["citations"][0]["id"] == "harvestlock-policy#2"
    answers["ask"] = {"answer": "เดาเอา", "found": True, "source_ids": ["not-a-source"]}
    r = ok(client.post("/api/legal/ask", headers=BUYER_B, json={"question": "ราคาตลาดวันนี้เท่าไร"}))
    assert r["found"] is False and r["citations"] == []  # no valid citation -> not treated as found


def test_ask_about_contract_is_scoped_to_parties(client, fake_ai):
    cid = contract(client)
    from tests.conftest import BUYER_C
    assert client.post("/api/legal/ask", headers=BUYER_C, json={"question": "ราคาเท่าไร", "contract_id": cid}).status_code == 403


# --- QC photo assist -----------------------------------------------------------------------------

def _png() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (64, 48), (200, 160, 40)).save(buf, format="PNG")
    return buf.getvalue()


def test_photo_assist_suggests_and_inspector_decides(client, fake_ai):
    calls, answers = fake_ai
    answers["photo"] = {"can_assess": True, "image_quality": "good", "grade_shares": [{"grade": "A", "percent": 75}, {"grade": "B", "percent": 20}],
                        "reject_percent": 5, "defects": [{"type": "BRUISING", "description": "ช้ำเล็กน้อย", "severity": "minor"}],
                        "confidence": "medium", "notes": "ภาพชัด"}
    cid = contract(client)
    lot = ok(client.post(f"/api/contracts/{cid}/lots", json={"harvest_date": "2026-12-15", "harvested_kg": 2000}, headers=FARMER), 201)["lots"][0]
    ok(client.post(f"/api/lots/{lot['id']}/dispatch", json={"vehicle": "A", "gross_kg": 2100, "tare_kg": 100}, headers=FARMER))
    ok(client.post(f"/api/lots/{lot['id']}/receive", json={"received_kg": 2000}, headers=BUYER_B))
    assert client.post(f"/api/lots/{lot['id']}/ai-grade", headers=INSPECTOR).status_code == 422  # no photos yet
    ok(client.post("/api/files", headers=INSPECTOR, data={"entity_type": "lot", "entity_id": lot["id"]},
                   files={"file": ("lot.png", _png(), "image/png")}), 201)
    assert client.post(f"/api/lots/{lot['id']}/ai-grade", headers=FARMER).status_code == 403  # the seller cannot grade

    s = ok(client.post(f"/api/lots/{lot['id']}/ai-grade", headers=INSPECTOR))
    assert s["label"] == "AI-suggested" and s["images_used"] == 1
    kg = s["suggested_kg"]
    assert kg["grades"]["A"] + kg["grades"]["B"] + kg["rejected_kg"] == 2000 and kg["rejected_kg"] == 100
    assert calls[-1]["content"][0]["type"] == "image" and calls[-1]["content"][0]["source"]["media_type"] == "image/jpeg"

    # Inspector records their own numbers, referencing the suggestion
    c = ok(client.post(f"/api/lots/{lot['id']}/inspections", headers=INSPECTOR, json={
        "grades": [{"grade": "A", "quantity_kg": 1550}, {"grade": "B", "quantity_kg": 400}], "rejected_kg": 50,
        "rejection_reason": "BRUISING", "sampling_method": "สุ่ม 10%", "ai_run_id": s["run_id"]}), 201)
    assert c["inspection"]["ai_assisted"] is True and c["settlement"]["gross_amount"] == 1550 * 45 + 400 * 30


def test_photo_assist_without_key_is_unavailable(client):
    cid = contract(client)
    lot = ok(client.post(f"/api/contracts/{cid}/lots", json={"harvest_date": "2026-12-15", "harvested_kg": 2000}, headers=FARMER), 201)["lots"][0]
    ok(client.post("/api/files", headers=FARMER, data={"entity_type": "lot", "entity_id": lot["id"]}, files={"file": ("a.png", _png(), "image/png")}), 201)
    assert client.post(f"/api/lots/{lot['id']}/ai-grade", headers=BUYER_B).status_code == 503


# --- forecast baseline ------------------------------------------------------------------------

def test_forecast_baseline_warns_on_overestimate(client):
    f = fc.forecast("mango", D(3), D(5000), D(4000))
    assert f["method"] == "BASELINE" and f["p50_kg"] == 3000 and f["p90_kg"] == 4500
    assert len(f["warnings"]) == 2 and f["safe_to_commit_kg"] == 3000
    assert fc.forecast("mango", None, D(5000), D(0))["insufficient_data"] is True
    r = ok(client.get(f"/api/listings/{LISTING}/forecast", headers=FARMER))
    assert r["model_version"] == fc.MODEL_VERSION and r["p50_kg"] == 45000  # Green Valley: 45 rai


# --- Gemini provider adapter (no network) ---------------------------------------------------

from types import SimpleNamespace  # noqa: E402

from google.genai import types as gtypes  # noqa: E402


class FakeGemini:
    def __init__(self, response):
        self.response, self.calls = response, []
        self.models = self

    def generate_content(self, **kw):
        self.calls.append(kw)
        return self.response


def gemini_response(text, finish="STOP", blocked=None):
    return SimpleNamespace(
        prompt_feedback=SimpleNamespace(block_reason=blocked) if blocked else None,
        candidates=[SimpleNamespace(finish_reason=getattr(gtypes.FinishReason, finish))],
        text=text, usage_metadata=SimpleNamespace(prompt_token_count=12, candidates_token_count=34),
        model_version="gemini-3.8-flash")


def test_provider_selection(monkeypatch):
    monkeypatch.setattr(settings, "anthropic_api_key", None)
    monkeypatch.setattr(settings, "gemini_api_key", "g-key")
    assert ai.provider() == "gemini" and ai.model_name() == settings.gemini_model
    monkeypatch.setattr(settings, "anthropic_api_key", "a-key")
    assert ai.provider() == "anthropic"
    monkeypatch.setattr(settings, "ai_provider", "gemini")
    assert ai.provider() == "gemini"


def test_gemini_call_converts_content_and_parses_json(monkeypatch):
    monkeypatch.setattr(settings, "gemini_api_key", "g-key")
    monkeypatch.setattr(settings, "anthropic_api_key", None)
    fake = FakeGemini(gemini_response('{"answer": "ok", "found": true, "source_ids": []}'))
    monkeypatch.setattr(ai, "_gemini", fake)
    import base64
    img = base64.standard_b64encode(_png()).decode()
    data, model, tin, tout = ai._call("sys", [{"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": img}},
                                            {"type": "text", "text": "hello"}], legal.ANSWER_SCHEMA)
    assert data["answer"] == "ok" and model == "gemini-3.8-flash" and (tin, tout) == (12, 34)
    sent = fake.calls[0]
    assert sent["model"] == settings.gemini_model and sent["contents"][1] == "hello"
    assert sent["contents"][0].inline_data.mime_type == "image/jpeg"
    cfg = sent["config"]
    assert cfg.response_mime_type == "application/json" and cfg.response_json_schema == legal.ANSWER_SCHEMA and cfg.system_instruction == "sys"


@pytest.mark.parametrize("finish,blocked,exc", [("SAFETY", None, ai.AIRefused), ("STOP", "SAFETY", ai.AIRefused), ("MAX_TOKENS", None, ai.AIUnavailable)])
def test_gemini_blocked_or_truncated(monkeypatch, finish, blocked, exc):
    monkeypatch.setattr(settings, "gemini_api_key", "g-key")
    monkeypatch.setattr(settings, "anthropic_api_key", None)
    monkeypatch.setattr(ai, "_gemini", FakeGemini(gemini_response("{}", finish, blocked)))
    with pytest.raises(exc):
        ai._call("sys", [{"type": "text", "text": "x"}], legal.ANSWER_SCHEMA)


def test_ask_end_to_end_with_gemini(client, monkeypatch):
    monkeypatch.setattr(settings, "gemini_api_key", "g-key")
    monkeypatch.setattr(settings, "anthropic_api_key", None)
    monkeypatch.setattr(ai, "_gemini", FakeGemini(gemini_response('{"answer": "ต้องยืนยันภายใน 72 ชั่วโมง", "found": true, "source_ids": ["harvestlock-policy#2"]}')))
    r = ok(client.post("/api/legal/ask", headers=BUYER_B, json={"question": "ถ้าไม่ยืนยันสัญญาจะเป็นอย่างไร"}))
    assert r["found"] is True and r["model"] == "gemini-3.8-flash"
    status = ok(client.get("/api/ai/status", headers=BUYER_B))
    assert status["provider"] == "gemini" and status["model"] == settings.gemini_model


def test_failover_from_gemini_quota_to_claude(monkeypatch):
    monkeypatch.setattr(settings, "gemini_api_key", "g-key")
    monkeypatch.setattr(settings, "anthropic_api_key", "a-key")
    monkeypatch.setattr(settings, "ai_provider", "gemini")
    used = []

    def gemini_quota(*a):
        used.append("gemini")
        raise ai.AIUnavailable("quota")

    def claude_ok(*a):
        used.append("anthropic")
        return {"ok": True}, "claude-opus-5-5", 1, 1

    monkeypatch.setattr(ai, "_call_gemini", gemini_quota)
    monkeypatch.setattr(ai, "_call_anthropic", claude_ok)
    assert ai.providers_in_order() == ["gemini", "anthropic"]
    data, model, *_ = ai._call("s", [{"type": "text", "text": "x"}], {"type": "object"})
    assert used == ["gemini", "anthropic"] and model == "claude-opus-5-5"


def test_refusal_is_not_retried_on_other_provider(monkeypatch):
    monkeypatch.setattr(settings, "gemini_api_key", "g-key")
    monkeypatch.setattr(settings, "anthropic_api_key", "a-key")
    monkeypatch.setattr(settings, "ai_provider", "gemini")

    def refused(*a):
        raise ai.AIRefused("no")

    monkeypatch.setattr(ai, "_call_gemini", refused)
    monkeypatch.setattr(ai, "_call_anthropic", lambda *a: pytest.fail("must not retry a refusal"))
    with pytest.raises(ai.AIRefused):
        ai._call("s", [{"type": "text", "text": "x"}], {"type": "object"})


# --- navigation chatbot ---------------------------------------------------------------------

def test_nav_rules_mode_routes_by_role(client):
    r = ok(client.post("/api/assistant/chat", headers=FARMER, json={"message": "อยากลงขายมะม่วง"}))
    assert r["mode"] == "rules" and r["actions"][0]["route"] == "/produce/new"
    r = ok(client.post("/api/assistant/chat", headers=BUYER_B, json={"message": "อยากซื้อทุเรียน"}))
    assert r["actions"][0]["route"] == "/requests/new"
    assert all(a["route"] != "/produce/new" for a in r["actions"])  # buyer never sees farmer-only pages


def test_nav_lists_pending_tasks(client):
    contract(client, accept=False)  # buyer B now has a HarvestLock to sign
    r = ok(client.post("/api/assistant/chat", headers=BUYER_B, json={"message": "มีงานอะไรค้างบ้าง"}))
    assert r["actions"][0]["task"] is True and r["actions"][0]["route"].startswith("/contracts/")
    r = ok(client.post("/api/assistant/chat", headers=FARMER, json={"message": "มีงานอะไรต้องทำ"}))
    assert any(a["route"].startswith("/allocation/") for a in r["actions"])


def test_nav_ai_mode_drops_invented_destinations(client, monkeypatch):
    monkeypatch.setattr(settings, "gemini_api_key", "g-key")
    seen = {}

    def fake_call(system, content, schema):
        seen["text"] = content[0]["text"]
        return {"reply": "ไปลงประกาศได้เลยครับ", "destination_ids": ["produce_new", "admin_users", "https://evil.example", "produce_new"],
                "suggestions": ["ดูข้อเสนอ"]}, "gemini-3.8-flash", 1, 1

    monkeypatch.setattr(ai, "_call", fake_call)
    r = ok(client.post("/api/assistant/chat", headers=FARMER, json={
        "message": "จะขายมะม่วงต้องทำยังไง", "history": [{"role": "user", "text": "สวัสดี"}], "current_path": "/dashboard"}))
    assert r["mode"] == "ai" and [a["route"] for a in r["actions"]] == ["/produce/new"]  # admin page and URL dropped, deduped
    assert "admin_users" not in seen["text"] and "USER ROLE: FARMER" in seen["text"]
