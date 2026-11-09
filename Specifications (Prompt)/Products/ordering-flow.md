# Ordering Flow

## Lifecycle

1. The Buyer creates a `PurchaseRequest` specifying type/variety, quantity, receiving date range, grade, location, and payment terms
2. The Matching service filters eligible farms and ranks them
3. The Buyer sends an offer; the farm sees the price, terms, and AgriTrust profile
4. The farm uses the Allocation Planner to split quantity across multiple Buyers
5. A HarvestLock is created per buyer and confirmation is requested from both parties
6. Only once confirmed is supply conditionally reserved and delivery lots created
7. Weigh / ship / inspect via GradeProof
8. Calculate settlement and track payment
9. Close the transaction and create verified events for AgriTrust

## State machine

`OFFER_PENDING → RESERVED → CONFIRMED → HARVESTED → IN_TRANSIT → QC_PENDING → QC_ACCEPTED → PAYMENT_PENDING → PAID → COMPLETED`

Alternative states: `EXPIRED`, `CANCELLED`, `DISPUTED`, `PARTIALLY_SETTLED`. Every transition must record a role, reason, and audit log.

## APIs

- `POST /api/purchase-requests`
- `POST /api/offers`
- `POST /api/orders/{id}/confirm`
- `POST /api/orders/{id}/cancel`
- `GET /api/orders/{id}/timeline`

## Acceptance criteria

- An unconfirmed offer does not permanently deduct available supply
- Concurrent confirmations use a database transaction/row lock
- An expired reservation can release supply, but a confirmed contract must go through the cancellation policy
- The timeline shows the actor, time, evidence, and old/new state
