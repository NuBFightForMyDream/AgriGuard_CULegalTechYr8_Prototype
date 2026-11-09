"""AgriTrust: evidence-based buyer reliability (Business & Legals/agitrust.md).

Not a credit score and not a probability of payment. Each dimension uses Bayesian smoothing so a
small sample cannot produce an extreme score.
"""

from dataclasses import dataclass
from datetime import date, datetime

DIMENSIONS: list[tuple[str, float, str]] = [
    ("PAYMENT", 0.30, "การชำระเงินตรงเวลา"),
    ("PICKUP", 0.25, "การรับสินค้าตามนัด"),
    ("CONTRACT", 0.20, "การปฏิบัติตามสัญญา"),
    ("QC", 0.15, "ความโปร่งใสในการตรวจคุณภาพ"),
    ("DISPUTE", 0.10, "การแก้ไขข้อพิพาท"),
]
MIN_TRANSACTIONS = 3
ALPHA = BETA = 1


@dataclass
class Event:
    dimension: str
    success: bool
    transaction_ref: str
    occurred_at: datetime


def smoothed(successes: int, trials: int) -> float:
    return 100 * (successes + ALPHA) / (trials + ALPHA + BETA)


def band(score: float) -> str:
    return "LOW_RISK" if score >= 85 else "MEDIUM_RISK" if score >= 70 else "HIGH_RISK"


def compute(events: list[Event]) -> dict:
    transactions = len({e.transaction_ref for e in events})
    dims = []
    for key, weight, label in DIMENSIONS:
        rel = [e for e in events if e.dimension == key]
        s, n = sum(e.success for e in rel), len(rel)
        score = smoothed(s, n)
        dims.append(
            {
                "key": key,
                "label": label,
                "weight": weight,
                "successes": s,
                "trials": n,
                "rate": round(100 * s / n, 1) if n else None,
                "score": round(score, 1),
                "contribution": round(weight * score, 1),
            }
        )
    if transactions < MIN_TRANSACTIONS:
        return {
            "insufficient_data": True,
            "score": None,
            "band": None,
            "transactions": transactions,
            "dimensions": dims,
        }
    total = sum(d["contribution"] for d in dims)
    return {
        "insufficient_data": False,
        "score": round(total, 1),
        "band": band(total),
        "transactions": transactions,
        "dimensions": dims,
    }


def monthly_history(events: list[Event], today: date, months: int = 12) -> list[dict]:
    """Score as it stood at the end of each of the last `months` months."""
    out = []
    y, m = today.year, today.month
    points = []
    for _ in range(months):
        points.append((y, m))
        y, m = (y - 1, 12) if m == 1 else (y, m - 1)
    for y, m in reversed(points):
        end = date(y + (m == 12), 1 if m == 12 else m + 1, 1)
        upto = [e for e in events if e.occurred_at.date() < end]
        out.append({"month": f"{y}-{m:02d}", "score": compute(upto)["score"]})
    return out
