# Build context is the repository root: the Backend depends on the AI package in ../AI.
FROM python:3.13-slim
COPY --from=ghcr.io/astral-sh/uv:0.13.6 /uv /bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
COPY AI /app/AI
WORKDIR /app/Backend
COPY Backend/pyproject.toml Backend/uv.lock ./
RUN uv sync --frozen --no-dev
COPY Backend/alembic.ini ./
COPY Backend/migrations ./migrations
COPY Backend/app ./app
EXPOSE 8000
# Cloud Run and Render inject PORT. Migrations run on startup (RUN_MIGRATIONS=true).
CMD ["sh", "-c", "exec /app/Backend/.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
