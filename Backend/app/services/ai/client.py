"""Provider-neutral wrapper for structured (JSON-schema) AI answers, with audit logging.

Two providers: Claude API (Anthropic) and Gemini API (Google AI Studio). Callers pass Anthropic-style content
blocks ({"type": "text"} / {"type": "image", "source": {...base64}}); each provider adapter converts them.
Every call: fixed system prompt, JSON-schema output, refusal/safety and max-token handling, and an AiRun row
(model, prompt version, input hash, output) so AI output is traceable.
"""

import base64
import hashlib
import json
import re
import uuid

import anthropic
from google import genai
from google.genai import errors as genai_errors
from google.genai import types as genai_types
from sqlalchemy.orm import Session

from app.config import settings
from app.models import AiRun


class AIUnavailable(Exception):
    """No API key configured, or the API could not be reached."""


class AIRefused(Exception):
    """The model declined (after server-side fallback)."""


_client: anthropic.Anthropic | None = None
_gemini: genai.Client | None = None


def provider() -> str | None:
    if settings.ai_provider in ("anthropic", "gemini"):
        return settings.ai_provider if (settings.anthropic_api_key if settings.ai_provider == "anthropic" else settings.gemini_api_key) else None
    if settings.anthropic_api_key:
        return "anthropic"
    if settings.gemini_api_key:
        return "gemini"
    return None


def available() -> bool:
    return provider() is not None


def model_name() -> str | None:
    p = provider()
    return {"anthropic": settings.ai_model, "gemini": settings.gemini_model}.get(p) if p else None


def _get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic(api_key=settings.anthropic_api_key, max_retries=2, timeout=120)
    return _client


def _get_gemini() -> genai.Client:
    global _gemini
    if _gemini is None:
        _gemini = genai.Client(api_key=settings.gemini_api_key)
    return _gemini


def _key(p: str) -> str | None:
    return settings.anthropic_api_key if p == "anthropic" else settings.gemini_api_key


def providers_in_order() -> list[str]:
    """Primary provider first, then the other one if its key is set (failover, e.g. Gemini free quota -> Claude)."""
    first = provider()
    if first is None:
        return []
    return [first] + [p for p in ("anthropic", "gemini") if p != first and _key(p)]


def _call(system: str, content: list[dict], schema: dict) -> tuple[dict, str, int | None, int | None]:
    """One structured request, with failover to the other provider. Tests replace this to avoid the network."""
    last: AIUnavailable | None = None
    for p in providers_in_order():
        try:
            return _guarded(p, system, content, schema)
        except AIUnavailable as e:  # refusals are not retried elsewhere
            last = e
    raise last or AIUnavailable("ยังไม่ได้ตั้งค่า AI (GEMINI_API_KEY หรือ ANTHROPIC_API_KEY)")


def _guarded(p: str, system: str, content: list[dict], schema: dict) -> tuple[dict, str, int | None, int | None]:
    """Run one provider and turn its SDK errors into AIUnavailable with a clear Thai message."""
    try:
        return (_call_gemini if p == "gemini" else _call_anthropic)(system, content, schema)
    except (AIRefused, AIUnavailable):
        raise
    except anthropic.RateLimitError as e:
        raise AIUnavailable("Claude มีผู้ใช้งานมาก กรุณาลองใหม่ภายหลัง") from e
    except anthropic.AuthenticationError as e:
        raise AIUnavailable("ANTHROPIC_API_KEY ไม่ถูกต้อง") from e
    except anthropic.APIStatusError as e:
        raise AIUnavailable(f"Claude ตอบกลับผิดพลาด ({e.status_code})") from e
    except anthropic.APIConnectionError as e:
        raise AIUnavailable("เชื่อมต่อ Claude ไม่ได้") from e
    except genai_errors.APIError as e:
        code = getattr(e, "code", None)
        if code == 429:
            raise AIUnavailable("ใช้ AI เกินโควตาฟรีของ Gemini ชั่วคราว กรุณารอสักครู่แล้วลองใหม่") from e
        if code in (400, 401, 403) and "key" in str(e).lower():
            raise AIUnavailable("GEMINI_API_KEY ไม่ถูกต้อง") from e
        raise AIUnavailable(f"Gemini ตอบกลับผิดพลาด ({code})") from e
    except (json.JSONDecodeError, StopIteration) as e:
        raise AIUnavailable("อ่านคำตอบของ AI ไม่ได้") from e


def gemini_parts(content: list[dict]) -> list:
    parts: list = []
    for block in content:
        if block["type"] == "text":
            parts.append(block["text"])
        elif block["type"] == "image":
            src = block["source"]
            parts.append(genai_types.Part.from_bytes(data=base64.b64decode(src["data"]), mime_type=src["media_type"]))
    return parts


_GEMINI_BLOCKED = {"SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION", "IMAGE_SAFETY"}


def _call_gemini(system: str, content: list[dict], schema: dict) -> tuple[dict, str, int | None, int | None]:
    response = _get_gemini().models.generate_content(
        model=settings.gemini_model,
        contents=gemini_parts(content),
        config=genai_types.GenerateContentConfig(
            system_instruction=system,
            response_mime_type="application/json",
            response_json_schema=schema,
            max_output_tokens=16000,
        ),
    )
    feedback = getattr(response, "prompt_feedback", None)
    if feedback is not None and getattr(feedback, "block_reason", None):
        raise AIRefused("AI ปฏิเสธคำขอนี้ (ตัวกรองความปลอดภัยของ Gemini)")
    candidate = (response.candidates or [None])[0]
    reason = getattr(getattr(candidate, "finish_reason", None), "name", None) if candidate else None
    if candidate is None or reason in _GEMINI_BLOCKED:
        raise AIRefused("AI ปฏิเสธคำขอนี้ (ตัวกรองความปลอดภัยของ Gemini)")
    if reason == "MAX_TOKENS":
        raise AIUnavailable("คำตอบของ AI ยาวเกินกำหนด")
    text = response.text
    if not text:
        raise AIUnavailable("AI ไม่ได้ส่งคำตอบกลับมา")
    usage = getattr(response, "usage_metadata", None)
    return (json.loads(text), getattr(response, "model_version", None) or settings.gemini_model,
            getattr(usage, "prompt_token_count", None), getattr(usage, "candidates_token_count", None))


def _call_anthropic(system: str, content: list[dict], schema: dict) -> tuple[dict, str, int | None, int | None]:
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
        raise AIUnavailable("ยังไม่ได้ตั้งค่า AI (GEMINI_API_KEY หรือ ANTHROPIC_API_KEY)")
    data, model, tin, tout = _call(system, content, schema)
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
