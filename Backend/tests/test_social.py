"""Chat between farms and buyers, the community board, and the buyer 'find a deal' feed."""

from app.seed import sid
from tests.conftest import BUYER_B, BUYER_C, FARMER, INSPECTOR, as_user

ADMIN = as_user("admin@agriguard.example")
SUNRISE = as_user("wilai@sunrise.example")


def test_chat_list_shows_seeded_threads_with_unread_and_deal(client):
    chats = client.get("/api/chats", headers=FARMER).json()
    names = [c["counterpart"]["name"] for c in chats]
    assert "FreshFruit Export Co." in names and "Eastern Wholesale Market" in names
    b = next(c for c in chats if c["counterpart"]["name"] == "FreshFruit Export Co.")
    assert b["deal"]["kind"] == "offer" and b["deal"]["status"] == "PENDING"
    assert b["counterpart_trust"] is not None
    d = next(c for c in chats if c["counterpart"]["name"] == "Eastern Wholesale Market")
    assert d["unread"] == 2  # the farmer never replied in that thread
    assert client.get("/api/chats/unread", headers=FARMER).json()["unread"] == 2


def test_send_message_and_read_tracking(client):
    chat_id = client.post("/api/chats", json={"organization_id": str(sid("buyer_c"))}, headers=FARMER).json()["id"]
    # Starting again returns the same thread.
    assert client.post("/api/chats", json={"organization_id": str(sid("buyer_c"))}, headers=FARMER).json()["id"] == chat_id
    r = client.post(f"/api/chats/{chat_id}/messages", json={"body": "  สวัสดีครับ  "}, headers=FARMER)
    assert r.status_code == 201 and r.json()["body"] == "สวัสดีครับ" and r.json()["mine"]
    assert client.get("/api/chats/unread", headers=BUYER_C).json()["unread"] == 1
    detail = client.get(f"/api/chats/{chat_id}", headers=BUYER_C).json()
    assert detail["messages"][-1]["mine"] is False
    assert detail["offers"] and detail["offers"][0]["status"] == "PENDING"
    assert client.get("/api/chats/unread", headers=BUYER_C).json()["unread"] == 0
    assert client.post(f"/api/chats/{chat_id}/messages", json={"body": "   "}, headers=FARMER).status_code == 422


def test_chat_access_rules(client):
    chat_id = client.post("/api/chats", json={"organization_id": str(sid("buyer_c"))}, headers=FARMER).json()["id"]
    assert client.get(f"/api/chats/{chat_id}", headers=BUYER_B).status_code == 403
    assert client.get(f"/api/chats/{chat_id}", headers=SUNRISE).status_code == 403
    assert client.get("/api/chats", headers=INSPECTOR).status_code == 403
    assert client.get("/api/chats/unread", headers=INSPECTOR).json()["unread"] == 0
    # Farm to farm is not a trade chat.
    assert client.post("/api/chats", json={"organization_id": str(sid("sunrise"))}, headers=FARMER).status_code == 422
    contacts = client.get("/api/chats/contacts", headers=FARMER).json()
    assert contacts and all(c["kind"] == "BUYER" for c in contacts)


def test_community_posts_comments_likes(client):
    groups = client.get("/api/community/groups", headers=FARMER).json()
    assert {g["slug"] for g in groups} >= {"chanthaburi", "durian", "contracts"}
    contracts_group = next(g for g in groups if g["slug"] == "contracts")
    post = client.post("/api/community/posts", headers=BUYER_B, json={
        "group_id": contracts_group["id"], "title": "ทดสอบกระทู้", "body": "เนื้อหา"}).json()
    assert post["likes"] == 0 and post["author"]["organization"] == "FreshFruit Export Co."
    liked = client.post(f"/api/community/posts/{post['id']}/like", headers=FARMER).json()
    assert liked["likes"] == 1 and liked["liked"]
    assert client.post(f"/api/community/posts/{post['id']}/like", headers=FARMER).json()["likes"] == 0
    full = client.post(f"/api/community/posts/{post['id']}/comments", json={"body": "ตอบครับ"}, headers=FARMER).json()
    assert full["comments"] == 1 and full["comment_list"][0]["can_delete"]
    listed = client.get("/api/community/posts?group=contracts", headers=FARMER).json()
    assert listed[0]["id"] == post["id"] and all(p["group"]["slug"] == "contracts" for p in listed)
    assert client.get("/api/community/posts?q=ทดสอบ", headers=FARMER).json()[0]["id"] == post["id"]
    # Only the author or an admin may delete.
    assert client.delete(f"/api/community/posts/{post['id']}", headers=FARMER).status_code == 403
    assert client.delete(f"/api/community/posts/{post['id']}", headers=ADMIN).status_code == 200
    assert client.get(f"/api/community/posts/{post['id']}", headers=FARMER).status_code == 404


def test_community_top_sort_and_validation(client):
    top = client.get("/api/community/posts?sort=top", headers=FARMER).json()
    scores = [p["likes"] + p["comments"] for p in top]
    assert scores == sorted(scores, reverse=True)
    gid = top[0]["group"]["id"]
    assert client.post("/api/community/posts", headers=FARMER, json={"group_id": gid, "title": "  ", "body": "x"}).status_code == 422


def test_buyer_deal_suggestions(client):
    deals = client.get("/api/deals/suggestions", headers=BUYER_B).json()
    assert deals and deals[0]["request"]["code"] == "PR-2026-001"
    assert [d["score"] for d in deals] == sorted((d["score"] for d in deals), reverse=True)
    assert any(d["already_offered"] for d in deals)
    assert client.get("/api/deals/suggestions", headers=FARMER).status_code == 403


def test_contract_brief_carries_sourcing(client):
    listing = sid("PL-2026-001")
    r = client.post(f"/api/listings/{listing}/allocation/confirm", headers=FARMER,
                    json={"items": [{"offer_id": str(sid("OF-2026-001")), "quantity_kg": 3000}]})
    assert r.status_code == 201
    briefs = client.get("/api/contracts", headers=FARMER).json()
    assert briefs[0]["sourcing"]["request_code"] == "PR-2026-001" and briefs[0]["sourcing"]["mode"] == "MULTI"
    # The chat thread with that buyer now reports the contract as its deal.
    b = next(c for c in client.get("/api/chats", headers=FARMER).json() if c["counterpart"]["name"] == "FreshFruit Export Co.")
    assert b["deal"]["kind"] == "contract" and b["deal"]["status"] == "AWAITING_CONFIRMATION"
