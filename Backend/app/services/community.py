"""Community board groups. The defaults are ensured at startup (like quality standards), so production gets them too."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import CommunityGroup

GROUPS = [
    # slug, name, description, province, product
    ("chanthaburi", "ชาวสวนจันทบุรี", "แลกเปลี่ยนเรื่องสวน ราคา และการขนส่งในจันทบุรีและภาคตะวันออก", "จันทบุรี", None),
    ("durian", "คนปลูกทุเรียน", "เทคนิคดูแลสวน การตัดทุเรียนให้ได้เกรด และราคาหน้าสวน", None, "durian"),
    ("mango", "มะม่วงส่งออก", "มาตรฐานส่งออก การคัดเกรด และผู้ซื้อที่น่าเชื่อถือ", None, "mango"),
    ("contracts", "ถามตอบสัญญา & กฎหมาย", "ถามเรื่อง HarvestLock เงื่อนไขสัญญา และการระงับข้อพิพาท", None, None),
    ("buyers", "ห้องผู้ซื้อ & โรงงาน", "ผู้ซื้อ โรงงานแปรรูป และผู้ส่งออกคุยเรื่องการจัดหาผลผลิต", None, None),
]


def ensure_community(db: Session) -> None:
    have = set(db.scalars(select(CommunityGroup.slug)))
    for slug, name, desc, province, product in GROUPS:
        if slug not in have:
            db.add(CommunityGroup(slug=slug, name=name, description=desc, province=province, product_type=product))
    db.commit()
