# AgriGuard

**Secure Every Harvest. Trust Every Trade.**
![Cover Page](https://github.com/NuBFightForMyDream/AgriGuard_CULegalTechYr8_ReLaw/blob/main/CULGT8_ReLaw_AgriGuard.jpg)

AgriGuard manages **pre-harvest B2B fruit deals** between farms and buyers (exporters, packing houses, processing factories, modern trade). Prices are locked before harvest, grades are settled with evidence, and every step leaves an audit trail. This replaces verbal agreements that often end with the price cut at harvest time.

The pitch and feasibility decks are in [`Appendix/Deck/`](Appendix/Deck/slides.html) (9 slides) and [`Appendix/Feasibility/`](Appendix/Feasibility/slides.html) (full version). The product specs are in [`Specifications (Prompt)/`](<Specifications (Prompt)/Products/README.md>).

## The problem

| Farmers | Buyers & factories |
| --- | --- |
| Buyers cancel or cut the price at harvest | Hard to find farms that meet the spec |
| Arguments over grade | Quality and delivery are unpredictable |
| Late payment, no evidence | China is strict about traceability |

The alternatives each fall short:

| Alternative | Strength | What's missing |
| --- | --- | --- |
| Middlemen (ล้ง) | Pay cash on the spot | No contract, no evidence |
| LINE / Facebook groups | Free, everyone already uses them | No QC, no track record |
| B2B marketplaces (Freshket, สี่มุมเมือง) | Funded, online | Sell ready stock, not pre-harvest deals |
| **AgriGuard** | Contract + QC + evidence + trace | Holds no stock and needs no working capital |

## What AgriGuard does

| Feature | What it does |
| --- | --- |
| **HarvestLock** | Price per grade plus a deposit, agreed before harvest. The contract has a terms hash and an audit log and can't be edited after the fact. |
| **Smart Matching** | Ranks farms for a purchase request in two steps: hard filters first, then a weighted score (timing 30 · quantity 25 · quality 20 · logistics 15 · reliability 10), with the score shown per factor. |
| **Smart Allocation** | Splits a harvest across several buyers for the best net revenue. The exact optimizer handles up to 12 offers, deducts transport and caps volume by AgriTrust. Row locks prevent overbooking. |
| **GradeProof** | An inspector records weight per grade. Settlement = Σ(kg × grade price) − deposit. |
| **AgriTrust** | A buyer score built only from verified transactions: payment 30 · receiving 25 · contract 20 · QC 15 · disputes 10, with Bayesian smoothing. It shows "insufficient data" when there is no history, and buyers can appeal. |
| **QR Trace** | A public trace page per lot, with no personal data or prices. |
| **AgriBot / Legal AI** | One chat that reads contracts in plain Thai, flags risks and answers legal questions with real citations. It also takes users to the right page for their role. |
| **QC Photo Assist** | A vision model suggests the grade mix from lot photos. The inspector edits and confirms. |
| **Harvest Forecast** | A p10/p50/p90 yield range that warns when a farm oversells. It is labelled as a baseline (yield per rai × area), not a trained model. |

**The deal flow has 10 steps, all working end to end:** purchase request → matching → offer → allocation → HarvestLock → harvest → delivery → GradeProof → payment → AgriTrust.

Compared with middlemen (ERRC):

- **Eliminate:** verbal deals and price cuts at harvest.
- **Reduce:** grade disputes and the buyer's time spent finding farms.
- **Raise:** price transparency, evidence at every step and confidence of getting paid.
- **Create:** AgriTrust, per-lot QR trace and AI contract reading.

## AI, used only as decision support

AI never edits contracts, scores or QC results, and the app still works without an AI key (it falls back to rules and keywords).

- **Models:** Claude Sonnet 5.5 (`claude-sonnet-5-5`) is the primary model, with Gemini 3.8 Flash as failover. The same multimodal model handles QC photos.
- **Shared pipeline:**
  1. The rule engine checks the contract.
  2. Sources are retrieved (TF-IDF over contract clauses and policies).
  3. The cache is checked by input hash.
  4. Personal data is redacted and the LLM is called with a JSON schema.
  5. The run is logged to `ai_runs`.
  6. Invented citations are removed.
  7. The result is labelled AI-generated, and high-risk answers go to a human reviewer.
- **Cost:** about ฿10 of AI per deal.

## Market

- **TAM ฿171,000M:** Thai fresh fruit exports in 2025 (2.08M tonnes; durian alone ฿125,737M).
- **SAM ฿35,000–50,000M\*:** pre-harvest B2B deals between mid-to-large farms and corporate buyers.
- **SOM ฿750M\*:** GMV target for year 3.
- **Beachhead:** exporters and packing houses that need trace for China, and mid-size farms of 10–50 rai growing export fruit.

\* Team assumptions. Sources: Ministry of Commerce, OPS MOAC.

## Business model

Features that protect users are always free. Features that help users earn more are paid.

| Side | Plan | Price | Includes |
| --- | --- | --- | --- |
| Farmer | Free | 0.5% per deal, capped at ฿3,000/deal | Contracts, evidence, disputes, AgriBot. Farmers pay only once paid, and the first season is free. |
| Farmer | Farm Pro | ฿1,500/season + 0.3% | Smart Allocation, forecast, AI grading, QR trace |
| Buyer / factory | Basic | ฿0 + 1% per deal | 1 user, up to 3 farms per request |
| Buyer / factory | Premium (the deck's "Business") | ฿3,000/month + 0.6% | Multiple users, procurement dashboard, export QR trace, supplier scorecard, CSV export. Worth it above ฿750k of purchases per month. |
| Buyer / factory | Enterprise (not in the deck) | Quoted per volume | Multiple factories and sites, approval rules, supply calendar, supply-risk alerts, API & ERP, SSO, custom contract templates, SLA |

- Combined fees come to about 0.9–1.5% per deal, plus subscriptions that bring in revenue outside the season.
- **Later revenue:** loan and insurance referrals based on transaction data (embedded finance), and licences for cooperatives and government agencies (B2G).
- Prices are an initial proposal and will be adjusted after user interviews.

## Go-to-market

Buyer-led (B2B2C), with field work 2–3 months before each harvest season:

1. Sign 3–5 anchor buyers. They use it free during the pilot and in return bring the farms they already buy from.
2. Farms join because their buyer asks them to, which is more convincing than ads.
3. Scale through partners: cooperatives, BAAC (ธ.ก.ส.), provincial agriculture offices, the Thai Durian Association and Young Smart Farmer.
4. Content and referrals: clips on "price cut vs HarvestLock", farmer rights from Legal AI, and a fee discount for referring other farms.

**Pilot funnel targets\*:**

| Stage | Target |
| --- | --- |
| Reached | 600 farms and 40 buyers |
| Sign up | 200 farms and 20 buyers |
| First HarvestLock deal | 40% |
| Return in season 2 | ≥ 60% |
| Upgrade to a paid plan | 10% |

**Moat:** the verified-transaction data flywheel. More buyers make demand clearer, which brings more farms. More verified deals make AgriTrust and matching more accurate.

## Feasibility

| Area | Rating | Summary |
| --- | --- | --- |
| Technical | High | The 10-step flow works end to end; 88 tests (Backend 70 + AI 18) run on CI. TRL 5 → 7, pilot-ready in 3–4 months. |
| Market | Medium–high | The market is large and the pain is real, but it isn't validated yet: buyers have bargaining power and don't like being rated. |
| Production | Medium | The software is ready. Still to build: neutral third-party QC, onboarding farmers through cooperatives, certified scales, a human mediator for disputes and in-season LINE support. |
| Legal | Medium | Four items must be closed before launch (see below). |
| Business | Medium | Two-sided fees plus subscriptions. The chicken-and-egg problem is solved by selling SaaS to buyers first. |
| Financial | Needs seed capital | ฿6–8M needed before break-even (late year 2 to early year 3). Revenue is about ฿3.5–4.5k per ฿300k deal, and gross margin is over 95%. |

**Three-year plan\*:**

| | Year 1 | Year 2 | Year 3 |
| --- | --- | --- | --- |
| Buyers / farms | 20 / 200 | 80 / 1,000 | 250 / 4,000 |
| Deals | 150 | 800 | 2,500 |
| GMV | ฿45M | ฿240M | ฿750M |

**Legal items to close before launch** (this is not legal advice; confirm with counsel):

1. **Agricultural Contract Farming Act 2017.** HarvestLock (a pre-harvest price plus a deposit) may fall under this act. Get a legal opinion and align the contract template with it.
2. **Payment Systems Act 2017 / Escrow Act 2008.** The platform never holds money; a licensed bank or provider holds deposits.
3. **PDPA 2019.** Data is stored in Singapore. This needs a privacy notice, DPAs with every processor and a 72-hour breach response plan.
4. **Royal Decree on Digital Platforms 2022.** Notify ETDA, publish terms of service and provide a complaints channel.

The prototype already handles several of these by design: no real money moves, the QR trace shows no personal data or prices, AgriTrust is based on verified facts and can be appealed, AI never changes scores or contracts, and Legal AI carries a disclaimer and goes through human review.

**Roadmap\*:**

- **Months 0–3:** bank escrow, LINE, certified e-signature, legal opinion and paid hosting.
- **Months 3–6:** pilot one fruit in one province (for example Chanthaburi durian, Apr–Jul, or export Nam Dok Mai mango).
- **Months 6–12:** measure results, add a second fruit and train matching and forecasting on real data.
- **Pilot team:** 2 developers, 1 product/design, 2 field ops/sales, legal retainer and a QC partner. Burn is about ฿350–450k per month.

\* Team assumptions.

## Repository

| Folder | What | Stack |
| --- | --- | --- |
| `Frontend/` | Web app (Thai UI, mobile-first) | Next.js 15, React 19, TypeScript, Tailwind CSS 4, SWR, Recharts |
| `Backend/` | REST API and business logic: JWT, RBAC, state machine, audit, matching, allocation, settlement, AgriTrust | FastAPI, SQLAlchemy 2, uv |
| `AI/` | AI package used by the Backend: Legal AI, AgriBot, QC photo assist, forecast ([AI/README.md](AI/README.md)) | Claude / Gemini, no database access |
| `Database/` | Postgres init scripts | PostgreSQL 17 (Docker) |
| `Appendix/` | Pitch and feasibility decks | HTML slides + PNG exports |

**Hosting:** Vercel (web), Render (API) and Supabase in Singapore (Postgres with RLS on every table, Auth with Google OAuth via PKCE, private Storage for evidence with SHA-256 and 5-minute links).

**Status:** Phase 1 and Phase 2 are done ([development-phases.md](<Specifications (Prompt)/Products/development-phases.md>)). That covers the full ordering workflow, Google sign-in, revenue- and risk-aware allocation, amendments and shortfall, disputes, evidence uploads, multi-lot QR traceability, the admin console, AgriTrust appeals and notifications. Buyer plans (Basic / Premium / Enterprise) with Procurement Insights and Team pages are in the app as a simulation: the plan is stored in the browser and nothing is billed. **To put it online, follow [DEPLOY.md](DEPLOY.md)** (Supabase + Render + Vercel).

## Run

Requires Docker, Node 20+, and [uv](https://docs.astral.sh/uv/).

```bash
# 1. Database + API (http://localhost:8000, API docs at /docs). Seeds demo data on first start.
docker compose up -d --build

# 2. Frontend (http://localhost:3000)
cd Frontend && npm install && npm run dev
```

Without Docker, the API uses a local SQLite file:

```bash
cd Backend && uv sync && uv run uvicorn app.main:app --reload
```

## Demo walkthrough

Open http://localhost:3000. The landing page scrolls down to the sign-in section, where you pick a demo user. "รีเซ็ตข้อมูลเดโม" restores the starting scenario.

1. **สมชาย ใจดี (Farmer)** → Smart Allocation → มะม่วงน้ำดอกไม้ 5,000 kg. Allocate 2,000 / 2,000 / 1,000 kg to Buyers B, C, D and confirm. Three HarvestLocks are created.
2. **อนันต์ (Buyer B)** → คำสั่งซื้อ & HarvestLock → open the contract, tick the terms, confirm.
3. **Farmer** → same contract → record harvest (creates `LOT-2026-MANGO-001`) → dispatch with weights.
4. **Buyer B** → confirm receipt.
5. **ปรีชา (Inspector)** → QC queue → Grade A 1,600 / B 300 / rejected 100 kg (bruising). Settlement: ฿81,000 − ฿10,000 deposit = ฿71,000.
6. **Buyer B** → record payment. **Farmer** → confirm receipt → completed; Buyer B's AgriTrust now counts 43 verified transactions.

The contract page shows the 10-stage journey, next action per role, risks, terms hash and acceptances, and a swimlane timeline.

**Buyer plans:** each demo buyer starts on a different plan.

- **มาลี (Siam Fruit Processing, a factory):** Enterprise.
- **อนันต์ (FreshFruit Export):** Premium.
- **ธนา (Eastern Wholesale):** Basic.

Open Procurement Insights, ทีม & ระบบองค์กร or แผนบริการ to see each tier. Features above the current plan show as a blurred preview with an upgrade card.

## Test

```bash
cd Backend && uv run python -m pytest     # API, end-to-end, auth, migration and AI integration tests (SQLite)
cd AI && uv run python -m pytest          # AI package tests (no network, no database)
cd Frontend && npm run lint && npm run build
```

## Notes

- Sign-in: Google via Supabase when configured. The demo user picker stays available while `DEMO_LOGIN=true` (turn it off before real users).
- Payments, deposits, refunds, e-signatures and plan changes are simulated and labelled as such in the UI.
- Schema changes go through Alembic (`Backend/migrations/`), applied on API startup.
- Config: `Backend/.env.example`, `Frontend/.env.example`.
- Online deployment plan (Vercel + Cloud Run + Supabase, Google sign-in): [`Specifications (Prompt)/Technical/deployment.md`](<Specifications (Prompt)/Technical/deployment.md>).
