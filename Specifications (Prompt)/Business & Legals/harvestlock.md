# HarvestLock

## Purpose

Record the agreement before harvest to prevent price surprises and create a verifiable contract baseline.

## Inputs / outputs

Input: parties, product/variety, expected quantity, grade-price matrix, harvest/delivery window, pickup, payment, shortfall/cancellation rules

Output: immutable contract version, acceptance records, reservation policy, evidence checklist

## Implementation

Serialize the terms as canonical JSON and hash them into `terms_hash`; every amendment creates a new version and must be accepted by the affected parties.

`POST /api/harvest-locks` creates a draft; `POST /api/harvest-locks/{id}/accept` confirms; `POST /api/harvest-locks/{id}/amend` requests an amendment

## Acceptance criteria

- Show a diff between contract versions
- Never edit an existing price in place
- Reservation expiry is separate from confirmed cancellation
- The system supports shortfall, overage, grade downgrade, and force-majeure reasons
