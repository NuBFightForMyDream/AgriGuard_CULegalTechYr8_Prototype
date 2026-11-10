"""'Find a deal' feed for buyers: the best-matching farm listings across all of the buyer's open purchase requests."""

from fastapi import APIRouter
from sqlalchemy import select

from app.deps import DB, CurrentUser, require_role
from app.models import ProduceListing, PurchaseRequest
from app.routers.purchase_requests import _demand, _supply
from app.services import matching, sourcing
from app.services.inventory import expire_reservations
from app.views import listing_out, request_out

router = APIRouter(prefix="/deals", tags=["deals"])
PER_REQUEST = 3


@router.get("/suggestions")
def suggestions(db: DB, user: CurrentUser):
    require_role(user, "BUYER")
    expire_reservations(db)
    requests = db.scalars(select(PurchaseRequest).where(
        PurchaseRequest.buyer_org_id == user.organization_id,
        PurchaseRequest.status.in_(("OPEN", "PARTIALLY_FILLED")))).all()
    listings = db.scalars(select(ProduceListing)).all()
    cache: dict = {}
    out = []
    for r in requests:
        if not sourcing.accepting_offers(db, r)[0]:
            continue
        f = sourcing.fill(db, r)
        demand = _demand(r, f["remaining_kg"])
        request = request_out(r, f)
        offered = {o.listing_id for o in r.offers}
        recs = []
        for listing in listings:
            ev = matching.evaluate(_supply(db, listing, cache), demand)
            if ev["eligible"]:
                recs.append({"request": request, "listing": listing_out(listing), "score": ev["score"], "reasons": ev["reasons"],
                             "already_offered": listing.id in offered})
        recs.sort(key=lambda x: x["score"], reverse=True)
        out.extend(recs[:PER_REQUEST])
    out.sort(key=lambda x: x["score"], reverse=True)
    return out
