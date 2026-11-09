"""Buyer-first matching (Technical/matching.md).

Stage A filters on hard constraints; Stage B ranks with a configurable weighted heuristic.
This is a deterministic heuristic, not a trained model.
"""

from dataclasses import dataclass
from datetime import date
from math import asin, cos, radians, sin, sqrt

from app.catalog import PROVINCES

MODEL_VERSION = "heuristic-v1"
WEIGHTS = {"timing": 0.30, "quantity": 0.25, "quality": 0.20, "logistics": 0.15, "reliability": 0.10}
MAX_DISTANCE_KM = 800
DISTANCE_SCALE_KM = 500


@dataclass
class Supply:
    product_type: str
    variety: str | None
    harvest_start: date
    harvest_end: date
    grades: list[str]
    available_kg: float
    province: str
    reliability: float | None  # 0-100, None = insufficient data


@dataclass
class Demand:
    product_type: str
    variety: str | None
    delivery_start: date
    delivery_end: date
    grades: list[str]
    quantity_kg: float
    min_quantity_kg: float | None
    destination_province: str


def haversine_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lon1, lat2, lon2 = map(radians, (*a, *b))
    h = sin((lat2 - lat1) / 2) ** 2 + cos(lat1) * cos(lat2) * sin((lon2 - lon1) / 2) ** 2
    return 2 * 6371 * asin(sqrt(h))


def overlap_days(a_start: date, a_end: date, b_start: date, b_end: date) -> int:
    return max(0, (min(a_end, b_end) - max(a_start, b_start)).days + 1)


def distance_km(province_a: str, province_b: str) -> float | None:
    if province_a not in PROVINCES or province_b not in PROVINCES:
        return None
    return haversine_km(PROVINCES[province_a], PROVINCES[province_b])


def _same(a: str | None, b: str | None) -> bool:
    return (a or "").strip().casefold() == (b or "").strip().casefold()


def evaluate(s: Supply, d: Demand) -> dict:
    unmet: list[str] = []
    if not _same(s.product_type, d.product_type):
        unmet.append("ชนิดผลผลิตไม่ตรงกัน")
    if d.variety and not _same(s.variety, d.variety):
        unmet.append("สายพันธุ์ไม่ตรงกัน")

    window_days = (d.delivery_end - d.delivery_start).days + 1
    overlap = overlap_days(s.harvest_start, s.harvest_end, d.delivery_start, d.delivery_end)
    if overlap == 0:
        unmet.append("ช่วงเก็บเกี่ยวไม่ตรงกับช่วงรับสินค้า")

    min_needed = d.min_quantity_kg or d.quantity_kg
    if s.available_kg < min_needed:
        unmet.append(f"ปริมาณคงเหลือ {s.available_kg:,.0f} กก. น้อยกว่าขั้นต่ำ {min_needed:,.0f} กก.")

    common_grades = [g for g in d.grades if g in s.grades]
    if not common_grades:
        unmet.append("เกรดที่คาดว่าจะได้ไม่ตรงกับเกรดที่รับซื้อ")

    km = distance_km(s.province, d.destination_province)
    if km is not None and km > MAX_DISTANCE_KM:
        unmet.append(f"ระยะทาง {km:,.0f} กม. เกินกว่าที่ขนส่งได้")

    factors = {
        "timing": overlap / window_days,
        "quantity": min(s.available_kg, d.quantity_kg) / d.quantity_kg,
        "quality": len(common_grades) / len(d.grades) if d.grades else 0.0,
        "logistics": 0.5 if km is None else max(0.0, 1 - km / DISTANCE_SCALE_KM),
        "reliability": 0.5 if s.reliability is None else s.reliability / 100,
    }
    score = 100 * sum(WEIGHTS[k] * v for k, v in factors.items())

    reasons = [
        f"ช่วงเก็บเกี่ยวตรงกับช่วงรับสินค้า {overlap} จาก {window_days} วัน",
        f"มีผลผลิตคงเหลือ {s.available_kg:,.0f} กก. (ต้องการ {d.quantity_kg:,.0f} กก.)",
        f"เกรดที่ตรงกัน: {', '.join(common_grades) or '-'}",
        "ไม่ทราบระยะทาง" if km is None else f"ระยะทางประมาณ {km:,.0f} กม.",
        "ยังไม่มีประวัติของสวนเพียงพอ (ใช้ค่ากลาง)"
        if s.reliability is None
        else f"ความน่าเชื่อถือของสวน {s.reliability:.0f}/100",
    ]
    return {
        "eligible": not unmet,
        "unmet": unmet,
        "score": round(score, 1),
        "factors": {k: round(v * 100, 1) for k, v in factors.items()},
        "distance_km": None if km is None else round(km),
        "reasons": reasons,
    }
