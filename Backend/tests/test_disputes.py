from app.seed import sid
from tests.conftest import BUYER_B, BUYER_C, FARMER, INSPECTOR, as_user

ADMIN = as_user("admin@agriguard.example")
LISTING = str(sid("PL-2026-001"))


def ok(resp, code=200):
    assert resp.status_code == code, resp.text
    return resp.json()


def to_payment_pending(client) -> dict:
    offers = {o["buyer"]["name"]: o["id"] for o in ok(client.get(f"/api/listings/{LISTING}", headers=FARMER))["offers"]}
    created = ok(client.post(f"/api/listings/{LISTING}/allocation/confirm",
                             json={"items": [{"offer_id": offers["FreshFruit Export Co."], "quantity_kg": 2000}]}, headers=FARMER), 201)
    cid = created["contracts"][0]["id"]
    ok(client.post(f"/api/contracts/{cid}/accept", headers=BUYER_B))
    lot = ok(client.post(f"/api/contracts/{cid}/lots", json={"harvest_date": "2026-12-15", "harvested_kg": 2000}, headers=FARMER), 201)["lots"][0]
    ok(client.post(f"/api/lots/{lot['id']}/dispatch", json={"vehicle": "1กข", "gross_kg": 2100, "tare_kg": 100}, headers=FARMER))
    ok(client.post(f"/api/lots/{lot['id']}/receive", json={"received_kg": 2000}, headers=BUYER_B))
    return ok(client.post(f"/api/lots/{lot['id']}/inspections", headers=INSPECTOR, json={
        "grades": [{"grade": "A", "quantity_kg": 1500}, {"grade": "B", "quantity_kg": 300}], "rejected_kg": 200,
        "rejection_reason": "OTHER", "sampling_method": "สุ่ม 10%", "evidence_note": "ภาพ 5 ภาพ"}), 201)


def test_dispute_with_reinspection_adjusts_settlement_and_trust(client):
    c = to_payment_pending(client)
    cid = c["id"]
    assert c["settlement"]["net_amount"] == 1500 * 45 + 300 * 30 - 10000  # 66,500
    as_farmer = ok(client.get(f"/api/contracts/{cid}", headers=FARMER))
    assert "OPEN_DISPUTE" in as_farmer["actions"] and any("ปฏิเสธ" in r for r in as_farmer["risks"])

    d = ok(client.post(f"/api/contracts/{cid}/disputes", headers=FARMER, json={
        "category": "UNSUPPORTED_REJECTION", "description": "ผู้ซื้อปฏิเสธ 200 กก. ด้วยเหตุผลนอกสัญญา",
        "disputed_amount": 9000, "evidence_note": "ภาพก่อนขนส่ง"}), 201)
    assert d["status"] == "EVIDENCE_COLLECTION" and d["held_amount"] == 9000
    assert ok(client.get(f"/api/contracts/{cid}", headers=BUYER_B))["order_status"] == "DISPUTED"
    # Paused: buyer cannot pay, a second dispute is refused, a non-party cannot see it
    assert ok(client.get(f"/api/contracts/{cid}", headers=BUYER_B))["actions"] == []
    assert client.post(f"/api/contracts/{cid}/disputes", headers=BUYER_B, json={"category": "GRADE_DISPUTE", "description": "อีกเรื่องหนึ่งนะครับ"}).status_code == 409
    assert client.get(f"/api/disputes/{d['id']}", headers=BUYER_C).status_code == 403

    d = ok(client.post(f"/api/disputes/{d['id']}/statements", headers=BUYER_B, json={"body": "สินค้ามีตำหนิจริง แนบภาพ"}), 201)
    assert d["status"] == "UNDER_REVIEW"
    assert client.post(f"/api/disputes/{d['id']}/review", headers=FARMER, json={"action": "RESOLVE"}).status_code == 403
    d = ok(client.post(f"/api/disputes/{d['id']}/review", headers=ADMIN, json={"action": "REQUEST_REINSPECTION", "notes": "ตรวจซ้ำ"}))
    d = ok(client.post(f"/api/disputes/{d['id']}/reinspection", headers=INSPECTOR, json={
        "grades": [{"grade": "A", "quantity_kg": 1700}, {"grade": "B", "quantity_kg": 300}], "rejected_kg": 0,
        "sampling_method": "ตรวจทั้งล็อต", "evidence_note": "ภาพตรวจซ้ำ 20 ภาพ"}), 201)
    assert d["status"] == "UNDER_REVIEW" and d["proposed_adjustment"] == 9000
    d = ok(client.post(f"/api/disputes/{d['id']}/review", headers=ADMIN, json={
        "action": "RESOLVE", "outcome": "BUYER_RESPONSIBLE", "resolution": "ตรวจซ้ำแล้วไม่พบตำหนิ", "settlement_adjustment": 9000}))
    assert d["status"] == "RESOLVED" and d["held_amount"] == 0

    c = ok(client.get(f"/api/contracts/{cid}", headers=BUYER_B))
    assert c["order_status"] == "PAYMENT_PENDING" and c["settlement"]["net_amount"] == 75500
    ok(client.post(f"/api/settlements/{c['settlement']['id']}/payments", headers=BUYER_B, json={"amount": 75500, "reference": "T1"}), 201)
    c = ok(client.post(f"/api/contracts/{cid}/complete", headers=FARMER))
    assert c["disputes"][0]["status"] == "CLOSED"
    trust = ok(client.get(f"/api/organizations/{c['buyer']['id']}/trust", headers=FARMER))
    dispute_event = next(e for e in trust["recent_events"] if e["transaction_ref"] == c["code"] and e["dimension"] == "DISPUTE")
    assert dispute_event["success"] is False  # verified buyer responsibility counts; the open dispute did not


def test_no_fault_resolution_restores_without_penalty(client):
    c = to_payment_pending(client)
    d = ok(client.post(f"/api/contracts/{c['id']}/disputes", headers=BUYER_B, json={
        "category": "GRADE_DISPUTE", "description": "ขอทบทวนผลการคัดเกรด B"}), 201)
    ok(client.post(f"/api/disputes/{d['id']}/review", headers=ADMIN, json={"action": "START_REVIEW"}))
    ok(client.post(f"/api/disputes/{d['id']}/review", headers=ADMIN, json={
        "action": "RESOLVE", "outcome": "NO_FAULT", "resolution": "ผลตรวจเดิมถูกต้อง"}))
    c = ok(client.get(f"/api/contracts/{c['id']}", headers=BUYER_B))
    assert c["order_status"] == "PAYMENT_PENDING" and c["settlement"]["net_amount"] == 66500
