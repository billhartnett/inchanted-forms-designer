# Wave 13 UI Cleanup Update Summary (2026-07-13)

## Scope Completed
This update applies the requested Wave 13 cleanup deltas for Release 1 testing focus:
- Legacy mapping governance panels moved behind a dedicated Experimental tab.
- Mapping panel bound to Wave-9/10/11 semantic object (`field.semantic`).
- Main mapping workspace refreshed to ACORD-aligned eLabel and semantic cluster presentation.
- Wave 12 navigation hidden from the primary menu for Release 1.
- Wave 10 and Wave 11 exposed as primary workspace nav entries.

## Implemented Changes

### 1. Legacy panels moved to Experimental tab
File: `frontend/src/components/designer/DesignerRightPanel.tsx`
- Added tabbed section inside Advanced:
  - `Core` tab (default): ACORD ontology, family, calibration, semantic conflicts/fusion/graph, carrier adapters, semantic memory.
  - `Experimental` tab: Underwriting Rules, Risk & Decision, Submission Package.
- Result: legacy panels are no longer visible in main mapping workspace by default.

### 2. Mapping bound to `field.semantic` (Wave-9+)
File: `frontend/src/state/mappingStore.ts`
- Added semantic derivation object on selected mapping:
  - `field.semantic.acordCode`
  - `field.semantic.acordElabel`
  - `field.semantic.semanticCluster`
  - `field.semantic.confidence` (score/raw/normalized)
  - `field.semantic.calibration` (decision, thresholdReason, confidenceLevel)
  - `field.semantic.rationaleSignals` (semantic, lexical, ontology, arbitration)
- Preserved compatibility by also exposing `semantic` at top-level selected mapping result.

### 3. Mapping panel updated to Wave-9+ semantic model output
File: `frontend/src/mapping/MappingPanel.tsx`
- Header and confidence displays now read from `field.semantic`.
- Added explicit "Wave-9+ Semantic Model (field.semantic)" section showing:
  - ACORD eLabel
  - semantic cluster
  - calibration status
  - confidence (including normalized confidence when available)
  - rationale signal counts
- No Wave-8 semantic metadata block remains in this panel.

### 4. Release 1 navigation updates
Files:
- `frontend/src/layout/AppShell.tsx`
- `frontend/src/App.tsx`

Changes:
- Removed `Wave 12` from primary navigation.
- Added `Wave 11` nav link (primary workspace visibility).
- Added `/wave11` route alias mapped to current Wave 10/11 workbench component.
- Kept `/wave12` route available but non-primary (not shown in nav).

## Validation
- Type checks / diagnostics: no errors in changed files.
- Build validation: PASS.
  - Command: `npm run build` in `frontend/`
  - Outcome: successful Vite production build.

## Release 1 Readiness Outcome
- Mapping workspace is cleaner for accuracy testing.
- ACORD-aligned eLabels, semantic clusters, rationale signals, calibration state, and confidence are surfaced from Wave-9+ semantic model data.
- Legacy governance-heavy panels are isolated in Experimental.
