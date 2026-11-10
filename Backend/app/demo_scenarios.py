"""Richer demo: deals at every stage of the purchase flow, built through the real API so contracts, lots, GradeProof,
settlements, AgriTrust events, notifications and the audit trail are all consistent.

Runs after the base seed on a demo reset (and on first start), never in the test suite. Each deal is played "now" and
its timestamps are then moved back into the past (days or weeks) so the flow and chats read like a real season.
The main walkthrough (PL-2026-001 with buyers B/C/D) is left untouched.
"""

import secrets
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Annotated

from fastapi import Header
from sqlalchemy import DateTime, select

from app.db import Base, SessionLocal
from app.deps import DB, Claims, current_user
from app.models import ChatMessage, Contract, Conversation, Settlement, User
from app.seed import sid

NOW = lambda: datetime.now(timezone.utc)  # noqa: E731


def _aware(v: datetime | None) -> datetime | None:
    """SQLite hands back naive datetimes (stored as UTC); Postgres returns aware ones."""
    return v if v is None or v.tzinfo else v.replace(tzinfo=timezone.utc)

# key, listing, buyer email, farmer email, kg, grade prices, final stage, started days ago, last event hours ago
DEALS = [
    ("gv-longan-b", "PL-2026-006", "anan@freshfruit.example", "somchai@greenvalley.example", 1500, {"AA": 44, "A": 38, "B": 26}, "COMPLETED", 38, 200),
    ("gv-longan-f", "PL-2026-006", "worawut@tfeh.example", "somchai@greenvalley.example", 1200, {"AA": 45, "A": 39}, "IN_TRANSIT", 12, 5),
    ("gv-longan-c", "PL-2026-006", "malee@siamfruit.example", "somchai@greenvalley.example", 800, {"A": 36, "B": 25}, "CONFIRMED", 4, 20),
    ("gv-ramb-g", "PL-2026-007", "napa@bkkfresh.example", "somchai@greenvalley.example", 1000, {"A": 34, "B": 24}, "PAYMENT_PENDING", 15, 30),
    ("gv-ramb-d", "PL-2026-007", "thana@easternwholesale.example", "somchai@greenvalley.example", 800, {"A": 33, "B": 22}, "OVERDUE", 24, 60),
    ("cp-mangos-b", "PL-2026-010", "anan@freshfruit.example", "suda@chumphon.example", 1500, {"A": 78, "B": 55, "C": 35}, "COMPLETED", 45, 400),
    ("cp-mangos-d", "PL-2026-010", "thana@easternwholesale.example", "suda@chumphon.example", 1000, {"A": 72, "B": 50}, "COMPLETED", 40, 300),
    ("sr-orange-b", "PL-2026-008", "anan@freshfruit.example", "wilai@sunrise.example", 1500, {"A": 52, "B": 40}, "QC_PENDING", 9, 3),
    ("sr-orange-e", "PL-2026-008", "siriporn@newleaf.example", "wilai@sunrise.example", 1000, {"A": 50, "B": 38, "C": 25}, "CONFIRMED", 6, 30),
    ("gd-durian-b", "PL-2026-009", "anan@freshfruit.example", "prasert@goldendurian.example", 2000, {"A": 125, "B": 95}, "HARVESTED", 10, 8),
    ("gd-durian-c", "PL-2026-009", "malee@siamfruit.example", "prasert@goldendurian.example", 1500, {"A": 118, "B": 90}, "DISPUTED", 20, 26),
    ("mp-longan-b", "PL-2026-011", "anan@freshfruit.example", "boonmee@maeping.example", 2000, {"AA": 54, "A": 46, "B": 32}, "AWAITING", 2, 10),
    ("mp-longan-c", "PL-2026-011", "malee@siamfruit.example", "boonmee@maeping.example", 2000, {"AA": 50, "A": 44}, "PAID", 18, 14),
    ("mp-longan-f", "PL-2026-011", "worawut@tfeh.example", "boonmee@maeping.example", 1500, {"AA": 53, "A": 45, "B": 30}, "COMPLETED", 34, 150),
]
# Offers left for the farmer to decide (listing, buyer, kg, prices, days ago); one is rejected.
OPEN_OFFERS = [
    ("PL-2026-012", "napa@bkkfresh.example", 1500, {"A": 33, "B": 24}, 1),
    ("PL-2026-012", "worawut@tfeh.example", 1000, {"A": 36}, 2),
    ("PL-2026-006", "napa@bkkfresh.example", 400, {"A": 37, "B": 26}, 1),
    ("PL-2026-013", "worawut@tfeh.example", 3000, {"AA": 48, "A": 41}, 3),
]
REJECTED_OFFERS = [("PL-2026-008", "thana@easternwholesale.example", 500, {"A": 38}, 5, "ราคาต่ำกว่าตลาดมาก")]

