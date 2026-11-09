# AgriGuard Prototype

Base web scaffold for AgriGuard. Specs live in [`Specifications (Prompt)/`](Specifications%20(Prompt)/Products/README.md).

| Folder | What | Stack |
| --- | --- | --- |
| `Frontend/` | Web frontend | Next.js 15, React 19, TypeScript |
| `Backend/` | REST API | FastAPI, SQLAlchemy 2, uv |
| `Database/` | Postgres init scripts | PostgreSQL 17 (Docker) |

Current scope: one end-to-end slice, creating and listing **purchase requests**, plus a `/api/health` check that reports database status. The domain logic (matching, allocation, HarvestLock, etc.) is not implemented yet.

## Run

Requires Docker, Node 20+, and [uv](https://docs.astral.sh/uv/).

```bash
# 1. Database + API (http://localhost:8000, docs at /docs)
docker compose up -d --build

# 2. Frontend (http://localhost:3000)
cd Frontend && npm install && npm run dev
```

### Without Docker

The API falls back to a local SQLite file when `DATABASE_URL` is not set:

```bash
cd Backend && uv sync && uv run uvicorn app.main:app --reload
```

## Test

```bash
cd Backend && uv run python -m pytest     # API tests (SQLite)
cd Frontend && npm run lint && npm run build
```

## Notes

- Tables are created by `Base.metadata.create_all` on API startup. Switch to Alembic migrations before keeping real data.
- Config: `Backend/.env.example`, `Frontend/.env.example`.
- Online deployment plan (Vercel + Cloud Run + Supabase, Google sign-in): [`Specifications (Prompt)/Technical/deployment.md`](<Specifications (Prompt)/Technical/deployment.md>).
