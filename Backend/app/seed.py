"""Demo scenario from overall_flow.md §20: Green Valley Farm, 5,000 kg Nam Dok Mai mango, buyers B/C/D.

IDs are derived from emails/names so a reset keeps the same demo logins.
"""

import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal as D

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import Base
from app.models import (
    ChatMessage,
    CommunityComment,
    CommunityGroup,
    CommunityLike,
    CommunityPost,
    Conversation,
    Farm,
    Offer,
    Organization,
    ProduceListing,
    PurchaseRequest,
    TrustEvent,
    User,
)
from app.services.orders import audit

NS = uuid.UUID("6f1c2a52-6b1d-4d55-9a57-6a2b9a5f0e10")


def sid(key: str) -> uuid.UUID:
    return uuid.uuid5(NS, key)


def ago(days: float) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=days)


ORGS = [
    # key, name, kind, business_type, province, verified
    ("platform", "AgriGuard", "PLATFORM", None, "กรุงเทพมหานคร", True),
    ("greenvalley", "สวนกรีนวัลเลย์ (Green Valley Farm)", "FARM", None, "จันทบุรี", True),
    ("sunrise", "สวนซันไรส์ (Sunrise Orchard)", "FARM", None, "ระยอง", True),
    ("goldendurian", "สวนทุเรียนทองคำ (Golden Durian Farm)", "FARM", None, "จันทบุรี", True),
    ("chumphon", "สวนมังคุดชุมพร", "FARM", None, "ชุมพร", True),
    ("buyer_b", "FreshFruit Export Co.", "BUYER", "EXPORTER", "กรุงเทพมหานคร", True),
    ("buyer_c", "Siam Fruit Processing Co., Ltd.", "BUYER", "PROCESSOR", "ฉะเชิงเทรา", True),
    ("buyer_d", "Eastern Wholesale Market", "BUYER", "WHOLESALER", "ชลบุรี", True),
    ("buyer_e", "NewLeaf Foods", "BUYER", "PROCESSOR", "กรุงเทพมหานคร", False),
]

USERS = [
    # email, name, role, title, org key
    ("somchai@greenvalley.example", "สมชาย ใจดี", "FARMER", "เจ้าของสวนกรีนวัลเลย์", "greenvalley"),
    ("wilai@sunrise.example", "วิไล ศรีสุข", "FARMER", "เจ้าของสวนซันไรส์", "sunrise"),
    ("prasert@goldendurian.example", "ประเสริฐ ทองดี", "FARMER", "เจ้าของสวนทุเรียนทองคำ", "goldendurian"),
    ("anan@freshfruit.example", "อนันต์ กิตติวงศ์", "BUYER", "ผู้จัดการฝ่ายจัดซื้อ · Buyer B", "buyer_b"),
    ("malee@siamfruit.example", "มาลี วงศ์ใหญ่", "BUYER", "ฝ่ายจัดซื้อวัตถุดิบ · Buyer C", "buyer_c"),
    ("thana@easternwholesale.example", "ธนา รุ่งเรือง", "BUYER", "ผู้ค้าส่ง · Buyer D", "buyer_d"),
    ("siriporn@newleaf.example", "ศิริพร ใหม่ใจ", "BUYER", "ผู้ซื้อรายใหม่", "buyer_e"),
    ("preecha@agriguard.example", "ปรีชา ตรวจดี", "INSPECTOR", "ผู้ตรวจคุณภาพ", "platform"),
    ("admin@agriguard.example", "ผู้ดูแลระบบ", "ADMIN", "Platform Administrator", "platform"),
]

FARMS = [
    ("greenvalley", "สวนกรีนวัลเลย์", "จันทบุรี", D(45)),
    ("sunrise", "สวนซันไรส์", "ระยอง", D(30)),
    ("goldendurian", "สวนทุเรียนทองคำ", "จันทบุรี", D(60)),
    ("chumphon", "สวนมังคุดชุมพร", "ชุมพร", D(25)),
]

