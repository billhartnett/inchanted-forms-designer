# Wave 13 Model Performance Report (2026-07-13)

## Report Type
Initial Wave 13 baseline report (pre-training refinement pass).

## Summary
Wave 13 has started with UI cleanup complete and ML accuracy phase initialized. This report captures the baseline operating state before ACORD 125-driven tuning and retraining loops.

## Operational Baseline Signals
- Frontend Wave-9 integration sweep (`designer_wave9_frontend_integration_report.json`):
  - checked: 12
  - transport failures: 0
  - status mismatches: 0
  - contract violations: 0
  - failed: 0
- Backend production endpoint sweep (`backend_validation_report.production.wave8.json`):
  - checked: 75
  - transport failures: 0
  - status mismatches: 0
  - contract violations: 0
  - failed: 0
- Wave-8 final regression baseline (`training-data/acord-labeled/wave8_final_regression_report.json`):
  - regressions detected: 0
  - pass rate: 1.0
  - category mode mismatch rate baseline: 0.17178

## Wave 13 UI/UX Readiness for Accuracy Testing
- ACORD eLabel and semantic cluster visibility now present in mapping and semantic summary surfaces.
- Wave-8 diagnostic metadata removed from primary tester-facing semantic panels.
- Build validation status: PASS (`npm run build` in `frontend/`).

## Accuracy Baseline Status
Current state is baseline-only. Wave 13 model tuning has been initiated but not yet completed. Therefore, the following metrics are tracked as `pending empirical run` until the first ACORD 125 exemplar training/evaluation cycle is executed:
- Extraction field-level accuracy (ACORD 125 slice)
- ACORD eLabel top-1/top-3 accuracy
- Arbitration winner precision/recall
- Confidence calibration error (Brier / ECE)
- Semantic cluster alignment accuracy

## Planned Measurement Output (Next Run)
The first Wave 13 ML run will publish:
- ACORD 125 gold-standard evaluation table
- carrier-family stratified evaluation table
- eLabel confusion matrix
- arbitration confidence and threshold tuning deltas
- semantic cluster drift and alignment report

## Risks and Controls
- Risk: legacy metadata paths may still exist in non-primary ingestion internals.
  - Control: keep user-facing semantics aligned to Wave-10/11 model output and validate output payloads.
- Risk: overfitting to ACORD 125 exemplar.
  - Control: enforce held-out carrier-family validation and cluster-level drift checks.

## Current Decision
Wave 13 is in `baseline locked / tuning ready` state.
Proceed to ACORD 125 exemplar-driven training, calibration, and threshold refinement loop.
