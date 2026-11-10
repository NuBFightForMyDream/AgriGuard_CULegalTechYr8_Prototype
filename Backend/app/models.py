import secrets
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


QTY = Numeric(12, 2)
MONEY = Numeric(14, 2)
TS = DateTime(timezone=True)


def pk() -> Mapped[uuid.UUID]:
    return mapped_column(Uuid, primary_key=True, default=uuid.uuid4)


def fk(target: str, nullable: bool = False) -> Mapped:
    return mapped_column(Uuid, ForeignKey(target), nullable=nullable, index=True)


# --- Users and organizations -------------------------------------------------


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[uuid.UUID] = pk()
    name: Mapped[str] = mapped_column(String(120))
    kind: Mapped[str] = mapped_column(String(16))  # FARM | BUYER | PLATFORM
    business_type: Mapped[str | None] = mapped_column(String(32))
    province: Mapped[str | None] = mapped_column(String(64))
    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(TS, default=utcnow)


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = pk()
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(255), unique=True)
    role: Mapped[str] = mapped_column(String(16))  # FARMER | BUYER | INSPECTOR | ADMIN
    title: Mapped[str | None] = mapped_column(String(120))
    organization_id: Mapped[uuid.UUID] = fk("organizations.id")
    # Phase 2: link to Supabase Auth (see Technical/deployment.md).
    auth_user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, unique=True)

    organization: Mapped[Organization] = relationship()


class Farm(Base):
    __tablename__ = "farms"

    id: Mapped[uuid.UUID] = pk()
    organization_id: Mapped[uuid.UUID] = fk("organizations.id")
    name: Mapped[str] = mapped_column(String(120))
    province: Mapped[str] = mapped_column(String(64))
    area_rai: Mapped[Decimal | None] = mapped_column(QTY)

    organization: Mapped[Organization] = relationship()


# --- Produce and procurement --------------------------------------------------


class ProduceListing(Base):
    __tablename__ = "produce_listings"
    __table_args__ = (
        CheckConstraint("estimated_qty_kg > 0", name="ck_listing_qty_positive"),
        CheckConstraint("harvest_end >= harvest_start", name="ck_listing_window"),
    )

    id: Mapped[uuid.UUID] = pk()
    code: Mapped[str] = mapped_column(String(32), unique=True)
    farm_id: Mapped[uuid.UUID] = fk("farms.id")
    product_type: Mapped[str] = mapped_column(String(32))
    variety: Mapped[str | None] = mapped_column(String(64))
    estimated_qty_kg: Mapped[Decimal] = mapped_column(QTY)
    harvest_start: Mapped[date] = mapped_column(Date)
    harvest_end: Mapped[date] = mapped_column(Date)
    expected_grades: Mapped[list] = mapped_column(JSON)
    price_min: Mapped[Decimal | None] = mapped_column(MONEY)
    price_max: Mapped[Decimal | None] = mapped_column(MONEY)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(TS, default=utcnow)

    farm: Mapped[Farm] = relationship()
    offers: Mapped[list["Offer"]] = relationship(back_populates="listing")
    contracts: Mapped[list["Contract"]] = relationship(back_populates="listing")


class PurchaseRequest(Base):
    __tablename__ = "purchase_requests"
    __table_args__ = (
        CheckConstraint("quantity_kg > 0", name="ck_purchase_requests_quantity_positive"),
        CheckConstraint("delivery_end >= delivery_start", name="ck_purchase_requests_window"),
    )

    id: Mapped[uuid.UUID] = pk()
    code: Mapped[str] = mapped_column(String(32), unique=True)
    buyer_org_id: Mapped[uuid.UUID] = fk("organizations.id")
    product_type: Mapped[str] = mapped_column(String(32))
    variety: Mapped[str | None] = mapped_column(String(64))
    quantity_kg: Mapped[Decimal] = mapped_column(QTY)
    min_quantity_kg: Mapped[Decimal | None] = mapped_column(QTY)
    target_price: Mapped[Decimal | None] = mapped_column(MONEY)
    accepted_grades: Mapped[list] = mapped_column(JSON)
    quality_notes: Mapped[str | None] = mapped_column(Text)
    delivery_start: Mapped[date] = mapped_column(Date)
    delivery_end: Mapped[date] = mapped_column(Date)
    destination_province: Mapped[str] = mapped_column(String(64))
    payment_terms_days: Mapped[int] = mapped_column(Integer, default=3)
    expires_on: Mapped[date | None] = mapped_column(Date)
    # SINGLE: one farm supplies everything under one HarvestLock. MULTI: split across farms (optionally capped).
    sourcing_mode: Mapped[str] = mapped_column(String(8), default="MULTI", server_default="MULTI")
    max_suppliers: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(24), default="OPEN")  # OPEN | PARTIALLY_FILLED | FULFILLED | CANCELLED
    created_at: Mapped[datetime] = mapped_column(TS, default=utcnow)

    buyer_org: Mapped[Organization] = relationship()
    offers: Mapped[list["Offer"]] = relationship(back_populates="purchase_request")