ORDER = {s: i for i, s in enumerate(["AWAITING", "CONFIRMED", "HARVESTED", "IN_TRANSIT", "QC_PENDING", "PAYMENT_PENDING", "PAID", "COMPLETED"])}

# Chat lines per stage: (side, text). Kept short and generic so they fit any product.
CHAT = {
    "AWAITING": [("buyer", "สวัสดีครับ สนใจ{p}ล็อตนี้ครับ"), ("farmer", "ได้ครับ จัดสรรให้ {kg} แล้ว รบกวนยืนยันสัญญาภายใน 72 ชม.นะครับ")],
    "CONFIRMED": [("farmer", "ขอบคุณที่ยืนยันสัญญาครับ จะเริ่มเก็บ{p}ตามกำหนด"), ("buyer", "รบกวนแจ้งก่อนส่งของ 1 วันนะครับ")],
    "HARVESTED": [("farmer", "เก็บ{p}เสร็จแล้วครับ กำลังคัดและบรรจุ"), ("buyer", "ดีเลยครับ รถจะเข้าไปรับวันไหนดี")],
    "IN_TRANSIT": [("farmer", "รถออกจากสวนแล้วครับ ทะเบียนตามที่บันทึกในระบบ"), ("buyer", "รับทราบครับ ถึงแล้วจะชั่งและยืนยันในระบบ")],
    "QC_PENDING": [("buyer", "ของถึงแล้วครับ รอผู้ตรวจคุณภาพเข้ามาตรวจ"), ("farmer", "ขอบคุณครับ ถ้ามีประเด็นอะไรแจ้งได้เลย")],
    "PAYMENT_PENDING": [("farmer", "เห็นผลตรวจแล้วครับ รบกวนชำระตามยอดในระบบนะครับ"), ("buyer", "รับทราบค่ะ จะโอนภายในกำหนด")],
    "OVERDUE": [("farmer", "เลยกำหนดชำระมาหลายวันแล้วครับ รบกวนตรวจสอบด้วย"), ("farmer", "ถ้ายังไม่ได้ภายในสัปดาห์นี้ ผมคงต้องเปิดข้อพิพาทนะครับ")],
    "DISPUTED": [("buyer", "ผลตรวจเกรด A ต่ำกว่าที่คุยกันไว้มากเลยค่ะ"), ("farmer", "ผมเปิดข้อพิพาทขอตรวจซ้ำแล้วนะครับ ภาพก่อนส่งของยังอยู่ครบ")],
    "PAID": [("buyer", "โอนเงินเรียบร้อยแล้วครับ เลขอ้างอิงอยู่ในระบบ"), ("farmer", "ได้รับแจ้งแล้วครับ ขอเช็กบัญชีก่อนแล้วจะยืนยัน")],
    "COMPLETED": [("buyer", "ขอบคุณครับ{p}คุณภาพดีมาก ฤดูหน้าดีลกันอีกนะครับ"), ("farmer", "ยินดีครับ ขอบคุณที่จ่ายตรงเวลาครับ")],
}


class _Api:
    """In-process API calls as any demo user (a one-off token, so the override cannot be used from outside)."""

    def __init__(self):
        from fastapi.testclient import TestClient

        from app.main import (
            app,  # local import: main imports seed, which imports this module lazily
        )

        self.token = secrets.token_hex(16)
        token = self.token

        def as_user(db: DB, claims: Claims, x_demo_user: Annotated[str | None, Header()] = None,
                    x_scenario_user: Annotated[str | None, Header()] = None,
                    x_scenario_token: Annotated[str | None, Header()] = None) -> User:
            if x_scenario_user and x_scenario_token and secrets.compare_digest(x_scenario_token, token):
                return db.get(User, uuid.UUID(x_scenario_user))
            return current_user(db, claims, x_demo_user)

        self.app = app
        self.app.dependency_overrides[current_user] = as_user
        self.client = TestClient(app)

    def close(self):
        self.app.dependency_overrides.pop(current_user, None)

    def __call__(self, email: str, method: str, path: str, body=None, headers=None):
        h = {"X-Scenario-User": str(sid(email)), "X-Scenario-Token": self.token, **(headers or {})}
        r = self.client.request(method, f"/api{path}", json=body, headers=h)
        if r.status_code >= 400:
            raise RuntimeError(f"demo scenario {method} {path} failed: {r.status_code} {r.text[:300]}")
        return r.json()


