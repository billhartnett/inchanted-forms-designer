# Wave 10 Feature Integration Specification

Date: 2026-07-13
Scope: Wave 10 UI feature-module enablement on stabilized Wave 9 contract layer

## Objectives

Wave 10 introduces a unified frontend workspace for advanced mapping and decision workflows while preserving the Wave 9 contract envelope guarantees.

Required Wave 10 modules implemented:
- ACORD mapping UI
- Arbitration visualization UI
- Semantic summary UI
- Normalization and scoring UI
- Preview pipeline UI
- Document ingestion UX

## Architecture Alignment

Wave 10 frontend modules are bound to the existing centralized integration layer:
- Transport and contract resolution: `frontend/src/api/wave9Client.ts`
- Endpoint helpers and feature-facing adapters: `frontend/src/api/wave9Integration.ts`

Envelope-aware behavior:
- Requests are sent through envelope-aware helpers.
- Error handling standardizes `code`, `message`, `details`, and `traceId` via `ApiEnvelopeError`.
- Contract endpoint discovery continues through `/api/wave9/contracts` with fallback paths.

## Routing and Navigation

Wave 10 routing updates:
- Added route: `/wave10`
- Preserved compatibility alias: `/mapping` now serves the Wave 10 workbench

Files:
- `frontend/src/App.tsx`
- `frontend/src/layout/AppShell.tsx`

## State Management

Wave 10 introduces a dedicated state slice:
- `frontend/src/state/wave10Store.ts`

Capabilities:
- Active module tracking
- Per-module request payload input state
- Per-module loading/error/result state
- Shared action pattern for request lifecycle transitions

State barrel export updated:
- `frontend/src/state/index.ts`

## Wave 10 UI Workspace

Primary page:
- `frontend/src/pages/Wave10Workbench.tsx`

Behavior:
- Module selector for all six Wave 10 features
- JSON payload editor for endpoint-bound modules
- Contract endpoint panel showing active Wave 9 endpoint map
- Envelope-aware request execution and standardized error surfacing
- Response panel for transport and schema inspection
- Arbitration trace visualization list for stage-by-stage trace output
- File-based ingestion UX with extract-text and extract-document actions

## Endpoint Bindings

Wave 10 module bindings through centralized integration helpers:

1. ACORD mapping UI
- `runMappingFlow(...)` -> `/api/wave9/mapping/flow`
- `runAcordValidate(...)` -> `/api/wave9/acord/validate`

2. Arbitration visualization UI
- `runArbitrationTrace(...)` -> `/api/wave9/arbitration/trace`

3. Semantic summary UI
- `runSemanticSummary(...)` -> `/api/wave9/semantic-summary`

4. Normalization and scoring UI
- `runNormalization(...)` -> `/api/wave9/normalization`
- `runScoring(...)` -> `/api/wave9/scoring`

5. Preview pipeline UI
- `runPreview(...)` -> `/api/wave9/preview`

6. Document ingestion UX
- `runExtractText(file)` -> `/api/extractText`
- `runExtractDocument(file)` -> `/api/extractDocument`

## Compile and Integration Validation

Frontend compile validation:
- Command: `npm run build` (from `frontend/`)
- Result: success

Contract stability validation:
- Wave 9 frontend integration sweep
  - 12 endpoints checked
  - 0 transport failures
  - 0 status mismatches
  - 0 contract violations
- Wave 8 contract stability sweep (staging readiness baseline)
  - 75 routes checked
  - 0 transport failures
  - 0 status mismatches
  - 0 contract violations

## Deliverables

Implemented files:
- `frontend/src/pages/Wave10Workbench.tsx`
- `frontend/src/state/wave10Store.ts`
- `frontend/src/App.tsx`
- `frontend/src/layout/AppShell.tsx`
- `frontend/src/state/index.ts`

Validation artifacts used:
- `designer_wave9_frontend_integration_report.json`
- `backend_validation_report.staging.wave8.json`

## Acceptance Summary

Wave 10 UI feature modules are enabled and integrated through the Wave 9 contract-aware transport layer with centralized endpoint binding, route support, state support, envelope-safe error behavior, and compile/sweep validation evidence.