class Offer(Base):
    __tablename__ = "purchase_offers"
    __table_args__ = (CheckConstraint("quantity_kg > 0", name="ck_offer_qty_positive"),)

    id: Mapped[uuid.UUID] = pk()
    code: Mapped[str] = mapped_column(String(32), unique=True)
    listing_id: Mapped[uuid.UUID] = fk("produce_listings.id")
    purchase_request_id: Mapped[uuid.UUID | None] = fk("purchase_requests.id", nullable=True)
    buyer_org_id: Mapped[uuid.UUID] = fk("organizations.id")
    quantity_kg: Mapped[Decimal] = mapped_column(QTY)
    min_quantity_kg: Mapped[Decimal | None] = mapped_column(QTY)
    grade_prices: Mapped[dict] = mapped_column(JSON)  # {"A": 45.0, "B": 30.0} THB/kg
    payment_terms_days: Mapped[int] = mapped_column(Integer, default=3)
    deposit_thb: Mapped[Decimal] = mapped_column(MONEY, default=Decimal(0))
    message: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16), default="PENDING")
    created_at: Mapped[datetime] = mapped_column(TS, default=utcnow)

    listing: Mapped[ProduceListing] = relationship(back_populates="offers")
    purchase_request: Mapped[PurchaseRequest | None] = relationship(back_populates="offers")
    buyer_org: Mapped[Organization] = relationship()


# --- Allocation and contracts ---------------------------------------------------


class AllocationPlan(Base):
    __tablename__ = "allocation_plans"

    id: Mapped[uuid.UUID] = pk()
    listing_id: Mapped[uuid.UUID] = fk("produce_listings.id")
    strategy: Mapped[str] = mapped_column(String(24))
    total_kg: Mapped[Decimal] = mapped_column(QTY)
    expected_revenue: Mapped[Decimal] = mapped_column(MONEY)
    created_by: Mapped[uuid.UUID] = fk("users.id")
    created_at: Mapped[datetime] = mapped_column(TS, default=utcnow)

    items: Mapped[list["AllocationItem"]] = relationship(back_populates="plan")


class AllocationItem(Base):
    __tablename__ = "allocation_items"

    id: Mapped[uuid.UUID] = pk()
    plan_id: Mapped[uuid.UUID] = fk("allocation_plans.id")
    offer_id: Mapped[uuid.UUID] = fk("purchase_offers.id")
    quantity_kg: Mapped[Decimal] = mapped_column(QTY)

    plan: Mapped[AllocationPlan] = relationship(back_populates="items")


