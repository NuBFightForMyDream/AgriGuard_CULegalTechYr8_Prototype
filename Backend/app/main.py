from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import models  # noqa: F401  (register tables on Base.metadata)
from app.config import settings
from app.db import Base, SessionLocal, engine
from app.routers import (
    contracts,
    dashboard,
    health,
    history,
    listings,
    lots,
    meta,
    offers,
    purchase_requests,
    settlements,
    trust,
)
from app.seed import seed_if_empty


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Dev convenience only. Replace with Alembic migrations before real data exists (Technical/deployment.md).
    Base.metadata.create_all(engine)
    if settings.demo_seed:
        with SessionLocal() as db:
            seed_if_empty(db)
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (health, meta, dashboard, listings, purchase_requests, offers, contracts, lots, settlements, trust, history):
    app.include_router(r.router, prefix="/api")
