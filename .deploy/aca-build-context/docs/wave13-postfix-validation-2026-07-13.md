# Wave 13 Post-Fix Validation Note (2026-07-13)

## Scope
Targeted validation after mapping blank-screen hotfix:
1. Confirm mapping semantic binding uses `field.semantic` path.
2. Confirm Designer Core vs Experimental tab behavior.
3. Record post-fix runtime/build status.

## Results

### 1) Mapping semantic binding verification
- `useSelectedFieldMapping` now constructs and returns `field.semantic` with:
  - ACORD code/eLabel
  - semantic cluster
  - confidence (score, wave9 raw, normalized)
  - calibration status
  - rationale signal buckets
- `MappingPanel` consumes `selectedMapping.field?.semantic || selectedMapping.semantic` and renders the Wave-9+ semantic model card using that object.

Files reviewed:
- `frontend/src/state/mappingStore.ts`
- `frontend/src/mapping/MappingPanel.tsx`

### 2) Core vs Experimental tab behavior (live Designer smoke)
Validated on production Designer route:
- Experimental tab:
  - Shows legacy banner and legacy panels:
    - Underwriting Rule Alignment
    - Risk and Decision Intelligence
    - Submission Package
  - Hides core ontology panel.
- Core tab:
  - Shows core panels including ACORD ontology.
  - Hides the three legacy panels and experimental banner.

File governing behavior:
- `frontend/src/components/designer/DesignerRightPanel.tsx`

### 3) Post-fix runtime/build status
- Frontend build: PASS.
- Production deploy: completed.
- Endpoint health checks after warm-up:
  - `/` -> 200
  - `/mapping` -> 200
  - `/env.js` -> 200
- User validation: PDF load + automapping completed without blank-screen regression.

## Notes
- Browser tabs can temporarily show stale 503 after deploy restart; independent health checks confirmed service recovery.
- Targeted pass indicates the Wave 13 semantic binding and panel partitioning are behaving as intended.
