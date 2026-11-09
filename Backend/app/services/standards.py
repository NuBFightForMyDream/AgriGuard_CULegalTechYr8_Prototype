from sqlalchemy import select
from sqlalchemy.orm import Session

from app.catalog import DEFAULT_SAMPLING_METHOD, GRADE_CRITERIA, PRODUCTS
from app.models import QualityStandard


def ensure_standards(db: Session) -> None:
    """Insert a grading template for any product that has none (admins edit them afterwards)."""
    have = set(db.scalars(select(QualityStandard.product_type)))
    for product, grades in GRADE_CRITERIA.items():
        if product not in have:
            db.add(QualityStandard(product_type=product, sampling_method=DEFAULT_SAMPLING_METHOD,
                                   grades=[{"grade": g, "criteria": c} for g, c in grades]))
    db.commit()


def grades_for(db: Session, product: str) -> list[str]:
    std = db.scalar(select(QualityStandard).where(QualityStandard.product_type == product))
    return [g["grade"] for g in std.grades] if std else PRODUCTS[product]["grades"]