def _shift(start: datetime, end: datetime, t0: datetime, t1: datetime) -> None:
    """Move every timestamp written during [t0, t1] onto [start, end], keeping order (all tables, all DateTime columns)."""
    span = (t1 - t0).total_seconds() or 1
    with SessionLocal() as db:
        for mapper in Base.registry.mappers:
            table = mapper.local_table
            pk = list(table.primary_key.columns)[0]
            for col in table.columns:
                if not isinstance(col.type, DateTime):
                    continue
                for row_id, value in db.execute(select(pk, col).where(col.between(t0, t1))).all():
                    v = _aware(value)
                    frac = (v - t0).total_seconds() / span
                    db.execute(table.update().where(pk == row_id).values({col.name: start + (end - start) * frac}))
        db.commit()


def _deal(api: _Api, key, listing_code, buyer, farmer, kg, prices, stage, days, last_h) -> uuid.UUID:
    listing_id = str(sid(listing_code))
    offer = api(buyer, "POST", "/offers", {"listing_id": listing_id, "quantity_kg": kg, "grade_prices": prices,
                                           "payment_terms_days": 5, "deposit_thb": 5000 if kg >= 1500 else 0,
                                           "message": "สนใจทั้งล็อต รับเองที่สวนได้"})
    out = api(farmer, "POST", f"/listings/{listing_id}/allocation/confirm", {"items": [{"offer_id": offer["id"], "quantity_kg": kg}]})
    cid = out["contracts"][0]["id"]
    reached = ORDER.get(stage, ORDER["PAYMENT_PENDING"])
    if stage == "AWAITING":
        return uuid.UUID(cid)
    buyer_name = api(buyer, "GET", "/me")["name"]
    api(buyer, "POST", f"/contracts/{cid}/accept", {"signature_name": buyer_name, "consent": True})
    if reached < ORDER["HARVESTED"]:
        return uuid.UUID(cid)
    harvest_day = (NOW() - timedelta(hours=last_h + 30)).date()
    lot = api(farmer, "POST", f"/contracts/{cid}/lots", {"harvest_date": harvest_day.isoformat(), "harvested_kg": kg})["lots"][0]
    if reached < ORDER["IN_TRANSIT"]:
        return uuid.UUID(cid)
    api(farmer, "POST", f"/lots/{lot['id']}/dispatch", {"vehicle": f"{70 + len(key)}-{1000 + kg // 10}", "transport_operator": "ขนส่งผลไม้ตะวันออก",
                                                       "gross_kg": kg + 120, "tare_kg": 120})
    if reached < ORDER["QC_PENDING"]:
        return uuid.UUID(cid)
    api(buyer, "POST", f"/lots/{lot['id']}/receive", {"received_kg": kg - 10})
    if reached < ORDER["PAYMENT_PENDING"]:
        return uuid.UUID(cid)
    grades = sorted(prices)
    rejected = 20 if stage != "DISPUTED" else 120
    usable = kg - 10 - rejected
    split = [round(usable * 0.7)] + ([usable - round(usable * 0.7)] if len(grades) > 1 else [])
    if len(split) == 1:
        split[0] = usable
    detail = api("preecha@agriguard.example", "POST", f"/lots/{lot['id']}/inspections", {
        "grades": [{"grade": g, "quantity_kg": q} for g, q in zip(grades, split)], "rejected_kg": rejected,
        "rejection_reason": "BRUISING", "sampling_method": "สุ่ม 10% ต่อพาเลท", "evidence_note": "ภาพถ่าย 8 ภาพ"})
    if stage == "DISPUTED":
        api(farmer, "POST", f"/contracts/{cid}/disputes", {"category": "GRADE_DISPUTE",
            "description": "สัดส่วนเกรด A ต่ำกว่าผลคัดที่สวนมาก ขอตรวจซ้ำ", "disputed_amount": 15000, "evidence_note": "ภาพก่อนขนส่ง 12 ภาพ"})
        return uuid.UUID(cid)
    if reached < ORDER["PAID"]:
        return uuid.UUID(cid)
    s = detail["settlement"]
    api(buyer, "POST", f"/settlements/{s['id']}/payments", {"amount": float(s["net_amount"]), "reference": f"TRX-{key.upper()}"},
        headers={"Idempotency-Key": f"demo-{key}"})
    if stage == "COMPLETED":
        api(farmer, "POST", f"/contracts/{cid}/complete")
    return uuid.UUID(cid)


