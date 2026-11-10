import uuid
from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.catalog import PRODUCTS, PROVINCES, REJECTION_REASONS


def _check_product(v: str) -> str:
    if v not in PRODUCTS:
        raise ValueError("ไม่รู้จักชนิดผลผลิตนี้")
    return v


def _check_grades(v: list[str]) -> list[str]:
    cleaned = sorted({g.strip().upper() for g in v if g.strip()})
    if not cleaned:
        raise ValueError("ต้องระบุอย่างน้อยหนึ่งเกรด")
    return cleaned


class ListingCreate(BaseModel):
    product_type: str
    variety: str | None = Field(default=None, max_length=64)
    estimated_qty_kg: Decimal = Field(gt=0, le=10_000_000)
    harvest_start: date
    harvest_end: date
    expected_grades: list[str]
    price_min: Decimal | None = Field(default=None, gt=0)
    price_max: Decimal | None = Field(default=None, gt=0)
    notes: str | None = Field(default=None, max_length=2000)

    _product = field_validator("product_type")(_check_product)
    _grades = field_validator("expected_grades")(_check_grades)

    @model_validator(mode="after")
    def check(self):
        if self.harvest_end < self.harvest_start:
            raise ValueError("วันสิ้นสุดเก็บเกี่ยวต้องไม่ก่อนวันเริ่ม")
        if self.price_min and self.price_max and self.price_max < self.price_min:
            raise ValueError("ราคาสูงสุดต้องไม่ต่ำกว่าราคาต่ำสุด")
        return self


class PurchaseRequestCreate(BaseModel):
    product_type: str
    variety: str | None = Field(default=None, max_length=64)
    quantity_kg: Decimal = Field(gt=0, le=10_000_000)
    min_quantity_kg: Decimal | None = Field(default=None, gt=0)
    target_price: Decimal | None = Field(default=None, gt=0)
    accepted_grades: list[str]
    quality_notes: str | None = Field(default=None, max_length=2000)
    delivery_start: date
    delivery_end: date
    destination_province: str
    payment_terms_days: int = Field(default=3, ge=0, le=90)
    expires_on: date | None = None
    sourcing_mode: Literal["SINGLE", "MULTI"] = "MULTI"
    max_suppliers: int | None = Field(default=None, ge=2, le=20)

    _product = field_validator("product_type")(_check_product)
    _grades = field_validator("accepted_grades")(_check_grades)

    @field_validator("destination_province")
    @classmethod
    def check_province(cls, v: str) -> str:
        if v not in PROVINCES:
            raise ValueError("ไม่รู้จักจังหวัดนี้")
        return v

    @model_validator(mode="after")
    def check(self):
        if self.delivery_end < self.delivery_start:
            raise ValueError("วันสิ้นสุดรับสินค้าต้องไม่ก่อนวันเริ่ม")
        if self.min_quantity_kg and self.min_quantity_kg > self.quantity_kg:
            raise ValueError("ปริมาณขั้นต่ำต้องไม่เกินปริมาณที่ต้องการ")
        if self.sourcing_mode == "SINGLE":
            # One supplier must deliver the full quantity.
            self.min_quantity_kg = self.quantity_kg
            self.max_suppliers = None
        return self


class OfferCreate(BaseModel):
    listing_id: uuid.UUID
    purchase_request_id: uuid.UUID | None = None
    quantity_kg: Decimal = Field(gt=0, le=10_000_000)
    min_quantity_kg: Decimal | None = Field(default=None, gt=0)
    grade_prices: dict[str, Decimal]
    payment_terms_days: int = Field(default=3, ge=0, le=90)
    deposit_thb: Decimal = Field(default=Decimal(0), ge=0)
    message: str | None = Field(default=None, max_length=2000)

    @field_validator("grade_prices")
    @classmethod
    def check_prices(cls, v: dict[str, Decimal]) -> dict[str, Decimal]:
        cleaned = {k.strip().upper(): p for k, p in v.items() if k.strip()}
        if not cleaned:
            raise ValueError("ต้องระบุราคาอย่างน้อยหนึ่งเกรด")
        if any(p <= 0 for p in cleaned.values()):
            raise ValueError("ราคาต้องมากกว่า 0")
        return cleaned

    @model_validator(mode="after")
    def check(self):
        if self.min_quantity_kg and self.min_quantity_kg > self.quantity_kg:
            raise ValueError("ปริมาณขั้นต่ำต้องไม่เกินปริมาณที่เสนอซื้อ")
        return self


