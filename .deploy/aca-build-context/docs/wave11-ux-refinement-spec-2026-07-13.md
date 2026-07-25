# Wave 11 UX Refinement Specification

Date: 2026-07-13
Scope: UX refinement across all Wave 10 modules using Wave 9 contract transport and Wave 10 state management.

## Wave 11 Goals

Wave 11 focuses on UX and interaction quality rather than adding new backend surfaces.

Primary goals:
- unify UX patterns across all Wave 10 modules
- standardize envelope-aware error rendering
- improve loading/result lifecycle transitions
- strengthen orchestration between modules with shared state handoffs
- preserve centralized Wave 9 integration path for all transport

## Refined Module Coverage

Wave 11 refinements were applied to all Wave 10 modules in the Wave workbench:
- ACORD mapping
- arbitration visualization
- semantic summary
- normalization and scoring
- preview pipeline
- document ingestion

Primary implementation file:
- frontend/src/pages/Wave10Workbench.tsx

## Cross-Module UX Unification

Unified module rail:
- each module card now shows consistent status chip (Idle, Loading, Success, Error)
- each module shows last action summary
- active module visual hierarchy is standardized

Unified interaction shell:
- shared action zone with consistent button grouping
- shared payload editor presentation for JSON-driven modules
- shared result panel rendering for all modules

Unified orchestration banner:
- single "Run End-to-End Pipeline" action
- standardized orchestration messaging and lifecycle behavior

## Standardized Error Envelope Rendering

Wave 11 state now models errors as envelope structures instead of plain strings.

State type introduced:
- Wave11ErrorEnvelope
  - message
  - code
  - details
  - traceId
  - status

UI rendering behavior:
- all module errors are rendered in a uniform "Error Envelope" card
- traceId and status are surfaced consistently
- error details are shown in expandable JSON

## Loading and Result Lifecycle Improvements

Wave 11 state now tracks lifecycle metadata per module:
- status: idle/loading/success/error
- actionLabel
- startedAt
- endedAt

State updates:
- startRequest(module, actionLabel)
- finishSuccess(module, data, actionLabel)
- finishError(module, errorEnvelope, actionLabel)

UI outcomes:
- consistent status chips in module rail and header
- consistent loading banner while requests are in-flight
- lifecycle timing metadata visible per active module

## Orchestration Enhancements

Wave 11 introduced explicit orchestration pathways that connect module outputs to downstream module inputs via Wave 10 state:

Automatic handoff chain:
- ACORD mapping output -> semantic summary payload
- semantic summary output -> normalization/scoring payload
- normalization/scoring output -> preview payload
- document ingestion output -> mapping payload

End-to-end action:
- Run mapping
- run semantic summary
- run normalization and scoring
- run preview
- update downstream payload states between each step

All orchestration actions execute through Wave 9 integration helpers, preserving contract and envelope behavior.

## Contract and Transport Alignment

Transport path remains centralized:
- frontend/src/api/wave9Integration.ts
- frontend/src/api/wave9Client.ts

Wave 11 does not bypass centralized transport and does not introduce ad hoc fetch paths.

## Files Updated

- frontend/src/pages/Wave10Workbench.tsx
- frontend/src/state/wave10Store.ts

## Validation Summary

Compile check:
- npm run build (frontend): PASS

Contract checks:
- wave9 frontend integration sweep: PASS
  - 12 endpoints
  - 0 transport failures
  - 0 status mismatches
  - 0 contract violations
- wave8 stability sweep (staging baseline): PASS
  - 75 routes
  - 0 transport failures
  - 0 status mismatches
  - 0 contract violations

## Outcome

Wave 11 UX refinement is complete for the module workspace and provides consistent cross-module interaction patterns, envelope-safe error UX, improved lifecycle visibility, and stronger state-driven orchestration across all Wave 10 feature flows.
