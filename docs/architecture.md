# inchanted Forms Designer Architecture

## Current Architecture Summary

The repository is a monorepo with three active surfaces:

- `backend/api`: Azure Functions handlers plus the legacy semantic services that drive extraction and ACORD mapping.
- `frontend/src`: React, Konva, and Zustand designer UI, including PDF import, canvas interaction, and field metadata editing.
- `shared`: repository-level semantic contracts and ACORD data intended to be reused by backend and frontend.

Before this refactor, the core semantic pipeline lived mostly under `backend/api/src/services`, while the frontend consumed results through ad hoc contracts inside `PdfImportModal` and `useDesignerStore`. The canvas and designer UX were strong, but the repo structure did not clearly separate extraction, mapping, services, and shared semantics.

## Target Architecture

### Backend

- `backend/extraction`
  - `documentIntelligence.ts`: Azure Document Intelligence client creation.
  - `pageExtraction.ts`: normalize OCR page and line output.
  - `bboxNormalization.ts`: canonical bounding box handling.
  - `labelDetection.ts`: identify likely semantic labels and reject instructions.
  - `semanticInference.ts`: infer typed companion fields from label meaning.
  - `fieldFactory.ts`: convert extracted blocks plus inferences into typed fields.
  - `index.ts`: extraction pipeline facade.
- `backend/mapping`
  - `mappingEngine.ts`: facade over ACORD scoring and rationale assembly.
  - `mappingConfidence.ts`: confidence band policy.
  - `mappingRationale.ts`: explicit rationale payload builder.
  - `acordDictionary.ts`, `embeddings.ts`, `acordXml.ts`: mapping support surfaces.
- `backend/services`
  - `config.ts`: environment lookup.
  - `blobStorage.ts`: mapping persistence support.
  - `queueStorage.ts`: placeholder async orchestration seam.
  - `logging.ts`: backend logging shim.
- `backend/types`
  - Re-exports the canonical shared pipeline and ACORD contracts.
- `backend/api`
  - Function folders stay thin and delegate to extraction or mapping modules.

### Frontend

- `frontend/src/designer`
  - Existing: `Designer.tsx`, `DesignerLayout.tsx`, `PropertiesPanel.tsx`.
  - Added scaffolding: `InspectorPanel.tsx`, `FieldOverlay.tsx`, `FieldHandles.tsx`, `PageManager.tsx`, `SchemaGenerator.ts`.
- `frontend/src/canvas`
  - Existing canvas behavior remains the owner of multi-page rendering, snapping, selection, and field manipulation.
- `frontend/src/mapping`
  - `MappingPanel.tsx`, `MappingConfidence.tsx`, `MappingRationale.tsx`, `MappingOverrides.tsx` surface ACORD mapping state in a designer-centric inspector.
- `frontend/src/extraction`
  - `ExtractionViewer.tsx`, `LabelPreview.tsx`, `FieldPreview.tsx` reserve space for explicit OCR and label review.
- `frontend/src/state`
  - `designerStore.ts`: adapter to the existing designer Zustand store.
  - `fieldStore.ts`: selected field selectors.
  - `pageStore.ts`: page state selectors.
  - `mappingStore.ts`: mapping overrides and selected mapping summary.
  - `extractionStore.ts`: extracted pages and blocks.

### Shared

- `shared/src/acord`
  - `acordTypes.ts`, `acordMappings.ts`, `acordDictionary.ts`, `index.ts`.
- `shared/src/types`
  - `pipeline.ts`, `index.ts`.
- `shared/src/index.ts`
  - Single export surface for ACORD and pipeline contracts.

## Pipeline

The intended pipeline is:

1. PDF upload.
2. OCR page extraction.
3. Text block normalization.
4. Label detection.
5. Semantic inference.
6. Typed field generation.
7. ACORD candidate scoring and rationale creation.
8. Designer rendering of fields only.
9. Final schema or ACORD XML output.

The non-negotiable rule remains unchanged: OCR text is evidence for mapping and field creation, not an overlay layer in the designer.

## Concrete Refactor Map

### Files already refactored or wrapped

- `backend/api/src/services/mappingEngine.ts`
  - Now consumes shared pipeline types.
- `backend/api/src/services/acordDictionary.ts`
  - Now consumes the shared ACORD dictionary entry type.
- `backend/api/extractDocument/index.ts`
  - Delegates block coercion and plain-text extraction to `backend/extraction`.
- `backend/api/extractText/index.ts`
  - Delegates Document Intelligence client creation and page normalization to `backend/extraction`.
- `backend/api/mapFields/index.ts`
  - Delegates to `backend/mapping/mapBlocksWithAcord`.
- `backend/api/loadMapping/index.ts`
  - Delegates blob reads to `backend/services/blobStorage`.
- `backend/api/exportAcordXml/index.ts`
  - Delegates XML generation to `backend/mapping/acordXml.ts`.
- `frontend/src/designer/Designer.tsx`
  - Now renders an `InspectorPanel` that composes the existing properties UI with the new mapping panel.

### Modules that should migrate next

- `backend/api/acord/index.ts`
  - Move to thin wrappers over `backend/mapping/acordDictionary.ts`.
- `backend/api/saveMapping/index.ts`
  - Consolidate with `backend/services/blobStorage.ts` to avoid duplicate blob persistence logic.
- `backend/api/suggestLabels/index.ts`
  - Rename and align with the mapping surface; current naming and route registration need cleanup.
- `frontend/src/designer/ai/PdfImportModal.tsx`
  - Replace local OCR contract types with imports from `shared/src/types` and feed `extractionStore.ts` during import.
- `frontend/src/designer/state/useDesignerStore.ts`
  - Gradually replace locally defined metadata primitives with shared contracts and the new state adapters.

## Architectural Guardrails

- Do not render OCR text as overlay artifacts on the canvas.
- Do not map section headers, instructions, or logos as fields.
- Preserve page indices, field IDs, group IDs, and serializable designer state.
- Keep Azure Function handlers thin; domain logic belongs in `backend/extraction`, `backend/mapping`, or `backend/services`.
- Keep ACORD rationale explicit whenever confidence is ambiguous.

## Open TODOs

- Implement label clustering and neighboring-context inference in `backend/extraction/semanticInference.ts`.
- Promote `frontend/src/extraction` from placeholders into a reviewer workflow integrated with `PdfImportModal`.
- Move schema and ACORD XML generation behind the shared typed field model instead of loosely structured dictionaries.
- Add automated tests for the mapping confidence gates and designer page-scoping behavior.