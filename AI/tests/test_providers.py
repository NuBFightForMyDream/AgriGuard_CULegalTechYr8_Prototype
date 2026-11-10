import base64
import io
from types import SimpleNamespace

import pytest
from google.genai import types as gtypes
from PIL import Image

from agriguard_ai import providers as ai
from agriguard_ai.config import settings
from agriguard_ai.legal import ANSWER_SCHEMA


def png() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (64, 48), (200, 160, 40)).save(buf, format="PNG")
    return buf.getvalue()


class FakeGemini:
    def __init__(self, response):
        self.response, self.calls = response, []
        self.models = self

    def generate_content(self, **kw):
        self.calls.append(kw)
        return self.response


def gemini_response(text, finish="STOP", blocked=None):
    return SimpleNamespace(
        prompt_feedback=SimpleNamespace(block_reason=blocked) if blocked else None,
        candidates=[SimpleNamespace(finish_reason=getattr(gtypes.FinishReason, finish))],
        text=text, usage_metadata=SimpleNamespace(prompt_token_count=12, candidates_token_count=34),
        model_version="gemini-3.8-flash")


def test_no_key_means_unavailable():
    assert ai.provider() is None and not ai.available()
    with pytest.raises(ai.AIUnavailable):
        ai.generate("s", [{"type": "text", "text": "x"}], {"type": "object"})


def test_provider_selection(monkeypatch):
    monkeypatch.setattr(settings, "gemini_api_key", "g-key")
    assert ai.provider() == "gemini" and ai.model_name() == settings.gemini_model
    monkeypatch.setattr(settings, "anthropic_api_key", "a-key")
    assert ai.provider() == "anthropic"
    monkeypatch.setattr(settings, "ai_provider", "gemini")
    assert ai.provider() == "gemini" and ai.providers_in_order() == ["gemini", "anthropic"]


def test_gemini_call_converts_content_and_parses_json(monkeypatch):
    monkeypatch.setattr(settings, "gemini_api_key", "g-key")
    fake = FakeGemini(gemini_response('{"answer": "ok", "found": true, "source_ids": []}'))
    monkeypatch.setattr(ai, "_gemini", fake)
    img = base64.standard_b64encode(png()).decode()
    g = ai.generate("sys", [{"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": img}},
                            {"type": "text", "text": "hello"}], ANSWER_SCHEMA)
    assert g.data["answer"] == "ok" and g.model == "gemini-3.8-flash" and (g.input_tokens, g.output_tokens) == (12, 34)
    sent = fake.calls[0]
    assert sent["contents"][1] == "hello" and sent["contents"][0].inline_data.mime_type == "image/jpeg"
    assert sent["config"].response_mime_type == "application/json" and sent["config"].response_json_schema == ANSWER_SCHEMA


@pytest.mark.parametrize("finish,blocked,exc", [("SAFETY", None, ai.AIRefused), ("STOP", "SAFETY", ai.AIRefused), ("MAX_TOKENS", None, ai.AIUnavailable)])
def test_gemini_blocked_or_truncated(monkeypatch, finish, blocked, exc):
    monkeypatch.setattr(settings, "gemini_api_key", "g-key")
    monkeypatch.setattr(ai, "_gemini", FakeGemini(gemini_response("{}", finish, blocked)))
    with pytest.raises(exc):
        ai.generate("sys", [{"type": "text", "text": "x"}], ANSWER_SCHEMA)


def test_failover_from_gemini_to_claude(monkeypatch):
    monkeypatch.setattr(settings, "gemini_api_key", "g-key")
    monkeypatch.setattr(settings, "anthropic_api_key", "a-key")
    monkeypatch.setattr(settings, "ai_provider", "gemini")
    used = []

    def gemini_quota(*a):
        used.append("gemini")
        raise ai.AIUnavailable("quota")

    def claude_ok(*a):
        used.append("anthropic")
        return {"ok": True}, "claude-opus-5-5", 1, 1

    monkeypatch.setattr(ai, "_call_gemini", gemini_quota)
    monkeypatch.setattr(ai, "_call_anthropic", claude_ok)
    assert ai.generate("s", [{"type": "text", "text": "x"}], {"type": "object"}).model == "claude-opus-5-5"
    assert used == ["gemini", "anthropic"]


def test_refusal_is_not_retried(monkeypatch):
    monkeypatch.setattr(settings, "gemini_api_key", "g-key")
    monkeypatch.setattr(settings, "anthropic_api_key", "a-key")
    monkeypatch.setattr(settings, "ai_provider", "gemini")

    def refused(*a):
        raise ai.AIRefused("no")

    monkeypatch.setattr(ai, "_call_gemini", refused)
    monkeypatch.setattr(ai, "_call_anthropic", lambda *a: pytest.fail("must not retry a refusal"))
    with pytest.raises(ai.AIRefused):
        ai.generate("s", [{"type": "text", "text": "x"}], {"type": "object"})


def test_redact_personal_data():
    out = ai.redact("ติดต่อ anan@freshfruit.example หรือ 081-234-5678 บัตร 1-2345-67890-12-3")
    assert "anan@" not in out and "[อีเมล]" in out and "[เบอร์โทร]" in out and "[เลขประจำตัว]" in out
