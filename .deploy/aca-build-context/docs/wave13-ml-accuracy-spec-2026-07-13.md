# Wave 13 ML Accuracy Specification (2026-07-13)

## Goal
Begin Wave 13 ML accuracy phase for ACORD eLabel mapping on carrier-specific XFDL forms, using correctly mapped ACORD 125 as the gold-standard training exemplar.

## Primary Outcome Targets
- Improve extraction accuracy for ACORD-relevant fields in carrier XFDL forms.
- Improve ACORD eLabel classification accuracy.
- Improve arbitration confidence calibration for close-label conflicts.
- Tune scoring thresholds to reduce low-confidence false accepts.
- Improve semantic cluster alignment to ACORD ontology sections/groups.

## Gold Standard Definition
- Canonical exemplar: ACORD 125 mappings verified as correct.
- Required for each exemplar field:
  - source extraction block id
  - normalized field text
  - ACORD code
  - ACORD eLabel
  - expected semantic cluster
  - expected arbitration winner (where conflicts exist)
- Exemplar quality gate:
  - no unresolved mapping conflicts
  - no unlabeled required fields
  - confidence trace available for each accepted mapping

## Dataset Plan
- Training corpus:
  - ACORD 125 gold-standard exemplars (seed set)
  - Carrier-specific XFDL forms with mapped labels
- Validation corpus:
  - Held-out ACORD 125 variants
  - Held-out carrier forms by family
- Split strategy:
  - by carrier family and form variant, not random line-level split

## Feature and Signal Plan
- Extraction features:
  - OCR text confidence
  - geometry and page region context
  - key-value and checkbox/signature states
- Classification features:
  - lexical and embedding similarity
  - dictionary score
  - ontology section/group alignment
- Arbitration features:
  - confidence deltas between top candidates
  - ontology rule violations
  - carrier adapter compatibility
- Scoring signals:
  - calibrated confidence
  - risk and underwriting signal impacts

## Model Behaviors to Tune
- ACORD eLabel ranking model:
  - optimize top-1 correctness and top-k recall
- Arbitration confidence model:
  - increase margin for accepted decisions
  - reduce unstable close-score flips
- Threshold calibration:
  - `accept`, `review`, `reject` by family and by ACORD code where needed

## Wave 13 KPIs
- Extraction accuracy (field-level): target >= 0.97 on validation set
- eLabel top-1 accuracy: target >= 0.95 on ACORD 125 validation
- eLabel top-3 recall: target >= 0.99 on ACORD 125 validation
- Arbitration winner precision: target >= 0.94
- Over-confident false accept rate: target <= 0.01
- Semantic cluster alignment accuracy: target >= 0.96

## Evaluation Protocol
- Per-run outputs required:
  - confusion matrix by ACORD eLabel
  - calibration curve and Brier score
  - arbitration conflict resolution report
  - threshold sensitivity table
  - semantic cluster drift summary
- Mandatory slices:
  - ACORD 125
  - each carrier family
  - low-confidence cohort
  - high-overlap geometry cohort

## Rollout Plan
1. Baseline using current Wave-9/Wave-10 stack and ACORD 125 exemplar set.
2. Train/tune eLabel ranking and arbitration calibration.
3. Re-evaluate with held-out carrier XFDL sets.
4. Apply threshold updates (global and family overrides).
5. Promote only if all critical KPIs pass and regression gates remain clean.

## Hard Gates
- No contract violations on Wave-9 transport endpoints.
- No regression in strict-mode or baseline replay gates.
- No increase in unresolved semantic conflicts for ACORD 125 slice.
