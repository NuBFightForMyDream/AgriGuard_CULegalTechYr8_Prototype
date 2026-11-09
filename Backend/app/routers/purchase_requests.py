from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import PurchaseRequest
from app.schemas import PurchaseRequestCreate, PurchaseRequestRead

router = APIRouter(prefix="/purchase-requests", tags=["purchase-requests"])


@router.get("", response_model=list[PurchaseRequestRead])
def list_purchase_requests(db: Session = Depends(get_db)) -> list[PurchaseRequest]:
    return list(db.scalars(select(PurchaseRequest).order_by(PurchaseRequest.id.desc())))


@router.post("", response_model=PurchaseRequestRead, status_code=status.HTTP_201_CREATED)
def create_purchase_request(
    payload: PurchaseRequestCreate, db: Session = Depends(get_db)
) -> PurchaseRequest:
    pr = PurchaseRequest(**payload.model_dump())
    db.add(pr)
    db.commit()
    db.refresh(pr)
    return pr


@router.get("/{pr_id}", response_model=PurchaseRequestRead)
def get_purchase_request(pr_id: int, db: Session = Depends(get_db)) -> PurchaseRequest:
    pr = db.get(PurchaseRequest, pr_id)
    if pr is None:
        raise HTTPException(status_code=404, detail="Purchase request not found")
    return pr