LISTINGS = [
    # code, farm, product, variety, kg, start, end, grades, price range
    ("PL-2026-001", "greenvalley", "mango", "น้ำดอกไม้", 5000, date(2026, 12, 15), date(2026, 12, 18), ["A", "B"], (42, 50)),
    ("PL-2026-002", "greenvalley", "durian", "หมอนทอง", 3000, date(2027, 4, 20), date(2027, 5, 5), ["A", "B", "C"], (110, 150)),
    ("PL-2026-003", "sunrise", "mango", "น้ำดอกไม้", 3000, date(2026, 12, 10), date(2026, 12, 20), ["A", "B"], (40, 48)),
    ("PL-2026-004", "goldendurian", "durian", "หมอนทอง", 8000, date(2027, 4, 25), date(2027, 5, 15), ["A", "B"], (110, 150)),
    ("PL-2026-005", "chumphon", "mangosteen", "ผิวมัน", 4000, date(2027, 5, 1), date(2027, 5, 20), ["A", "B", "C"], (60, 85)),
]

REQUESTS = [
    # code, buyer, product, variety, kg, min, target, grades, start, end, province, terms days
    ("PR-2026-001", "buyer_b", "mango", "น้ำดอกไม้", 3000, 1000, 45, ["A"], date(2026, 12, 15), date(2026, 12, 18), "กรุงเทพมหานคร", 3),
    ("PR-2026-002", "buyer_c", "mango", "น้ำดอกไม้", 2500, 1000, 48, ["A", "B"], date(2026, 12, 14), date(2026, 12, 20), "ฉะเชิงเทรา", 7),
    ("PR-2026-003", "buyer_d", "mango", "น้ำดอกไม้", 2000, 500, 50, ["A", "B"], date(2026, 12, 15), date(2026, 12, 19), "ชลบุรี", 5),
    ("PR-2026-004", "buyer_e", "durian", "หมอนทอง", 5000, 5000, 130, ["A", "B"], date(2027, 4, 25), date(2027, 5, 10), "กรุงเทพมหานคร", 7),
]

OFFERS = [
    # code, buyer, request, kg, prices, terms days, deposit, message
    ("OF-2026-001", "buyer_b", "PR-2026-001", 3000, {"A": 45, "B": 30}, 3, 10000, "ต้องการเกรด A สำหรับส่งออก รับสินค้าที่กรุงเทพฯ"),
    ("OF-2026-002", "buyer_c", "PR-2026-002", 2500, {"A": 48, "B": 32}, 7, 8000, "ใช้เป็นวัตถุดิบแปรรูป รับเกรด A และ B"),
    ("OF-2026-003", "buyer_d", "PR-2026-003", 2000, {"A": 50, "B": 33}, 5, 0, "ราคาสูง ชำระภายใน 5 วันหลังตรวจรับ"),
]