class AllocationItemIn(BaseModel):
    offer_id: uuid.UUID
    quantity_kg: Decimal = Field(ge=0)


STRATEGIES = Literal["MANUAL", "PROPORTIONAL", "MAX_NET_REVENUE", "RISK_AWARE"]


class AllocationPreview(BaseModel):
    strategy: STRATEGIES = "MANUAL"
    items: list[AllocationItemIn] = []


class AllocationConfirm(BaseModel):
    strategy: STRATEGIES = "MANUAL"
    items: list[AllocationItemIn]


class Reason(BaseModel):
    reason: str | None = Field(default=None, max_length=1000)


class HarvestCreate(BaseModel):
    harvest_date: date
    harvested_kg: Decimal = Field(gt=0)


class DispatchIn(BaseModel):
    vehicle: str = Field(min_length=1, max_length=64)
    transport_operator: str | None = Field(default=None, max_length=120)
    gross_kg: Decimal = Field(gt=0)
    tare_kg: Decimal = Field(ge=0)

    @model_validator(mode="after")
    def check(self):
        if self.tare_kg >= self.gross_kg:
            raise ValueError("น้ำหนักภาชนะต้องน้อยกว่าน้ำหนักรวม")
        return self


class ReceiveIn(BaseModel):
    received_kg: Decimal = Field(gt=0)


class GradeQty(BaseModel):
    grade: str = Field(min_length=1, max_length=8)
    quantity_kg: Decimal = Field(ge=0)


class InspectionCreate(BaseModel):
    grades: list[GradeQty]
    rejected_kg: Decimal = Field(default=Decimal(0), ge=0)
    rejection_reason: str | None = None
    sampling_method: str = Field(min_length=1, max_length=255)
    evidence_note: str | None = Field(default=None, max_length=2000)
    notes: str | None = Field(default=None, max_length=2000)
    ai_run_id: uuid.UUID | None = None  # the AI photo suggestion the inspector started from, if any

    @model_validator(mode="after")
    def check(self):
        if self.rejected_kg > 0 and not self.rejection_reason:
            raise ValueError("กรุณาระบุเหตุผลการปฏิเสธ")
        if self.rejection_reason and self.rejection_reason not in REJECTION_REASONS:
            raise ValueError("ไม่รู้จักเหตุผลการปฏิเสธนี้")
        return self


class PaymentCreate(BaseModel):
    amount: Decimal = Field(gt=0)
    reference: str = Field(min_length=1, max_length=120)


class Signature(BaseModel):
    """Phase 2 demo e-signature: typed full name plus explicit consent."""

    signature_name: str = Field(min_length=2, max_length=120)
    consent: bool

    @model_validator(mode="after")
    def check(self):
        if not self.consent:
            raise ValueError("ต้องยืนยันว่ายอมรับเงื่อนไข")
        return self


class AmendmentChanges(BaseModel):
    quantity_kg: float | None = Field(default=None, gt=0)
    grade_prices: dict[str, float] | None = None
    delivery_window: list[date] | None = None
    payment_due_days: int | None = Field(default=None, ge=0, le=90)
    deposit_thb: float | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def check(self):
        if self.delivery_window is not None and (len(self.delivery_window) != 2 or self.delivery_window[1] < self.delivery_window[0]):
            raise ValueError("ช่วงส่งมอบไม่ถูกต้อง")
        if self.grade_prices is not None and (not self.grade_prices or any(p <= 0 for p in self.grade_prices.values())):
            raise ValueError("ราคาต้องมากกว่า 0")
        return self


class AmendmentCreate(BaseModel):
    changes: AmendmentChanges
    reason: str = Field(min_length=3, max_length=1000)


class AmendmentResponse(BaseModel):
    accept: bool
    signature_name: str | None = Field(default=None, max_length=120)
    consent: bool = False


class ShortfallIn(BaseModel):
    actual_kg: Decimal = Field(ge=0)
    reason: str | None = Field(default=None, max_length=1000)
