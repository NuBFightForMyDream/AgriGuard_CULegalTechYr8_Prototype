# GradeProof

## Purpose

Record quality inspection results as evidence-linked records and compare them against the HarvestLock criteria.

## Inputs / outputs

Input: delivery lot, weight, sampling method, photos/video, inspector measurements, grade schema, contract version

Output: grade distribution, accepted/rejected quantity, confidence, evidence links, QC decision, and discrepancy flags

## Algorithm

MVP: rule-based thresholds + inspector checklist + immutable evidence metadata

Upgrade: a computer vision model such as YOLO/a classifier to detect defects, size, and color; a human inspector must approve, and the model must return confidence/an unknown class

`POST /api/quality-inspections`; `GET /api/lots/{id}/gradeproof`

## Acceptance criteria

- Every inspection result records the inspector, timestamp, device/source, and contract version
- AI predictions never automatically override a human decision
- Duplicate/blurry images are flagged
- The system calculates price from the grade-price matrix and allows opening a dispute when results differ from the lock
