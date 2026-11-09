from datetime import date, datetime, timezone
from decimal import Decimal as D

import pytest

from app.services import allocation, matching, settlement, trust
from app.services.orders import TRANSITIONS


# --- matching ---------------------------------------------------------------

def _supply(**kw):
    base = dict(
        product_type="mango", variety="น้ำดอกไม้", harvest_start=date(2026, 12, 15),
        harvest_end=date(2026, 12, 18), grades=["A", "B"], available_kg=5000,
        province="จันทบุรี", reliability=None,
    )
    return matching.Supply(**{**base, **kw})


def _demand(**kw):
    base = dict(
        product_type="mango", variety="น้ำดอกไม้", delivery_start=date(2026, 12, 15),
        delivery_end=date(2026, 12, 18), grades=["A"], quantity_kg=3000, min_quantity_kg=None,
        destination_province="กรุงเทพมหานคร",
    )
    return matching.Demand(**{**base, **kw})


def test_matching_eligible_candidate_scores_in_range():
    r = matching.evaluate(_supply(), _demand())
    assert r["eligible"] and r["unmet"] == []
    assert 0 < r["score"] <= 100
    assert r["factors"]["timing"] == 100 and r["factors"]["quantity"] == 100


@pytest.mark.parametrize(
    "supply_kw,demand_kw",
    [
        ({"product_type": "durian"}, {}),
        ({"harvest_start": date(2027, 1, 1), "harvest_end": date(2027, 1, 5)}, {}),
        ({"available_kg": 500}, {}),
        ({"grades": ["C"]}, {}),
    ],
)
def test_matching_hard_constraints_exclude(supply_kw, demand_kw):
    assert not matching.evaluate(_supply(**supply_kw), _demand(**demand_kw))["eligible"]


# --- allocation ---------------------------------------------------------------

OFFERS = [
    allocation.OfferDemand("B", D(3000), None, D(45)),
    allocation.OfferDemand("C", D(2500), None, D(48)),
    allocation.OfferDemand("D", D(2000), None, D(50)),
]


def test_demo_manual_allocation_is_valid_and_revenue_matches():
    items = {"B": D(2000), "C": D(2000), "D": D(1000)}
    assert allocation.validate(D(5000), OFFERS, items) == []
    s = allocation.summarize(D(5000), OFFERS, items)
    assert s["remaining_kg"] == 0
    assert s["expected_revenue"] == D(2000 * 45 + 2000 * 48 + 1000 * 50)


def test_allocation_rejects_overbooking_and_over_demand():
    errors = allocation.validate(D(5000), OFFERS, {"B": D(3000), "C": D(2600)})
    assert any("เกินผลผลิต" in e for e in errors)
    assert any("เกินกว่าที่ผู้ซื้อต้องการ" in e for e in errors)


def test_proportional_never_exceeds_supply_and_respects_minimum():
    offers = OFFERS[:2] + [allocation.OfferDemand("D", D(2000), D(1500), D(50))]
    items, warnings = allocation.proportional(D(5000), offers)
    assert sum(items.values()) <= D(5000)
    assert items["D"] == 0 and warnings
    assert all(v % 10 == 0 for v in items.values())


# --- settlement -------------------------------------------------------------

def test_settlement_matches_spec_example():
    r = settlement.compute({"A": D(1600), "B": D(300)}, {"A": 45, "B": 30}, D(100), D(10000))
    assert r["gross"] == D(81000) and r["net"] == D(71000)


def test_discrepancy_flags():
    terms = {"quantity_kg": 2000, "tolerance_pct": 5, "grade_prices": {"A": 45}, "rejection_conditions": ["ROT"]}
    codes = {f["code"] for f in settlement.discrepancy_flags(terms, D(1800), {"A": D(1700), "C": D(50)}, D(50), "OTHER", "")}
    assert codes == {"QUANTITY_SHORTFALL", "GRADE_NOT_IN_CONTRACT", "UNAUTHORIZED_REJECTION", "QC_EVIDENCE_MISSING"}
    assert settlement.discrepancy_flags(terms, D(2000), {"A": D(2000)}, D(0), None, "photo set 1") == []


# --- AgriTrust ----------------------------------------------------------------

NOW = datetime(2026, 11, 1, tzinfo=timezone.utc)


def test_trust_insufficient_data_is_not_zero():
    r = trust.compute([trust.Event("PAYMENT", True, "T1", NOW)])
    assert r["insufficient_data"] and r["score"] is None


def test_trust_score_weighted_and_smoothed():
    events = [trust.Event(dim, True, f"T{i}", NOW) for i in range(10) for dim, _, _ in trust.DIMENSIONS]
    r = trust.compute(events)
    assert r["transactions"] == 10
    assert r["score"] == pytest.approx(100 * 11 / 12, abs=0.2)  # smoothing keeps a perfect record below 100


# --- state machine -------------------------------------------------------------

def test_happy_path_is_reachable():
    path = ["AWAITING_CONFIRMATION", "CONFIRMED", "HARVESTED", "IN_TRANSIT", "DELIVERED", "QC_PENDING",
            "QC_ACCEPTED", "PAYMENT_PENDING", "PAID", "COMPLETED"]
    for a, b in zip(path, path[1:]):
        assert b in TRANSITIONS[a]
    assert "COMPLETED" not in TRANSITIONS
