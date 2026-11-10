"""AI features through the API, with the provider call replaced (no network). Pure AI logic is tested in AI/tests."""

import io
from types import SimpleNamespace

import pytest
from agriguard_ai import providers
from agriguard_ai.config import settings as ai_settings
from google.genai import types as gtypes
from PIL import Image

from app.seed import sid
from tests.conftest import BUYER_B, BUYER_C, FARMER, INSPECTOR

LISTING = str(sid("PL-2026-001"))
SIGN = {"signature_name": "ผู้ลงนาม", "consent": True}


def ok(resp, code=200):
    assert resp.status_code == code, resp.text
    return resp.json()


@pytest.fixture(autouse=True)
def no_ai_keys(monkeypatch):
    for k in ("ai_provider", "gemini_api_key", "anthropic_api_key"):
        monkeypatch.setattr(ai_settings, k, None)


@pytest.fixture()
def fake_ai(monkeypatch):
    """Stand-in for the provider call: records what would be sent and returns a canned JSON answer."""
    calls, answers = [], {}

    def fake_call(system, content, schema):
        calls.append({"system": system, "content": content, "schema": schema})
        props = schema["properties"]
        key = "review" if "risks" in props else "photo" if "grade_shares" in props else "nav" if "destination_ids" in props else "ask"
        return answers[key], "claude-opus-5-5", 1000, 200

    monkeypatch.setattr(ai_settings, "anthropic_api_key", "test-key")
    monkeypatch.setattr(providers, "_call", fake_call)
    return calls, answers


def contract(client, accept=True):
    offer = next(o for o in ok(client.get(f"/api/listings/{LISTING}", headers=FARMER))["offers"] if o["buyer"]["name"] == "FreshFruit Export Co.")
    cid = ok(client.post(f"/api/listings/{LISTING}/allocation/confirm", headers=FARMER,
                         json={"items": [{"offer_id": offer["id"], "quantity_kg": 2000}]}), 201)["contracts"][0]["id"]
    if accept:
        ok(client.post(f"/api/contracts/{cid}/accept", json=SIGN, headers=BUYER_B))
    return cid


def _png() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (64, 48), (200, 160, 40)).save(buf, format="PNG")
    return buf.getvalue()


# --- Legal AI ----------------------------------------------------------------------------------

def test_review_without_key_still_returns_rule_findings(client):
    cid = contract(client)
    r = ok(client.post(f"/api/legal/contracts/{cid}/review", headers=FARMER))
    assert r["ai"] is None and "GEMINI_API_KEY" in r["ai_error"]
    assert all(f["source"] == "RULE_ENGINE" for f in r["rule_findings"])
    assert ok(client.get("/api/ai/status", headers=FARMER))["available"] is False


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
    assert [c["id"] for c in r["ai"]["key_terms"][0]["citations"]] == ["C-price"]
    assert [c["id"] for c in r["ai"]["risks"][0]["citations"]] == ["C-payment", "harvestlock-policy#4"]
    assert r["human_review_required"] is True
    assert "C-law" in calls[0]["content"][0]["text"]
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


def test_ask_without_key_shows_related_documents(client):
    r = ok(client.post("/api/legal/ask", headers=BUYER_B, json={"question": "ลายมือชื่ออิเล็กทรอนิกส์ใช้ได้ไหม"}))
    assert r["answer"] is None and r["citations"][0]["id"].startswith("electronic-transactions")


def test_ask_about_contract_is_scoped_to_parties(client, fake_ai):
    cid = contract(client)
    assert client.post("/api/legal/ask", headers=BUYER_C, json={"question": "ราคาเท่าไร", "contract_id": cid}).status_code == 403


def test_ask_end_to_end_with_gemini_adapter(client, monkeypatch):
    monkeypatch.setattr(ai_settings, "gemini_api_key", "g-key")

    class FakeGemini:
        def __init__(self):
            self.models = self

        def generate_content(self, **kw):
            return SimpleNamespace(prompt_feedback=None, candidates=[SimpleNamespace(finish_reason=gtypes.FinishReason.STOP)],
                                   text='{"answer": "ต้องยืนยันภายใน 72 ชั่วโมง", "found": true, "source_ids": ["harvestlock-policy#2"]}',
                                   usage_metadata=SimpleNamespace(prompt_token_count=1, candidates_token_count=1), model_version="gemini-3.8-flash")

    monkeypatch.setattr(providers, "_gemini", FakeGemini())
    r = ok(client.post("/api/legal/ask", headers=BUYER_B, json={"question": "ถ้าไม่ยืนยันสัญญาจะเป็นอย่างไร"}))
    assert r["found"] is True and r["model"] == "gemini-3.8-flash"
    status = ok(client.get("/api/ai/status", headers=BUYER_B))
    assert status["provider"] == "gemini" and status["model"] == ai_settings.gemini_model


