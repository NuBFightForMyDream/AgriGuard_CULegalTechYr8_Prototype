# Settlement & Disputes

## Settlement

Net amount = Σ(quantity_by_grade × agreed_price) + adjustments − deposit − approved deductions

Create a settlement snapshot from accepted QC results; never silently read values that were edited afterwards.

APIs: `POST /api/orders/{id}/settlements/preview`, `POST /api/settlements/{id}/confirm`, `POST /api/payments/proof`

## Dispute workflow

`OPENED → EVIDENCE_REQUESTED → UNDER_REVIEW → RESOLVED` or `ESCALATED`

A dispute must have an issue type, claimant, evidence, disputed amount, deadline, reviewer, and resolution reason

## Anomaly detection

Start with rules such as repeated last-minute cancellation, duplicate evidence, and abnormal grade variance; later, use Isolation Forest as a signal only, never as a verdict

## Acceptance criteria

- Disputed money can be separated out as a held amount
- Both parties can see the evidence and response deadline
- A resolution creates an audit event and updates AgriTrust only for verified responsibility
- Payment status is idempotent and handles duplicate webhooks