class Contract(Base):
    """A HarvestLock agreement with one buyer. Also carries the order state machine."""

    __tablename__ = "contracts"

    id: Mapped[uuid.UUID] = pk()
    code: Mapped[str] = mapped_column(String(32), unique=True)
    listing_id: Mapped[uuid.UUID] = fk("produce_listings.id")
    offer_id: Mapped[uuid.UUID] = fk("purchase_offers.id")
    plan_id: Mapped[uuid.UUID | None] = fk("allocation_plans.id", nullable=True)
    farmer_org_id: Mapped[uuid.UUID] = fk("organizations.id")
    buyer_org_id: Mapped[uuid.UUID] = fk("organizations.id")
    quantity_kg: Mapped[Decimal] = mapped_column(QTY)
    status: Mapped[str] = mapped_column(String(24))  # HarvestLock status
    order_status: Mapped[str] = mapped_column(String(32), index=True)  # order state machine
    current_version: Mapped[int] = mapped_column(Integer, default=1)
    # A proposed amendment awaiting the other party (never edits the accepted version in place).
    proposed_version: Mapped[int | None] = mapped_column(Integer)
    reservation_expires_at: Mapped[datetime | None] = mapped_column(TS)
    created_at: Mapped[datetime] = mapped_column(TS, default=utcnow)
    confirmed_at: Mapped[datetime | None] = mapped_column(TS)
    completed_at: Mapped[datetime | None] = mapped_column(TS)

    listing: Mapped[ProduceListing] = relationship(back_populates="contracts")
    offer: Mapped[Offer] = relationship()
    farmer_org: Mapped[Organization] = relationship(foreign_keys=[farmer_org_id])
    buyer_org: Mapped[Organization] = relationship(foreign_keys=[buyer_org_id])
    versions: Mapped[list["ContractVersion"]] = relationship(
        back_populates="contract", order_by="ContractVersion.version"
    )
    acceptances: Mapped[list["ContractAcceptance"]] = relationship(back_populates="contract")
    lots: Mapped[list["ProduceLot"]] = relationship(
        back_populates="contract", order_by="ProduceLot.created_at"
    )
    settlement: Mapped["Settlement | None"] = relationship(back_populates="contract")

    @property
    def terms(self) -> dict:
        return next(v.terms for v in self.versions if v.version == self.current_version)


class ContractVersion(Base):
    __tablename__ = "contract_versions"
    __table_args__ = (UniqueConstraint("contract_id", "version"),)

    id: Mapped[uuid.UUID] = pk()
    contract_id: Mapped[uuid.UUID] = fk("contracts.id")
    version: Mapped[int] = mapped_column(Integer)
    terms: Mapped[dict] = mapped_column(JSON)
    terms_hash: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(16), default="PROPOSED", server_default="ACCEPTED")  # PROPOSED | ACCEPTED | REJECTED | SUPERSEDED
    reason: Mapped[str | None] = mapped_column(Text)
    proposed_by_org_id: Mapped[uuid.UUID | None] = fk("organizations.id", nullable=True)
    created_by: Mapped[uuid.UUID] = fk("users.id")
    created_at: Mapped[datetime] = mapped_column(TS, default=utcnow)

    contract: Mapped[Contract] = relationship(back_populates="versions")


class ContractAcceptance(Base):
    __tablename__ = "contract_acceptances"
    __table_args__ = (UniqueConstraint("contract_id", "version", "organization_id"),)

    id: Mapped[uuid.UUID] = pk()
    contract_id: Mapped[uuid.UUID] = fk("contracts.id")
    version: Mapped[int] = mapped_column(Integer)
    organization_id: Mapped[uuid.UUID] = fk("organizations.id")
    user_id: Mapped[uuid.UUID] = fk("users.id")
    terms_hash: Mapped[str] = mapped_column(String(64))
    # Phase 2 demo e-signature: typed full name + explicit consent (no third-party e-signature provider).
    signature_name: Mapped[str | None] = mapped_column(String(120))
    method: Mapped[str] = mapped_column(String(32), default="TYPED_NAME", server_default="AUTHENTICATED_CLICK")
    accepted_at: Mapped[datetime] = mapped_column(TS, default=utcnow)

    contract: Mapped[Contract] = relationship(back_populates="acceptances")
    user: Mapped[User] = relationship()


# --- Logistics and quality ----------------------------------------------------------


class ProduceLot(Base):
    __tablename__ = "produce_lots"

    id: Mapped[uuid.UUID] = pk()
    code: Mapped[str] = mapped_column(String(48), unique=True)
    # Opaque token behind the lot's QR code; the QR never carries personal data.
    trace_token: Mapped[str | None] = mapped_column(String(32), unique=True, default=lambda: secrets.token_urlsafe(12))
    contract_id: Mapped[uuid.UUID] = fk("contracts.id")
    harvest_date: Mapped[date] = mapped_column(Date)
    harvested_kg: Mapped[Decimal] = mapped_column(QTY)
    status: Mapped[str] = mapped_column(String(24))
    vehicle: Mapped[str | None] = mapped_column(String(64))
    transport_operator: Mapped[str | None] = mapped_column(String(120))
    gross_kg: Mapped[Decimal | None] = mapped_column(QTY)
    tare_kg: Mapped[Decimal | None] = mapped_column(QTY)
    net_kg: Mapped[Decimal | None] = mapped_column(QTY)
    dispatched_at: Mapped[datetime | None] = mapped_column(TS)
    received_kg: Mapped[Decimal | None] = mapped_column(QTY)
    received_at: Mapped[datetime | None] = mapped_column(TS)
    created_at: Mapped[datetime] = mapped_column(TS, default=utcnow)

    contract: Mapped[Contract] = relationship(back_populates="lots")
    inspections: Mapped[list["QcInspection"]] = relationship(back_populates="lot")


