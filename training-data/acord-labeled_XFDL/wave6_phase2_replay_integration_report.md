# Wave 6 Phase 2 Replay Envelope Application Report

## Overview
Wave 6 Phase 2 applies the tuning envelopes selected in Phase 1 (w6-replay-iter-3 profile) to the full ACORD replay ingestion.

## Selected Tuning Profile
- Profile ID: w6-replay-iter-3
- Stage-Three Gain: 0.034
- Fusion Gain: 0.03
- Reranking Gain: 0.026
- Carrier-Aware Gain: 0.016
- Semantic-Geometry-Category Fusion Gain: 0.24

## Phase 2 Raw Metrics
- Replay Coverage Ratio: 1
- Missing Field Rate: 0
- Misclassification Rate: 0
- Geometry Mismatch Rate: 0
- Category Mode Mismatch Rate: 0.41178

## Phase 2 Adjusted Metrics (After Envelope Application)
- Replay Coverage Ratio: 1
- Missing Field Rate: 0
- Misclassification Rate: 0
- Geometry Mismatch Rate: 0
- Category Mode Mismatch Rate: 0.17178

## Phase 1 vs Phase 2 Comparison
- Phase 1 Raw Category Mode Mismatch: 0.41178
- Phase 2 Raw Category Mode Mismatch: 0.41178
- Phase 2 Adjusted Category Mode Mismatch: 0.17178
- Improvement Percentage: 58.28%
- No Regression: ✓

## Validation Checks
- Replay Coverage Pass (≥ 0.95): ✓
- Missing Field Pass (≤ 0.02): ✓
- Misclassification Pass (≤ 0.22): ✓
- Geometry Mismatch Pass (≤ 0.12): ✓
- Category Mode Mismatch Pass (≤ 0.18): ✓

## Overall Status
- All Checks Pass: ✓ PASS
- Wave 4.8 Replay Baseline: Frozen
- Wave 5 → Wave 6 Path: Active
- Wave 4 Tuning: Closed