# Verified history: transactions and failures per dimension (tuned to the spec's example scores ~92 / ~85 / ~65).
TRUST_HISTORY = {
    "buyer_b": (42, {"PAYMENT": 1, "PICKUP": 4, "CONTRACT": 2, "QC": 3, "DISPUTE": 2}),
    "buyer_c": (20, {"PAYMENT": 3, "PICKUP": 2, "CONTRACT": 2, "QC": 2, "DISPUTE": 1}),
    "buyer_d": (12, {"PAYMENT": 5, "PICKUP": 4, "CONTRACT": 4, "QC": 3, "DISPUTE": 2}),
}
# Chat threads: (farm org, buyer org, [(sender side, hours ago, text)])
CHATS = [
    ("greenvalley", "buyer_b", [
        ("buyer", 30, "สวัสดีครับคุณสมชาย สนใจมะม่วงน้ำดอกไม้เกรด A สำหรับส่งออกครับ"),
        ("farmer", 29, "สวัสดีครับ ปีนี้ผลผลิตประมาณ 5 ตัน คาดว่าเกรด A ราว 60% ครับ"),
        ("buyer", 28, "ส่งข้อเสนอ 3,000 กก. ไปแล้วนะครับ ราคาเกรด A 45 บาท รับที่กรุงเทพฯ"),
        ("farmer", 3, "ได้รับแล้วครับ ขอดูข้อเสนอของผู้ซื้อรายอื่นก่อน แล้วจะแจ้งผลภายในวันนี้ครับ"),
    ]),
    ("greenvalley", "buyer_d", [
        ("buyer", 20, "ราคาเกรด A ของเรา 50 บาทนะครับ ชำระภายใน 5 วันหลังตรวจรับ"),
        ("buyer", 2, "ถ้าสะดวกส่งเพิ่มอีก 500 กก. เราพร้อมรับครับ"),
    ]),
    ("goldendurian", "buyer_e", [
        ("buyer", 50, "สนใจทุเรียนหมอนทองทั้งล็อต 5 ตัน จากสวนเดียวค่ะ ส่งได้ครบไหมคะ"),
        ("farmer", 48, "ได้ครับ สวนเรามีประมาณ 8 ตัน ช่วงปลายเมษาครับ"),
    ]),
]

# Community: (group slug, author email, hours ago, title, body, [(commenter email, text)], likers)
POSTS = [
    ("chanthaburi", "somchai@greenvalley.example", 6, "ปีนี้ฝนมาเร็ว มะม่วงติดผลน้อยลงไหมครับ",
     "สวนผมที่ท่าใหม่ติดผลน้อยกว่าปีก่อนราว 10% มีใครเจอเหมือนกันบ้างครับ แล้วแก้ยังไง",
     [("wilai@sunrise.example", "ที่ระยองก็เป็นค่ะ ลองพ่นแคลเซียมโบรอนช่วงดอกบานดู ช่วยได้เยอะ"),
      ("prasert@goldendurian.example", "ทุเรียนก็โดนครับ ปีนี้ต้องระวังเรื่องโรคด้วย")],
     ["wilai@sunrise.example", "prasert@goldendurian.example", "anan@freshfruit.example"]),
    ("contracts", "wilai@sunrise.example", 20, "ผู้ซื้อขอลดราคาหลังเซ็น HarvestLock ทำได้ไหม",
     "เคยเจอผู้ซื้อโทรมาขอลดราคาตอนรถมารับของ ในแอปมีวิธีป้องกันไหมคะ",
     [("somchai@greenvalley.example", "ใน HarvestLock ราคาถูกล็อกไว้ ถ้าจะเปลี่ยนต้องยื่นแก้ไขสัญญาและเราต้องยอมรับก่อนครับ"),
      ("admin@agriguard.example", "ถูกต้องครับ การแก้ไขต้องได้รับความยินยอมทั้งสองฝ่าย และถ้าผู้ซื้อผิดสัญญาสามารถเปิดข้อพิพาทได้ คะแนน AgriTrust จะสะท้อนพฤติกรรมนี้")],
     ["somchai@greenvalley.example", "prasert@goldendurian.example"]),
    ("durian", "prasert@goldendurian.example", 40, "แชร์วิธีดูทุเรียนแก่ก่อนตัด",
     "เคาะฟังเสียง ดูหนามปลายแห้ง และนับวันหลังดอกบาน 110-120 วันสำหรับหมอนทอง ใครมีเทคนิคเพิ่มแชร์กันครับ",
     [("siriporn@newleaf.example", "ขอบคุณค่ะ เป็นประโยชน์กับฝั่งผู้ซื้อด้วย")],
     ["somchai@greenvalley.example", "siriporn@newleaf.example"]),
    ("buyers", "malee@siamfruit.example", 30, "โรงงานแปรรูปรับเกรด B ราคาเท่าไหร่กันบ้างคะ",
     "อยากทราบราคากลางมะม่วงเกรด B สำหรับแปรรูปช่วงธันวาคม เพื่อตั้งราคาเป้าหมายให้เหมาะสมค่ะ",
     [("thana@easternwholesale.example", "แถวชลบุรีอยู่ราว 30-33 บาทครับ")], []),
    ("mango", "anan@freshfruit.example", 70, "มาตรฐานมะม่วงส่งออกญี่ปุ่นที่ต้องรู้",
     "ต้องผ่านการอบไอน้ำ (VHT) น้ำหนักผล 300-450 กรัม ผิวสวยไม่มีตำหนิเกิน 5% ฝากเกษตรกรที่สนใจครับ",
     [("somchai@greenvalley.example", "ขอบคุณครับ ปีนี้จะลองคัดเกรดตามนี้")], ["somchai@greenvalley.example", "wilai@sunrise.example"]),
]

