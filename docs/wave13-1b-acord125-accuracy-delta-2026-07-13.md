# Wave 13.1b ACORD-125 Calibration Delta (2026-07-13)

## Scope
Calibration-only remediation cycle executed for ACORD-125 with these constraints:
- No anchor mapping rule changes
- No semantic assignment changes
- Focus only on threshold calibration and suppression behavior

Inputs used:
- Latest dynamic XFDL expectations
- Latest Wave-13.1 regenerated mappings
- Local rebuilt backend API (`/api/mapFields`)

## Executive Delta (Wave 13.1b)
- Backend mappings: 854
- UI rendered fields: 744
- Mapping to UI delta (suppressed/unrendered): 110
- Gold expectation checks: 8
- Mislabels: 0
- Top-N misses: 0
- Low-confidence assignments (<0.6): 626
- Rejected by threshold: 626
- Review band assignments: 207
- Rationale disagreements: 93
- Calibration mismatches: 0
- High-confidence semantic misalignment cases: 25
- Geometry anomalies: invalid 0, tiny 0, large 3

## Wave 13.1 -> Wave 13.1b
- Expectation mislabels: 0 -> 0
- Expectation top-N misses: 0 -> 0
- Calibration mismatches: 34 -> 0
- UI rendered fields: 728 -> 744
- Suppressed/unrendered delta: 126 -> 110
- Rejected by threshold: 625 -> 626
- Review band assignments: 207 -> 207
- Low-confidence assignments: 626 -> 626

## Interpretation
- Calibration mismatch remediation succeeded fully for this cycle (`34 -> 0`).
- Suppression noise improved materially (more UI rendered fields, smaller suppressed/unrendered gap).
- Threshold-based rejections did not improve (`625 -> 626`), indicating current confidence distribution remains concentrated below effective review thresholds for many non-anchor rows.
- Anchor and semantic outcomes remained stable (no regressions in the 8-anchor expectation checks).

## Remediation Applied (Calibration Only)
- Threshold-decision alignment changed to use resolved per-candidate thresholds (same basis used by delta mismatch evaluation).
- Mild field-cue threshold relaxation for non-header/non-nonfield rows.
- Suppression rescue for credible field-cue rows to reduce false suppression noise.
- Added conservative field-cue confidence review rescue floor for borderline candidates.

## Artifacts
- Delta JSON: [wave13_acord125_accuracy_delta.json](../wave13_acord125_accuracy_delta.json)
- Dynamic expectations: [backend/api/tests/generated/acord125-xfdl-expectations.json](../backend/api/tests/generated/acord125-xfdl-expectations.json)
- Backend output: [mapfields_backend_acord125.json](../mapfields_backend_acord125.json)
- UI output: [mapfields_ui_acord125.json](../mapfields_ui_acord125.json)
- Regeneration script: [backend/api/scripts/wave13_regenerate_acord125_mappings.cjs](../backend/api/scripts/wave13_regenerate_acord125_mappings.cjs)
- Delta runner: [backend/api/scripts/wave13_acord125_delta_runner.cjs](../backend/api/scripts/wave13_acord125_delta_runner.cjs)
