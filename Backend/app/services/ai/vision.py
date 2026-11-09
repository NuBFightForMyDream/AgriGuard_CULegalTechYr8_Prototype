"""GradeProof photo assist (Technical/gradeproof.md "computer vision assist"), using Claude vision.

It only suggests: estimated grade shares, visible defects and a confidence, with "cannot assess" allowed.
The inspector records the result; the suggestion never overrides a human decision.
"""

import base64
import io
from decimal import ROUND_FLOOR, Decimal

from PIL import Image
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import EvidenceFile, ProduceLot, QualityStandard, User
from app.services.ai import client as ai
from app.services.storage import storage

PROMPT_VERSION = "qc-photo-v1"
MAX_IMAGES = 4
MAX_SIDE = 1568
SUPPORTED = {"image/jpeg", "image/png", "image/webp"}

SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["can_assess", "image_quality", "grade_shares", "reject_percent", "defects", "confidence", "notes"],
    "properties": {
        "can_assess": {"type": "boolean"},
        "image_quality": {"type": "string", "enum": ["good", "fair", "poor"]},
        "grade_shares": {"type": "array", "items": {
            "type": "object", "additionalProperties": False, "required": ["grade", "percent"],
            "properties": {"grade": {"type": "string"}, "percent": {"type": "number"}}}},
        "reject_percent": {"type": "number"},
        "defects": {"type": "array", "items": {
            "type": "object", "additionalProperties": False, "required": ["type", "description", "severity"],
            "properties": {
                "type": {"type": "string", "enum": ["ROT", "PEST_DAMAGE", "BRUISING", "UNDERSIZE", "SKIN_BLEMISH", "OTHER"]},
                "description": {"type": "string"},
                "severity": {"type": "string", "enum": ["minor", "moderate", "severe"]}}}},
        "confidence": {"type": "string", "enum": ["low", "medium", "high"]},
        "notes": {"type": "string"},
    },
}

SYSTEM = """You help a produce quality inspector on AgriGuard, a Thai agricultural platform, by looking at lot photos.
You only suggest; the inspector decides and records the official result.
Judge only what is visible in the photos against the grading criteria you are given. Photos show a sample, so treat
shares as rough estimates and say how representative the photos seem. If the photos are unclear, do not show this
product, or are not enough to judge, set can_assess to false and explain in notes instead of guessing.
Grade shares plus reject_percent should total about 100. Write descriptions and notes in Thai."""


def _jpeg(data: bytes) -> str:
    img = Image.open(io.BytesIO(data))
    img = img.convert("RGB")
    img.thumbnail((MAX_SIDE, MAX_SIDE))
    out = io.BytesIO()
    img.save(out, format="JPEG", quality=85)
    return base64.standard_b64encode(out.getvalue()).decode()


def lot_images(db: Session, lot: ProduceLot) -> list[EvidenceFile]:
    rows = db.scalars(select(EvidenceFile).where(EvidenceFile.entity_type == "lot", EvidenceFile.entity_id == lot.id)
                      .order_by(EvidenceFile.created_at.desc())).all()
    return [f for f in rows if f.content_type in SUPPORTED][:MAX_IMAGES]


def suggested_kg(result: dict, received_kg: Decimal, grades: list[str]) -> dict:
    """Turn percentages into kilograms that add up exactly to the received weight (10 kg steps, remainder to the top grade)."""
    if not result.get("can_assess") or not received_kg:
        return {}
    shares = {g["grade"].upper(): Decimal(str(max(0.0, g["percent"]))) for g in result.get("grade_shares", [])}
    reject = Decimal(str(max(0.0, result.get("reject_percent", 0))))
    total = sum(shares.values(), Decimal(0)) + reject
    if total <= 0:
        return {}
    step = Decimal(10)
    kg = {g: ((received_kg * shares.get(g, Decimal(0)) / total) / step).to_integral_value(rounding=ROUND_FLOOR) * step for g in grades}
    rejected = ((received_kg * reject / total) / step).to_integral_value(rounding=ROUND_FLOOR) * step
    kg[grades[0]] += received_kg - sum(kg.values(), Decimal(0)) - rejected
    return {"grades": {g: float(v) for g, v in kg.items()}, "rejected_kg": float(rejected)}


def assess(db: Session, lot: ProduceLot, user: User) -> dict:
    c = lot.contract
    files = lot_images(db, lot)
    if not files:
        raise ValueError("ยังไม่มีภาพของล็อตนี้ (JPG/PNG/WebP) — แนบภาพที่การ์ดล็อตก่อน")
    std = db.scalar(select(QualityStandard).where(QualityStandard.product_type == c.listing.product_type))
    criteria = "\n".join(f"- {g['grade']}: {g['criteria']}" for g in (std.grades if std else []))
    grades = sorted(c.terms["grade_prices"])
    content: list[dict] = []
    for f in files:
        content.append({"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": _jpeg(storage().get(f.storage_key))}})
    content.append({"type": "text", "text": (
        f"Product: {c.listing.product_type} variety {c.listing.variety or '-'}. Lot {lot.code}, received "
        f"{lot.received_kg or lot.harvested_kg} kg. Grades in this contract: {', '.join(grades)}.\n"
        f"Platform grading criteria:\n{criteria or '- (none configured)'}\n"
        f"Contract rejection reasons: {', '.join(c.terms.get('rejection_conditions', []))}.\n"
        "Estimate the share of each contract grade and the reject share from these photos.")})
    run = ai.run(db, task="QC_PHOTO_ASSIST", prompt_version=PROMPT_VERSION, system=SYSTEM, schema=SCHEMA, content=content,
                 entity_type="lot", entity_id=lot.id, user_id=user.id,
                 hash_parts=(PROMPT_VERSION, lot.id, [f.sha256 for f in files], criteria))
    received = lot.received_kg or lot.harvested_kg
    return {**run.output, "run_id": run.id, "model": run.model, "label": "AI-suggested", "images_used": len(files),
            "suggested_kg": suggested_kg(run.output, received, grades),
            "disclaimer": "คำแนะนำจาก AI จากภาพตัวอย่าง ผู้ตรวจต้องตรวจจริงและเป็นผู้ตัดสินผล"}