def _overdue(cid: uuid.UUID) -> None:
    from app.services.orders import transition

    with SessionLocal() as db:
        c = db.get(Contract, cid)
        s = db.scalar(select(Settlement).where(Settlement.contract_id == cid))
        s.due_date = date.today() - timedelta(days=4)
        transition(db, c, "PAYMENT_OVERDUE", None, f"เลยกำหนดชำระ {s.due_date.isoformat()} แล้ว ยังไม่ได้รับเงิน")
        db.commit()


def _chat(farmer_email: str, buyer_email: str, stage: str, product: str, kg: int, end: datetime) -> None:
    with SessionLocal() as db:
        f, b = db.get(User, sid(farmer_email)), db.get(User, sid(buyer_email))
        c = db.scalar(select(Conversation).where(Conversation.farmer_org_id == f.organization_id,
                                                 Conversation.buyer_org_id == b.organization_id))
        if c is None:
            c = Conversation(id=sid(f"chat:{farmer_email}:{buyer_email}"), farmer_org_id=f.organization_id,
                             buyer_org_id=b.organization_id, created_at=end - timedelta(days=3))
            db.add(c)
            db.flush()
        lines = CHAT.get(stage, [])
        for i, (side, text) in enumerate(lines):
            u = f if side == "farmer" else b
            at = end - timedelta(hours=(len(lines) - i) * 2)
            db.add(ChatMessage(conversation_id=c.id, sender_user_id=u.id, sender_org_id=u.organization_id,
                               body=text.format(p=product, kg=f"{kg:,} กก."), created_at=at))
        last = end - timedelta(hours=2)
        c.last_message_at = max(filter(None, [_aware(c.last_message_at), last]))
        # The side that wrote last has read the thread; the other side has the new lines unread.
        last_side = lines[-1][0] if lines else "farmer"
        if last_side == "farmer":
            c.farmer_read_at = last
        else:
            c.buyer_read_at = last
        db.commit()


PRODUCT_TH = {"PL-2026-006": "ลำไย", "PL-2026-007": "เงาะ", "PL-2026-008": "ส้ม", "PL-2026-009": "ทุเรียน",
              "PL-2026-010": "มังคุด", "PL-2026-011": "ลำไย", "PL-2026-012": "เงาะ", "PL-2026-013": "ลำไย"}


def build() -> None:
    api = _Api()
    try:
        for key, listing, buyer, farmer, kg, prices, stage, days, last_h in DEALS:
            t0 = NOW()
            cid = _deal(api, key, listing, buyer, farmer, kg, prices, stage, days, last_h)
            if stage == "OVERDUE":
                _overdue(cid)
            t1 = NOW()
            start, end = NOW() - timedelta(days=days), NOW() - timedelta(hours=last_h)
            _shift(start, end, t0, t1)
            _chat(farmer, buyer, stage, PRODUCT_TH.get(listing, "ผลผลิต"), kg, end)
        for listing, buyer, kg, prices, days in OPEN_OFFERS:
            t0 = NOW()
            api(buyer, "POST", "/offers", {"listing_id": str(sid(listing)), "quantity_kg": kg, "grade_prices": prices,
                                           "payment_terms_days": 3, "message": "เสนอราคานี้ รับได้ทั้งล็อต"})
            _shift(NOW() - timedelta(days=days), NOW() - timedelta(days=days) + timedelta(minutes=1), t0, NOW())
        for listing, buyer, kg, prices, days, reason in REJECTED_OFFERS:
            t0 = NOW()
            o = api(buyer, "POST", "/offers", {"listing_id": str(sid(listing)), "quantity_kg": kg, "grade_prices": prices})
            api("wilai@sunrise.example", "POST", f"/offers/{o['id']}/reject", {"reason": reason})
            _shift(NOW() - timedelta(days=days), NOW() - timedelta(days=days - 1), t0, NOW())
    finally:
        api.close()

