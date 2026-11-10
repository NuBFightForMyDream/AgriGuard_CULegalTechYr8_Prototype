import pytest

from agriguard_ai.config import settings


@pytest.fixture(autouse=True)
def no_keys(monkeypatch):
    """Tests never use real keys from the developer's environment."""
    for k in ("ai_provider", "gemini_api_key", "anthropic_api_key"):
        monkeypatch.setattr(settings, k, None)
