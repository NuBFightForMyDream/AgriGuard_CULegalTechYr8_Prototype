"""Settlement calculation and contract-vs-QC comparison (Business & Legals/settlement-disputes.md, GradeProof)."""

from decimal import Decimal

from app.catalog import REJECTION_REASONS

TWO_PLACES = Decimal("0.01")
QUANTITY_FLAGS = {"QUANTITY_SHORTFALL", "QUANTITY_OVERAGE"}


def compute(
    grade_qty: dict[str, Decimal],
    grade_prices: dict[str, float],
    rejected_kg: Decimal,
    deposit: Decimal,
) -> dict:
    """Net = Σ(quantity_by_grade × agreed_price) − deposit. Rejected produce is paid at 0."""
    lines = []
    for grade, qty in grade_qty.items():
        if qty <= 0:
            continue
        price = Decimal(str(grade_prices.get(grade, 0)))
        lines.append({"grade": grade, "quantity_kg": qty, "price": price, "amount": (qty * price).quantize(TWO_PLACES)})
    if rejected_kg > 0:
        lines.append({"grade": "REJECTED", "quantity_kg": rejected_kg, "price": Decimal(0), "amount": Decimal("0.00")})
    gross = sum((line["amount"] for line in lines), Decimal("0.00"))
    return {"lines": lines, "gross": gross, "deposit": deposit, "net": max(gross - deposit, Decimal("0.00"))}


def discrepancy_flags(
    terms: dict,
    received_kg: Decimal,
    grade_qty: dict[str, Decimal],
    rejected_kg: Decimal,
    rejection_reason: str | None,
    evidence_note: str | None,
) -> list[dict]:
    """Compare an inspection with the HarvestLock terms. Flags route to human review; they are not verdicts."""
    flags: list[dict] = []
    agreed = Decimal(str(terms["quantity_kg"]))
    tolerance = Decimal(str(terms.get("tolerance_pct", 0))) / 100
    if received_kg < agreed * (1 - tolerance):
        flags.append(
            {
                "code": "QUANTITY_SHORTFALL",
                "message": f"ส่งมอบ {received_kg:,.0f} กก. ต่ำกว่าที่ตกลง {agreed:,.0f} กก. เกินค่าคลาดเคลื่อน",
            }
        )
    if received_kg > agreed * (1 + tolerance):
        flags.append(
            {"code": "QUANTITY_OVERAGE", "message": f"ส่งมอบ {received_kg:,.0f} กก. เกินกว่าที่ตกลง {agreed:,.0f} กก."}
        )
    unknown = [g for g, q in grade_qty.items() if q > 0 and g not in terms["grade_prices"]]
    if unknown:
        flags.append(
            {"code": "GRADE_NOT_IN_CONTRACT", "message": f"เกรด {', '.join(unknown)} ไม่มีราคาในสัญญา (คิดราคา 0)"}
        )
    if rejected_kg > 0 and rejection_reason not in terms.get("rejection_conditions", []):
        label = REJECTION_REASONS.get(rejection_reason or "", "ไม่ระบุเหตุผล")
        flags.append(
            {"code": "UNAUTHORIZED_REJECTION", "message": f"เหตุผลการปฏิเสธ “{label}” ไม่อยู่ในเงื่อนไขสัญญา ต้องตรวจทาน"}
        )
    if not (evidence_note or "").strip():
        flags.append({"code": "QC_EVIDENCE_MISSING", "message": "ยังไม่มีหลักฐานประกอบการตรวจคุณภาพ"})
    return flags
