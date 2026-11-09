"""Order state machine and audit trail (Products/ordering-flow.md)."""

from app.models import AuditLog, Contract, User

TRANSITIONS: dict[str, set[str]] = {
    "AWAITING_CONFIRMATION": {"CONFIRMED", "CANCELLED", "RESERVATION_EXPIRED"},
    "CONFIRMED": {"HARVESTED", "CANCELLED", "DISPUTED"},
    "HARVESTED": {"IN_TRANSIT", "DISPUTED"},
    "IN_TRANSIT": {"DELIVERED", "DISPUTED"},
    "DELIVERED": {"QC_PENDING"},
    "QC_PENDING": {"QC_ACCEPTED", "QC_DISPUTED", "DISPUTED"},
    "QC_ACCEPTED": {"PAYMENT_PENDING"},
    "PAYMENT_PENDING": {"PAID", "PAYMENT_OVERDUE", "DISPUTED"},
    "PAYMENT_OVERDUE": {"PAID", "DISPUTED"},
    "PAID": {"COMPLETED", "DISPUTED"},
}
# A dispute pauses the order; resolution returns it to where it was (enforced in services/disputes.py).
DISPUTABLE = {s for s, targets in TRANSITIONS.items() if "DISPUTED" in targets}
TRANSITIONS["DISPUTED"] = DISPUTABLE | {"PAID"}
RESERVED = {"AWAITING_CONFIRMATION"}
INACTIVE = {"CANCELLED", "RESERVATION_EXPIRED"}


class InvalidTransition(Exception):
    pass


def audit(
    db,
    *,
    entity_type: str,
    entity_id,
    entity_code: str | None,
    action: str,
    actor: User | None,
    message: str,
    contract: Contract | None = None,
    farmer_org_id=None,
    buyer_org_id=None,
    from_status: str | None = None,
    to_status: str | None = None,
) -> AuditLog:
    log = AuditLog(
        entity_type=entity_type,
        entity_id=entity_id,
        entity_code=entity_code,
        action=action,
        from_status=from_status,
        to_status=to_status,
        actor_user_id=actor.id if actor else None,
        actor_role=actor.role if actor else "SYSTEM",
        contract_id=contract.id if contract else None,
        farmer_org_id=contract.farmer_org_id if contract else farmer_org_id,
        buyer_org_id=contract.buyer_org_id if contract else buyer_org_id,
        message=message,
    )
    db.add(log)
    from app.services.notify import notify_from_audit  # local import avoids a cycle

    notify_from_audit(db, log, actor.organization_id if actor else None)
    return log


def transition(db, contract: Contract, to: str, actor: User | None, message: str) -> None:
    current = contract.order_status
    if to not in TRANSITIONS.get(current, set()):
        raise InvalidTransition(f"เปลี่ยนสถานะจาก {current} เป็น {to} ไม่ได้")
    contract.order_status = to
    audit(
        db,
        entity_type="contract",
        entity_id=contract.id,
        entity_code=contract.code,
        action="STATUS_CHANGED",
        actor=actor,
        message=message,
        contract=contract,
        from_status=current,
        to_status=to,
    )
