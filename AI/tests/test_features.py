from decimal import Decimal as D

from agriguard_ai import forecast as fc
from agriguard_ai import legal, navigator, retrieval, vision


TERMS = {"farmer": "สวน A", "buyer": "ผู้ซื้อ B", "listing_code": "PL-1", "product_type": "mango", "variety": "น้ำดอกไม้",
         "quantity_kg": 2000, "tolerance_pct": 5, "grade_prices": {"A": 45, "B": 30}, "harvest_window": ["2026-12-15", "2026-12-18"],
         "delivery_window": ["2026-12-15", "2026-12-18"], "destination_province": "กรุงเทพมหานคร", "payment_due_days": 3,
         "deposit_thb": 10000, "sampling_method": "สุ่ม 10%", "rejection_conditions": ["ROT", "BRUISING"],
         "shortfall_policy": "PROPORTIONAL_REDUCTION", "cancellation": "ต้องยินยอมทั้งสองฝ่าย", "dispute_procedure": "ภายใน 48 ชม.",
         "governing_law": "กฎหมายไทย"}


# --- retrieval & legal ------------------------------------------------------------------------

def test_thai_retrieval_finds_relevant_policy():
    assert retrieval.search("ลายมือชื่ออิเล็กทรอนิกส์ใช้ได้ไหม", 1)[0].id.startswith("electronic-transactions")
    assert any(s.id.startswith("dispute-policy") for s in retrieval.search("เปิดข้อพิพาทแล้วคะแนนลดไหม", 3))
    assert len(retrieval.corpus()) >= 25


def test_complete_contract_has_no_rule_findings():
    assert legal.rule_findings(TERMS, {"insufficient_data": False, "band": "LOW_RISK"}) == []


def test_rule_engine_flags_missing_and_risky_terms():
    terms = {**TERMS, "delivery_window": ["2026-12-01", "2026-12-05"], "payment_due_days": 45, "deposit_thb": 0,
             "rejection_conditions": [], "governing_law": None}
    codes = {f["code"] for f in legal.rule_findings(terms, {"insufficient_data": True})}
    assert {"NO_REJECTION_CONDITIONS", "LONG_PAYMENT_TERM", "DELIVERY_BEFORE_HARVEST", "MISSING_GOVERNING_LAW", "NO_DEPOSIT_NEW_BUYER"} <= codes


def test_review_result_keeps_only_real_citations():
    sources = legal.review_sources(TERMS)
    out = legal.review_result({"summary": "x", "plain_language": "y", "questions_to_ask": [],
                               "key_terms": [{"label": "ราคา", "value": "45", "source_ids": ["C-price", "X-fake"]}],
                               "risks": [{"issue": "i", "severity": "high", "who_is_affected": "BOTH", "suggestion": "s", "source_ids": ["nope"]}]}, sources)
    assert [c["id"] for c in out["key_terms"][0]["citations"]] == ["C-price"] and out["risks"][0]["citations"] == []
    assert legal.needs_human_review([], out) is True


def test_answer_without_valid_citation_is_not_found():
    sources = legal.ask_sources("ถ้าไม่ยืนยันสัญญาจะเป็นอย่างไร", TERMS)
    assert legal.ask_result({"answer": "เดา", "found": True, "source_ids": ["made-up"]}, sources)["found"] is False
    ok = legal.ask_result({"answer": "72 ชม.", "found": True, "source_ids": ["harvestlock-policy#2"]}, sources)
    assert ok["found"] is True and ok["citations"][0]["id"] == "harvestlock-policy#2"


# --- navigation -----------------------------------------------------------------------------------

def test_navigation_rules_by_role():
    farmer = navigator.catalog_for("FARMER", "org-1")
    buyer = navigator.catalog_for("BUYER", "org-2")
    assert navigator.rule_reply("อยากลงขายมะม่วง", farmer, [])["actions"][0]["route"] == "/produce/new"
    assert navigator.rule_reply("อยากซื้อทุเรียน", buyer, [])["actions"][0]["route"] == "/requests/new"
    assert "/produce/new" not in {d.route for d in buyer} and "/buyers/org-2" in {d.route for d in buyer}


def test_navigation_prefers_tasks_and_validates_ai_ids():
    task = navigator.Dest("task:HL-1", "/contracts/1", "ลงนาม HL-1", "รอคุณลงนาม")
    dests = [task] + navigator.catalog_for("BUYER", "o")
    assert navigator.rule_reply("มีงานอะไรค้างบ้าง", dests, [task])["actions"][0]["task"] is True
    r = navigator.nav_result({"reply": "ไปได้เลย", "destination_ids": ["task:HL-1", "admin_users", "task:HL-1", "/evil"], "suggestions": []}, dests)
    assert [a["route"] for a in r["actions"]] == ["/contracts/1"]


# --- vision & forecast ---------------------------------------------------------------------------

def test_photo_suggestion_adds_up_to_received_weight():
    s = vision.suggested_kg({"can_assess": True, "grade_shares": [{"grade": "A", "percent": 75}, {"grade": "B", "percent": 20}],
                             "reject_percent": 5}, D(2000), ["A", "B"])
    assert s["grades"]["A"] + s["grades"]["B"] + s["rejected_kg"] == 2000 and s["rejected_kg"] == 100
    assert vision.suggested_kg({"can_assess": False}, D(2000), ["A"]) == {}


def test_photo_content_downscales_to_jpeg():
    import io
    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", (4000, 3000)).save(buf, format="PNG")
    b64 = vision.to_jpeg_b64(buf.getvalue())
    content = vision.photo_content([b64], product_type="mango", variety=None, lot_code="LOT-1", received_kg=2000,
                                   grades=["A"], criteria=[{"grade": "A", "criteria": "ผิวสวย"}], rejection_conditions=["ROT"])
    import base64
    img = Image.open(io.BytesIO(base64.b64decode(content[0]["source"]["data"])))
    assert img.format == "JPEG" and max(img.size) <= vision.MAX_SIDE and content[-1]["type"] == "text"


def test_forecast_baseline():
    f = fc.forecast("mango", D(3), D(5000), D(4000))
    assert f["method"] == "BASELINE" and f["p50_kg"] == 3000 and len(f["warnings"]) == 2
    assert fc.forecast("mango", None, D(5000), D(0))["insufficient_data"] is True


def test_agrichatlaw_routes_legal_questions_and_navigation():
    from agriguard_ai.navigator import wants_legal

    for q in ("สัญญา HarvestLock ผูกพันเมื่อไหร่", "เปิดข้อพิพาทแล้วคะแนน AgriTrust ลดไหม", "ผู้ซื้อยกเลิกหลังเซ็นสัญญาได้ไหม",
              "ลายเซ็นอิเล็กทรอนิกส์ใช้ได้ตามกฎหมายไหม", "ระบบเก็บข้อมูลส่วนตัวอะไรบ้าง"):
        assert wants_legal(q), q
    for q in ("มีงานอะไรค้างบ้าง", "อยากซื้อทุเรียน 5 ตัน", "อยากดูสัญญา", "ผู้ซื้อรายนี้เชื่อถือได้ไหม", "ดูคะแนน AgriTrust ของเรา",
              "จะแบ่งผลผลิตให้ผู้ซื้อหลายรายยังไง"):
        assert not wants_legal(q), q
