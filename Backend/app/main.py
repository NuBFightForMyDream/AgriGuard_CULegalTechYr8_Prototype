from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import models  # noqa: F401  (register tables on Base.metadata)
from app.config import settings
from app.db import SessionLocal
from app.migrate import upgrade_to_head
from app.routers import (
    admin,
    ai,
    auth,
    chats,
    community,
    contracts,
    dashboard,
    deals,
    disputes,
    files,
    health,
    history,
    listings,
    lots,
    meta,
    notifications,
    offers,
    purchase_requests,
    settlements,
    trust,
)
from app.seed import seed_if_empty
from app.services.community import ensure_community
from app.services.standards import ensure_standards


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.run_migrations:
        upgrade_to_head()
    if settings.demo_seed:
        with SessionLocal() as db:
            seed_if_empty(db)
    with SessionLocal() as db:
        ensure_standards(db)
        ensure_community(db)
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=settings.cors_origin_regex,
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (health, auth, meta, admin, ai, notifications, chats, community, deals, dashboard, disputes, files, listings, purchase_requests, offers, contracts, lots, settlements, trust, history):
    app.include_router(r.router, prefix="/api")
