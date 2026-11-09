# Database Model

## Core tables

`organizations`, `users`, `farms`, `farm_plots`, `products`, `varieties`, `grade_schemas`, `purchase_requests`, `offers`, `allocations`, `harvest_locks`, `contract_versions`, `delivery_lots`, `quality_inspections`, `evidence`, `settlements`, `payments`, `disputes`, `trust_events`, `trust_scores`, `audit_logs`, `model_versions`

## Key relationships

- organization has users, farms or buyer profile
- purchase request has many offers; accepted offers create allocations
- allocation belongs to one HarvestLock and delivery lots
- inspection belongs to lot and contract version
- settlement aggregates accepted inspection and payment records
- trust event references verified transaction/evidence, never free-text rating only

## Constraints

- unique `(organization_id, external_reference)`
- positive quantities and non-negative prices
- no overlapping active reservations for same supply lot
- append-only contract versions and audit logs
- foreign keys with soft-delete policy for business records

## Acceptance criteria

Migrations include indexes on state/date/organization; the concurrent reservation test passes; PII fields have a retention policy; financial amounts use decimal/integer minor units

