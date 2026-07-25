# Wave 12 Automation Specification

Date: 2026-07-13
Scope: Advanced workflow automation and multi-document pipeline features built on Wave 9 contract layer and Wave 10/11 UX foundations.

## Wave 12 Goals

Wave 12 extends the refined Wave 10/11 workspace into automation-centric operations:
- multi-document ingestion
- batch mapping flows
- reusable mapping templates
- pipeline presets
- arbitration override UI
- semantic tuning controls
- scoring threshold configuration

All transport remains bound to the centralized Wave 9 integration helpers.

## Architecture and Layering

Transport layer (unchanged, reused):
- frontend/src/api/wave9Client.ts
- frontend/src/api/wave9Integration.ts

State layer (extended):
- frontend/src/state/wave10Store.ts

Workspace UI (new):
- frontend/src/pages/Wave12Automation.tsx

Routing/navigation updates:
- frontend/src/App.tsx
- frontend/src/layout/AppShell.tsx

## State Management Extensions

Wave 12 extends the Wave 10 store with automation state primitives:

1. Multi-document lifecycle state
- documents[] with per-document status
- selectedDocumentId
- statuses: queued, ingesting, ready, mapping, mapped, pipeline, completed, error
- extractionResult, mappingPayload, mappingResult, pipelineResult, error envelope

2. Template and preset state
- mappingTemplates[]
- pipelinePresets[]
- activePresetId

3. Governance/tuning state
- arbitrationOverrides[]
- semanticTuning { minSemanticScore, maxCandidates, boostExactAcord }
- scoringThresholds { accept, review, reject }

4. Batch orchestration state
- batchRuns[]
- createBatchRun / updateBatchRun lifecycle helpers

## Wave 12 Feature Modules

### 1) Multi-document ingestion
- Upload multiple PDFs
- Create document records in queue
- Per-document status tracking and error envelope capture

### 2) Batch mapping flows
- Execute selected pipeline preset across all queued documents
- Per-document extraction and mapping progression
- Batch run summary and status history

### 3) Reusable mapping templates
- Save mapping payloads from selected documents
- Save templates from manual JSON editor
- Apply templates to selected document payload state

### 4) Pipeline presets
- Preset selection UI
- Default presets:
  - Balanced Pipeline
  - Governance + Arbitration
- Preset drives step execution sequence

### 5) Arbitration override UI
- Add/remove field-level override records
- Override payload inclusion in mapping/arbitration stages

### 6) Semantic tuning controls
- Min semantic score slider
- Max candidates slider
- Exact ACORD match boost toggle
- Tuning values injected into mapping request context

### 7) Scoring threshold configuration
- Accept/review/reject threshold controls
- Threshold payload inclusion in scoring stage

## Pipeline Orchestration Logic

Per document, selected preset steps execute through centralized helpers:
- extract -> runExtractText(file)
- mapping -> runMappingFlow(payload)
- semantic summary -> runSemanticSummary(payload)
- normalization -> runNormalization(payload)
- scoring -> runScoring(payload)
- preview -> runPreview(payload)
- arbitration (optional) -> runArbitrationTrace(payload)

Derived payload handoffs implemented between stages:
- extraction output -> mapping payload
- mapping output -> semantic summary payload
- semantic summary output -> normalization payload
- normalization output -> preview payload

## Routing and Workspace Exposure

Routes:
- /wave12 -> Wave12Automation workspace
- Existing /wave10 and /mapping preserved

Navigation:
- App shell includes Wave 12 entry for direct workspace access

## Validation

Compile:
- npm run build (frontend): PASS

Contract/stability checks:
- Wave9 frontend integration sweep: PASS
  - 12 endpoints
  - 0 transport failures
  - 0 status mismatches
  - 0 contract violations
- Wave8 stability sweep baseline: PASS
  - 75 routes
  - 0 transport failures
  - 0 status mismatches
  - 0 contract violations

## Deliverables

Implemented files:
- frontend/src/pages/Wave12Automation.tsx
- frontend/src/state/wave10Store.ts
- frontend/src/App.tsx
- frontend/src/layout/AppShell.tsx

Validation artifacts reused/updated:
- designer_wave9_frontend_integration_report.json
- backend_validation_report.staging.wave8.json

## Outcome

Wave 12 automation capabilities are implemented with multi-document lifecycle orchestration, template/preset execution, and governance/tuning controls while retaining Wave 9 centralized contract transport and Wave 10/11 UX consistency.
