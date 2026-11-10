from app.seed import sid
from tests.conftest import BUYER_B, FARMER, as_user

FARMER_SUNRISE = as_user("wilai@sunrise.example")
GREEN = str(sid("PL-2026-001"))      # Green Valley mango, 5,000 kg
SUNRISE = str(sid("PL-2026-003"))    # Sunrise mango, 3,000 kg
SIGN = {"signature_name": "อนันต์ กิตติวงศ์", "consent": True}


def ok(resp, code=200):
    assert resp.status_code == code, resp.text
    return resp.json()


def new_request(client, mode, qty=3000, max_suppliers=None):
    return ok(client.post("/api/purchase-requests", headers=BUYER_B, json={
        "product_type": "mango", "variety": "น้ำดอกไม้", "quantity_kg": qty, "min_quantity_kg": 500, "accepted_grades": ["A", "B"],
        "delivery_start": "2026-12-14", "delivery_end": "2026-12-20", "destination_province": "กรุงเทพมหานคร",
        "sourcing_mode": mode, "max_suppliers": max_suppliers}), 201)


def offer(client, req, listing, qty, code=201):
    r = client.post("/api/offers", headers=BUYER_B, json={
        "listing_id": listing, "purchase_request_id": req["id"], "quantity_kg": qty, "grade_prices": {"A": 46, "B": 31}})
    assert r.status_code == code, r.text
    return r.json()


def allocate(client, farmer, listing, offer_id, qty):
    return ok(client.post(f"/api/listings/{listing}/allocation/confirm", headers=farmer,
                          json={"items": [{"offer_id": offer_id, "quantity_kg": qty}]}), 201)["contracts"][0]["id"]


def test_single_supplier_full_quantity_and_auto_close(client):
    # Buyer B's existing offer on Green Valley must go first so its new offer is allowed (one pending offer per listing)
    ok(client.post(f"/api/offers/{sid('OF-2026-001')}/withdraw", headers=BUYER_B, json={}))
    req = new_request(client, "SINGLE")
    assert req["sourcing_mode"] == "SINGLE" and req["min_quantity_kg"] == 3000
    matches = ok(client.get(f"/api/purchase-requests/{req['id']}/matches", headers=BUYER_B))
    assert {m["listing"]["code"] for m in matches["recommendations"]} == {"PL-2026-001", "PL-2026-003"}  # both can cover 3,000 kg
    offer(client, req, GREEN, 2000, code=422)  # must be the full quantity
    o1 = offer(client, req, GREEN, 3000)
    o2 = offer(client, req, SUNRISE, 3000)
    assert o1["min_quantity_kg"] == 3000
    # The farm cannot split a single-supplier offer
    r = client.post(f"/api/listings/{GREEN}/allocation/confirm", headers=FARMER, json={"items": [{"offer_id": o1["id"], "quantity_kg": 2000}]})
    assert r.status_code == 422
    c1 = allocate(client, FARMER, GREEN, o1["id"], 3000)
    c2 = allocate(client, FARMER_SUNRISE, SUNRISE, o2["id"], 3000)
    assert ok(client.get(f"/api/contracts/{c1}", headers=BUYER_B))["terms"]["sourcing_mode"] == "SINGLE"
    ok(client.post(f"/api/contracts/{c1}/accept", json=SIGN, headers=BUYER_B))
    # Signing with Green Valley releases Sunrise's reservation and closes the request
    assert ok(client.get(f"/api/contracts/{c2}", headers=FARMER_SUNRISE))["order_status"] == "CANCELLED"
    r = ok(client.get(f"/api/purchase-requests/{req['id']}", headers=BUYER_B))
    assert r["status"] == "FULFILLED" and r["fill"]["suppliers"] == 1 and r["accepting_offers"] is False
    assert ok(client.get(f"/api/listings/{SUNRISE}", headers=FARMER_SUNRISE))["inventory"]["available_kg"] == 3000
    offer(client, req, SUNRISE, 3000, code=409)


def test_multi_supplier_fills_and_respects_cap(client):
    ok(client.post(f"/api/offers/{sid('OF-2026-001')}/withdraw", headers=BUYER_B, json={}))
    req = new_request(client, "MULTI", qty=3000, max_suppliers=2)
    o1 = offer(client, req, GREEN, 2000)
    o2 = offer(client, req, SUNRISE, 1500)
    c1 = allocate(client, FARMER, GREEN, o1["id"], 1500)  # farm may allocate part of a multi-supplier offer
    ok(client.post(f"/api/contracts/{c1}/accept", json=SIGN, headers=BUYER_B))
    r = ok(client.get(f"/api/purchase-requests/{req['id']}", headers=BUYER_B))
    assert r["status"] == "PARTIALLY_FILLED" and r["fill"]["remaining_kg"] == 1500
    offer(client, req, SUNRISE, 2000, code=422)  # more than what is still missing (and Sunrise already has a pending offer)
    c2 = allocate(client, FARMER_SUNRISE, SUNRISE, o2["id"], 1500)
    ok(client.post(f"/api/contracts/{c2}/accept", json=SIGN, headers=BUYER_B))
    r = ok(client.get(f"/api/purchase-requests/{req['id']}", headers=BUYER_B))
    assert r["status"] == "FULFILLED" and r["fill"]["suppliers"] == 2 and r["fill"]["confirmed_kg"] == 3000


def test_multi_supplier_cap_closes_other_offers(client):
    ok(client.post(f"/api/offers/{sid('OF-2026-001')}/withdraw", headers=BUYER_B, json={}))
    req = ok(client.post("/api/purchase-requests", headers=BUYER_B, json={
        "product_type": "mango", "quantity_kg": 4000, "accepted_grades": ["A"], "delivery_start": "2026-12-14",
        "delivery_end": "2026-12-20", "destination_province": "กรุงเทพมหานคร", "sourcing_mode": "MULTI", "max_suppliers": 2}), 201)
    assert client.post("/api/purchase-requests", headers=BUYER_B, json={
        "product_type": "mango", "quantity_kg": 100, "accepted_grades": ["A"], "delivery_start": "2026-12-14",
        "delivery_end": "2026-12-20", "destination_province": "กรุงเทพมหานคร", "max_suppliers": 1}).status_code == 422  # cap must be >= 2
    o1 = offer(client, req, GREEN, 1000)
    o2 = offer(client, req, SUNRISE, 1000)
    for farmer, listing, o in ((FARMER, GREEN, o1), (FARMER_SUNRISE, SUNRISE, o2)):
        ok(client.post(f"/api/contracts/{allocate(client, farmer, listing, o['id'], 1000)}/accept", json=SIGN, headers=BUYER_B))
    r = ok(client.get(f"/api/purchase-requests/{req['id']}", headers=BUYER_B))
    assert r["status"] == "PARTIALLY_FILLED" and r["accepting_offers"] is False and "2 ราย" in r["closed_reason"]


def test_farmer_marketplace_shows_mode(client):
    reqs = {r["code"]: r for r in ok(client.get("/api/purchase-requests", headers=FARMER))}
    assert reqs["PR-2026-004"]["sourcing_mode"] == "SINGLE" and reqs["PR-2026-001"]["sourcing_mode"] == "MULTI"
