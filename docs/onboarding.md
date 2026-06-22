# Developer Onboarding

## What This Platform Does

inchanted Forms Designer converts insurance forms into editable, structured, ACORD-aware input experiences. The system is intentionally pipeline-centric:

1. Extract OCR text and geometry from a PDF.
2. Detect which text behaves like semantic labels.
3. Infer the type of companion field each label implies.
4. Map that field to ACORD eLabels with confidence and rationale.
5. Render only the fillable fields on the designer canvas.
6. Export structured payloads such as JSON schema or ACORD XML.

## Main Modules

### Shared contracts

- `shared/src/types/pipeline.ts`: canonical extraction, mapping, and field contracts.
- `shared/src/acord`: ACORD dictionary entry types and normalization helpers.

### Backend

- `backend/extraction`: OCR normalization, label detection, semantic inference, field factory.
- `backend/mapping`: ACORD scoring, rationale, XML generation.
- `backend/services`: storage, config, logging.
- `backend/api`: Azure Function entrypoints only.

### Frontend

- `frontend/src/designer`: core designer composition and inspector experience.
- `frontend/src/canvas`: Konva stage, snapping, selection, and page-aware rendering.
- `frontend/src/mapping`: mapping confidence, rationale, and override UI.
- `frontend/src/state`: adapters and stores for designer, pages, mappings, and extraction artifacts.

## How To Add A New Form Feature

### Add a new extraction rule

1. Put the rule in `backend/extraction`, not in a function handler.
2. Model its inputs and outputs with `shared/src/types/pipeline.ts`.
3. Feed the result into typed field generation or mapping, not directly into the UI.

### Add a new ACORD mapping behavior

1. Extend the logic in `backend/mapping` or the legacy `mappingEngine` facade.
2. Keep confidence and rationale explicit.
3. Prefer abstaining over forcing a weak ACORD guess.

### Add a new designer feature

1. Put canvas behavior in `frontend/src/canvas`.
2. Put inspection or semantic UI in `frontend/src/designer`, `frontend/src/mapping`, or `frontend/src/extraction`.
3. Reuse `frontend/src/state` adapters instead of creating another isolated store.

## Practical Working Rules

- Do not render OCR text as canvas overlays.
- Do not regenerate field IDs unless you also handle persisted-state migration.
- Treat page scoping as first-class for multi-page forms.
- If a field is ambiguous, show ranked ACORD candidates and rationale instead of hiding the uncertainty.

## Recommended Next Steps For Contributors

1. Migrate `PdfImportModal` to the new shared extraction and mapping types.
2. Replace local metadata types in `useDesignerStore` with shared pipeline primitives.
3. Add tests for mapping confidence thresholds, page-scoped rendering, and XML generation.

## Azure Deployment: Re-enable Semantic Matching

Runtime semantic matching in `backend/api/src/services/mappingEngine.ts` is controlled by
the `DISABLE_RUNTIME_EMBEDDINGS` environment variable:

- `DISABLE_RUNTIME_EMBEDDINGS=1`: disable per-block runtime embedding calls.
- `DISABLE_RUNTIME_EMBEDDINGS=0` or unset: enable runtime semantic matching.

Use this runbook to re-enable semantic matching safely in Azure.

### Required App Settings (Function App)

Set these in Azure Portal -> Function App -> Settings -> Environment variables:

- `DISABLE_RUNTIME_EMBEDDINGS=0`
- `OPENAI_API_KEY=<your-openai-key>`
- `OPENAI_ENDPOINT=https://api.openai.com/v1` (or your Azure OpenAI endpoint)
- `OPENAI_API_VERSION=2024-02-15-preview` (or your deployed compatible version)
- `EMBEDDING_MODEL=text-embedding-3-small` (or the embedding model deployed in your target)

Keep existing required settings in place (`DI_ENDPOINT`, `DI_KEY`, storage, worker runtime).

### Rollout Steps

1. Apply settings in a staging slot first.
2. Restart the Function App (or slot) so env vars are reloaded.
3. Run extraction and mapping for ACORD 125 and at least one additional fixture.
4. Confirm mapping quality is improved and latency/error rates are acceptable.
5. Swap slot to production.

### Validation Checklist

- `mapFields` responds successfully for representative forms.
- Mapping confidence and anchor recall meet your gate thresholds.
- No sustained `431 request_headers_too_large` or OpenAI request failures in logs.
- End-to-end latency remains within your production SLO.

### Fast Rollback

If request failures or latency regressions return:

1. Set `DISABLE_RUNTIME_EMBEDDINGS=1`.
2. Restart Function App.
3. Re-run the diagnostics/gate scripts and verify baseline recovery.