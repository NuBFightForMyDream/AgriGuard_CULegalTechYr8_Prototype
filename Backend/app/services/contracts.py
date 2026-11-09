import hashlib
import json
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy.orm import Session

from app.catalog import (
    DEFAULT_REJECTION_CONDITIONS,
    DEFAULT_SAMPLING_METHOD,
    DEFAULT_TOLERANCE_PCT,
)
from app.config import settings
from app.deps import next_code
from app.models import (
    AllocationPlan,
    Contract,
    ContractAcceptance,
    ContractVersion,
    Offer,
    ProduceListing,
    TrustEvent,
    User,
)
from app.services.inventory import aware
from app.services.orders import audit


def build_terms(listing: ProduceListing, offer: Offer, qty: Decimal) -> dict:
    req = offer.purchase_request
    harvest = [listing.harvest_start.isoformat(), listing.harvest_end.isoformat()]
    return {
        "farmer": listing.farm.organization.name,
        "buyer": offer.buyer_org.name,
        "listing_code": listing.code,
        "offer_code": offer.code,
        "product_type": listing.product_type,
        "variety": listing.variety,
        "quantity_kg": float(qty),
        "tolerance_pct": DEFAULT_TOLERANCE_PCT,
        "grade_prices": {k: float(v) for k, v in offer.grade_prices.items()},
        "harvest_window": harvest,
        "delivery_window": [req.delivery_start.isoformat(), req.delivery_end.isoformat()] if req else harvest,
        "destination_province": req.destination_province if req else (offer.buyer_org.province or "-"),
        "payment_due_days": offer.payment_terms_days,
        "deposit_thb": float(offer.deposit_thb),
        "sampling_method": DEFAULT_SAMPLING_METHOD,
        "rejection_conditions": DEFAULT_REJECTION_CONDITIONS,
        "shortfall_policy": "PROPORTIONAL_REDUCTION",
        "cancellation": "หลังยืนยันแล้ว การยกเลิกต้องได้รับความยินยอมจากทั้งสองฝ่าย และคืนมัดจำตามสัดส่วนที่ตกลง",
        "dispute_procedure": "ยื่นข้อพิพาทพร้อมหลักฐานภายใน 48 ชั่วโมงหลังผลตรวจคุณภาพ ผู้ตรวจทานของแพลตฟอร์มพิจารณา และอาจขอตรวจซ้ำ",
        "governing_law": "กฎหมายไทย",
    }


def terms_hash(terms: dict) -> str:
    canonical = json.dumps(terms, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canonical.encode()).hexdigest()


def create_contract(
    db: Session, *, listing: ProduceListing, offer: Offer, qty: Decimal, plan: AllocationPlan, farmer: User
) -> Contract:
    year = date.today().year
    c = Contract(
        code=next_code(db, Contract, f"HL-{year}-"),
        listing_id=listing.id,
        offer_id=offer.id,
        plan_id=plan.id,
        farmer_org_id=listing.farm.organization_id,
        buyer_org_id=offer.buyer_org_id,
        quantity_kg=qty,
        status="AWAITING_BUYER",
        order_status="AWAITING_CONFIRMATION",
        reservation_expires_at=datetime.now(timezone.utc) + timedelta(hours=settings.reservation_hours),
    )
    terms = build_terms(listing, offer, qty)
    h = terms_hash(terms)
    c.versions.append(ContractVersion(version=1, terms=terms, terms_hash=h, status="PROPOSED",
                                      proposed_by_org_id=farmer.organization_id, created_by=farmer.id))
    # Confirming the allocation plan is the farmer's acceptance of version 1.
    c.acceptances.append(ContractAcceptance(version=1, organization_id=farmer.organization_id, user_id=farmer.id,
                                            terms_hash=h, signature_name=farmer.name, method="ALLOCATION_CONFIRMATION"))
    db.add(c)
    db.flush()
    offer.status = "ALLOCATED"
    audit(
        db,
        entity_type="contract",
        entity_id=c.id,
        entity_code=c.code,
        action="CONTRACT_CREATED",
        actor=farmer,
        contract=c,
        to_status="AWAITING_CONFIRMATION",
        message=f"สร้าง HarvestLock จัดสรร {qty:,.0f} กก. ให้ {offer.buyer_org.name} (เกษตรกรยอมรับแล้ว รอผู้ซื้อยืนยัน)",
    )
    return c


def record_trust_events(db: Session, c: Contract) -> list[TrustEvent]:
    """Verified events from a completed transaction feed AgriTrust."""
    s = c.settlement
    inspections = [lot.inspections[-1] for lot in c.lots if lot.inspections]
    terms = c.terms
    last_paid = max((aware(p.paid_at) for p in s.payments), default=aware(s.created_at))
    delivery_end = date.fromisoformat(terms["delivery_window"][1])
    paid_on_time = last_paid.date() <= s.due_date
    pickup_on_time = all(aware(lot.received_at).date() <= delivery_end for lot in c.lots if lot.received_at)
    from app.services.disputes import buyer_at_fault  # local import avoids a cycle

    buyer_fault = buyer_at_fault(db, c)
    qc_ok = all(not any(f["code"] in ("UNAUTHORIZED_REJECTION", "QC_EVIDENCE_MISSING") for f in i.flags) for i in inspections)
    results = [
        ("PAYMENT", paid_on_time, "ชำระเงินภายในกำหนด" if paid_on_time else "ชำระเงินหลังวันครบกำหนด"),
        ("PICKUP", pickup_on_time, "รับสินค้าภายในช่วงที่ตกลง" if pickup_on_time else "รับสินค้าหลังช่วงที่ตกลง"),
        ("CONTRACT", True, "ปฏิบัติตามสัญญาจนปิดธุรกรรม"),
        ("QC", qc_ok, "ผลตรวจมีหลักฐานและเหตุผลตามสัญญา" if qc_ok else "ผลตรวจขาดหลักฐานหรือมีการปฏิเสธนอกเงื่อนไข"),
        ("DISPUTE", not buyer_fault, "ข้อพิพาทที่ตรวจสอบแล้วว่าผู้ซื้อมีส่วนรับผิดชอบ" if buyer_fault else "ไม่มีข้อพิพาทที่ผู้ซื้อเป็นฝ่ายผิด"),
    ]
    events = [
        TrustEvent(
            buyer_org_id=c.buyer_org_id,
            dimension=dim,
            success=ok,
            verified=True,
            transaction_ref=c.code,
            contract_id=c.id,
            note=note,
        )
        for dim, ok, note in results
    ]
    db.add_all(events)
    return events