class QcInspection(Base):
    __tablename__ = "qc_inspections"

    id: Mapped[uuid.UUID] = pk()
    lot_id: Mapped[uuid.UUID] = fk("produce_lots.id")
    contract_id: Mapped[uuid.UUID] = fk("contracts.id")
    inspector_user_id: Mapped[uuid.UUID] = fk("users.id")
    inspected_at: Mapped[datetime] = mapped_column(TS, default=utcnow)
    received_kg: Mapped[Decimal] = mapped_column(QTY)
    accepted_kg: Mapped[Decimal] = mapped_column(QTY)
    rejected_kg: Mapped[Decimal] = mapped_column(QTY)
    rejection_reason: Mapped[str | None] = mapped_column(String(24))
    sampling_method: Mapped[str] = mapped_column(String(255))
    evidence_note: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)
    flags: Mapped[list] = mapped_column(JSON, default=list)
    # Set when the inspector started from an AI photo suggestion (the decision is still the inspector's).
    ai_run_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)

    lot: Mapped[ProduceLot] = relationship(back_populates="inspections")
    inspector: Mapped[User] = relationship()
    grade_items: Mapped[list["QcGradeItem"]] = relationship(back_populates="inspection")


class QcGradeItem(Base):
    __tablename__ = "qc_grade_items"

    id: Mapped[uuid.UUID] = pk()
    inspection_id: Mapped[uuid.UUID] = fk("qc_inspections.id")
    grade: Mapped[str] = mapped_column(String(8))
    quantity_kg: Mapped[Decimal] = mapped_column(QTY)

    inspection: Mapped[QcInspection] = relationship(back_populates="grade_items")


# --- Financial and reputation -------------------------------------------------------------


class Settlement(Base):
    __tablename__ = "settlements"

    id: Mapped[uuid.UUID] = pk()
    contract_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("contracts.id"), unique=True)
    inspection_id: Mapped[uuid.UUID] = fk("qc_inspections.id")
    lines: Mapped[list] = mapped_column(JSON)
    gross_amount: Mapped[Decimal] = mapped_column(MONEY)
    deposit_amount: Mapped[Decimal] = mapped_column(MONEY)
    net_amount: Mapped[Decimal] = mapped_column(MONEY)
    paid_amount: Mapped[Decimal] = mapped_column(MONEY, default=Decimal(0))
    due_date: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(24))
    created_at: Mapped[datetime] = mapped_column(TS, default=utcnow)

    contract: Mapped[Contract] = relationship(back_populates="settlement")
    payments: Mapped[list["Payment"]] = relationship(back_populates="settlement")


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[uuid.UUID] = pk()
    settlement_id: Mapped[uuid.UUID] = fk("settlements.id")
    amount: Mapped[Decimal] = mapped_column(MONEY)
    reference: Mapped[str] = mapped_column(String(120))
    idempotency_key: Mapped[str | None] = mapped_column(String(80), unique=True)
    recorded_by: Mapped[uuid.UUID] = fk("users.id")
    paid_at: Mapped[datetime] = mapped_column(TS, default=utcnow)

    settlement: Mapped[Settlement] = relationship(back_populates="payments")


class TrustEvent(Base):
    __tablename__ = "trust_events"

    id: Mapped[uuid.UUID] = pk()
    buyer_org_id: Mapped[uuid.UUID] = fk("organizations.id")
    dimension: Mapped[str] = mapped_column(String(16))  # PAYMENT | PICKUP | CONTRACT | QC | DISPUTE
    success: Mapped[bool] = mapped_column(Boolean)
    verified: Mapped[bool] = mapped_column(Boolean, default=True)
    transaction_ref: Mapped[str] = mapped_column(String(48))
    contract_id: Mapped[uuid.UUID | None] = fk("contracts.id", nullable=True)
    note: Mapped[str | None] = mapped_column(Text)
    occurred_at: Mapped[datetime] = mapped_column(TS, default=utcnow)


