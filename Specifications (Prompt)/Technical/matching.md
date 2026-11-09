# Matching Engine

## Objective

Match Buyer demand with farms that have suitable produce, considering timing, quantity, quality, logistics, and reliability.

## Inputs / outputs

Input: `PurchaseRequest`, farm profile, forecast quantity, harvest window, grade schema, distance, buyer constraints

Output: candidates with `score`, reasons, unmet constraints, and `model_version`

## Algorithm

Stage A: deterministic filtering — product/variety match, quantity threshold, overlapping harvest/delivery window, quality compatibility, and transport feasibility

Stage B: weighted baseline:

`score = .30 timing + .25 quantity + .20 quality + .15 logistics + .10 reliability`

Normalize every component to 0–1 and show each factor's contribution

Once there is enough data, switch to Learning-to-Rank such as XGBoost/LightGBM LambdaMART, using a time-based split and preventing future leakage

## API

`POST /api/ai/matching/recommend` → `{ purchase_request_id, limit }`

Response: `{ model_version, recommendations: [{ farm_id, score, reasons }] }`

## Acceptance criteria

- Results never include candidates that violate a hard constraint
- Recommendations are explainable and reproducible from the same model version
- Measure Precision@K, Recall@K, NDCG@K, acceptance, and completed-settlement rate
