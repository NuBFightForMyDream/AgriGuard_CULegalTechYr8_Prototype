from tests.conftest import BUYER_B, BUYER_C, BUYER_D, FARMER, INSPECTOR
from app.seed import sid

LISTING = str(sid("PL-2026-001"))


SIGN = {"signature_name": "อนันต์ กิตติวงศ์", "consent": True}


def ok(resp, code=200):
    assert resp.status_code == code, resp.text
    return resp.json()


def offers_by_buyer(client):
    listing = ok(client.get(f"/api/listings/{LISTING}", headers=FARMER))
    return {o["buyer"]["name"]: o for o in listing["offers"]}, listing


def test_health_and_auth(client):
    assert ok(client.get("/api/health"))["database"] == "ok"
    assert client.get("/api/dashboard").status_code == 401
    assert ok(client.get("/api/me", headers=FARMER))["role"] == "FARMER"


def test_demo_scenario_end_to_end(client):
    # 1-5. Farmer sees the 5,000 kg listing and three offers with AgriTrust profiles
    offers, listing = offers_by_buyer(client)
    assert listing["inventory"]["available_kg"] == 5000
    assert {o["buyer_trust"]["score"] for o in offers.values()} == {92.3, 85.5, 64.7}

    # 6-11. Manual allocation 2,000 / 2,000 / 1,000
    items = [
        {"offer_id": offers["FreshFruit Export Co."]["id"], "quantity_kg": 2000},
        {"offer_id": offers["Siam Fruit Processing Co., Ltd."]["id"], "quantity_kg": 2000},
        {"offer_id": offers["Eastern Wholesale Market"]["id"], "quantity_kg": 1000},
    ]
    preview = ok(client.post(f"/api/listings/{LISTING}/allocation/preview", json={"items": items}, headers=FARMER))
    assert preview["errors"] == [] and preview["expected_revenue"] == 2000 * 45 + 2000 * 48 + 1000 * 50
    created = ok(client.post(f"/api/listings/{LISTING}/allocation/confirm", json={"items": items}, headers=FARMER), 201)
    assert len(created["contracts"]) == 3

    # Supply is reserved, not yet contracted
    _, listing = offers_by_buyer(client)
    assert listing["inventory"]["available_kg"] == 0 and listing["inventory"]["reserved_kg"] == 5000

    # 12-14. Buyer B accepts its HarvestLock
    b_contract = next(c for c in created["contracts"] if c["buyer"]["name"] == "FreshFruit Export Co.")
    cid = b_contract["id"]
    detail = ok(client.post(f"/api/contracts/{cid}/accept", json=SIGN, headers=BUYER_B))
    assert detail["order_status"] == "CONFIRMED" and len(detail["acceptances"]) == 2
    assert len({a["terms_hash"] for a in detail["acceptances"]}) == 1  # both accepted the same version

    # 15-16. Harvest, lot, dispatch
    detail = ok(client.post(f"/api/contracts/{cid}/lots", json={"harvest_date": "2026-12-15", "harvested_kg": 2000}, headers=FARMER), 201)
    lot = detail["lots"][0]
    assert lot["code"].startswith("LOT-2026-MANGO-")
    detail = ok(client.post(f"/api/lots/{lot['id']}/dispatch", json={"vehicle": "1กข-1234", "gross_kg": 2150, "tare_kg": 150}, headers=FARMER))
    assert detail["order_status"] == "IN_TRANSIT"
    detail = ok(client.post(f"/api/lots/{lot['id']}/receive", json={"received_kg": 2000}, headers=BUYER_B))
    assert detail["order_status"] == "QC_PENDING"

    # 17-18. GradeProof and settlement (spec example: 81,000 − 10,000 deposit = 71,000)
    qc = {"grades": [{"grade": "A", "quantity_kg": 1600}, {"grade": "B", "quantity_kg": 300}],
          "rejected_kg": 100, "rejection_reason": "BRUISING", "sampling_method": "สุ่ม 10%", "evidence_note": "ภาพถ่าย 12 ภาพ"}
    detail = ok(client.post(f"/api/lots/{lot['id']}/inspections", json=qc, headers=INSPECTOR), 201)
    assert detail["order_status"] == "PAYMENT_PENDING"
    assert detail["settlement"]["gross_amount"] == 81000 and detail["settlement"]["net_amount"] == 71000
    assert detail["inspection"]["flags"] == []

    # 19. Payment (idempotent) and farmer confirmation
    sid_ = detail["settlement"]["id"]
    pay = {"amount": 71000, "reference": "TRX-001"}
    ok(client.post(f"/api/settlements/{sid_}/payments", json=pay, headers={**BUYER_B, "Idempotency-Key": "k1"}), 201)
    detail = ok(client.post(f"/api/settlements/{sid_}/payments", json=pay, headers={**BUYER_B, "Idempotency-Key": "k1"}), 201)
    assert detail["settlement"]["paid_amount"] == 71000 and detail["order_status"] == "PAID"
    detail = ok(client.post(f"/api/contracts/{cid}/complete", headers=FARMER))
    assert detail["order_status"] == "COMPLETED"

    # 20. AgriTrust updated with 1 more verified transaction
    trust = ok(client.get(f"/api/organizations/{b_contract['buyer']['id']}/trust", headers=FARMER))
    assert trust["profile"]["transactions"] == 43
    assert any(e["transaction_ref"] == b_contract["code"] for e in trust["recent_events"])

    # Timeline covers request → offer → contract → completion
    actions = [e["action"] for e in detail["timeline"]]
    assert actions[0] == "LISTING_CREATED" and "OFFER_SUBMITTED" in actions and actions[-1] == "TRUST_UPDATED"


