"""The richer demo (app/demo_scenarios.py) must keep working through the real API as the app changes."""

from collections import Counter
from datetime import datetime, timedelta, timezone

from app.demo_scenarios import DEALS, build
from tests.conftest import BUYER_B, FARMER, as_user

ADMIN = as_user("admin@agriguard.example")


def test_demo_scenarios_build_every_stage(client):
    build()
    contracts = client.get("/api/contracts", headers=ADMIN).json()
    by_status = Counter(c["order_status"] for c in contracts)
    assert len(contracts) == len(DEALS)
    for status in ("AWAITING_CONFIRMATION", "CONFIRMED", "HARVESTED", "IN_TRANSIT", "QC_PENDING", "PAYMENT_PENDING",
                   "PAYMENT_OVERDUE", "PAID", "COMPLETED", "DISPUTED"):
        assert by_status[status] >= 1, status
    # Played in the past: a completed deal started weeks ago, and its events keep their order.
    done = min((c for c in contracts if c["order_status"] == "COMPLETED"), key=lambda c: c["created_at"])
    detail = client.get(f"/api/contracts/{done['id']}", headers=ADMIN).json()
    times = [e["created_at"] for e in detail["timeline"] if e["contract_id"] == done["id"]]
    assert times == sorted(times)
    started = datetime.fromisoformat(detail["created_at"]).replace(tzinfo=timezone.utc)
    assert started < datetime.now(timezone.utc) - timedelta(days=7)
    # Chats and dashboards reflect it.
    assert len(client.get("/api/chats", headers=FARMER).json()) >= 5
    assert client.get("/api/dashboard", headers=BUYER_B).json()["trust"]["transactions"] >= 44
