# Wave 9 Frontend Integration Specification (2026-07-13)

## Objective
Enable full frontend integration for Wave 9 by exposing all UI-facing backend routes with stable envelopes and documented payload contracts.

## Scope Delivered
- Enabled Wave 9 UI aliases in backend route bridge for:
  - preview
  - semantic summary
  - ACORD validate
  - arbitration trace
  - normalization
  - scoring
  - mapping flow
- Expanded `/api/wave9/contracts` payload to include endpoint map, envelope format, and payload schemas.
- Preserved Wave 8 contract stability requirements while Wave 9 capabilities are active.

## Backend Changes
- Route and contract manifest updates:
  - backend/api/src/api/registerRoutes.ts
- New Wave 9 validation script:
  - backend/api/scripts/wave9_frontend_integration_sweep.cjs
- Machine-readable Wave 9 integration contract:
  - wave9_frontend_integration_contract.json

## Wave 9 UI Endpoint Contract
All routes return the standardized envelope (`ok`, `status`, `data`, `error`, `errorEnvelope`, `contract`, `meta`).

| Capability | Method | Path | Expected baseline status |
|---|---|---|---|
| Integration contract manifest | GET | /api/wave9/contracts | 200 |
| ACORD extraction | POST | /api/wave9/acord/extraction | 400 or 500 |
| ACORD semantic inference | POST | /api/wave9/acord/semantic-inference | 400 |
| Semantic summary | POST | /api/wave9/semantic-summary | 400 |
| ACORD validate | POST | /api/wave9/acord/validate | 200 or 400 |
| Inference | POST | /api/wave9/inference | 400 |
| Arbitration | POST | /api/wave9/arbitration | 400 |
| Arbitration trace | POST | /api/wave9/arbitration/trace | 400 |
| Normalization | POST | /api/wave9/normalization | 400 |
| Scoring | POST | /api/wave9/scoring | 400 |
| Preview | POST | /api/wave9/preview | 200 or 400 |
| Mapping flow | POST | /api/wave9/mapping/flow | 200 or 400 |

## Contract Schemas
Canonical schema definitions for request/response and envelope are published in:
- wave9_frontend_integration_contract.json

This includes:
- request and response envelope schemas
- inference payload format
- ACORD mapping structures
- arbitration output format
- normalization format
- scoring output format
- preview output format

## Validation Evidence
### Wave 8 stability under Wave 9 activation (75 routes)
- Script: backend/api/scripts/wave8_contract_stability_sweep.cjs
- Result: PASS
- Checked: 75
- Status mismatches: 0
- Contract violations: 0
- Report: backend_validation_report.staging.wave8.json

### Wave 9 frontend endpoint readiness
- Script: backend/api/scripts/wave9_frontend_integration_sweep.cjs
- Result: PASS
- Checked: 12
- Status mismatches: 0
- Contract violations: 0
- Report: designer_wave9_frontend_integration_report.json

## Staging Readiness for Frontend Rewire
- Wave 9 frontend integration contract: COMPLETE
- Required UI endpoint exposure: COMPLETE
- Wave 8 route stability under Wave 9 activation: PASS
- Readiness decision: READY FOR STAGING FRONTEND REWIRE
