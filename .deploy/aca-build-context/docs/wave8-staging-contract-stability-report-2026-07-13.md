# Wave 8 Staging Contract Stability Report (2026-07-13)

## Scope
- Contract target: wave8.v1
- Endpoint set: 75 frontend-facing API routes (ACORD extraction, semantic inference, arbitration, normalization, scoring, preview, and baseline platform routes)
- Sweep script: backend/api/scripts/wave8_contract_stability_sweep.cjs

## Execution
- Environment label: staging
- Base URL: https://inchanted-api-production.greenriver-7266e28c.eastus.azurecontainerapps.io
- Output artifact: backend_validation_report.staging.wave8.json
- Timestamp (UTC): 2026-07-13T04:10:57.098Z

## Results
- Checked: 75
- Transport failures: 0
- Status mismatches: 8
- Contract violations: 75
- Total failures: 83
- Pass/Fail: FAIL

## Key Findings
- The active deployment does not yet emit the Wave 8 contract envelope for most routes (missing required envelope fields such as ok and status).
- New Wave 9 UI-support aliases are not yet present in the active deployment (/api/wave9/* returned 404).
- Baseline service health is reachable and stable (no transport failures), so failures are contract-shape related rather than availability-related.

## Blocking Issues Before Promotion
- Contract envelope not applied on live staging target.
- Wave 9 contract-support routes not present on live staging target.
- Expected status-code set mismatch on 8 routes due missing new aliases.

## Recommendation
- Do not promote based on current staging sweep output.
- Complete deployment of commit 8b6c394 (and subsequent workflow update commit) through Deploy ACA, then rerun Wave 8 staging sweep.
- Require summary.failed == 0 as promotion gate.
