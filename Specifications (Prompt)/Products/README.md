# AgriGuard Technical Documentation

Design documents for a B2B procurement platform for fruit and agricultural produce, covering everything from creating a purchase request through payment and building a reliability track record.

## Documents

1. [Overview](overview.md) — Vision, scope, and system principles
2. [Ordering Flow](ordering-flow.md) — Order lifecycle and state machine
3. [Matching](../Technical/matching.md) — Matching orchards with buyers
4. [Allocation](../Technical/allocation.md) — Splitting produce across multiple buyers using optimization
5. [AgriTrust](<../Business & Legals/agitrust.md>) — Reliability score based on verified transactions
6. [HarvestLock](<../Business & Legals/harvestlock.md>) — Locking terms before harvest
7. [GradeProof](../Technical/gradeproof.md) — Quality evidence and computer vision
8. [Settlement & Disputes](<../Business & Legals/settlement-disputes.md>) — Amount calculation, payment, and disputes
9. [AI Forecasting](../Technical/ai-forecasting.md) — Yield forecasting and uncertainty
10. [Legal AI](<../Business & Legals/legal-ai.md>) — Contract and policy reading assistant with guardrails
11. [Architecture](../Technical/architecture.md) — Service boundaries
12. [Deployment](../Technical/deployment.md) — Hosting, Google sign-in via Supabase, environments, and CI/CD
13. [Database](../Technical/database.md) — Entity model and constraints
14. [Roadmap](roadmap.md) — Delivery sequence from MVP to scale
15. [Development Phases](development-phases.md) — What the prototype delivers in Phase 1 and what Phase 2 adds

## Scope note

The system supports fruit in general, such as durian, mango, mangosteen, longan, orange, rambutan, or any other type, through a configurable `product_type`, `variety`, `grade_schema`, and season. Rules for a single fruit type should not be hardcoded.