class Dispute(Base):
    __tablename__ = "disputes"

    id: Mapped[uuid.UUID] = pk()
    code: Mapped[str] = mapped_column(String(32), unique=True)
    contract_id: Mapped[uuid.UUID] = fk("contracts.id")
    category: Mapped[str] = mapped_column(String(32))
    description: Mapped[str] = mapped_column(Text)
    opened_by_user_id: Mapped[uuid.UUID] = fk("users.id")
    opened_by_org_id: Mapped[uuid.UUID] = fk("organizations.id")
    against_org_id: Mapped[uuid.UUID] = fk("organizations.id")
    disputed_amount: Mapped[Decimal] = mapped_column(MONEY, default=Decimal(0))
    held_amount: Mapped[Decimal] = mapped_column(MONEY, default=Decimal(0))
    status: Mapped[str] = mapped_column(String(32), index=True)
    previous_order_status: Mapped[str] = mapped_column(String(32))
    response_deadline: Mapped[datetime] = mapped_column(TS)
    reviewer_user_id: Mapped[uuid.UUID | None] = fk("users.id", nullable=True)
    reviewer_notes: Mapped[str | None] = mapped_column(Text)
    proposed_adjustment: Mapped[Decimal | None] = mapped_column(MONEY)
    outcome: Mapped[str | None] = mapped_column(String(32))  # BUYER_RESPONSIBLE | FARMER_RESPONSIBLE | SHARED | NO_FAULT
    resolution: Mapped[str | None] = mapped_column(Text)
    settlement_adjustment: Mapped[Decimal | None] = mapped_column(MONEY)
    created_at: Mapped[datetime] = mapped_column(TS, default=utcnow)
    resolved_at: Mapped[datetime | None] = mapped_column(TS)

    contract: Mapped[Contract] = relationship()
    opened_by: Mapped[User] = relationship(foreign_keys=[opened_by_user_id])
    opened_by_org: Mapped[Organization] = relationship(foreign_keys=[opened_by_org_id])
    against_org: Mapped[Organization] = relationship(foreign_keys=[against_org_id])
    reviewer: Mapped[User | None] = relationship(foreign_keys=[reviewer_user_id])
    statements: Mapped[list["DisputeStatement"]] = relationship(
        back_populates="dispute", order_by="DisputeStatement.created_at"
    )


class DisputeStatement(Base):
    __tablename__ = "dispute_statements"

    id: Mapped[uuid.UUID] = pk()
    dispute_id: Mapped[uuid.UUID] = fk("disputes.id")
    organization_id: Mapped[uuid.UUID] = fk("organizations.id")
    user_id: Mapped[uuid.UUID] = fk("users.id")
    body: Mapped[str] = mapped_column(Text)
    evidence_note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(TS, default=utcnow)

    dispute: Mapped[Dispute] = relationship(back_populates="statements")
    user: Mapped[User] = relationship()
    organization: Mapped[Organization] = relationship()


class EvidenceFile(Base):
    """Uploaded evidence (photos, weighing slips, payment proof). Stored privately; served via short-lived signed URLs."""

    __tablename__ = "evidence_files"

    id: Mapped[uuid.UUID] = pk()
    contract_id: Mapped[uuid.UUID] = fk("contracts.id")
    entity_type: Mapped[str] = mapped_column(String(24))  # lot | inspection | dispute | settlement
    entity_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    uploaded_by: Mapped[uuid.UUID] = fk("users.id")
    organization_id: Mapped[uuid.UUID] = fk("organizations.id")
    filename: Mapped[str] = mapped_column(String(255))
    content_type: Mapped[str] = mapped_column(String(80))
    size_bytes: Mapped[int] = mapped_column(Integer)
    sha256: Mapped[str] = mapped_column(String(64))
    storage_key: Mapped[str] = mapped_column(String(255))
    note: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(TS, default=utcnow)

    uploader: Mapped[User] = relationship()


