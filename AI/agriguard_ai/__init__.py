"""AgriGuard AI package.

Pure AI logic with no database access: model providers (Gemini / Claude with failover), prompts and JSON schemas,
the approved policy knowledge base and its retrieval, the Legal AI rule engine, the navigation chatbot catalog,
QC photo preparation and the harvest forecast baseline. The Backend loads data, calls these functions, and logs
every AI call in its ai_runs table.
"""

from agriguard_ai.providers import AIRefused, AIUnavailable, Generation, available, generate, model_name, provider

__all__ = ["AIRefused", "AIUnavailable", "Generation", "available", "generate", "model_name", "provider"]
