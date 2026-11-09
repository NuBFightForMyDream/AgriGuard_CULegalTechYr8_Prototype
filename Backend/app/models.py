from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import CheckConstraint, Date, DateTime, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class PurchaseRequest(Base):
    """A buyer's request to purchase produce. Not a confirmed order (see ordering-flow.md)."""

    __tablename__ = "purchase_requests"
    __table_args__ = (
        CheckConstraint("quantity_kg > 0", name="ck_purchase_requests_quantity_positive"),
        CheckConstraint("delivery_end >= delivery_start", name="ck_purchase_requests_window"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    product_type: Mapped[str] = mapped_column(String(64))
    variety: Mapped[str | None] = mapped_column(String(64))
    grade: Mapped[str | None] = mapped_column(String(32))
    quantity_kg: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    delivery_start: Mapped[date] = mapped_column(Date)
    delivery_end: Mapped[date] = mapped_column(Date)
    location: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(32), default="OPEN")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
