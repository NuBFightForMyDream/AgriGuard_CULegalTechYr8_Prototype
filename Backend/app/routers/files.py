import hashlib
import uuid
from pathlib import PurePosixPath

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select

from app.config import settings
from app.deps import DB, CurrentUser, get_or_404
from app.models import Contract, Dispute, EvidenceFile, ProduceLot, QcInspection, Settlement, User
from app.routers.contracts import load_contract
from app.services.orders import audit
from app.services.storage import LocalStorage, storage, verify

router = APIRouter(tags=["files"])

ALLOWED = {"image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"}
ENTITIES = {"lot": ProduceLot, "inspection": QcInspection, "dispute": Dispute, "settlement": Settlement}


def file_out(f: EvidenceFile) -> dict:
    return {
        "id": f.id, "entity_type": f.entity_type, "entity_id": f.entity_id, "filename": f.filename,
        "content_type": f.content_type, "size_bytes": f.size_bytes, "sha256": f.sha256, "note": f.note,
        "uploaded_by": {"id": f.uploader.id, "name": f.uploader.name, "role": f.uploader.role}, "created_at": f.created_at,
    }


def contract_files(db, contract_id) -> list[dict]:
    rows = db.scalars(select(EvidenceFile).where(EvidenceFile.contract_id == contract_id).order_by(EvidenceFile.created_at))
    return [file_out(f) for f in rows]


def _contract_of(db, entity_type: str, entity_id: uuid.UUID) -> Contract:
    obj = get_or_404(db, ENTITIES[entity_type], entity_id, "รายการที่แนบหลักฐาน")
    return db.get(Contract, obj.contract_id)


def _can_see(user: User, c: Contract) -> bool:
    return user.role in ("INSPECTOR", "ADMIN") or user.organization_id in (c.farmer_org_id, c.buyer_org_id)


@router.post("/files", status_code=201)
async def upload(db: DB, user: CurrentUser, entity_type: str = Form(...), entity_id: uuid.UUID = Form(...),
                 note: str | None = Form(None), file: UploadFile = File(...)):
    if entity_type not in ENTITIES:
        raise HTTPException(422, "ประเภทรายการไม่ถูกต้อง")
    c = _contract_of(db, entity_type, entity_id)
    if not _can_see(user, c) or user.role == "ADMIN" and entity_type != "dispute":
        raise HTTPException(403, "คุณไม่มีสิทธิ์แนบหลักฐานในรายการนี้")
    content_type = (file.content_type or "").lower()
    if content_type not in ALLOWED:
        raise HTTPException(422, "รองรับเฉพาะรูปภาพ (JPG, PNG, WebP, HEIC) และ PDF")
    limit = settings.max_upload_mb * 1024 * 1024
    data = await file.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(413, f"ไฟล์ต้องไม่เกิน {settings.max_upload_mb} MB")
    digest = hashlib.sha256(data).hexdigest()
    file_id = uuid.uuid4()
    suffix = PurePosixPath(file.filename or "").suffix.lower()[:8]
    key = f"org/{c.farmer_org_id}/{entity_type}/{entity_id}/{file_id}{suffix}"
    storage().put(key, data, content_type)
    f = EvidenceFile(id=file_id, contract_id=c.id, entity_type=entity_type, entity_id=entity_id, uploaded_by=user.id,
                     organization_id=user.organization_id, filename=(file.filename or "file")[:255], content_type=content_type,
                     size_bytes=len(data), sha256=digest, storage_key=key, note=(note or None) and note[:255])
    db.add(f)
    audit(db, entity_type="evidence", entity_id=f.id, entity_code=c.code, action="EVIDENCE_UPLOADED", actor=user, contract=c,
          message=f"แนบหลักฐาน {f.filename} (SHA-256 {digest[:12]}…)")
    db.commit()
    db.refresh(f)
    return file_out(f)


@router.get("/files/{file_id}/link")
def link(file_id: uuid.UUID, db: DB, user: CurrentUser):
    f = get_or_404(db, EvidenceFile, file_id, "ไฟล์")
    if not _can_see(user, db.get(Contract, f.contract_id)):
        raise HTTPException(403, "คุณไม่มีสิทธิ์ดูไฟล์นี้")
    return {"url": storage().signed_url(str(f.id), f.storage_key), "expires_in": 300}


@router.get("/files/{file_id}/raw")
def raw(file_id: uuid.UUID, exp: int, sig: str, db: DB):
    """Local-storage download behind an HMAC-signed, expiring link (no auth header needed, like a signed URL)."""
    if not verify(str(file_id), exp, sig):
        raise HTTPException(403, "ลิงก์หมดอายุหรือไม่ถูกต้อง")
    f = get_or_404(db, EvidenceFile, file_id, "ไฟล์")
    s = storage()
    if not isinstance(s, LocalStorage):
        raise HTTPException(404, "ไม่พบไฟล์")
    return FileResponse(s.path(f.storage_key), media_type=f.content_type, filename=f.filename,
                        headers={"Cache-Control": "private, max-age=300"})


__all__ = ["router", "contract_files", "load_contract"]