class TrustAppeal(Base):
    """A buyer's appeal against one AgriTrust event. An accepted appeal un-verifies the event and records before/after."""

    __tablename__ = "trust_appeals"

    id: Mapped[uuid.UUID] = pk()
    buyer_org_id: Mapped[uuid.UUID] = fk("organizations.id")
    trust_event_id: Mapped[uuid.UUID] = fk("trust_events.id")
    submitted_by: Mapped[uuid.UUID] = fk("users.id")
    reason: Mapped[str] = mapped_column(Text)
    evidence_note: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16), default="OPEN")  # OPEN | ACCEPTED | REJECTED
    reviewer_user_id: Mapped[uuid.UUID | None] = fk("users.id", nullable=True)
    decision_note: Mapped[str | None] = mapped_column(Text)
    score_before: Mapped[float | None] = mapped_column(Numeric(5, 1))
    score_after: Mapped[float | None] = mapped_column(Numeric(5, 1))
    created_at: Mapped[datetime] = mapped_column(TS, default=utcnow)
    decided_at: Mapped[datetime | None] = mapped_column(TS)

    event: Mapped[TrustEvent] = relationship()
    buyer_org: Mapped[Organization] = relationship()


class QualityStandard(Base):
    """Per-fruit grading template used by GradeProof (overall_flow §13: not one template for all produce)."""

    __tablename__ = "quality_standards"

    id: Mapped[uuid.UUID] = pk()
    product_type: Mapped[str] = mapped_column(String(32), unique=True)
    grades: Mapped[list] = mapped_column(JSON)  # [{"grade": "A", "criteria": "..."}]
    sampling_method: Mapped[str] = mapped_column(String(255))
    updated_by: Mapped[uuid.UUID | None] = fk("users.id", nullable=True)
    updated_at: Mapped[datetime] = mapped_column(TS, default=utcnow)


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[uuid.UUID] = pk()
    organization_id: Mapped[uuid.UUID] = fk("organizations.id")
    title: Mapped[str] = mapped_column(String(160))
    body: Mapped[str] = mapped_column(Text)
    link: Mapped[str | None] = mapped_column(String(255))
    read_at: Mapped[datetime | None] = mapped_column(TS)
    created_at: Mapped[datetime] = mapped_column(TS, default=utcnow, index=True)


class AiRun(Base):
    """Audit record of every AI call: task, model, prompt version, input hash and output (Business & Legals/legal-ai.md)."""

    __tablename__ = "ai_runs"

    id: Mapped[uuid.UUID] = pk()
    task: Mapped[str] = mapped_column(String(32), index=True)  # CONTRACT_REVIEW | LEGAL_QA | QC_PHOTO_ASSIST
    model: Mapped[str] = mapped_column(String(64))
    prompt_version: Mapped[str] = mapped_column(String(32))
    input_hash: Mapped[str] = mapped_column(String(64), index=True)
    entity_type: Mapped[str | None] = mapped_column(String(32))
    entity_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, index=True)
    user_id: Mapped[uuid.UUID | None] = fk("users.id", nullable=True)
    output: Mapped[dict] = mapped_column(JSON)
    input_tokens: Mapped[int | None] = mapped_column(Integer)
    output_tokens: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(TS, default=utcnow)


# --- System -------------------------------------------------------------------------------


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = pk()
    entity_type: Mapped[str] = mapped_column(String(32))
    entity_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    entity_code: Mapped[str | None] = mapped_column(String(48))
    action: Mapped[str] = mapped_column(String(48))
    from_status: Mapped[str | None] = mapped_column(String(32))
    to_status: Mapped[str | None] = mapped_column(String(32))
    actor_user_id: Mapped[uuid.UUID | None] = fk("users.id", nullable=True)
    actor_role: Mapped[str] = mapped_column(String(16))  # FARMER | BUYER | INSPECTOR | ADMIN | SYSTEM
    contract_id: Mapped[uuid.UUID | None] = fk("contracts.id", nullable=True)
    farmer_org_id: Mapped[uuid.UUID | None] = fk("organizations.id", nullable=True)
    buyer_org_id: Mapped[uuid.UUID | None] = fk("organizations.id", nullable=True)
    message: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(TS, default=utcnow, index=True)

    actor: Mapped[User | None] = relationship()
