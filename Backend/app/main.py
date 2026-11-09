from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import models  # noqa: F401  (register tables on Base.metadata)
from app.config import settings
from app.db import Base, engine
from app.routers import health, purchase_requests


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Dev convenience only. Replace with Alembic migrations before real data exists.
    Base.metadata.create_all(engine)
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api")
app.include_router(purchase_requests.router, prefix="/api")
