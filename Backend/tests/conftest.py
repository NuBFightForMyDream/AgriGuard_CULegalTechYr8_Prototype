import os

os.environ["DATABASE_URL"] = "sqlite:///./test.db"
os.environ["DEMO_SEED"] = "false"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.db import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.seed import seed, sid  # noqa: E402


@pytest.fixture()
def client():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        seed(db)
    with TestClient(app) as c:
        yield c
    Base.metadata.drop_all(engine)


def as_user(email: str) -> dict:
    return {"X-Demo-User": str(sid(email))}


FARMER = as_user("somchai@greenvalley.example")
BUYER_B = as_user("anan@freshfruit.example")
BUYER_C = as_user("malee@siamfruit.example")
BUYER_D = as_user("thana@easternwholesale.example")
INSPECTOR = as_user("preecha@agriguard.example")
