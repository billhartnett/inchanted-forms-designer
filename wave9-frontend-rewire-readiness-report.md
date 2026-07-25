# Wave 9 Frontend Rewire Readiness Report

Date: 2026-07-13
Environment: staging readiness validation against
https://inchanted-api-production.greenriver-7266e28c.eastus.azurecontainerapps.io

## Outcome

Status: READY FOR FRONTEND REWIRE

All required backend contract and transport checks passed for Wave 9 UI endpoints,
and all 75 stabilized Wave 8 routes remained contract-stable after Wave 9 activation.

Wave 9 Step 3 is complete: remaining legacy direct API calls were replaced with
centralized Wave 9 integration helpers across the frontend codebase.

## Checklist Validation

1. API Base Configuration
- Implemented centralized API URL resolution via frontend runtime config.
- Added support for both NEXT_PUBLIC_* and VITE_* environment keys.

2. Wave 9 Contract Endpoint Configuration
- Implemented contract URL helper and feature flag helper.
- Added runtime typing entries in vite-env.d.ts.

3. Frontend Contract-aware Client
- Added wave9 client with contract fetch/cache + endpoint resolution fallback.
- Added envelope-aware JSON fetch with structured ApiEnvelopeError fields:
  code, message, details, traceId.

4. Mapping Flow Rewire
- Updated PDF import mapping flow call path to contract-resolved
  /api/wave9/mapping/flow (with fallback).

5. Shared Runtime URL Usage
- Updated frontend modules to use centralized apiUrl helper instead of
  local ad-hoc base URL logic.

6. Env Regeneration
- Created frontend/.env.staging with required keys:
  NEXT_PUBLIC_API_BASE
  NEXT_PUBLIC_WAVE9_CONTRACT_URL
  NEXT_PUBLIC_WAVE9_ENABLED=true
- Created frontend/.env.production with required keys and VITE equivalents.

7. Envelope and Contract Compatibility Validation
- Executed Wave 9 frontend integration sweep script with report artifact output.
- Enhanced sweep script to validate schema binding from /api/wave9/contracts:
  - required endpoint paths exist
  - envelopes schema exists
  - payloadFormats schema exists

8. Wave 8 Route Contract Stability Regression Check
- Executed 75-route Wave 8 contract stability sweep after Wave 9 changes.

9. Legacy API Call Detection Checklist (Step 3)
- Replaced remaining direct transport calls in UI/components/hooks/services with
  centralized Wave 9 integration helpers.
- Removed hardcoded localhost API usage and inline base URL derivations from
  frontend call sites.
- Standardized envelope-aware parsing/error transport through centralized helpers.
- Updated legacy endpoint usage and response-shape assumptions in:
  - Document ingestion tester
  - Monitoring service
  - Submission package panel
  - Designer ACORD XML export path
  - Properties panel ACORD lookups/suggestions
  - PDF import modal extraction/mapping flow transport
  - Mapping store persistence transports
- Current direct `fetch(...)` usage in frontend source is confined to
  `wave9Client.ts` (the centralized transport adapter).

## Validation Artifacts

- designer_wave9_frontend_integration_report.json
  - Result: 12 endpoints checked, 0 transport failures, 0 status mismatches,
    0 contract violations.
- backend_validation_report.staging.wave8.json
  - Result: 75 routes checked, 0 transport failures, 0 status mismatches,
    0 contract violations.

- Frontend compile validation
  - Command: `npm run build` from `frontend/`
  - Result: SUCCESS (Vite build completed; production bundle emitted).

## Notable Constraint

- Vite reports large chunk-size warnings for the main bundle. This does not block
  deployment but should be tracked for follow-up optimization.

## Recommendation

Proceed with Wave 9 frontend rewire rollout using the generated contract-aware client,
runtime env configuration, and validated backend endpoint contract.
