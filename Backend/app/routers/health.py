from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db import engine, get_db

router = APIRouter(tags=["health"])


@router.get("/health")
def health(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        database = "ok"
    except Exception as exc:  # report, don't crash, so the FE can show the problem
        database = f"error: {exc.__class__.__name__}"
    return {"status": "ok", "database": database, "dialect": engine.dialect.name}
