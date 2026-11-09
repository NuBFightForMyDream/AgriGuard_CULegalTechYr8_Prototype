from app.seed import sid
from tests.conftest import BUYER_B, BUYER_C, BUYER_D, FARMER

LISTING = str(sid("PL-2026-001"))
SIGN = {"signature_name": "ผู้ลงนาม", "consent": True}


def ok(resp, code=200):
    assert resp.status_code == code, resp.text
    return resp.json()


def confirmed_contracts(client):
    offers = {o["buyer"]["name"]: o["id"] for o in ok(client.get(f"/api/listings/{LISTING}", headers=FARMER))["offers"]}
    items = [{"offer_id": offers["FreshFruit Export Co."], "quantity_kg": 2000},
             {"offer_id": offers["Siam Fruit Processing Co., Ltd."], "quantity_kg": 2000},
             {"offer_id": offers["Eastern Wholesale Market"], "quantity_kg": 1000}]
    created = ok(client.post(f"/api/listings/{LISTING}/allocation/confirm", json={"items": items}, headers=FARMER), 201)["contracts"]
    by_buyer = {c["buyer"]["name"]: c["id"] for c in created}
    for name, h in (("FreshFruit Export Co.", BUYER_B), ("Siam Fruit Processing Co., Ltd.", BUYER_C), ("Eastern Wholesale Market", BUYER_D)):
        ok(client.post(f"/api/contracts/{by_buyer[name]}/accept", json=SIGN, headers=h))
    return by_buyer


def test_signature_required_to_accept(client):
    offers = {o["buyer"]["name"]: o["id"] for o in ok(client.get(f"/api/listings/{LISTING}", headers=FARMER))["offers"]}
    cid = ok(client.post(f"/api/listings/{LISTING}/allocation/confirm", headers=FARMER,
                         json={"items": [{"offer_id": offers["FreshFruit Export Co."], "quantity_kg": 1000}]}), 201)["contracts"][0]["id"]
    assert client.post(f"/api/contracts/{cid}/accept", json={"signature_name": "x y", "consent": False}, headers=BUYER_B).status_code == 422
    c = ok(client.post(f"/api/contracts/{cid}/accept", json=SIGN, headers=BUYER_B))
    buyer_sig = next(a for a in c["acceptances"] if a["method"] == "TYPED_NAME")
    assert buyer_sig["signature_name"] == "ผู้ลงนาม" and buyer_sig["terms_hash"] == c["terms_hash"]
    assert c["versions"][0]["status"] == "ACCEPTED"


def test_amendment_needs_other_party_and_keeps_history(client):
    cid = confirmed_contracts(client)["FreshFruit Export Co."]
    c = ok(client.post(f"/api/contracts/{cid}/amendments", headers=BUYER_B, json={
        "changes": {"grade_prices": {"A": 47, "B": 30}, "payment_due_days": 5}, "reason": "ปรับราคาตามตลาด"}), 201)
    assert c["status"] == "AMENDMENT_PENDING" and c["current_version"] == 1
    assert {d["field"] for d in c["proposed"]["diff"]} == {"grade_prices", "payment_due_days"}
    assert "RESPOND_AMENDMENT" not in c["actions"]  # proposer cannot accept their own change
    assert client.post(f"/api/contracts/{cid}/amendments/respond", json={"accept": True}, headers=FARMER).status_code == 422  # unsigned
    c = ok(client.post(f"/api/contracts/{cid}/amendments/respond", json={"accept": True, **SIGN}, headers=FARMER))
    assert c["current_version"] == 2 and c["terms"]["grade_prices"]["A"] == 47
    assert [v["status"] for v in c["versions"]] == ["SUPERSEDED", "ACCEPTED"]
    assert c["versions"][0]["terms"]["grade_prices"]["A"] == 45  # never overwritten


def test_quantity_increase_cannot_overbook(client):
    cid = confirmed_contracts(client)["FreshFruit Export Co."]
    r = client.post(f"/api/contracts/{cid}/amendments", headers=FARMER, json={"changes": {"quantity_kg": 2500}, "reason": "เพิ่มปริมาณ"})
    assert r.status_code == 422  # all 5,000 kg are already contracted


def test_shortfall_proposes_proportional_reduction(client):
    by_buyer = confirmed_contracts(client)
    preview = ok(client.post(f"/api/listings/{LISTING}/shortfall/preview", json={"actual_kg": 4200}, headers=FARMER))
    assert [p["new_kg"] for p in preview["plan"]] == [1680, 1680, 840]
    res = ok(client.post(f"/api/listings/{LISTING}/shortfall", json={"actual_kg": 4200}, headers=FARMER))
    assert res["proposed"] == 3
    c = ok(client.get(f"/api/contracts/{by_buyer['FreshFruit Export Co.']}", headers=BUYER_B))
    assert c["quantity_kg"] == 2000 and c["proposed"]["terms"]["quantity_kg"] == 1680  # not silently modified
    c = ok(client.post(f"/api/contracts/{c['id']}/amendments/respond", json={"accept": True, **SIGN}, headers=BUYER_B))
    assert c["quantity_kg"] == 1680
    c2 = ok(client.post(f"/api/contracts/{by_buyer['Eastern Wholesale Market']}/amendments/respond", json={"accept": False}, headers=BUYER_D))
    assert c2["quantity_kg"] == 1000 and c2["status"] == "CONFIRMED"
