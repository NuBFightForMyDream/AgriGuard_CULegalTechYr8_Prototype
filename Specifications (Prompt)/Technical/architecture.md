# Architecture

## Logical components

`Next.js/TypeScript Web + Mobile PWA`

→ `FastAPI API + Auth/RBAC + Workflow Orchestrator`

→ `PostgreSQL (transactions) | Redis (cache/jobs) | Object Storage (evidence) | ML Registry`

Workers: matching, optimizer, forecast, vision inference, legal RAG, notifications, payment reconciliation

## Integration rules

- Synchronous APIs for commands that need an immediate response; async jobs for model/inference and large files
- Event outbox from the transaction DB to publish reliable domain events
- Idempotency keys for confirm, settlement, and payment webhooks
- Observability: structured logs, trace ID, metrics, model/data version

## Security

RBAC by role and organization, signed upload URLs, encryption at rest/in transit, tenant isolation, secrets manager, append-only audit log

## Acceptance criteria

A service failure never leaves a contract state stuck without a retry/status; evidence access is checked at both the API and object storage; models can be rolled back by version.
