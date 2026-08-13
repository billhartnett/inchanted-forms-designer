# Semantic Engine v2

This package captures the retrained semantic engine state derived from the merged XFDL ground-truth corpus and the append-safe semantic patch corpus.

## Scope

The engine state includes the deterministic candidate-ranking path, label/value pairing heuristics, typed-blank classification, checkbox/Yes-No pairing, table detection and cell typing, suppression filtering, semantic grouping, and PDF widget alignment logic.

## Included artifacts

- manifest.json — package manifest and retraining state
- validation-report.json — regression and corpus validation summary
- corpus-accuracy-report.json — corpus-wide metrics and remaining discrepancy profile
- heuristics-profile.json — scoring and filtering thresholds
- retraining-summary.json — a concise summary of improvements and outstanding Phase 5 alignment items

## Source evidence

- training-data/acord-labeled_XFDL/ground-truth/manifest.json
- semantic-patches/semantic-errors/index.json
- semantic-patches/manifest.json
- backend/api/src/extraction/hybridFieldExtraction.ts
- backend/api/src/api/mapFields.ts
- frontend/src/utils/pdfToImages.ts
- frontend/src/designer/ai/PdfImportModal.tsx
- frontend/src/components/designer/FieldRenderer.tsx

## Validation status

The rebuilt engine was validated across the full merged corpus and the focused backend/semi-structured regression suite. All generated corpus JSON parsed successfully and the backend/frontend verification checks passed.
