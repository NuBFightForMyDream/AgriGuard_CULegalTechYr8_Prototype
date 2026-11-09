# Deploy AgriGuard online

Frontend on **Vercel**, API on **Render** (Docker), database + Google sign-in + file storage on **Supabase**. All three have free tiers and deploy from this GitHub repo. Everything below needs your own accounts; the code is already configured. Design rationale: [deployment.md](<Specifications (Prompt)/Technical/deployment.md>).

Use Singapore regions everywhere. Have the GitHub repo pushed with `main` up to date before you start.

## 1. Supabase (database, auth, storage)

1. Create a project at supabase.com, region **Southeast Asia (Singapore)**. Save the database password.
2. **Project Settings → API keys**: copy the **Project URL**, the **publishable key** (`sb_publishable_…`, or the legacy `anon` key) and a **secret key** (`sb_secret_…`, or the legacy `service_role` key). The secret key goes to the backend only.
3. **Connect** (top bar) → **Session pooler** → copy the connection string (`postgres://postgres.<ref>:<password>@aws-…pooler.supabase.com:5432/postgres`). Add `?sslmode=require` at the end.
4. **Storage → New bucket**: name `evidence`, **private** (leave "Public bucket" off).

The API creates all tables itself on first start (Alembic migrations) and turns on row-level security for every table, so the publishable key cannot read app data through Supabase's Data API.

## 2. Google sign-in

1. **Google Cloud Console → APIs & Services → Credentials → Create credentials → OAuth client ID** (type *Web application*). If asked, configure the consent screen first (app name, support email; scopes `email`, `profile`).
2. **Authorized redirect URI**: `https://<project-ref>.supabase.co/auth/v1/callback`
3. Copy the client ID and secret into **Supabase → Authentication → Sign In / Providers → Google** and enable it.

## 3. Backend on Render

1. render.com → **New → Blueprint** → choose this repo. Render reads [`render.yaml`](render.yaml) and creates `agriguard-api` (Docker, Singapore, free plan). It generates `FILE_URL_SECRET` (signs file links) for you.
2. Fill in the environment variables it asks for:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Supabase session pooler string from step 1.3 |
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `SUPABASE_SECRET_KEY` | secret key from step 1.2 |
| `CORS_ORIGINS` | `["https://<your-app>.vercel.app"]` (fill after step 4, then redeploy) |
| `GEMINI_API_KEY` | optional: a Gemini key from aistudio.google.com (free tier), turns on the AI assistants (contract review, legal Q&A, QC photo assist). Free-tier content may be used by Google to improve its products, so use it with demo data |
| `ANTHROPIC_API_KEY` | optional, instead of Gemini: a Claude API key from console.anthropic.com (paid) |
| `CORS_ORIGIN_REGEX` | optional, for preview deploys: `https://.*-<your-team>\.vercel\.app` |

3. Check `https://agriguard-api.onrender.com/api/health` returns `"database": "ok", "dialect": "postgresql"`.

Free Render instances sleep after ~15 minutes idle and take up to a minute to wake. Open the health URL a minute before a live demo.

## 4. Frontend on Vercel

1. vercel.com → **Add New → Project** → import the repo → **Root Directory: `Frontend`**.
2. Environment variables:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | `https://agriguard-api.onrender.com` |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | publishable key from step 1.2 |
| `NEXT_PUBLIC_DEMO_LOGIN` | `true` to keep the demo user picker for judges, `false` to hide it |

3. Deploy, then put the Vercel URL into Render's `CORS_ORIGINS` (step 3) and redeploy the API.

## 5. Finish Supabase auth URLs

**Supabase → Authentication → URL Configuration**:
- **Site URL**: `https://<your-app>.vercel.app`
- **Redirect URLs**: `https://<your-app>.vercel.app/**`, `http://localhost:3000/**` (and your preview pattern if used)

## 6. Check it

- Open the Vercel URL → **เข้าสู่ระบบด้วย Google** → choose Farmer or Buyer on first sign-in.
- Sign in as **ผู้ดูแลระบบ** (demo picker) → **ผู้ใช้และสิทธิ์** to grant Inspector or Admin to Google users, **ยืนยันธุรกิจ** to verify new organizations.
- Upload a photo on a lot and open it: the link should point to `…supabase.co/storage/v1/object/sign/evidence/…`.

## Security notes

- `DEMO_LOGIN=true` lets anyone act as any demo user. It is meant for the hackathon demo; set it to `false` (and `NEXT_PUBLIC_DEMO_LOGIN=false`) before real users or data.
- Never put the Supabase secret key or database password in Vercel or the repo.
- Payments, deposits and e-signatures are simulated and labelled as such in the UI.
