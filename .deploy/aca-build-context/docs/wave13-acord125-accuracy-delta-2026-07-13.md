# Wave 13 ACORD-125 Accuracy Delta (2026-07-13)

## Scope
Cycle executed against current ACORD-125 outputs and gold-standard expectations using:
- Current backend mapping output
- Current UI rendered field output
- Canonical ACORD-125 XFDL gold form (2016-03r1)
- XFDL-derived dynamic ACORD-125 expectation set (anchors + labels + geometry + semantic paths)
- ACORD-125 quality/ontology/calibration baselines
- Fixture expectation anchors

Canonical gold form in repo:
- [backend/api/tests/gold-standard/acord-125/ACORD 0125 2016-03r1.xfdl](backend/api/tests/gold-standard/acord-125/ACORD%200125%202016-03r1.xfdl)

## Executive Delta
- Backend mappings: 854
- UI rendered fields: 729
- Mapping to UI delta (suppressed/unrendered): 125
- Gold expectation checks: 8
- Mislabels (expected code != chosen code): 3
- Top-N misses at expectation anchors: 3
- Low-confidence assignments (<0.6): 628
- Rejected by threshold: 627
- Rationale disagreements: 95
- Calibration decision mismatches: 35
- High-confidence semantic misalignment cases: 25
- Geometry anomalies: invalid 0, tiny 0, large 3

### Post-Remediation Summary (Wave-13)
- Anchor accuracy improved on the targeted ACORD-125 anchors: mislabels and top-N misses both moved from 7 to 3.
- Remaining miss set is now concentrated in three anchors: named-insured, mailing-address, and policy-number.
- Tradeoff signals increased during this pass:
  - UI rendered fields decreased from 761 to 729 (suppressed/unrendered delta rose from 93 to 125).
  - Calibration mismatches increased from 1 to 35.
  - Low-confidence / rejected counts rose modestly (609 -> 628 and 608 -> 627).
- Rationale disagreement volume dropped materially (747 -> 95), indicating cleaner lexical-vs-semantic arbitration even with the remaining anchor misses.

## 1) Mislabels (eLabel/classification)
1. named-insured
- Expected: GeneralInfo.NamedInsured
- Chosen: NamedInsured_LegalEntity_OtherDescription
- Block: p1-l92
- Text: NAME (First Named Insured & Other Named Insureds)
- Confidence: 0.78
- Top-N: miss

2. mailing-address
- Expected: GeneralInfo.MailingAddress
- Chosen: NamedInsured_MailingAddress_PostalCode
- Block: p1-l93
- Text: MAILING ADDRESS INCL ZIP+4 (of First Named Insured)
- Confidence: 0.742
- Top-N: miss

3. policy-number
- Expected: Policy_PolicyNumberIdentifier
- Chosen: null
- Block: p1-l11
- Text: POLICY NUMBER
- Confidence: 0.00
- Top-N: miss

## 2) Low-Confidence Assignments
- 628 of 854 mappings are below 0.6.
- Threshold bands:
  - accepted: 0
  - review: 214
  - rejected: 627

Representative low-confidence cases:
- p1-l1: COMMERCIAL INSURANCE APPLICATION -> CommercialPropertyCoverage_DependentProperty_CoinsurancePercentage (0.46, rejected)
- p1-l6: CARRIER -> BuildersRiskInstallation_Transportation_CommonCarrierRiskPercent (0.46, rejected)
- p1-l10: POLICIES OR PROGRAM REQUESTED -> AirportFBOLineOfBusiness_ApplicantParticipateNATASafetyFirstProgramExplanation (0.46, rejected)

## 3) Rationale Disagreements (semantic vs lexical)
- 95 cases flagged where lexical evidence is strong while semantic similarity is near zero (or ambiguity noted).
- Common pattern: lexicalScore ~1.0 with semanticSimilarity 0.0.

Representative disagreements:
- p1-l12: CITY: -> Aircraft_SeatingCapacityCount (conf 0.62, lexical 1.0, semantic 0.0)
- p1-l15: STATE: -> StatementOfValues_CauseOfLoss_BasicIndicator (conf 0.62, lexical 1.0, semantic 0.0)
- p1-l170: NATURE OF BUSINESS... -> BoilerAndMachinery...CoolPremises...Explanation (conf 0.62, alignment low)

Arbitration-confidence coupling:
- Mappings with arbitration evidence present: 213
- Mappings without arbitration evidence: 641
- Low-confidence mappings without arbitration evidence: 628

## 4) Calibration/Threshold Mismatches
- 35 direct threshold-decision mismatches detected.
- Most mismatches cluster at low confidence where assigned decision does not match configured threshold bands.

## Extraction Geometry Evaluation
- Invalid geometries (non-positive width/height): 0
- Tiny geometries (<=8 px in width or height): 0
- Large geometries: 3 (all signature-class fields at 180x80)
- Geometry quality appears structurally stable; primary defects are semantic/classification and confidence calibration, not box integrity.

## 5) Current Remediation Notes
- Mapping remediation included targeted anchor supervision and prompt-level disambiguation for:
  - named insured
  - mailing address
  - policy number
  - business start date
  - city
  - state
  - zip
  - agent name
- Dynamic expectation extraction now uses page-aware matching, row-level city/state/zip disambiguation, and stricter fallback checks for state labels.
- Remaining tuning focus should prioritize:
  - forcing policy-number prompts away from null selection when lexical evidence is explicit
  - preferring `GeneralInfo.NamedInsured` for first-named-insured prompts
  - preferring full mailing address line targets over postal-only targets for mailing-address prompts

## Baseline Context (ACORD-125)
- exactAccuracy: 0
- topNAccuracy: 0
- lowConfidenceRate: 1.0
- chosenWithinTopNRate: 0.244582
- calibratedAccuracy: 0
- thresholdAdjustedRankingQuality: 0.159439
- lowConfidenceFields: 79
- unstableSignals: 79

## Output Artifacts
- Detailed computed delta JSON: [wave13_acord125_accuracy_delta.json](wave13_acord125_accuracy_delta.json)
- Dynamic expectation set: [backend/api/tests/generated/acord125-xfdl-expectations.json](backend/api/tests/generated/acord125-xfdl-expectations.json)
- Runner used for this cycle: [backend/api/scripts/wave13_acord125_delta_runner.cjs](backend/api/scripts/wave13_acord125_delta_runner.cjs)
- XFDL extraction script: [backend/api/scripts/extract-wave13-acord125-xfdl-expectations.cjs](backend/api/scripts/extract-wave13-acord125-xfdl-expectations.cjs)
- Gold source used in this cycle: [backend/api/tests/gold-standard/acord-125/ACORD 0125 2016-03r1.xfdl](backend/api/tests/gold-standard/acord-125/ACORD%200125%202016-03r1.xfdl)
- Source current outputs:
  - [mapfields_backend_acord125.json](mapfields_backend_acord125.json)
  - [mapfields_ui_acord125.json](mapfields_ui_acord125.json)
- Gold baseline inputs:
  - [backend/api/tests/fixture-expectations.json](backend/api/tests/fixture-expectations.json)
  - [backend/api/tests/baselines/quality/sample-Acord-125.pdf.quality.json](backend/api/tests/baselines/quality/sample-Acord-125.pdf.quality.json)
  - [backend/api/tests/baselines/ontology/sample-Acord-125.pdf.ontology.json](backend/api/tests/baselines/ontology/sample-Acord-125.pdf.ontology.json)
  - [backend/api/tests/baselines/calibration/sample-Acord-125.pdf.calibration.json](backend/api/tests/baselines/calibration/sample-Acord-125.pdf.calibration.json)
