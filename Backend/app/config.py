import secrets

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "AgriGuard API"
    app_env: str = "local"  # local | preview | production
    database_url: str = "sqlite:///./agriguard.db"
    cors_origins: list[str] = ["http://localhost:3000"]
    # e.g. https://.*-myteam\.vercel\.app for Vercel preview deployments
    cors_origin_regex: str | None = None
    # Apply Alembic migrations on startup (disable when a release step runs them).
    run_migrations: bool = True
    # Seed the demo scenario when the database is empty.
    demo_seed: bool = True
    # Allow the demo user picker (X-Demo-User). Anyone can act as any demo user, so keep it for demos only.
    demo_login: bool = True
    # Supabase Auth: when set, Bearer JWTs from Google sign-in are accepted (Technical/deployment.md).
    supabase_url: str | None = None
    # Only for projects still on the legacy shared HS256 secret; JWKS (asymmetric keys) is preferred.
    supabase_jwt_secret: str | None = None
    # Supabase Storage for evidence files; local disk is used when unset.
    supabase_secret_key: str | None = None
    storage_bucket: str = "evidence"
    upload_dir: str = "./uploads"
    max_upload_mb: int = 10
    # Signs local-storage download links. Set it in production so links survive restarts and multiple workers.
    file_url_secret: str = secrets.token_hex(16)
    # How long an allocation reservation waits for the buyer to accept the HarvestLock.
    reservation_hours: int = 72

    @field_validator("database_url")
    @classmethod
    def use_psycopg(cls, v: str) -> str:
        """Accept the plain postgres:// URLs that Supabase and Render hand out."""
        for prefix in ("postgres://", "postgresql://"):
            if v.startswith(prefix):
                return "postgresql+psycopg://" + v[len(prefix):]
        return v

    @field_validator("supabase_url")
    @classmethod
    def strip_slash(cls, v: str | None) -> str | None:
        return v.rstrip("/") if v else v


settings = Settings()
