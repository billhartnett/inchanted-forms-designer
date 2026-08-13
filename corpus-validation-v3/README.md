# Corpus Validation v3

## Overview
- Paired forms evaluated: 51
- Total truth fields: 16227
- Total matched fields: 8697
- Total predicted fillable fields: 11663
- Total discrepancies: 40779
- Backend semantic accuracy: 53.60%
- Designer visual accuracy: -56.65%
- Table accuracy: 64.45%
- Checkbox/Yes-No accuracy: 99.41%
- Suppression accuracy: 53.60%
- Grouping accuracy: 69.50%
- Label/value pairing accuracy: 92.49%

## Readiness
The system is evaluated as: not-ready-for-full-production.

This is a useful validation checkpoint for supervised rollout, but it is not yet a blanket full-production signoff because residuals remain primarily in table layout, grouping, suppression, and semantic label reconciliation under complex edge-case forms.

## Remaining residuals
- backend residual: 7
- designer residual: 8
- layout-driven edge case: 36
- corpus anomaly: 0

## Files generated
- summary-report.json
- snapshot-manifest.json
- visual-diffs/
- semantic-diffs/
- final-refinements-v3/
