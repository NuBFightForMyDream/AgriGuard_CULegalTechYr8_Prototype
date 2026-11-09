from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class PurchaseRequestCreate(BaseModel):
    product_type: str = Field(min_length=1, max_length=64, examples=["durian"])
    variety: str | None = Field(default=None, max_length=64, examples=["Monthong"])
    grade: str | None = Field(default=None, max_length=32, examples=["A"])
    quantity_kg: Decimal = Field(gt=0, examples=[1000])
    delivery_start: date
    delivery_end: date
    location: str = Field(min_length=1, max_length=255, examples=["Chanthaburi"])

    @model_validator(mode="after")
    def check_window(self) -> "PurchaseRequestCreate":
        if self.delivery_end < self.delivery_start:
            raise ValueError("delivery_end must be on or after delivery_start")
        return self


class PurchaseRequestRead(PurchaseRequestCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    status: str
    created_at: datetime
