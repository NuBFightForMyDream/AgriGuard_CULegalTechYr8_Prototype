from app.seed import sid
from tests.conftest import BUYER_B, BUYER_D, FARMER, INSPECTOR, as_user

ADMIN = as_user("admin@agriguard.example")
BUYER_E = as_user("siriporn@newleaf.example")
LISTING = str(sid("PL-2026-001"))


def ok(resp, code=200):
    assert resp.status_code == code, resp.text
    return resp.json()


def test_admin_endpoints_are_admin_only(client):
    for path in ("/api/admin/users", "/api/admin/organizations", "/api/admin/risk"):
        assert client.get(path, headers=FARMER).status_code == 403
        assert client.get(path, headers=ADMIN).status_code == 200


def test_notifications_reach_the_other_party(client):
    offers = {o["buyer"]["name"]: o["id"] for o in ok(client.get(f"/api/listings/{LISTING}", headers=FARMER))["offers"]}
    ok(client.post(f"/api/listings/{LISTING}/allocation/confirm", headers=FARMER,
                   json={"items": [{"offer_id": offers["FreshFruit Export Co."], "quantity_kg": 1000}]}), 201)
    n = ok(client.get("/api/notifications", headers=BUYER_B))
    assert n["unread"] >= 1 and n["items"][0]["title"] == "มี HarvestLock รอคุณยืนยัน" and n["items"][0]["link"].startswith("/contracts/")
    assert all("HarvestLock รอคุณยืนยัน" not in i["title"] for i in ok(client.get("/api/notifications", headers=FARMER))["items"])
    ok(client.post("/api/notifications/read-all", headers=BUYER_B))
    assert ok(client.get("/api/notifications", headers=BUYER_B))["unread"] == 0


def test_appeal_accepted_recalculates_score(client):
    profile = ok(client.get(f"/api/organizations/{sid('buyer_d')}/trust", headers=BUYER_D))
    failed = next(e for e in profile["recent_events"] if not e["success"])
    a = ok(client.post(f"/api/trust/events/{failed['id']}/appeals", headers=BUYER_D, json={"reason": "ชำระตรงเวลา มีสลิปยืนยัน"}), 201)
    assert client.post(f"/api/trust/events/{failed['id']}/appeals", headers=BUYER_B, json={"reason": "ไม่ใช่ของฉันแต่ลองดู"}).status_code == 403
    assert any(i["title"] == "มีคำอุทธรณ์ AgriTrust" for i in ok(client.get("/api/notifications", headers=ADMIN))["items"])
    d = ok(client.post(f"/api/admin/appeals/{a['id']}/decide", headers=ADMIN, json={"accept": True, "note": "หลักฐานครบ"}))
    assert d["status"] == "ACCEPTED" and d["score_after"] > d["score_before"]
    assert ok(client.get("/api/trust/appeals", headers=BUYER_D))[0]["status"] == "ACCEPTED"


def test_verify_org_and_grant_inspector(client):
    org = next(o for o in ok(client.get("/api/admin/organizations", headers=ADMIN)) if o["name"] == "NewLeaf Foods")
    assert org["verified"] is False
    assert ok(client.post(f"/api/admin/organizations/{org['id']}/verify", headers=ADMIN, json={"verified": True}))["verified"] is True
    assert any("ยืนยัน" in i["body"] for i in ok(client.get("/api/notifications", headers=BUYER_E))["items"])
    user = next(u for u in ok(client.get("/api/admin/users", headers=ADMIN)) if u["email"] == "siriporn@newleaf.example")
    assert ok(client.post(f"/api/admin/users/{user['id']}/role", headers=ADMIN, json={"role": "INSPECTOR"}))["organization"]["kind"] == "PLATFORM"
    assert client.post(f"/api/admin/users/{user['id']}/role", headers=ADMIN, json={"role": "FARMER"}).status_code == 409


def test_quality_standard_drives_allowed_grades(client):
    stds = {s["product_type"]: s for s in ok(client.get("/api/quality-standards", headers=INSPECTOR))}
    assert [g["grade"] for g in stds["longan"]["grades"]] == ["AA", "A", "B"]
    ok(client.put("/api/admin/quality-standards/mango", headers=ADMIN, json={
        "sampling_method": "สุ่ม 5%", "grades": [{"grade": "P", "criteria": "พรีเมียม"}, {"grade": "A", "criteria": "มาตรฐาน"}]}))
    cat = ok(client.get("/api/catalog"))
    assert next(p for p in cat["products"] if p["key"] == "mango")["grades"] == ["P", "A"]
    bad = client.post("/api/listings", headers=FARMER, json={"product_type": "mango", "estimated_qty_kg": 100, "harvest_start": "2027-01-01",
                                                            "harvest_end": "2027-01-05", "expected_grades": ["C"]})
    assert bad.status_code == 422


def test_risk_flags_repeated_drops(client):
    offers = {o["buyer"]["name"]: o["id"] for o in ok(client.get(f"/api/listings/{LISTING}", headers=FARMER))["offers"]}
    for qty in (500, 400):
        cid = ok(client.post(f"/api/listings/{LISTING}/allocation/confirm", headers=FARMER,
                             json={"items": [{"offer_id": offers["Eastern Wholesale Market"], "quantity_kg": qty}]}), 201)["contracts"][0]["id"]
        ok(client.post(f"/api/contracts/{cid}/decline", headers=BUYER_D, json={}))
        # Re-open the declined offer's buyer with a fresh offer for the second round
        if qty == 500:
            offers["Eastern Wholesale Market"] = ok(client.post("/api/offers", headers=BUYER_D, json={
                "listing_id": LISTING, "quantity_kg": 400, "grade_prices": {"A": 50}}), 201)["id"]
    d = next(r for r in ok(client.get("/api/admin/risk", headers=ADMIN)) if r["name"] == "Eastern Wholesale Market")
    assert any(s["code"] == "REPEATED_DROPS" for s in d["signals"])
