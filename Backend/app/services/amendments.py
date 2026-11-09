"""HarvestLock amendments and harvest-shortfall reduction (Business & Legals/harvestlock.md, overall_flow §11, §16B).

Rules: accepted versions are never edited in place; an amendment is a new version that only takes effect when the
other party accepts the same terms hash; a shortfall applies the agreed policy as proposals, never silently.
"""

from decimal import ROUND_FLOOR, Decimal

from app.models import Contract, ContractAcceptance, ContractVersion, User
from app.services.contracts import terms_hash
from app.services.orders import audit

AMENDABLE = {"CONFIRMED", "HARVESTED"}
FIELDS = {
    "quantity_kg": "ปริมาณ (กก.)",
    "grade_prices": "ราคาตามเกรด (บาท/กก.)",
    "delivery_window": "ช่วงส่งมอบ",
    "payment_due_days": "ชำระภายใน (วัน)",
    "deposit_thb": "เงินมัดจำ (บาท)",
}


def diff(old: dict, new: dict) -> list[dict]:
    return [{"field": k, "label": label, "from": old.get(k), "to": new.get(k)} for k, label in FIELDS.items() if old.get(k) != new.get(k)]


def propose(db, c: Contract, user: User, changes: dict, reason: str) -> ContractVersion:
    current = c.terms
    new_terms = {**current, **{k: v for k, v in changes.items() if v is not None}}
    changed = diff(current, new_terms)
    if not changed:
        raise ValueError("ไม่มีการเปลี่ยนแปลงจากฉบับปัจจุบัน")
    version = max(v.version for v in c.versions) + 1
    h = terms_hash(new_terms)
    v = ContractVersion(version=version, terms=new_terms, terms_hash=h, status="PROPOSED", reason=reason,
                        proposed_by_org_id=user.organization_id, created_by=user.id)
    c.versions.append(v)
    c.acceptances.append(ContractAcceptance(version=version, organization_id=user.organization_id, user_id=user.id,
                                            terms_hash=h, signature_name=user.name, method="PROPOSER"))
    c.proposed_version = version
    c.status = "AMENDMENT_PENDING"
    summary = ", ".join(f"{d['label']} {d['from']} → {d['to']}" for d in changed)
    audit(db, entity_type="contract", entity_id=c.id, entity_code=c.code, action="AMENDMENT_PROPOSED", actor=user,
          contract=c, message=f"เสนอแก้ไขสัญญาเป็นฉบับที่ {version}: {summary} — เหตุผล: {reason}")
    return v


def respond(db, c: Contract, user: User, accept: bool, signature_name: str | None) -> None:
    proposed = next(v for v in c.versions if v.version == c.proposed_version)
    if accept:
        c.acceptances.append(ContractAcceptance(version=proposed.version, organization_id=user.organization_id, user_id=user.id,
                                                terms_hash=proposed.terms_hash, signature_name=signature_name, method="TYPED_NAME"))
        for v in c.versions:
            if v.version == c.current_version:
                v.status = "SUPERSEDED"
        proposed.status = "ACCEPTED"
        c.current_version = proposed.version
        c.quantity_kg = Decimal(str(proposed.terms["quantity_kg"]))
        message = f"ยอมรับการแก้ไข มีผลเป็นฉบับที่ {proposed.version} (hash {proposed.terms_hash[:12]}…)"
    else:
        proposed.status = "REJECTED"
        message = f"ปฏิเสธการแก้ไขฉบับที่ {proposed.version} สัญญาฉบับที่ {c.current_version} ยังมีผล"
    c.proposed_version = None
    c.status = "CONFIRMED"
    audit(db, entity_type="contract", entity_id=c.id, entity_code=c.code,
          action="AMENDMENT_ACCEPTED" if accept else "AMENDMENT_REJECTED", actor=user, contract=c, message=message)


def shortfall_plan(contracts: list[Contract], actual_kg: Decimal) -> list[dict]:
    """PROPORTIONAL_REDUCTION: every affected contract shrinks by the same ratio, rounded down to 10 kg."""
    total = sum((c.quantity_kg for c in contracts), Decimal(0))
    if total <= 0 or actual_kg >= total:
        return []
    ratio = actual_kg / total
    plan = []
    for c in contracts:
        new = (c.quantity_kg * ratio / 10).to_integral_value(rounding=ROUND_FLOOR) * 10
        plan.append({"contract_id": c.id, "contract_code": c.code, "buyer": c.buyer_org.name,
                     "current_kg": c.quantity_kg, "new_kg": new, "reduction_kg": c.quantity_kg - new})
    return plan
