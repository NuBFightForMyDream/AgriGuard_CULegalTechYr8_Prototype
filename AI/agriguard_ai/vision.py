"""GradeProof photo assist (Technical/gradeproof.md "computer vision assist"), using Claude vision.

It only suggests: estimated grade shares, visible defects and a confidence, with "cannot assess" allowed.
The inspector records the result; the suggestion never overrides a human decision.
"""

import base64
import io
from decimal import ROUND_FLOOR, Decimal

from PIL import Image

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


def to_jpeg_b64(data: bytes) -> str:
    """Downscale to the model's useful size and re-encode as JPEG (also strips EXIF metadata)."""
    img = Image.open(io.BytesIO(data))
    img = img.convert("RGB")
    img.thumbnail((MAX_SIDE, MAX_SIDE))
    out = io.BytesIO()
    img.save(out, format="JPEG", quality=85)
    return base64.standard_b64encode(out.getvalue()).decode()


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


DISCLAIMER = "คำแนะนำจาก AI จากภาพตัวอย่าง ผู้ตรวจต้องตรวจจริงและเป็นผู้ตัดสินผล"


def photo_content(images_jpeg_b64: list[str], *, product_type: str, variety: str | None, lot_code: str, received_kg,
                  grades: list[str], criteria: list[dict], rejection_conditions: list[str]) -> list[dict]:
    content: list[dict] = [{"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": b}}
                           for b in images_jpeg_b64[:MAX_IMAGES]]
    rules = "\n".join(f"- {g['grade']}: {g['criteria']}" for g in criteria)
    content.append({"type": "text", "text": (
        f"Product: {product_type} variety {variety or '-'}. Lot {lot_code}, received {received_kg} kg. "
        f"Grades in this contract: {', '.join(grades)}.\n"
        f"Platform grading criteria:\n{rules or '- (none configured)'}\n"
        f"Contract rejection reasons: {', '.join(rejection_conditions)}.\n"
        "Estimate the share of each contract grade and the reject share from these photos.")})
    return content
