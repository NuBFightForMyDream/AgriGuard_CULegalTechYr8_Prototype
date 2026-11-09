"""Harvest forecast baseline (Technical/ai-forecasting.md "start from a baseline yield-per-area").

This is a rule-based baseline, not a trained model: there is no validated yield history yet. It turns the farm's
area into a p10/p50/p90 range from typical yield-per-rai ranges and checks the farmer's estimate against it, so
reservations keep a safety buffer. Replace with a quantile model once real harvest records exist.
"""

from decimal import Decimal

# Indicative yield ranges in kg per rai (low, typical, high) for mature orchards. Rough reference values to be
# replaced by the platform's own records; shown to users as such.
YIELD_PER_RAI = {
    "mango": (600, 1000, 1500),
    "durian": (800, 1300, 2000),
    "mangosteen": (400, 700, 1100),
    "longan": (500, 900, 1400),
    "orange": (1500, 2500, 3500),
    "rambutan": (700, 1100, 1600),
}
MODEL_VERSION = "baseline-yield-per-rai-v1"


def forecast(product_type: str, area_rai: Decimal | None, estimate_kg: Decimal, contracted_kg: Decimal) -> dict:
    base = {"model_version": MODEL_VERSION, "method": "BASELINE", "estimate_kg": estimate_kg, "contracted_kg": contracted_kg}
    ref = YIELD_PER_RAI.get(product_type)
    if not ref or not area_rai:
        return {**base, "insufficient_data": True,
                "reason": "ไม่มีข้อมูลพื้นที่ปลูกหรือค่าอ้างอิงของผลผลิตชนิดนี้" if ref else "ยังไม่มีค่าอ้างอิงสำหรับผลผลิตชนิดนี้"}
    p10, p50, p90 = (Decimal(v) * area_rai for v in ref)
    warnings = []
    if estimate_kg > p90:
        warnings.append(f"ประมาณการ {estimate_kg:,.0f} กก. สูงกว่าช่วงอ้างอิงสูงสุด ({p90:,.0f} กก.) เสี่ยงจองเกินผลผลิตจริง")
    elif estimate_kg > p50:
        warnings.append("ประมาณการสูงกว่าค่ากลางอ้างอิง ควรเผื่อกรณีผลผลิตขาด")
    if contracted_kg > p50:
        warnings.append(f"ทำสัญญาแล้ว {contracted_kg:,.0f} กก. เกินค่ากลางอ้างอิง ({p50:,.0f} กก.) หากผลผลิตออกตามค่ากลาง อาจต้องใช้นโยบายผลผลิตขาด")
    return {**base, "insufficient_data": False, "area_rai": area_rai, "yield_per_rai": {"p10": ref[0], "p50": ref[1], "p90": ref[2]},
            "p10_kg": p10, "p50_kg": p50, "p90_kg": p90,
            "safe_to_commit_kg": min(estimate_kg, p50), "warnings": warnings}
