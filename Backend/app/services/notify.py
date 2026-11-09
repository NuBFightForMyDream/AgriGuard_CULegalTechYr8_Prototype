"""In-app notifications derived from audit events: every party other than the actor hears about it."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AuditLog, Notification, Organization

TITLES = {
    "OFFER_SUBMITTED": "มีข้อเสนอซื้อใหม่",
    "OFFER_REJECTED": "ข้อเสนอถูกปฏิเสธ",
    "OFFER_WITHDRAWN": "ผู้ซื้อถอนข้อเสนอ",
    "CONTRACT_CREATED": "มี HarvestLock รอคุณยืนยัน",
    "STATUS_CHANGED": "สถานะคำสั่งซื้อเปลี่ยน",
    "AMENDMENT_PROPOSED": "มีข้อเสนอแก้ไขสัญญา",
    "AMENDMENT_ACCEPTED": "การแก้ไขสัญญามีผลแล้ว",
    "AMENDMENT_REJECTED": "การแก้ไขสัญญาถูกปฏิเสธ",
    "PAYMENT_RECORDED": "มีการบันทึกการชำระเงิน",
    "DISPUTE_OPENED": "มีข้อพิพาทใหม่",
    "STATEMENT_ADDED": "มีคำชี้แจงข้อพิพาทใหม่",
    "REINSPECTION_REQUESTED": "มีคำขอตรวจคุณภาพซ้ำ",
    "DISPUTE_RESOLVED": "ข้อพิพาทมีผลพิจารณาแล้ว",
    "TRUST_UPDATED": "AgriTrust ได้รับการอัปเดต",
    "LOT_DISPATCHED": "มีล็อตกำลังเดินทาง",
    "EVIDENCE_UPLOADED": "มีการแนบหลักฐานใหม่",
    "APPEAL_SUBMITTED": "มีคำอุทธรณ์ AgriTrust",
    "APPEAL_DECIDED": "คำอุทธรณ์ AgriTrust มีผลแล้ว",
    "ORG_VERIFIED": "สถานะการยืนยันธุรกิจเปลี่ยน",
    "ROLE_CHANGED": "สิทธิ์ผู้ใช้เปลี่ยน",
}


def _platform_ids(db: Session) -> list:
    return list(db.scalars(select(Organization.id).where(Organization.kind == "PLATFORM")))


def notify_from_audit(db: Session, log: AuditLog, actor_org_id) -> None:
    title = TITLES.get(log.action)
    if title is None:
        return
    targets = {o for o in (log.farmer_org_id, log.buyer_org_id) if o and o != actor_org_id}
    # Platform staff hear about QC work and disputes.
    if log.to_status in ("QC_PENDING", "REINSPECTION_REQUESTED") or log.action in ("DISPUTE_OPENED", "APPEAL_SUBMITTED"):
        targets.update(o for o in _platform_ids(db) if o != actor_org_id)
    if log.entity_type == "dispute":
        link = f"/disputes/{log.entity_id}"
    elif log.contract_id:
        link = f"/contracts/{log.contract_id}"
    elif log.entity_type == "trust_appeal":
        link = "/admin/appeals"
    else:
        link = None
    code = f"{log.entity_code} · " if log.entity_code else ""
    for org in targets:
        db.add(Notification(organization_id=org, title=title, body=f"{code}{log.message}", link=link))