FAIL_NOTES = {
    "PAYMENT": "ชำระเงินล่าช้ากว่ากำหนด",
    "PICKUP": "มารับสินค้าช้ากว่านัด",
    "CONTRACT": "ขอแก้ไขเงื่อนไขหลังยืนยันสัญญา",
    "QC": "ผลตรวจคุณภาพไม่มีหลักฐานประกอบ",
    "DISPUTE": "ข้อพิพาทที่ตรวจสอบแล้วว่าผู้ซื้อเป็นฝ่ายรับผิดชอบ",
}


def seed(db: Session) -> None:
    orgs = {}
    for key, name, kind, btype, province, verified in ORGS:
        o = Organization(id=sid(key), name=name, kind=kind, business_type=btype, province=province, verified=verified)
        orgs[key] = o
        db.add(o)
    users = {}
    for email, name, role, title, org in USERS:
        u = User(id=sid(email), email=email, name=name, role=role, title=title, organization_id=orgs[org].id)
        users[org] = users.get(org, u)
        db.add(u)
    farms = {}
    for org, name, province, rai in FARMS:
        f = Farm(id=sid("farm:" + org), organization_id=orgs[org].id, name=name, province=province, area_rai=rai)
        farms[org] = f
        db.add(f)
    db.flush()

    listings = {}
    for i, (code, farm, product, variety, kg, start, end, grades, (pmin, pmax)) in enumerate(LISTINGS):
        listing = ProduceListing(
            id=sid(code), code=code, farm_id=farms[farm].id, product_type=product, variety=variety,
            estimated_qty_kg=D(kg), harvest_start=start, harvest_end=end, expected_grades=grades,
            price_min=D(pmin), price_max=D(pmax), created_at=ago(20 - i),
        )
        listings[code] = listing
        db.add(listing)
        audit(db, entity_type="listing", entity_id=listing.id, entity_code=code, action="LISTING_CREATED",
              actor=users[farm] if farm in users else None, farmer_org_id=orgs[farm].id,
              message=f"ลงประกาศผลผลิต {kg:,} กก. (ประมาณการ)")
    requests = {}
    for i, (code, buyer, product, variety, kg, mn, target, grades, start, end, province, days) in enumerate(REQUESTS):
        r = PurchaseRequest(
            id=sid(code), code=code, buyer_org_id=orgs[buyer].id, product_type=product, variety=variety,
            quantity_kg=D(kg), min_quantity_kg=D(mn), target_price=D(target), accepted_grades=grades,
            delivery_start=start, delivery_end=end, destination_province=province, payment_terms_days=days,
            expires_on=start - timedelta(days=5), status="OPEN", created_at=ago(12 - i),
            sourcing_mode="SINGLE" if code == "PR-2026-004" else "MULTI",
        )
        requests[code] = r
        db.add(r)
        audit(db, entity_type="purchase_request", entity_id=r.id, entity_code=code, action="REQUEST_CREATED",
              actor=users[buyer], buyer_org_id=orgs[buyer].id, message=f"สร้างคำขอซื้อ {kg:,} กก.")
    for i, (code, buyer, req, kg, prices, days, deposit, msg) in enumerate(OFFERS):
        listing = listings["PL-2026-001"]
        o = Offer(
            id=sid(code), code=code, listing_id=listing.id, purchase_request_id=requests[req].id,
            buyer_org_id=orgs[buyer].id, quantity_kg=D(kg), grade_prices=prices, payment_terms_days=days,
            deposit_thb=D(deposit), message=msg, status="PENDING", created_at=ago(5 - i),
        )
        db.add(o)
        audit(db, entity_type="offer", entity_id=o.id, entity_code=code, action="OFFER_SUBMITTED",
              actor=users[buyer], farmer_org_id=orgs["greenvalley"].id, buyer_org_id=orgs[buyer].id,
              message=f"เสนอซื้อ {kg:,} กก. ราคาเกรด A {prices['A']} บาท/กก.")

    for buyer, (n, fails) in TRUST_HISTORY.items():
        for t in range(n):
            when = ago(365 - (t + 1) * 360 / n)
            for dim, fail_count in fails.items():
                failed_idx = {round(k * n / fail_count) for k in range(fail_count)} if fail_count else set()
                ok = t not in failed_idx
                db.add(TrustEvent(
                    buyer_org_id=orgs[buyer].id, dimension=dim, success=ok, verified=True,
                    transaction_ref=f"HIST-{buyer[-1].upper()}-{t + 1:03d}", note=None if ok else FAIL_NOTES[dim],
                    occurred_at=when,
                ))
    db.commit()
    from app.services.community import ensure_community  # local imports avoid a cycle
    from app.services.standards import ensure_standards

    ensure_standards(db)
    ensure_community(db)
    _seed_social(db, orgs)


