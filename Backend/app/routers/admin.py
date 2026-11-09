"""Platform administration: users and roles, business verification, quality standards,
trust & risk signals, AgriTrust appeals (overall_flow §5 Administrator sidebar)."""

import uuid
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.catalog import PRODUCTS
from app.deps import DB, CurrentUser, get_or_404, require_role
from app.models import (
    Contract,
    Dispute,
    EvidenceFile,
    Organization,
    QcInspection,
    QualityStandard,
    TrustAppeal,
    TrustEvent,
    User,
)
from app.services import trust
from app.services.inventory import aware
from app.services.orders import audit
from app.views import org_brief, trust_events, user_out

router = APIRouter(tags=["admin"])


class RoleChange(BaseModel):
    role: Literal["FARMER", "BUYER", "INSPECTOR", "ADMIN"]


class Verification(BaseModel):
    verified: bool
    note: str | None = Field(default=None, max_length=500)


class GradeRule(BaseModel):
    grade: str = Field(min_length=1, max_length=8)
    criteria: str = Field(min_length=1, max_length=500)


class StandardIn(BaseModel):
    grades: list[GradeRule] = Field(min_length=1, max_length=8)
    sampling_method: str = Field(min_length=1, max_length=255)


class AppealIn(BaseModel):
    reason: str = Field(min_length=10, max_length=2000)
    evidence_note: str | None = Field(default=None, max_length=1000)


class AppealDecision(BaseModel):
    accept: bool
    note: str = Field(min_length=3, max_length=2000)


def _score(db, org_id) -> float | None:
    return trust.compute(trust_events(db, org_id))["score"]


def appeal_out(a: TrustAppeal) -> dict:
    e = a.event
    return {
        "id": a.id, "status": a.status, "reason": a.reason, "evidence_note": a.evidence_note,
        "decision_note": a.decision_note, "score_before": a.score_before, "score_after": a.score_after,
        "created_at": a.created_at, "decided_at": a.decided_at, "buyer": org_brief(a.buyer_org),
        "event": {"id": e.id, "dimension": e.dimension, "success": e.success, "verified": e.verified,
                  "transaction_ref": e.transaction_ref, "note": e.note, "occurred_at": e.occurred_at},
    }


# --- users & organizations ---------------------------------------------------------------

@router.get("/admin/users")
def users(db: DB, user: CurrentUser):
    require_role(user, "ADMIN")
    return [{**user_out(u), "sign_in": "google" if u.auth_user_id else "demo"} for u in db.scalars(select(User).order_by(User.role, User.name))]


@router.post("/admin/users/{user_id}/role")
def change_role(user_id: uuid.UUID, payload: RoleChange, db: DB, user: CurrentUser):
    require_role(user, "ADMIN")
    target = get_or_404(db, User, user_id, "ผู้ใช้")
    if target.id == user.id:
        raise HTTPException(409, "เปลี่ยนสิทธิ์ของตัวเองไม่ได้")
    org = target.organization
    if payload.role in ("INSPECTOR", "ADMIN"):
        platform = db.scalar(select(Organization).where(Organization.kind == "PLATFORM"))
        target.organization = platform
    elif (payload.role == "FARMER") != (org.kind == "FARM") or org.kind == "PLATFORM":
        raise HTTPException(409, "บทบาทนี้ต้องอยู่ในองค์กรประเภทเดียวกัน (สวน/ผู้ซื้อ)")
    old = target.role
    target.role = payload.role
    audit(db, entity_type="user", entity_id=target.id, entity_code=target.email, action="ROLE_CHANGED", actor=user,
          message=f"เปลี่ยนบทบาท {target.name}: {old} → {payload.role}")
    db.commit()
    return user_out(target)


@router.get("/admin/organizations")
def organizations(db: DB, user: CurrentUser):
    require_role(user, "ADMIN")
    out = []
    for o in db.scalars(select(Organization).where(Organization.kind != "PLATFORM").order_by(Organization.verified, Organization.name)):
        members = db.scalars(select(User).where(User.organization_id == o.id)).all()
        out.append({**org_brief(o), "created_at": o.created_at, "members": [{"name": m.name, "email": m.email} for m in members]})
    return out


