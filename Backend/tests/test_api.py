import os

os.environ["DATABASE_URL"] = "sqlite:///./test.db"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.db import Base, engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture()
def client():
    Base.metadata.drop_all(engine)
    with TestClient(app) as c:
        yield c
    Base.metadata.drop_all(engine)


VALID = {
    "product_type": "durian",
    "variety": "Monthong",
    "grade": "A",
    "quantity_kg": "1000",
    "delivery_start": "2026-05-01",
    "delivery_end": "2026-05-15",
    "location": "Chanthaburi",
}


def test_health(client):
    body = client.get("/api/health").json()
    assert body == {"status": "ok", "database": "ok", "dialect": "sqlite"}


def test_create_and_list_purchase_request(client):
    created = client.post("/api/purchase-requests", json=VALID)
    assert created.status_code == 201
    assert created.json()["status"] == "OPEN"

    listed = client.get("/api/purchase-requests").json()
    assert [pr["id"] for pr in listed] == [created.json()["id"]]


def test_rejects_invalid_window_and_quantity(client):
    bad = {**VALID, "quantity_kg": "0", "delivery_end": "2026-04-01"}
    assert client.post("/api/purchase-requests", json=bad).status_code == 422


def test_get_missing_returns_404(client):
    assert client.get("/api/purchase-requests/999").status_code == 404
