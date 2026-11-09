# AgriTrust

## Purpose

Evidence-Based Buyer Reliability. This is not a financial credit score, and the score should not be interpreted directly as a probability.

## Inputs / outputs

Input: verified payment, pickup, contract, QC, and dispute events, with responsibility/evidence status

Output: dimensions, score/risk band, sample size, confidence/uncertainty, reasons, appeal status

Baseline dimensions: Payment 30%, Pickup 25%, Contract 20%, QC transparency 15%, Dispute resolution 10%

`TrustScore = .30P + .25R + .20C + .15Q + .10D`

When data is limited, use Bayesian smoothing `(successes + α)/(trials + α + β)` and show the number of transactions, so the score does not imply more precision than it has.

## APIs

- `GET /api/buyers/{id}/trust-profile`
- `POST /api/trust/events`
- `POST /api/trust/{id}/appeals`

## Rules

- An unresolved dispute does not deduct the score automatically
- No history = `Insufficient Data`, not a score of zero
- Every score has an explanation and an audit trail
- Do not use protected/sensitive data that is not relevant

## Acceptance criteria

Buyers can review the events affecting their score and file an appeal; a correction recalculates the score in a versioned way and shows before/after.
