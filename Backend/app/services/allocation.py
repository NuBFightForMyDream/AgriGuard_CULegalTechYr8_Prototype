"""Multi-buyer allocation (Technical/allocation.md).

Strategies: MANUAL, PROPORTIONAL, MAX_NET_REVENUE, RISK_AWARE. The optimizer is exact: for every subset of
buyers it gives each chosen buyer their minimum lot, then fills the rest by net price. With the small number of
offers per listing (capped at MAX_EXACT_OFFERS) this enumerates every feasible plan, so it is optimal for the
linear objective with minimum-lot constraints. Larger problems would move to a MILP solver (OR-Tools).
"""

from dataclasses import dataclass, field
from decimal import ROUND_FLOOR, Decimal
from itertools import combinations

STEP_KG = Decimal(10)
MAX_EXACT_OFFERS = 12
# Illustrative logistics estimate: THB per kg per km (refrigerated truck, shared load).
LOGISTICS_THB_PER_KG_KM = Decimal("0.002")
# Risk-aware caps: share of available supply a single buyer may take, by AgriTrust band.
RISK_CAPS = {"HIGH_RISK": Decimal("0.25"), "MEDIUM_RISK": Decimal("0.50"), None: Decimal("0.50")}


@dataclass
class OfferDemand:
    offer_id: str
    quantity_kg: Decimal
    min_quantity_kg: Decimal | None
    price: Decimal  # top-grade price, used for the revenue estimate
    logistics_cost: Decimal = Decimal(0)  # THB/kg
    trust_band: str | None = None  # AgriTrust band; None = insufficient data
    label: str = field(default="")

    @property
    def net_price(self) -> Decimal:
        return self.price - self.logistics_cost


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
    by_id = {o.offer_id: o for o in offers}
    for line in lines:
        o = by_id[line["offer_id"]]
        line["logistics_cost_per_kg"] = o.logistics_cost
        line["net_revenue"] = line["quantity_kg"] * o.net_price
    return {
        "lines": lines,
        "total_kg": total,
        "remaining_kg": available - total,
        "expected_revenue": sum((line["expected_revenue"] for line in lines), Decimal(0)),
        "expected_net_revenue": sum((line["net_revenue"] for line in lines), Decimal(0)),
    }


def logistics_cost(distance_km: float | None) -> Decimal:
    if distance_km is None:
        return Decimal(0)
    return (Decimal(str(distance_km)) * LOGISTICS_THB_PER_KG_KM).quantize(Decimal("0.01"))


def _floor_step(q: Decimal) -> Decimal:
    return (q / STEP_KG).to_integral_value(rounding=ROUND_FLOOR) * STEP_KG


def optimize(available: Decimal, offers: list[OfferDemand], risk_aware: bool = False) -> tuple[dict[str, Decimal], list[str]]:
    """Maximize Σ net_price × qty subject to supply, demand, minimum lots and (optionally) risk caps."""
    notes: list[str] = []
    caps: dict[str, Decimal] = {}
    for o in offers:
        cap = o.quantity_kg
        if risk_aware and o.trust_band in RISK_CAPS:
            limit = _floor_step(available * RISK_CAPS[o.trust_band])
            if limit < cap:
                cap = limit
                reason = "ยังไม่มีประวัติเพียงพอ" if o.trust_band is None else f"AgriTrust ระดับ {o.trust_band}"
                notes.append(f"{o.label or o.offer_id}: จำกัดไม่เกิน {cap:,.0f} กก. ({int(RISK_CAPS[o.trust_band] * 100)}% ของผลผลิต) เพราะ{reason}")
        caps[o.offer_id] = cap

    candidates = [o for o in offers if o.net_price > 0]
    if len(candidates) > MAX_EXACT_OFFERS:  # keep it bounded: best net prices first
        candidates = sorted(candidates, key=lambda o: o.net_price, reverse=True)[:MAX_EXACT_OFFERS]
        notes.append(f"พิจารณาเฉพาะ {MAX_EXACT_OFFERS} ข้อเสนอที่ราคาสุทธิสูงสุด")

    best: tuple[Decimal, dict[str, Decimal]] = (Decimal(-1), {})
    for size in range(1, len(candidates) + 1):
        for subset in combinations(candidates, size):
            mins = {o.offer_id: (o.min_quantity_kg or STEP_KG) for o in subset}
            if any(mins[o.offer_id] > caps[o.offer_id] for o in subset):
                continue
            remaining = available - sum(mins.values(), Decimal(0))
            if remaining < 0:
                continue
            plan = dict(mins)
            for o in sorted(subset, key=lambda o: o.net_price, reverse=True):
                add = _floor_step(min(caps[o.offer_id] - plan[o.offer_id], remaining))
                plan[o.offer_id] += add
                remaining -= add
            value = sum((plan[o.offer_id] * o.net_price for o in subset), Decimal(0))
            if value > best[0]:
                best = (value, plan)

    items = {o.offer_id: best[1].get(o.offer_id, Decimal(0)) for o in offers}
    skipped = [o for o in offers if items[o.offer_id] == 0]
    for o in skipped:
        notes.append(f"{o.label or o.offer_id}: ไม่ได้รับการจัดสรรในแผนที่ให้มูลค่าสุทธิสูงสุด")
    return items, notes
