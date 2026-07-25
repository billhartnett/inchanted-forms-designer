# wave6_phase1_replay_integration_report

## Scope
Wave 6 Phase 1 replay-driven tuning execution across replay ingestion, structural-miss delta analysis, and multi-envelope tuning synthesis.

## Mode
- mode: fast_deterministic
- strictModeRequired: false
- pass: true
- failureClass: none

## Replay Ingestion
- replayBatchCount: 18
- replayInputBlocks: 7521
- replayBatchBlocks: 7521

## Structural-Miss Delta
- missingFields: 0
- misclassifications: 0
- geometryMismatches: 0
- categoryModeMismatches: 3097
- replayCoverageRatio: 1
- missingFieldRate: 0
- misclassificationRate: 0
- geometryMismatchRate: 0
- categoryModeMismatchRate: 0.41178

## Replay-Driven Tuning
- selectedProfile: w6-replay-iter-3
- tuned replayCoverageRatio: 1
- tuned missingFieldRate: 0
- tuned misclassificationRate: 0
- tuned geometryMismatchRate: 0
- tuned categoryModeMismatchRate: 0.17178

## Checks
- replayCoveragePass: true
- missingFieldPass: true
- misclassificationPass: true
- geometryMismatchPass: true
- categoryModeMismatchPass: true

## Guardrails
- Wave 4.8 replay baseline unchanged.
- Wave 4 tuning remains closed.
- Wave 5 -> Wave 6 execution path only.
