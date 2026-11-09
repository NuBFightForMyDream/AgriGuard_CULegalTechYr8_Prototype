# Overview

## Product

AgriGuard is a B2B agricultural procurement and transaction-assurance platform connecting Farmers, Buyers, Inspectors, and Admins. It manages the risks around unharvested produce, actual quantity, quality, goods receipt, and payment.

## Core flow

`Purchase Request → Match → Offer → Allocation → HarvestLock → Harvest/Delivery → GradeProof → Settlement → AgriTrust`

## Design principles

- A request is not a confirmed order until both parties confirm the HarvestLock
- Every piece of evidence must have an owner, timestamp, source, and verification status
- AI is decision support; it must never change a contract or deduct a score automatically without review
- When data is limited, use a rule-based baseline and show `Insufficient Data`

## Inputs / outputs

Input: product demand, farm supply forecast, quality requirements, dates, location, offers, evidence

Output: ranked matches, allocation proposal, locked contracts, inspection result, settlement ledger, reliability events

## Acceptance criteria

- Users can create transactions for many fruit types without code changes
- Every state transition has authorization and an audit event
- No overbooking occurs when confirmations happen concurrently
- Users can see the reasoning and evidence behind each recommendation
