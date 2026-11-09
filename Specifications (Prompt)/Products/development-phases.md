# Development Phases

The prototype is built in two phases. Phase 1 makes the core ordering workflow work end to end on a real backend and database; Phase 2 adds the advanced operations, real sign-in, and online deployment. This maps onto [roadmap.md](roadmap.md) Phase 0–1 and part of Phase 2.

## Phase 1 — Working MVP (done)

Every step of the demo scenario (overall_flow §20) runs through the API and is stored in the database:

| Step | Pages | API |
| --- | --- | --- |
| Demo sign-in and role selection | `/login` | `GET /api/demo/users`, `X-Demo-User` header |
| Role dashboards (Farmer, Buyer, Inspector, Admin) | `/dashboard` | `GET /api/dashboard` |
| Produce listings with inventory states | `/produce`, `/produce/new`, `/produce/{id}` | `/api/listings` |
| Purchase requests (4-step wizard) | `/requests`, `/requests/new` | `/api/purchase-requests` |
| Buyer-first matching (heuristic, explainable) | `/requests/{id}`, `/marketplace` | `GET /api/purchase-requests/{id}/matches` |
| Offer submission | `/farms`, `/requests/{id}`, `/offers` | `/api/offers` |
| AgriTrust buyer profiles | `/buyers`, `/buyers/{id}` | `GET /api/organizations/{id}/trust` |
| Manual and proportional multi-buyer allocation | `/allocation`, `/allocation/{id}` | `/api/listings/{id}/allocation/preview`, `/confirm` |
| HarvestLock agreements (versioned terms, SHA-256 hash, two-party acceptance, reservation expiry) | `/contracts`, `/contracts/{id}` | `/api/contracts/{id}/accept`, `/decline` |
| Order state machine with audit trail | `/contracts/{id}` (stepper + swimlane timeline) | every transition writes `audit_logs` |
| Harvest, lot, dispatch, receipt | `/contracts/{id}`, `/deliveries` | `/api/contracts/{id}/lots`, `/api/lots/{id}/dispatch`, `/receive` |
| GradeProof inspection with contract comparison flags | `/contracts/{id}`, `/quality` | `POST /api/lots/{id}/inspections` |
| Settlement calculation and simulated, idempotent payment | `/contracts/{id}`, `/payments` | `/api/settlements/{id}/payments` |
| Completion feeds verified AgriTrust events | `/contracts/{id}` | `POST /api/contracts/{id}/complete` |
| Transaction history | `/history` | `GET /api/history` |

**Explicitly simulated in Phase 1** (labelled in the UI): sign-in (demo user picker), electronic acceptance (authenticated click, no e-signature), payments and deposits (no money moves, no escrow), and QC evidence (a text note instead of uploaded files).

**Verification:** backend unit and end-to-end tests (`Backend/tests`), the full demo flow run against Postgres, and a headless-browser run of the 20-step demo through the UI.

## Phase 2 — Advanced operations and going online

| Area | Work | Spec |
| --- | --- | --- |
| Sign-in and deployment | Google sign-in via Supabase Auth replacing `X-Demo-User`; JWT verification in FastAPI; onboarding and roles; Vercel + Cloud Run + Supabase | [deployment.md](../Technical/deployment.md) |
| Database | Alembic migrations instead of `create_all`; RLS / schema isolation on Supabase | [deployment.md](../Technical/deployment.md), [database.md](../Technical/database.md) |
| Allocation | Revenue optimization with OR-Tools (grade-aware, minimum lots, logistics cost); dynamic reallocation after cancellation or harvest shortfall | [allocation.md](../Technical/allocation.md) |
| HarvestLock | Amendments with version diff and re-acceptance; contract PDF; e-signature provider | [harvestlock.md](<../Business & Legals/harvestlock.md>) |
| Disputes | Dispute workflow, evidence gallery, reinspection, settlement adjustment, held amounts | [settlement-disputes.md](<../Business & Legals/settlement-disputes.md>) |
| Evidence | File uploads to Supabase Storage with signed URLs and hashes; QR traceability per lot; multiple lots per contract | [gradeproof.md](../Technical/gradeproof.md) |
| AgriTrust | Appeals with versioned recalculation | [agitrust.md](<../Business & Legals/agitrust.md>) |
| Admin | User management, business verification, per-fruit quality templates, trust and risk monitoring, analytics | overall_flow §5 |
| Notifications | Reservation expiry, pending acceptance, payment due | overall_flow §23 |

AI features (Learning-to-Rank matching, vision-assisted QC, forecasting, legal RAG) stay in roadmap Phase 3 and are added only when validated data exists.
