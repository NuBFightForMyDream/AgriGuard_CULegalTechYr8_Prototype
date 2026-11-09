# Development Phases

The prototype was built in two phases. Phase 1 made the core ordering workflow work end to end on a real backend and database; Phase 2 added the advanced operations, Google sign-in, and everything needed to deploy online. AI features stay in [roadmap.md](roadmap.md) Phase 3.

## Phase 1 — Working MVP (done)

Every step of the demo scenario (overall_flow §20) runs through the API and is stored in the database:

| Step | Pages | API |
| --- | --- | --- |
| Sign-in and role selection | `/login` | demo picker (`X-Demo-User`) |
| Role dashboards | `/dashboard` | `GET /api/dashboard` |
| Produce listings with inventory states | `/produce`, `/produce/new`, `/produce/{id}` | `/api/listings` |
| Purchase requests (4-step wizard) | `/requests`, `/requests/new` | `/api/purchase-requests` |
| Buyer-first matching (heuristic, explainable) | `/requests/{id}`, `/marketplace` | `GET /api/purchase-requests/{id}/matches` |
| Offer submission | `/farms`, `/requests/{id}`, `/offers` | `/api/offers` |
| AgriTrust buyer profiles | `/buyers`, `/buyers/{id}` | `GET /api/organizations/{id}/trust` |
| Manual and proportional allocation | `/allocation`, `/allocation/{id}` | `/api/listings/{id}/allocation/*` |
| HarvestLock agreements | `/contracts`, `/contracts/{id}` | `/api/contracts/{id}/accept`, `/decline` |
| Order state machine with audit trail | `/contracts/{id}` (stepper + swimlane) | every transition writes `audit_logs` |
| Harvest, lot, dispatch, receipt | `/contracts/{id}`, `/deliveries` | `/api/contracts/{id}/lots`, `/api/lots/{id}/*` |
| GradeProof with contract comparison flags | `/contracts/{id}`, `/quality` | `POST /api/lots/{id}/inspections` |
| Settlement and simulated, idempotent payment | `/contracts/{id}`, `/payments` | `/api/settlements/{id}/payments` |
| Completion feeds verified AgriTrust events | `/contracts/{id}` | `POST /api/contracts/{id}/complete` |
| Transaction history | `/history` | `GET /api/history` |

## Phase 2 — Advanced operations and going online (done)

| Area | What was built | Pages / API |
| --- | --- | --- |
| Google sign-in | Supabase Auth (PKCE); API verifies JWTs via JWKS; first sign-in onboarding (Farmer or Buyer only); demo picker behind `DEMO_LOGIN` | `/login`, `/auth/callback`, `/onboarding`; `/api/auth/*`, `/api/onboarding` |
| Database | Alembic migrations applied on startup; RLS enabled on every table on Postgres | `Backend/migrations/` |
| Allocation | Exact revenue optimizer (min lots, net of logistics cost) and risk-aware caps by AgriTrust band; reallocation after cancellation/expiry | `/allocation/{id}`; `/api/listings/{id}/reallocation` |
| HarvestLock | Versioned amendments with diff and re-signing; harvest shortfall → proportional-reduction proposals; typed-name e-signature (simulated); printable contract PDF | `/contracts/{id}`, `/contracts/{id}/document`; `/api/contracts/{id}/amendments*`, `/api/listings/{id}/shortfall*` |
| Disputes | Open with evidence, statements, held amount, reviewer, reinspection, settlement adjustment; AgriTrust counts verified fault only | `/disputes`, `/disputes/{id}`; `/api/disputes/*` |
| Evidence | Photo/PDF uploads with SHA-256, private storage (local or Supabase Storage), 5-minute signed links | evidence panels; `/api/files*` |
| Logistics | Multiple lots per contract; QR per lot with public trace page (no personal data or prices) | `/trace/{token}`; `/api/trace/{token}` |
| Admin | Users and roles, business verification, per-fruit quality standards, trust & risk signals, AgriTrust appeals | `/admin/*` |
| Notifications | In-app notifications from audit events, header bell | `/api/notifications` |
| Delivery | Render blueprint, Vercel settings, CI (tests, Postgres migrations, lint, build) | [DEPLOY.md](../../DEPLOY.md), `render.yaml`, `.github/workflows/ci.yml` |

**Still simulated** (labelled in the UI): payments, deposits and refunds (no money moves); e-signature (typed name + consent, not a certified provider); business verification (manual review, no registry lookup).

**Verification:** 48 backend tests (unit, end-to-end, auth, migrations, disputes, amendments, lots/files, admin) plus headless-browser runs of the demo, dispute, amendment, multi-lot/QR and admin flows.

## Not built yet

Email/SMS/LINE notifications, maps, a payment gateway or escrow, a certified e-signature provider, Learning-to-Rank matching, vision-assisted QC, harvest forecasting, legal RAG (roadmap Phase 3–4).
