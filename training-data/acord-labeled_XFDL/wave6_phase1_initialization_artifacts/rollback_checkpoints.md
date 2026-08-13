# wave6_phase1_rollback_checkpoints

1. Disable Wave 6 strict replay gate enforcement temporarily.
2. Revert replay threshold policy adjustments if classification regressions appear.
3. Roll back to last stable fixture partition and seed set.
4. Preserve Wave 5 strict tuning gates while rolling back Wave 6-only changes.

Constraints:
- Do not modify Wave 4.8 replay baseline.
- Do not reopen Wave 4 tuning.
