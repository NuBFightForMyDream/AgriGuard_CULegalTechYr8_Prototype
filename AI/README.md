# AgriGuard AI (`agriguard_ai`)

Everything AI in AgriGuard, as a Python package the Backend installs. **No database access**: the Backend loads
data, calls these functions, and logs every call in its `ai_runs` table (`Backend/app/services/ai_bridge.py`).

| Module | What it does |
| --- | --- |
| `providers.py` | Calls Gemini (`GEMINI_API_KEY`) or Claude (`ANTHROPIC_API_KEY`) for JSON-schema answers; fails over to the other provider; refusal/safety handling; `redact()` strips emails, phone numbers and ID numbers |
| `config.py` | Keys and model names, read from the environment |
| `knowledge/*.md` | Approved policy documents the assistants may answer from. One `## ` section = one citable source (`<file>#<n>`) |
| `retrieval.py` | Finds relevant sections with character 3-gram TF-IDF (works for Thai without a word segmenter) |
| `legal.py` | Legal AI: rule engine for contract clauses, prompts and schemas for contract review and Q&A, citation validation |
| `navigator.py` | Navigation chatbot: role-filtered page catalog, keyword mode (no key), prompt/schema, destination validation |
| `vision.py` | QC photo assist: image downscaling, prompt/schema, converting grade percentages to kilograms |
| `forecast.py` | Harvest forecast baseline (yield-per-rai ranges; labelled baseline, not a trained model) |

## Develop

```bash
cd AI
uv sync
uv run python -m pytest        # no network, no database
```

The Backend uses this folder as an editable dependency (`Backend/pyproject.toml` → `agriguard-ai = { path = "../AI" }`),
so changes here show up in the API after a restart. Docker builds from the repo root for the same reason.

Common changes:
- **Change what the assistants know:** edit or add Markdown in `knowledge/` (keep sections short; one topic per `## `).
- **Change a prompt or output:** edit `SYSTEM` / the schema / the `*_content` builder in the module, and bump its
  `PROMPT_VERSION` so cached contract reviews are regenerated and `ai_runs` shows which version produced what.
- **Add a page to the chatbot:** add a `Dest` to `navigator.CATALOG` with the roles that may see it.
- **Switch model:** `GEMINI_MODEL` / `AI_MODEL` env vars; `AI_PROVIDER=gemini|anthropic` sets which goes first.

## Guardrails (keep them when changing prompts)

Answers only from the given sources, every point cites a real source id (invented ids are dropped in code, not by
trusting the model), "not found" instead of guessing, personal data redacted before any call, outputs labelled
AI-generated, high-risk findings require human review, and AI suggestions never change contracts, scores or QC
results on their own. The Gemini free tier lets Google use submitted content to improve its products: demo data only.