def _hours(h: float) -> datetime:
    return datetime.now(timezone.utc) - timedelta(hours=h)


def _seed_social(db: Session, orgs: dict) -> None:
    people = {u.email: u for u in db.scalars(select(User))}
    first_user = {u.organization_id: u for u in reversed(list(people.values()))}
    for farm, buyer, msgs in CHATS:
        c = Conversation(farmer_org_id=orgs[farm].id, buyer_org_id=orgs[buyer].id, created_at=_hours(msgs[0][1] + 1))
        db.add(c)
        db.flush()
        for side, h, text in msgs:
            org = orgs[farm if side == "farmer" else buyer]
            db.add(ChatMessage(conversation_id=c.id, sender_user_id=first_user[org.id].id, sender_org_id=org.id,
                               body=text, created_at=_hours(h)))
        c.last_message_at = _hours(msgs[-1][1])
        # Each side has read up to its own last message.
        c.farmer_read_at = max((_hours(h) for side, h, _ in msgs if side == "farmer"), default=None)
        c.buyer_read_at = max((_hours(h) for side, h, _ in msgs if side == "buyer"), default=None)
    groups = {g.slug: g for g in db.scalars(select(CommunityGroup))}
    for slug, email, h, title, body, comments, likers in POSTS:
        p = CommunityPost(group_id=groups[slug].id, author_user_id=people[email].id, title=title, body=body, created_at=_hours(h))
        db.add(p)
        db.flush()
        for i, (who, text) in enumerate(comments):
            db.add(CommunityComment(post_id=p.id, author_user_id=people[who].id, body=text, created_at=_hours(h - 1 - i)))
        for who in likers:
            db.add(CommunityLike(post_id=p.id, user_id=people[who].id))
    db.commit()


def seed_if_empty(db: Session) -> None:
    if db.scalar(select(Organization.id).limit(1)) is None:
        seed(db)


def reset(db: Session) -> None:
    """Delete all rows (no DDL, so no table locks against other sessions) and re-seed."""
    for table in reversed(Base.metadata.sorted_tables):
        db.execute(table.delete())
    db.flush()
    seed(db)
