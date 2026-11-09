"""Thin wrapper over the Claude API for structured (JSON-schema) answers, with audit logging.

Every call: fixed system prompt, JSON-schema output, server-side refusal fallback, refusal/max_tokens handling,
and an AiRun row (model, prompt version, input hash, output) so AI output is traceable.
"""

import hashlib
import json
import re
import uuid

import anthropic
from sqlalchemy.orm import Session

from app.config import settings
from app.models import AiRun


class AIUnavailable(Exception):
    """No API key configured, or the API could not be reached."""


class AIRefused(Exception):
    """The model declined (after server-side fallback)."""


_client: anthropic.Anthropic | None = None


def available() -> bool:
    return bool(settings.anthropic_api_key)


def _get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic(api_key=settings.anthropic_api_key, max_retries=2, timeout=120)
    return _client


def _call(system: str, content: list[dict], schema: dict) -> tuple[dict, str, int | None, int | None]:
    """One structured request. Separated so tests can replace it without network access."""
    response = _get_client().beta.messages.create(
        model=settings.ai_model,
        max_tokens=16000,
        system=system,
        messages=[{"role": "user", "content": content}],
        output_config={"effort": settings.ai_effort, "format": {"type": "json_schema", "schema": schema}},
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
    )
    if response.stop_reason == "refusal":
        raise AIRefused("AI ปฏิเสธคำขอนี้")
    if response.stop_reason == "max_tokens":
        raise AIUnavailable("คำตอบของ AI ยาวเกินกำหนด")
    text = next((b.text for b in response.content if b.type == "text"), None)
    if text is None:
        raise AIUnavailable("AI ไม่ได้ส่งคำตอบกลับมา")
    usage = response.usage
    return json.loads(text), response.model, getattr(usage, "input_tokens", None), getattr(usage, "output_tokens", None)


def input_hash(*parts) -> str:
    return hashlib.sha256(json.dumps(parts, sort_keys=True, ensure_ascii=False, default=str).encode()).hexdigest()


def run(db: Session, *, task: str, prompt_version: str, system: str, content: list[dict], schema: dict,
        entity_type: str | None = None, entity_id: uuid.UUID | None = None, user_id: uuid.UUID | None = None,
        hash_parts: tuple = ()) -> AiRun:
    if not available():
        raise AIUnavailable("ยังไม่ได้ตั้งค่า ANTHROPIC_API_KEY")
    try:
        data, model, tin, tout = _call(system, content, schema)
    except (AIRefused, AIUnavailable):
        raise
    except anthropic.RateLimitError as e:
        raise AIUnavailable("AI มีผู้ใช้งานมาก กรุณาลองใหม่ภายหลัง") from e
    except anthropic.AuthenticationError as e:
        raise AIUnavailable("ANTHROPIC_API_KEY ไม่ถูกต้อง") from e
    except anthropic.APIStatusError as e:
        raise AIUnavailable(f"AI ตอบกลับผิดพลาด ({e.status_code})") from e
    except anthropic.APIConnectionError as e:
        raise AIUnavailable("เชื่อมต่อ AI ไม่ได้") from e
    except (json.JSONDecodeError, StopIteration) as e:
        raise AIUnavailable("อ่านคำตอบของ AI ไม่ได้") from e
    record = AiRun(task=task, model=model, prompt_version=prompt_version, input_hash=input_hash(*hash_parts),
                   entity_type=entity_type, entity_id=entity_id, user_id=user_id, output=data,
                   input_tokens=tin, output_tokens=tout)
    db.add(record)
    db.flush()
    return record


_PATTERNS = [
    (re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+"), "[อีเมล]"),
    (re.compile(r"(?<!\d)(?:\+66|0)\d{1,2}[- ]?\d{3}[- ]?\d{4}(?!\d)"), "[เบอร์โทร]"),
    (re.compile(r"(?<!\d)\d[- ]?\d{4}[- ]?\d{5}[- ]?\d{2}[- ]?\d(?!\d)"), "[เลขประจำตัว]"),
]


def redact(text: str) -> str:
    """Strip personal identifiers before text leaves the system (legal-ai.md guardrail)."""
    for pattern, label in _PATTERNS:
        text = pattern.sub(label, text)
    return text
