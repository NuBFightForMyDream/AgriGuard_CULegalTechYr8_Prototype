# Legal AI Assistant

## Purpose

Helps summarize contracts, flag risky clauses, and answer questions from approved policies/documents. It is not a lawyer and does not give legal advice with guaranteed outcomes.

## Architecture

LLM + RAG + deterministic rule engine: ingest versioned documents, chunk, embed, retrieve with access control, generate answers with citations and confidence; the rule engine checks required clauses such as price, delivery, QC, payment, cancellation, dispute, and governing law

## APIs

- `POST /api/legal/documents`
- `POST /api/legal/review`
- `POST /api/legal/questions`

Output: summary, clause findings, source citations, missing fields, suggested questions, `human_review_required`

## Guardrails

- Never hallucinate clauses or cite law without a source
- Isolate tenants/document permissions and redact personal data before sending to the model
- Every generated output is labeled `AI-generated`, and the prompt/model/document versions are stored
- High-risk clauses require human review before being used to create a contract

## Acceptance criteria

Every answer can be traced back to its source text; if the information is not found, the assistant must say so and request additional documents.
