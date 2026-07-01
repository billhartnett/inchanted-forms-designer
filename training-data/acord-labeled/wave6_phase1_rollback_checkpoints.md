# wave6_phase1_rollback_checkpoints

## Rollback Checkpoints
1. Disable Wave 6 replay gate enforcement while retaining Wave 5 strict-mode gates.
2. Revert replay threshold policy changes if classification mismatch rate exceeds tolerance.
3. Freeze replay fixture set to last known stable slice if reproducibility fails.
4. Restore prior CI gate behavior while preserving Wave 5 exit artifacts.

## Rollback Constraints
- Do not modify Wave 4.8 replay baseline.
- Do not reopen Wave 4 tuning.
