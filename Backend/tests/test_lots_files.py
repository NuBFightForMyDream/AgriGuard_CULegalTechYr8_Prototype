from app.seed import sid
from tests.conftest import BUYER_B, BUYER_C, FARMER, INSPECTOR

LISTING = str(sid("PL-2026-001"))
SIGN = {"signature_name": "ผู้ลงนาม", "consent": True}
PNG = b"\\x89PNG\\r\\n\\x1a\\n" + b"0" * 64


def ok(resp, code=200):
    assert resp.status_code == code, resp.text
    return resp.json()


def confirmed(client, qty=2000):
    offer = next(o for o in ok(client.get(f"/api/listings/{LISTING}", headers=FARMER))["offers"] if o["buyer"]["name"] == "FreshFruit Export Co.")
    cid = ok(client.post(f"/api/listings/{LISTING}/allocation/confirm", headers=FARMER,
                         json={"items": [{"offer_id": offer["id"], "quantity_kg": qty}]}), 201)["contracts"][0]["id"]
    ok(client.post(f"/api/contracts/{cid}/accept", json=SIGN, headers=BUYER_B))
    return cid


def qc(client, lot_id, a, b, evidence=None):
    return ok(client.post(f"/api/lots/{lot_id}/inspections", headers=INSPECTOR, json={
        "grades": [{"grade": "A", "quantity_kg": a}, {"grade": "B", "quantity_kg": b}], "rejected_kg": 0,
        "sampling_method": "สุ่ม 10%", "evidence_note": evidence}), 201)


def test_two_lots_settle_together(client):
    cid = confirmed(client)
    c = ok(client.post(f"/api/contracts/{cid}/lots", json={"harvest_date": "2026-12-15", "harvested_kg": 1200}, headers=FARMER), 201)
    c = ok(client.post(f"/api/contracts/{cid}/lots", json={"harvest_date": "2026-12-17", "harvested_kg": 800}, headers=FARMER), 201)
    l1, l2 = c["lots"]
    assert c["order_status"] == "HARVESTED" and "RECORD_HARVEST" not in c["actions"]  # 2,000 kg reached
    ok(client.post(f"/api/lots/{l1['id']}/dispatch", json={"vehicle": "A", "gross_kg": 1300, "tare_kg": 100}, headers=FARMER))
    c = ok(client.post(f"/api/lots/{l1['id']}/receive", json={"received_kg": 1200}, headers=BUYER_B))
    assert c["order_status"] == "IN_TRANSIT"  # lot 2 not shipped yet
    ok(client.post(f"/api/lots/{l2['id']}/dispatch", json={"vehicle": "B", "gross_kg": 850, "tare_kg": 50}, headers=FARMER))
    c = ok(client.post(f"/api/lots/{l2['id']}/receive", json={"received_kg": 800}, headers=BUYER_B))
    assert c["order_status"] == "QC_PENDING"
    c = qc(client, l1["id"], 1000, 200, "ภาพ 6 ภาพ")
    assert c["order_status"] == "QC_PENDING" and c["settlement"] is None
    c = qc(client, l2["id"], 700, 100, "ภาพ 4 ภาพ")
    assert c["order_status"] == "PAYMENT_PENDING"
    assert c["settlement"]["gross_amount"] == 1700 * 45 + 300 * 30 and c["settlement"]["net_amount"] == 75500


def test_evidence_upload_signed_link_and_access_control(client):
    cid = confirmed(client)
    lot = ok(client.post(f"/api/contracts/{cid}/lots", json={"harvest_date": "2026-12-15", "harvested_kg": 2000}, headers=FARMER), 201)["lots"][0]
    up = client.post("/api/files", headers=FARMER, data={"entity_type": "lot", "entity_id": lot["id"], "note": "ก่อนขนส่ง"},
                     files={"file": ("pickup.png", PNG, "image/png")})
    f = ok(up, 201)
    assert len(f["sha256"]) == 64
    bad = client.post("/api/files", headers=FARMER, data={"entity_type": "lot", "entity_id": lot["id"]},
                      files={"file": ("x.exe", b"MZ", "application/octet-stream")})
    assert bad.status_code == 422
    assert client.get(f"/api/files/{f['id']}/link", headers=BUYER_C).status_code == 403  # not a party
    url = ok(client.get(f"/api/files/{f['id']}/link", headers=BUYER_B))["url"]
    assert client.get(url).content == PNG
    assert client.get(url.replace("sig=", "sig=0")).status_code == 403  # tampered signature
    c = ok(client.get(f"/api/contracts/{cid}", headers=BUYER_B))
    assert [x["filename"] for x in c["files"]] == ["pickup.png"]


def test_lot_photo_counts_as_qc_evidence_and_trace_is_public(client):
    cid = confirmed(client)
    lot = ok(client.post(f"/api/contracts/{cid}/lots", json={"harvest_date": "2026-12-15", "harvested_kg": 2000}, headers=FARMER), 201)["lots"][0]
    ok(client.post(f"/api/lots/{lot['id']}/dispatch", json={"vehicle": "A", "gross_kg": 2100, "tare_kg": 100}, headers=FARMER))
    ok(client.post(f"/api/lots/{lot['id']}/receive", json={"received_kg": 2000}, headers=BUYER_B))
    ok(client.post("/api/files", headers=INSPECTOR, data={"entity_type": "lot", "entity_id": lot["id"]}, files={"file": ("qc.png", PNG, "image/png")}), 201)
    c = qc(client, lot["id"], 1800, 200)
    assert all(f["code"] != "QC_EVIDENCE_MISSING" for f in c["inspection"]["flags"])
    t = ok(client.get(f"/api/trace/{lot['trace_token']}"))  # no auth header
    assert t["lot_code"] == lot["code"] and "buyer" not in str(t).lower() and "price" not in str(t)
    assert client.get("/api/trace/not-a-token").status_code == 404
