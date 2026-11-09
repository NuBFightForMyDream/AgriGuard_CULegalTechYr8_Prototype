"""Multi-buyer allocation (Technical/allocation.md). Phase 1: MANUAL and PROPORTIONAL strategies."""

from dataclasses import dataclass
from decimal import ROUND_FLOOR, Decimal

STEP_KG = Decimal(10)


@dataclass
class OfferDemand:
    offer_id: str
    quantity_kg: Decimal
    min_quantity_kg: Decimal | None
    price: Decimal  # top-grade price, used for the revenue estimate


def proportional(available: Decimal, offers: list[OfferDemand]) -> tuple[dict[str, Decimal], list[str]]:
    """Split supply by demand ratio, rounded down to STEP_KG, dropping buyers below their minimum."""
    warnings: list[str] = []
    total = sum((o.quantity_kg for o in offers), Decimal(0))
    if total == 0 or available <= 0:
        return {o.offer_id: Decimal(0) for o in offers}, ["ไม่มีผลผลิตคงเหลือหรือไม่มีความต้องการ"]
    if total <= available:
        return {o.offer_id: o.quantity_kg for o in offers}, []

    ratio = available / total
    result: dict[str, Decimal] = {}
    for o in offers:
        qty = (o.quantity_kg * ratio / STEP_KG).to_integral_value(rounding=ROUND_FLOOR) * STEP_KG
        if o.min_quantity_kg and qty < o.min_quantity_kg:
            warnings.append(
                f"ข้อเสนอ {o.offer_id}: ได้ {qty:,.0f} กก. ต่ำกว่าขั้นต่ำ {o.min_quantity_kg:,.0f} กก. จึงไม่จัดสรรให้"
            )
            qty = Decimal(0)
        result[o.offer_id] = qty
    return result, warnings


def validate(available: Decimal, offers: list[OfferDemand], items: dict[str, Decimal]) -> list[str]:
    errors: list[str] = []
    by_id = {o.offer_id: o for o in offers}
    for offer_id, qty in items.items():
        o = by_id.get(offer_id)
        if o is None:
            errors.append(f"ไม่พบข้อเสนอ {offer_id} หรือข้อเสนอไม่อยู่ในสถานะรอจัดสรร")
            continue
        if qty < 0:
            errors.append(f"ปริมาณของข้อเสนอ {offer_id} ต้องไม่ติดลบ")
        if qty > o.quantity_kg:
            errors.append(f"จัดสรรให้ข้อเสนอ {offer_id} เกินกว่าที่ผู้ซื้อต้องการ ({o.quantity_kg:,.0f} กก.)")
        if 0 < qty and o.min_quantity_kg and qty < o.min_quantity_kg:
            errors.append(f"จัดสรรให้ข้อเสนอ {offer_id} ต่ำกว่าขั้นต่ำ ({o.min_quantity_kg:,.0f} กก.)")
    total = sum(items.values(), Decimal(0))
    if total > available:
        errors.append(f"จัดสรรรวม {total:,.0f} กก. เกินผลผลิตที่ยังไม่ผูกพัน {available:,.0f} กก.")
    return errors


def summarize(available: Decimal, offers: list[OfferDemand], items: dict[str, Decimal]) -> dict:
    lines = []
    for o in offers:
        qty = items.get(o.offer_id, Decimal(0))
        lines.append(
            {
                "offer_id": o.offer_id,
                "quantity_kg": qty,
                "share_pct": float(qty / available * 100) if available else 0.0,
                "expected_revenue": qty * o.price,
            }
        )
    total = sum(items.values(), Decimal(0))
    return {
        "lines": lines,
        "total_kg": total,
        "remaining_kg": available - total,
        "expected_revenue": sum((line["expected_revenue"] for line in lines), Decimal(0)),
    }