@router.post("/admin/organizations/{org_id}/verify")
def verify(org_id: uuid.UUID, payload: Verification, db: DB, user: CurrentUser):
    require_role(user, "ADMIN")
    org = get_or_404(db, Organization, org_id, "องค์กร")
    org.verified = payload.verified
    audit(db, entity_type="organization", entity_id=org.id, entity_code=None, action="ORG_VERIFIED", actor=user,
          farmer_org_id=org.id if org.kind == "FARM" else None, buyer_org_id=org.id if org.kind == "BUYER" else None,
          message=f"{'ยืนยัน' if payload.verified else 'ยกเลิกการยืนยัน'}ธุรกิจ {org.name}" + (f" — {payload.note}" if payload.note else ""))
    db.commit()
    return org_brief(org)


# --- quality standards ---------------------------------------------------------------------

@router.get("/quality-standards")
def standards(db: DB, user: CurrentUser):
    return [{"product_type": s.product_type, "grades": s.grades, "sampling_method": s.sampling_method, "updated_at": s.updated_at}
            for s in db.scalars(select(QualityStandard).order_by(QualityStandard.product_type))]


@router.put("/admin/quality-standards/{product_type}")
def update_standard(product_type: str, payload: StandardIn, db: DB, user: CurrentUser):
    require_role(user, "ADMIN")
    if product_type not in PRODUCTS:
        raise HTTPException(404, "ไม่รู้จักชนิดผลผลิตนี้")
    grades = [{"grade": g.grade.strip().upper(), "criteria": g.criteria.strip()} for g in payload.grades]
    if len({g["grade"] for g in grades}) != len(grades):
        raise HTTPException(422, "ชื่อเกรดซ้ำกัน")
    s = db.scalar(select(QualityStandard).where(QualityStandard.product_type == product_type))
    if s is None:
        s = QualityStandard(product_type=product_type)
        db.add(s)
    s.grades, s.sampling_method, s.updated_by, s.updated_at = grades, payload.sampling_method, user.id, datetime.now(timezone.utc)
    db.commit()
    return {"product_type": s.product_type, "grades": s.grades, "sampling_method": s.sampling_method}


# --- trust & risk ----------------------------------------------------------------------------

@router.get("/admin/risk")
def risk(db: DB, user: CurrentUser):
    """Rule-based signals for human review (Business & Legals/settlement-disputes.md). Signals are not verdicts."""
    require_role(user, "ADMIN")
    since = datetime.now(timezone.utc) - timedelta(days=90)
    hashes = Counter()
    file_rows = db.execute(select(EvidenceFile.sha256, EvidenceFile.contract_id, EvidenceFile.organization_id)).all()
    by_hash: dict[str, set] = {}
    for sha, cid, _ in file_rows:
        by_hash.setdefault(sha, set()).add(cid)
    reused = {sha for sha, cids in by_hash.items() if len(cids) > 1}
    out = []
    for org in db.scalars(select(Organization).where(Organization.kind == "BUYER").order_by(Organization.name)):
        contracts = db.scalars(select(Contract).where(Contract.buyer_org_id == org.id)).all()
        signals = []
        dropped = [c for c in contracts if c.order_status in ("CANCELLED", "RESERVATION_EXPIRED") and aware(c.created_at) >= since]
        if len(dropped) >= 2:
            signals.append({"code": "REPEATED_DROPS", "severity": "medium", "message": f"ปฏิเสธ/ปล่อยให้การจองหมดอายุ {len(dropped)} ครั้งใน 90 วัน"})
        disputes = db.scalars(select(Dispute).where((Dispute.against_org_id == org.id) | (Dispute.opened_by_org_id == org.id))).all()
        fault = [d for d in disputes if d.outcome in ("BUYER_RESPONSIBLE", "SHARED")]
        if fault:
            signals.append({"code": "VERIFIED_DISPUTE_FAULT", "severity": "high", "message": f"ข้อพิพาทที่ผู้ซื้อมีส่วนรับผิดชอบ {len(fault)} ครั้ง"})
        open_d = [d for d in disputes if d.resolved_at is None]
        if open_d:
            signals.append({"code": "OPEN_DISPUTES", "severity": "info", "message": f"ข้อพิพาทที่ยังไม่ยุติ {len(open_d)} เรื่อง (ไม่นำมาหักคะแนน)"})
        ids = [c.id for c in contracts]
        inspections = db.scalars(select(QcInspection).where(QcInspection.contract_id.in_(ids))).all() if ids else []
        high_reject = [i for i in inspections if i.received_kg and i.rejected_kg / i.received_kg > 0.15]
        if high_reject:
            signals.append({"code": "HIGH_REJECTION", "severity": "medium", "message": f"สัดส่วนปฏิเสธสินค้าเกิน 15% ใน {len(high_reject)} การตรวจ"})
        dup = [sha for sha, cid, org_id in file_rows if org_id == org.id and sha in reused]
        if dup:
            signals.append({"code": "DUPLICATE_EVIDENCE", "severity": "high", "message": f"ใช้ไฟล์หลักฐานเดียวกันซ้ำข้ามสัญญา {len(set(dup))} ไฟล์"})
        p = trust.compute(trust_events(db, org.id))
        out.append({**org_brief(org), "trust": {k: p[k] for k in ("score", "band", "insufficient_data", "transactions")},
                    "contracts": len(contracts), "signals": signals})
    return out


