# Wave 13.2 ACORD-125 Threshold-Profile Delta (2026-07-13)

## Scope
Threshold-profile remediation cycle executed for ACORD-125 with strict constraints:
- No anchor mapping changes
- No semantic assignment changes
- No calibration weight changes
- Focus only on non-anchor confidence policy, threshold curves, review-band boundaries, and suppression noise

Inputs used:
- Latest dynamic XFDL expectations
- Local rebuilt backend API (`/api/mapFields`)
- Regenerated backend/UI mapping artifacts

## Executive Delta (Wave 13.2)
- Backend mappings: 854
- UI rendered fields: 745
- Mapping to UI delta (suppressed/unrendered): 109
- Gold expectation checks: 8
- Mislabels: 0
- Top-N misses: 0
- Low-confidence assignments (<0.6): 626
- Rejected by threshold: 625
- Review band assignments: 207
- Rationale disagreements: 137
- Calibration mismatches: 0
- High-confidence semantic misalignment cases: 25
- Geometry anomalies: invalid 0, tiny 0, large 3

## Wave 13.1b -> Wave 13.2
- Expectation mislabels: 0 -> 0
- Expectation top-N misses: 0 -> 0
- Calibration mismatches: 0 -> 0
- UI rendered fields: 744 -> 745
- Suppressed/unrendered delta: 110 -> 109
- Rejected by threshold: 626 -> 625
- Review band assignments: 207 -> 207
- Low-confidence assignments: 626 -> 626

## Interpretation
- Constraint compliance held: no anchor/semantic/calibration regressions were introduced.
- The threshold-profile follow-up produced modest directional improvement in non-anchor throughput (`+1` rendered field, `-1` suppressed/unrendered delta, `-1` threshold rejection).
- Review-band and low-confidence volumes remained stable, indicating the dominant confidence distribution still clusters near existing decision boundaries.
- Rationale disagreements increased (`93 -> 137`), so this pass improves strict threshold outcomes but increases explanation mismatches that should be targeted in a subsequent cleanup pass.

## Remediation Applied (Non-Anchor Only)
- Added a non-anchor prompt guard to keep threshold-profile changes isolated from anchor prompts.
- Expanded non-anchor field-cue review-band relaxation (`review` and `accepted` curves) while preserving threshold ordering.
- Added a conservative non-anchor confidence policy floor for credible field-cue rows.
- Added a non-anchor review suppression rescue for non-header/non-nonfield rows.
- Added non-anchor header-like noise demotion so low-confidence structural rows are treated as no-candidate instead of rejected mappings.

## Artifacts
- Delta JSON: [wave13_acord125_accuracy_delta.json](../wave13_acord125_accuracy_delta.json)
- Dynamic expectations: [backend/api/tests/generated/acord125-xfdl-expectations.json](../backend/api/tests/generated/acord125-xfdl-expectations.json)
- Backend output: [mapfields_backend_acord125.json](../mapfields_backend_acord125.json)
- UI output: [mapfields_ui_acord125.json](../mapfields_ui_acord125.json)
- Regeneration script: [backend/api/scripts/wave13_regenerate_acord125_mappings.cjs](../backend/api/scripts/wave13_regenerate_acord125_mappings.cjs)
- Delta runner: [backend/api/scripts/wave13_acord125_delta_runner.cjs](../backend/api/scripts/wave13_acord125_delta_runner.cjs)