# --- QC photo assist ---------------------------------------------------------------------------

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
    assert client.post(f"/api/lots/{lot['id']}/ai-grade", headers=FARMER).status_code == 403
    s = ok(client.post(f"/api/lots/{lot['id']}/ai-grade", headers=INSPECTOR))
    assert s["label"] == "AI-suggested" and s["images_used"] == 1
    kg = s["suggested_kg"]
    assert kg["grades"]["A"] + kg["grades"]["B"] + kg["rejected_kg"] == 2000
    assert calls[-1]["content"][0]["source"]["media_type"] == "image/jpeg"
    c = ok(client.post(f"/api/lots/{lot['id']}/inspections", headers=INSPECTOR, json={
        "grades": [{"grade": "A", "quantity_kg": 1550}, {"grade": "B", "quantity_kg": 400}], "rejected_kg": 50,
        "rejection_reason": "BRUISING", "sampling_method": "สุ่ม 10%", "ai_run_id": s["run_id"]}), 201)
    assert c["inspection"]["ai_assisted"] is True


def test_photo_assist_without_key_is_unavailable(client):
    cid = contract(client)
    lot = ok(client.post(f"/api/contracts/{cid}/lots", json={"harvest_date": "2026-12-15", "harvested_kg": 2000}, headers=FARMER), 201)["lots"][0]
    ok(client.post("/api/files", headers=FARMER, data={"entity_type": "lot", "entity_id": lot["id"]}, files={"file": ("a.png", _png(), "image/png")}), 201)
    assert client.post(f"/api/lots/{lot['id']}/ai-grade", headers=BUYER_B).status_code == 503


def test_forecast_endpoint(client):
    r = ok(client.get(f"/api/listings/{LISTING}/forecast", headers=FARMER))
    assert r["method"] == "BASELINE" and r["p50_kg"] == 45000  # Green Valley: 45 rai


# --- navigation chatbot --------------------------------------------------------------------------

def test_nav_rules_mode_routes_by_role(client):
    r = ok(client.post("/api/assistant/chat", headers=FARMER, json={"message": "อยากลงขายมะม่วง"}))
    assert r["mode"] == "rules" and r["actions"][0]["route"] == "/produce/new"
    r = ok(client.post("/api/assistant/chat", headers=BUYER_B, json={"message": "อยากซื้อทุเรียน"}))
    assert r["actions"][0]["route"] == "/requests/new"


def test_nav_lists_pending_tasks(client):
    contract(client, accept=False)
    r = ok(client.post("/api/assistant/chat", headers=BUYER_B, json={"message": "มีงานอะไรค้างบ้าง"}))
    assert r["actions"][0]["task"] is True and r["actions"][0]["route"].startswith("/contracts/")
    r = ok(client.post("/api/assistant/chat", headers=FARMER, json={"message": "มีงานอะไรต้องทำ"}))
    assert any(a["route"].startswith("/allocation/") for a in r["actions"])


def test_nav_ai_mode_drops_invented_destinations(client, fake_ai):
    calls, answers = fake_ai
    answers["nav"] = {"reply": "ไปลงประกาศได้เลยครับ", "destination_ids": ["produce_new", "admin_users", "https://evil.example", "produce_new"],
                      "suggestions": ["ดูข้อเสนอ"]}
    r = ok(client.post("/api/assistant/chat", headers=FARMER, json={
        "message": "จะขายมะม่วงต้องทำยังไง", "history": [{"role": "user", "text": "สวัสดี"}], "current_path": "/dashboard"}))
    assert r["mode"] == "ai" and [a["route"] for a in r["actions"]] == ["/produce/new"]
    assert "admin_users" not in calls[0]["content"][0]["text"] and "USER ROLE: FARMER" in calls[0]["content"][0]["text"]


def test_agrichatlaw_answers_legal_questions_with_citations(client, fake_ai):
    from agriguard_ai import legal

    calls, answers = fake_ai
    q = "สัญญา HarvestLock ผูกพันเมื่อไหร่"
    src = legal.ask_sources(q, None)[0].id
    answers["ask"] = {"answer": "ผูกพันเมื่อผู้ซื้อยืนยันสัญญา", "found": True, "source_ids": [src, "made-up#9"]}
    r = ok(client.post("/api/assistant/chat", headers=FARMER, json={"message": q}))
    assert r["kind"] == "legal" and r["reply"] == "ผูกพันเมื่อผู้ซื้อยืนยันสัญญา" and r["mode"] == "ai"
    assert [c["id"] for c in r["citations"]] == [src] and r["disclaimer"]  # invented id dropped
    assert len(r["actions"]) <= 2
    # Navigation requests still navigate.
    answers["nav"] = {"reply": "ไปลงประกาศได้เลยครับ", "destination_ids": ["produce_new"], "suggestions": []}
    r = ok(client.post("/api/assistant/chat", headers=FARMER, json={"message": "อยากลงขายมะม่วง"}))
    assert r["kind"] == "nav" and r["actions"][0]["route"] == "/produce/new"


def test_agrichatlaw_legal_without_key_lists_documents(client):
    r = ok(client.post("/api/assistant/chat", headers=BUYER_B, json={"message": "ลายเซ็นอิเล็กทรอนิกส์ใช้ได้ตามกฎหมายไหม"}))
    assert r["kind"] == "legal" and r["mode"] == "rules" and r["citations"] and r["reply"]
