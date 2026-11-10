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

## Buyer sourcing mode

When creating a purchase request the buyer chooses how many suppliers to deal with:

| Mode | Rules |
| --- | --- |
| **SINGLE** (ผู้ขายรายเดียว) | Matching only shows farms that can supply the full quantity; offers must be for the full quantity and cannot be split by the farm. The buyer may send offers to several farms to compare, but signing a HarvestLock with one closes the request: other pending offers are withdrawn and other unsigned reservations are released automatically (audited). |
| **MULTI** (หลายผู้ขาย) | Buyer can split across farms, optionally capped (`max_suppliers` ≥ 2). Offers cannot exceed what is still missing. The request moves OPEN → PARTIALLY_FILLED → FULFILLED as HarvestLocks are signed; when it is full or the cap is reached, remaining offers/reservations are closed. |

The mode is written into every HarvestLock (`sourcing_mode` term), shown in the contract document and read by the Legal AI (clause `C-sourcing`). API: `sourcing_mode` / `max_suppliers` on `POST /api/purchase-requests`; `fill`, `accepting_offers` on request responses.

## App redesign: chat, status and community

The UI follows the team's hand-drawn sketch (mobile first, adapted to desktop):

| Screen | Phone | Desktop |
| --- | --- | --- |
| Home (`/dashboard`) | Greeting card with income, contracts and credit % tiles; two big buttons (create listing/request, Status); shortcut grid; to-do alerts; deal cards | Same content in a wider grid, plus the charts and activity feed |
| Search (`/marketplace` farmer, `/farms` buyer) | Picture cards (illustrated produce cover, match % pill), search box, product chips, chat button | Three-column grid |
| Chat (`/chat`) | AgriBot pinned on top, then one thread per farm–buyer pair with unread count and the pair's deal status; a thread opens full screen | List and thread side by side |
| Status (`/status`) | Tabs **Status** (deal cards with a clickable 12-step purchase flow, "ขั้นที่ 9/12 · สรุปยอดแล้ว": opens every step with its date, who acts, what is next and all audit events recorded in that step; sourcing mode chip, red frame for problem states, filters) and **หา Deal** (best-fit requests for farmers; best-fit farms per open request for buyers) | Same, multi-column |
| Community (`/community`) | Group chips, new/top sort, search, posts with likes and comments | Group list on the left |

Navigation: a bottom tab bar on phones (home, search, chat, status, community; the chat button is raised) and a sidebar on desktop (main menu + tools). The tools list is kept short (about six items per role); related pages share one item and show tabs at the top (offers + allocation, requests + sent offers, deliveries + QC results, users + business verification, risk + appeals + buyer scores). Contracts are reached from Status; AgriBot is pinned in Chat (floating on desktop, in the tools list for inspectors and admins).

Chat rules: only between a farm and a buyer organization (`conversations` is unique per pair); the latest contract, else the latest offer, is the thread's status chip. Community: default groups are created at startup; anyone signed in can post, comment and like; authors and admins can delete. Chat and community content is not moderated automatically yet; agreements made in chat are not binding until they become a HarvestLock. API: `/api/chats`, `/api/chats/{id}/messages`, `/api/chats/unread`, `/api/chats/contacts`, `/api/community/*`, `/api/deals/suggestions`.

## Demo data

`POST /api/demo/reset` (and the first start on an empty database) seeds the base data, then plays a fuller season through the real API (`Backend/app/demo_scenarios.py`): 7 farms, 7 buyers, 14 listings, 9 purchase requests, and 14 HarvestLocks covering every order state (awaiting confirmation, confirmed, harvested, in transit, QC pending, payment pending, overdue, disputed, paid, completed), plus open and rejected offers, chats per deal and community threads. Each deal's timestamps are moved back days or weeks so flows and chats read like a real season. The main walkthrough on PL-2026-001 (buyers B/C/D) is untouched. `?scenarios=false` resets to the small base data only (scripted walkthroughs use it); `DEMO_SCENARIOS=false` turns the extra deals off entirely. The backend test suite uses the base data; `tests/test_demo_scenarios.py` checks that the scenarios still build.

## AI features (roadmap Phase 3, started)

| Feature | What it does | Guardrails |
| --- | --- | --- |
| Legal AI (contract review + Q&A) | Rule engine checks required/risky clauses; the configured model (Gemini `gemini-3.8-flash` via `GEMINI_API_KEY`, or Claude `claude-sonnet-5-5` via `ANTHROPIC_API_KEY`) summarises in plain Thai, lists risks and answers questions | Grounded only in the contract's clauses and approved policy documents (`Backend/app/knowledge/`); every point cites a real source id, invented ids are dropped; "not found" instead of guessing; personal data redacted; labelled AI-generated; high-risk → human review; every call logged in `ai_runs` |
| QC photo assist | The model's vision input estimates grade shares and defects from lot photos | Suggestion only; inspector edits and submits; inspection records `ai_run_id`; "cannot assess" allowed |
| AgriBot (legal Q&A + navigation in one chat) | Pinned at the top of Chat (floating on desktop). Each message is routed: a legal question (topic word + question form, e.g. "ผู้ซื้อยกเลิกหลังเซ็นสัญญาได้ไหม") gets the Legal AI answer with citations and up to 2 related pages; anything else ("อยากลงขายมะม่วง", "มีงานอะไรค้าง") gets a short reply with up to 3 buttons to the right page, including the user's pending tasks | Same guardrails as Legal AI for answers; destinations only from a role-filtered page catalog and the user's tasks; invented ids dropped; keyword matching and related documents when no AI key is set. `/assistant` now redirects here |
| Harvest forecast | p10/p50/p90 from yield-per-rai ranges and farm area; warns when estimate or commitments exceed it | Labelled as a baseline, not a trained model, until real harvest data exists |

Pages: contract workspace (ผู้ช่วยอ่านสัญญา), AgriBot (`/chat/agribot`), QC form, produce detail. API: `/api/assistant/chat`, `/api/legal/*`, `/api/lots/{id}/ai-grade`, `/api/listings/{id}/forecast`, `/api/ai/status`. With both `GEMINI_API_KEY` and `ANTHROPIC_API_KEY` set, a failed call on the primary provider (e.g. Gemini free-tier quota) is retried on the other; refusals are not. Without an AI key the rule engine, retrieval, keyword navigation and forecast still work. The Gemini free tier allows Google to use submitted content to improve its products: fine for demo data, not for real customers.

## Not built yet

Email/SMS/LINE notifications, maps, a payment gateway or escrow, a certified e-signature provider, Learning-to-Rank matching and a trained forecasting model (both need validated transaction and harvest data), Isolation Forest anomaly signals (roadmap Phase 3–4).
