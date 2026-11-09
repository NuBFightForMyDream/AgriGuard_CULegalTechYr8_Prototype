-- Runs once, the first time the Postgres container starts with an empty volume.
-- Tables are created by the backend (SQLAlchemy models) for now; move to Alembic migrations later.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