# --- AgriTrust appeals ----------------------------------------------------------------------

@router.post("/trust/events/{event_id}/appeals", status_code=201)
def submit_appeal(event_id: uuid.UUID, payload: AppealIn, db: DB, user: CurrentUser):
    require_role(user, "BUYER")
    e = get_or_404(db, TrustEvent, event_id, "เหตุการณ์")
    if e.buyer_org_id != user.organization_id:
        raise HTTPException(403, "อุทธรณ์ได้เฉพาะเหตุการณ์ของบริษัทคุณ")
    if db.scalar(select(TrustAppeal.id).where(TrustAppeal.trust_event_id == e.id, TrustAppeal.status == "OPEN")):
        raise HTTPException(409, "มีคำอุทธรณ์ที่รอพิจารณาสำหรับเหตุการณ์นี้อยู่แล้ว")
    a = TrustAppeal(buyer_org_id=e.buyer_org_id, trust_event_id=e.id, submitted_by=user.id, reason=payload.reason,
                    evidence_note=payload.evidence_note, status="OPEN")
    db.add(a)
    db.flush()
    audit(db, entity_type="trust_appeal", entity_id=a.id, entity_code=e.transaction_ref, action="APPEAL_SUBMITTED", actor=user,
          buyer_org_id=e.buyer_org_id, message=f"อุทธรณ์เหตุการณ์ {e.dimension} ของ {e.transaction_ref}: {payload.reason}")
    db.commit()
    db.refresh(a)
    return appeal_out(a)


@router.get("/trust/appeals")
def list_appeals(db: DB, user: CurrentUser):
    q = select(TrustAppeal).order_by(TrustAppeal.created_at.desc())
    if user.role != "ADMIN":
        q = q.where(TrustAppeal.buyer_org_id == user.organization_id)
    return [appeal_out(a) for a in db.scalars(q)]


@router.post("/admin/appeals/{appeal_id}/decide")
def decide_appeal(appeal_id: uuid.UUID, payload: AppealDecision, db: DB, user: CurrentUser):
    require_role(user, "ADMIN")
    a = get_or_404(db, TrustAppeal, appeal_id, "คำอุทธรณ์")
    if a.status != "OPEN":
        raise HTTPException(409, "คำอุทธรณ์นี้มีผลแล้ว")
    a.score_before = _score(db, a.buyer_org_id)
    if payload.accept:
        a.event.verified = False  # excluded from scoring; the record itself is kept for audit
        db.flush()
    a.score_after = _score(db, a.buyer_org_id)
    a.status = "ACCEPTED" if payload.accept else "REJECTED"
    a.reviewer_user_id, a.decision_note, a.decided_at = user.id, payload.note, datetime.now(timezone.utc)
    change = f" คะแนน {a.score_before} → {a.score_after}" if payload.accept else ""
    audit(db, entity_type="trust_appeal", entity_id=a.id, entity_code=a.event.transaction_ref, action="APPEAL_DECIDED", actor=user,
          buyer_org_id=a.buyer_org_id, message=f"{'รับ' if payload.accept else 'ไม่รับ'}คำอุทธรณ์: {payload.note}{change}")
    db.commit()
    return appeal_out(a)
