# wave6_phase1_exit_gates

## Mandatory Gates
1. Replay deterministic reproducibility validated across repeated runs.
2. Strict-mode classification fields present on all strict replay reports:
   - hostHealthFailure
   - mappingThresholdFailure
   - failureClass
3. Replay threshold envelope pass rate meets policy target.
4. Nightly, release branch, and sprint-exit strict replay workflows pass.
5. PR label requires-strict-mode triggers strict replay gate.

## Guardrail Gates
- Wave 4.8 replay baseline remains unchanged.
- Wave 4 tuning remains closed.
- Execution remains Wave 5 -> Wave 6 only.
