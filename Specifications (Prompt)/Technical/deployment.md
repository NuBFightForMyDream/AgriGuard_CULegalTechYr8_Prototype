# Deployment

## Objective

Run AgriGuard online on managed services with Google sign-in, so the prototype can be demoed from a public URL and grow toward production without re-platforming.

## Feasibility

Yes. The current scaffold (`Frontend/` Next.js, `Backend/` FastAPI, `Database/` Postgres) maps directly onto managed services. Supabase replaces the self-hosted Postgres and adds Auth (Google OAuth) and Storage (evidence files). No application rewrite is needed; the gaps are listed under [Prototype gaps](#prototype-gaps).

## Target topology

| Layer | Service | Region | Notes |
| --- | --- | --- | --- |
| Frontend | Vercel (Next.js) | `sin1` | Auto-deploy from `main`; preview deploy per PR |
| Backend API | Google Cloud Run (container from `Backend/Dockerfile`) | `asia-southeast1` | Scales to zero; same Google Cloud project as the OAuth client |
| Database | Supabase Postgres | `ap-southeast-1` | Accessed by the API only, via the Supavisor pooler |
| Auth | Supabase Auth, Google provider | — | Issues the JWT the API verifies |
| File storage | Supabase Storage, private bucket `evidence` | — | Access through short-lived signed URLs only |

`Browser → Vercel (Next.js) → Cloud Run (FastAPI) → Supabase Postgres / Storage`, with `Browser ↔ Supabase Auth ↔ Google` for sign-in.

Alternative backend host without a billing account: Render (Docker web service). Free instances sleep when idle and take tens of seconds to wake, so warm the service before a live demo.

Keep all services in Singapore regions to minimise latency to Thai users and keep data in one jurisdiction (see [Data protection](#data-protection)).

## Authentication (Google via Supabase)

1. **Google Cloud Console:** create an OAuth client (type *Web application*). Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`. Configure the consent screen with app name, support email, and the `email`/`profile` scopes only.
2. **Supabase dashboard → Auth → Providers → Google:** paste the client ID and secret. Set *Site URL* to the production frontend URL and add redirect URLs for production, Vercel previews (`https://*-<team>.vercel.app/**`), and `http://localhost:3000/**`.
3. **Frontend:** use `@supabase/ssr`. "Sign in with Google" calls `supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: <origin>/auth/callback } })`; the `/auth/callback` route exchanges the code for a cookie session.
4. **Frontend → API:** every request sends `Authorization: Bearer <access_token>` from the Supabase session.
5. **API:** verify the JWT against the project JWKS (`https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json`), checking signature, `exp`, `iss`, and `aud = authenticated`. Use `sub` as the identity key. Reject anything else with `401`.

### Roles and organizations

- Supabase Auth proves *who* the user is. *What they may do* (Farmer, Buyer, Inspector, Admin, and organization membership) lives in AgriGuard's own tables and is enforced by the API (RBAC, see [architecture.md](architecture.md)).
- `users.auth_user_id` (uuid, unique) links to `auth.users.id`. A user row is created on first sign-in.
- First sign-in goes to onboarding, where a user may self-select **Farmer** or **Buyer** only. **Inspector** and **Admin** are granted by an Admin.
- Never authorize from `user_metadata` in the token; users can edit it.

## Database

- **Connection:** use the Supavisor pooler connection string from the Supabase *Connect* panel (IPv4-compatible; the direct host may be IPv6-only). Session mode (port `5432`) works with SQLAlchemy as-is. Keep the SQLAlchemy pool small (e.g. `pool_size=5`), because every Cloud Run instance opens its own pool.
- **Migrations:** replace `Base.metadata.create_all` with Alembic. Run `alembic upgrade head` once per release, as a CI step or Cloud Run job, before the new revision takes traffic. Migrations must be backward compatible with the previous revision so rollback is safe.
- **Supabase Data API exposure:** Supabase automatically exposes the `public` schema over REST to anyone holding the publishable (anon) key. Either keep application tables in a separate schema that is not exposed (e.g. `app`), or enable RLS with no policies on every `public` table. The API connects as a privileged role and enforces authorization itself.
- **Backups:** rely on Supabase daily backups. Before any real (non-demo) data, confirm the plan's retention and enable point-in-time recovery if it is needed.

## Evidence storage

- Private bucket `evidence`; object path `org/<organization_id>/<entity>/<id>/<uuid>.<ext>`.
- Uploads: the API checks authorization, then returns a signed upload URL. Downloads use signed URLs with a short TTL (minutes).
- Store the SHA-256 hash, size, MIME type, uploader, and timestamp in the `evidence` table, as GradeProof and dispute evidence require.

## Configuration and secrets

| Variable | Where | Secret |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel | No |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (legacy name: anon key) | Vercel | No |
| `NEXT_PUBLIC_API_URL` | Vercel | No |
| `DATABASE_URL` (pooler, `sslmode=require`) | Cloud Run, via Secret Manager | Yes |
| `SUPABASE_URL` (JWKS + Storage) | Cloud Run | No |
| `SUPABASE_SECRET_KEY` (legacy name: service role key; Storage signing only) | Cloud Run, via Secret Manager | Yes |
| `CORS_ORIGINS` (production + preview frontend origins) | Cloud Run | No |
| `APP_ENV` (`local` / `preview` / `production`) | All | No |

The secret key and database password must never appear in the frontend bundle, the repository, or logs.

## Environments

| Environment | Frontend | API | Database / Auth |
| --- | --- | --- | --- |
| Local | `npm run dev` | `uv run uvicorn` or `docker compose` | Docker Postgres, or the Supabase CLI (`supabase start`) for local Auth/Storage |
| Preview | Vercel preview per PR | Shared staging Cloud Run service | Staging Supabase project |
| Production | Vercel production | Production Cloud Run service | Production Supabase project |

Never point preview deployments at the production Supabase project.

## CI/CD

1. On every PR, GitHub Actions runs backend tests, frontend lint/build, and an Alembic migration check against a throwaway Postgres.
2. On merge to `main`: build the image, push to Artifact Registry, run migrations, deploy a new Cloud Run revision. Vercel deploys the frontend automatically.
3. Rollback: shift Cloud Run traffic to the previous revision and promote the previous Vercel deployment.

## Later phases

Redis, background workers (matching, optimizer, forecast, vision, legal RAG), and the ML registry from [architecture.md](architecture.md) are not needed for Phase 0–1. When required, add them as Cloud Run jobs/worker services plus a managed Redis, without changing the topology above.

## Data protection

The platform stores personal data (names, emails, phone numbers, farm locations) and commercial terms, so Thailand's PDPA applies. Hosting in Singapore is a cross-border transfer: record it in the privacy notice, keep a list of processors (Supabase, Google, Vercel), and apply the retention policy from [database.md](database.md) before onboarding real users.

## Prototype gaps

What the current scaffold needs before going online:

- Alembic migrations instead of `create_all` on startup
- Supabase JWT verification dependency in FastAPI, and `401` on protected routes
- `users` / membership tables with `auth_user_id`, plus an onboarding flow
- Supabase client, sign-in page, and `/auth/callback` route in `Frontend/`
- SQLAlchemy pool settings and `sslmode=require` for the pooler
- Bind uvicorn to the `PORT` environment variable (required by Cloud Run)

## Acceptance criteria

- The frontend and API are reachable over HTTPS on public URLs; `GET /api/health` reports `database: ok` and `dialect: postgresql` in production.
- Google sign-in works on production, preview, and localhost; protected API routes return `401` without a valid Supabase token and `403` for the wrong role.
- No application table is readable through the Supabase Data API with the publishable key.
- Evidence files are reachable only through signed URLs issued after an authorization check.
- Secrets live only in platform secret stores; a scan of the built frontend finds no secret key.
- A release from `main` is reproducible, runs migrations exactly once, and can be rolled back to the previous revision.
