from pydantic_settings import BaseSettings, SettingsConfigDict


class AISettings(BaseSettings):
    """Read from the environment (or .env). Set ONE key; with both, AI_PROVIDER decides which goes first."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    ai_provider: str | None = None  # "gemini" | "anthropic"; otherwise whichever key is set (Claude first)
    # Gemini API (Google AI Studio). Free tier: Google may use content to improve its products, so demo data only.
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-3.8-flash"
    # Claude API (Anthropic).
    anthropic_api_key: str | None = None
    ai_model: str = "claude-opus-5-5"
    ai_effort: str = "medium"


settings = AISettings()
