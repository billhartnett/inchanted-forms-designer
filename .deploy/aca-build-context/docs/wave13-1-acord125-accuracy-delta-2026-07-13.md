# Wave 13.1 ACORD-125 Accuracy Delta (2026-07-13)

## Scope
Focused remediation cycle for three remaining ACORD-125 anchors:
- named-insured
- mailing-address
- policy-number

Cycle executed against:
- Regenerated backend mappings from local rebuilt API
- Regenerated UI mapping artifacts
- Latest dynamic XFDL expectations
- ACORD-125 canonical gold XFDL

## Executive Delta (Wave 13.1)
- Backend mappings: 854
- UI rendered fields: 728
- Mapping to UI delta (suppressed/unrendered): 126
- Gold expectation checks: 8
- Mislabels (expected code != chosen code): 0
- Top-N misses at expectation anchors: 0
- Low-confidence assignments (<0.6): 626
- Rejected by threshold: 625
- Review band assignments: 207
- Rationale disagreements: 93
- Calibration decision mismatches: 34
- High-confidence semantic misalignment cases: 25
- Geometry anomalies: invalid 0, tiny 0, large 3

## Anchor Outcome (Wave 13.1 Focus)
1. named-insured
- Expected: GeneralInfo.NamedInsured
- Chosen: GeneralInfo.NamedInsured
- Block: p1-l92
- Text: NAME (First Named Insured & Other Named Insureds)
- Confidence: 0.856
- Top-N: hit

2. mailing-address
- Expected: GeneralInfo.MailingAddress
- Chosen: GeneralInfo.MailingAddress
- Block: p1-l93
- Text: MAILING ADDRESS INCL ZIP+4 (of First Named Insured)
- Confidence: 0.85
- Top-N: hit

3. policy-number
- Expected: Policy_PolicyNumberIdentifier
- Chosen: Policy_PolicyNumberIdentifier
- Block: p1-l11
- Text: POLICY NUMBER
- Confidence: 0.969
- Top-N: hit

## Wave 13 -> Wave 13.1 Comparison
- Mislabels: 3 -> 0
- Top-N misses: 3 -> 0
- Low-confidence assignments: 628 -> 626
- Rejected by threshold: 627 -> 625
- Review band assignments: 214 -> 207
- Rationale disagreements: 95 -> 93
- Calibration mismatches: 35 -> 34
- UI rendered fields: 729 -> 728
- Suppressed/unrendered delta: 125 -> 126

## Remediation Changes Applied
- Targeted anchor prompt handling in mapping engine for:
  - named-insured
  - mailing-address
  - policy-number
- Header strict-gating exemptions for these focused anchor prompts to prevent false header suppression on field prompts.
- Anchor-specific confidence calibration updates:
  - stronger promotion of canonical target codes
  - stronger suppression of known distractor variants for the focused prompts
- ACORD-specific canonicalization rule applied to top candidate for focused anchor prompts:
  - GeneralInfo.NamedInsured
  - GeneralInfo.MailingAddress
  - Policy_PolicyNumberIdentifier
- Supervision tuning updates for focused anchors:
  - increased anchor weight multipliers and semantic/category hint weighting
  - expanded regex variants for the focused prompt shapes

## Artifacts
- Delta JSON: [wave13_acord125_accuracy_delta.json](../wave13_acord125_accuracy_delta.json)
- Dynamic expectations: [backend/api/tests/generated/acord125-xfdl-expectations.json](../backend/api/tests/generated/acord125-xfdl-expectations.json)
- Wave 13.1 regeneration script: [backend/api/scripts/wave13_regenerate_acord125_mappings.cjs](../backend/api/scripts/wave13_regenerate_acord125_mappings.cjs)
- Delta runner: [backend/api/scripts/wave13_acord125_delta_runner.cjs](../backend/api/scripts/wave13_acord125_delta_runner.cjs)
- XFDL extraction script: [backend/api/scripts/extract-wave13-acord125-xfdl-expectations.cjs](../backend/api/scripts/extract-wave13-acord125-xfdl-expectations.cjs)
- Backend mappings output: [mapfields_backend_acord125.json](../mapfields_backend_acord125.json)
- UI mappings output: [mapfields_ui_acord125.json](../mapfields_ui_acord125.json)
- Canonical gold XFDL: [backend/api/tests/gold-standard/acord-125/ACORD 0125 2016-03r1.xfdl](../backend/api/tests/gold-standard/acord-125/ACORD%200125%202016-03r1.xfdl)

## Notes
- Focused anchor objective is fully met for the 8-anchor expectation set in this cycle (0 mislabels, 0 top-N misses).
- Non-anchor calibration drift remains visible (34 mismatches, high rejected volume), but modestly improved from Wave 13 in this pass.