def test_overbooking_rejected(client):
    offers, _ = offers_by_buyer(client)
    items = [{"offer_id": o["id"], "quantity_kg": 2000} for o in offers.values()]  # 6,000 > 5,000
    resp = client.post(f"/api/listings/{LISTING}/allocation/confirm", json={"items": items}, headers=FARMER)
    assert resp.status_code == 422


def test_proportional_preview_fits_supply(client):
    plan = ok(client.post(f"/api/listings/{LISTING}/allocation/preview", json={"strategy": "PROPORTIONAL"}, headers=FARMER))
    assert plan["errors"] == [] and plan["total_kg"] <= 5000


def test_decline_releases_supply_and_roles_enforced(client):
    offers, _ = offers_by_buyer(client)
    c_offer = offers["Siam Fruit Processing Co., Ltd."]
    created = ok(client.post(f"/api/listings/{LISTING}/allocation/confirm",
                             json={"items": [{"offer_id": c_offer["id"], "quantity_kg": 2500}]}, headers=FARMER), 201)
    cid = created["contracts"][0]["id"]
    assert client.post(f"/api/contracts/{cid}/accept", json=SIGN, headers=BUYER_D).status_code == 403  # not their contract
    assert client.post(f"/api/contracts/{cid}/accept", json=SIGN, headers=FARMER).status_code == 409  # wrong party
    ok(client.post(f"/api/contracts/{cid}/decline", json={"reason": "ไม่พร้อมรับ"}, headers=BUYER_C))
    _, listing = offers_by_buyer(client)
    assert listing["inventory"]["available_kg"] == 5000


def test_buyer_creates_request_sees_matches_and_offers(client):
    req = ok(client.post("/api/purchase-requests", headers=BUYER_D, json={
        "product_type": "mango", "variety": "น้ำดอกไม้", "quantity_kg": 1000, "accepted_grades": ["A"],
        "delivery_start": "2026-12-14", "delivery_end": "2026-12-20", "destination_province": "ชลบุรี"}), 201)
    matches = ok(client.get(f"/api/purchase-requests/{req['id']}/matches", headers=BUYER_D))
    codes = [m["listing"]["code"] for m in matches["recommendations"]]
    assert set(codes) == {"PL-2026-001", "PL-2026-003"}
    sunrise = next(m for m in matches["recommendations"] if m["listing"]["code"] == "PL-2026-003")
    ok(client.post("/api/offers", headers=BUYER_D, json={
        "listing_id": sunrise["listing"]["id"], "purchase_request_id": req["id"], "quantity_kg": 1000,
        "grade_prices": {"A": 47}}), 201)
    assert client.post("/api/offers", headers=BUYER_D, json={
        "listing_id": sunrise["listing"]["id"], "quantity_kg": 500, "grade_prices": {"A": 47}}).status_code == 409


def test_dashboards_render_for_each_role(client):
    for headers, role in ((FARMER, "FARMER"), (BUYER_B, "BUYER"), (INSPECTOR, "INSPECTOR")):
        assert ok(client.get("/api/dashboard", headers=headers))["role"] == role


def test_optimizer_strategies_and_reallocation(client):
    plan = ok(client.post(f"/api/listings/{LISTING}/allocation/preview", json={"strategy": "MAX_NET_REVENUE"}, headers=FARMER))
    by_buyer = {o["buyer"]["name"]: o["id"] for o in offers_by_buyer(client)[0].values()}
    qty = {line["offer_id"]: line["quantity_kg"] for line in plan["lines"]}
    assert plan["errors"] == [] and plan["total_kg"] == 5000
    assert qty[by_buyer["Eastern Wholesale Market"]] == 2000 and qty[by_buyer["Siam Fruit Processing Co., Ltd."]] == 2500
    risk = ok(client.post(f"/api/listings/{LISTING}/allocation/preview", json={"strategy": "RISK_AWARE"}, headers=FARMER))
    rq = {line["offer_id"]: line["quantity_kg"] for line in risk["lines"]}
    assert rq[by_buyer["Eastern Wholesale Market"]] == 1250  # HIGH_RISK capped at 25%

    # Buyer C declines → supply returns and reallocation suggests a plan over remaining offers
    created = ok(client.post(f"/api/listings/{LISTING}/allocation/confirm",
                             json={"items": [{"offer_id": by_buyer["Siam Fruit Processing Co., Ltd."], "quantity_kg": 2500}]}, headers=FARMER), 201)
    ok(client.post(f"/api/contracts/{created['contracts'][0]['id']}/decline", json={}, headers=BUYER_C))
    re = ok(client.get(f"/api/listings/{LISTING}/reallocation", headers=FARMER))
    assert re["available_kg"] == 5000 and len(re["released"]) == 1
    assert re["recommended_plan"]["total_kg"] == 5000
