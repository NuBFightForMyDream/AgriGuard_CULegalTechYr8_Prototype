# AgriGuard Prototype

B2B agricultural procurement and transaction-assurance platform: buyer demand → matching → offers → multi-buyer allocation → HarvestLock → harvest & delivery → GradeProof → settlement → AgriTrust. Specs live in [`Specifications (Prompt)/`](<Specifications (Prompt)/Products/README.md>).

| Folder | What | Stack |
| --- | --- | --- |
| `Frontend/` | Web app (Thai UI) | Next.js 15, React 19, TypeScript, Tailwind CSS 4, SWR, Recharts |
| `Backend/` | REST API and business logic | FastAPI, SQLAlchemy 2, uv |
| `Database/` | Postgres init scripts | PostgreSQL 17 (Docker) |

**Status: Phase 1 (working MVP) is done.** The whole ordering workflow runs end to end against the database. Phase 2 (Google sign-in, deployment, optimization, disputes, QR, PDF) is planned in [development-phases.md](<Specifications (Prompt)/Products/development-phases.md>).

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

Open http://localhost:3000 and pick a demo user. "รีเซ็ตข้อมูลเดโม" on the sign-in page restores the starting scenario.

1. **สมชาย ใจดี (Farmer)** → Smart Allocation → มะม่วงน้ำดอกไม้ 5,000 kg. Allocate 2,000 / 2,000 / 1,000 kg to Buyers B, C, D and confirm. Three HarvestLocks are created.
2. **อนันต์ (Buyer B)** → คำสั่งซื้อ & HarvestLock → open the contract, tick the terms, confirm.
3. **Farmer** → same contract → record harvest (creates `LOT-2026-MANGO-001`) → dispatch with weights.
4. **Buyer B** → confirm receipt.
5. **ปรีชา (Inspector)** → QC queue → Grade A 1,600 / B 300 / rejected 100 kg (bruising). Settlement: ฿81,000 − ฿10,000 deposit = ฿71,000.
6. **Buyer B** → record payment. **Farmer** → confirm receipt → completed; Buyer B's AgriTrust now counts 43 verified transactions.

The contract page shows the 10-stage journey, next action per role, risks, terms hash and acceptances, and a swimlane timeline.

## Test

```bash
cd Backend && uv run python -m pytest     # unit + end-to-end API tests (SQLite)
cd Frontend && npm run lint && npm run build
```

## Notes

- Phase 1 sign-in is a demo user picker that sends `X-Demo-User`; Phase 2 replaces it with Supabase JWTs.
- Payments, deposits and acceptance are simulated and labelled as such in the UI.
- Tables are created by `Base.metadata.create_all` on API startup. Switch to Alembic migrations before keeping real data.
- Config: `Backend/.env.example`, `Frontend/.env.example`.
- Online deployment plan (Vercel + Cloud Run + Supabase, Google sign-in): [`Specifications (Prompt)/Technical/deployment.md`](<Specifications (Prompt)/Technical/deployment.md>).
