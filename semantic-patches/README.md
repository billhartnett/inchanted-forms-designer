# Semantic Patches

This directory contains the Phase 2 semantic-error corpus, its reproducible generator, and the corrective patch record.

## Contents

- `semantic-errors/index.json`: corpus index and category totals.
- `semantic-errors/*.semantic-errors.json`: field-level expected/actual evidence for each paired form.
- `generate-semantic-errors.cjs`: replays extraction and mapping against XFDL ground truth.
- `PATCH-CATALOG.md`: category-by-category source changes, affected fields, rationale, tests, and validation.
- `SUMMARY-REPORT.md`: dominant themes and expected improvements.
- `current-output/`: ignored local API snapshots used to avoid repeated Document Intelligence calls.

## Generate

Start a freshly built backend on an isolated port, then run:

```powershell
$env:SEMANTIC_PATCH_API_BASE_URL='http://127.0.0.1:7089'
node semantic-patches\generate-semantic-errors.cjs --refresh
```

When new ground-truth and pairing records have been appended, preserve existing reports and replay only the new eligible pairs:

```powershell
node training-data\scripts\extract-xfdl-ground-truth.cjs --append
node training-data\scripts\pair-xfdl-pdfs.cjs --append
$env:SEMANTIC_PATCH_API_BASE_URL='http://127.0.0.1:7089'
node semantic-patches\generate-semantic-errors.cjs --append --refresh
```

Append mode keys XFDL records by source SHA-256 and semantic reports by dataset file. It refuses ground-truth output collisions, reserves previously assigned PDFs, and never rewrites an existing per-form semantic report. Aggregate manifests and indexes are merged and regenerated.

Use `--matched-only` to exclude review pairs or `--limit=N` for a focused probe. The merged corpus includes 46 accepted pairs and five review-only pairs; every record retains pair status and confidence.

## Current Corpus

- Ground truth: 63 XFDLs, 320 pages, and 21,140 fillable controls.
- Pairing: 46 matched, five review, and 12 unmatched XFDLs; three PDFs remain unmatched.
- Semantic replay: 51 forms, 16,227 truth fields, 11,663 predicted fillables, 8,697 matched fields, and 40,779 discrepancies.
- Latest append: 35 XFDLs, 32 PDFs, 31 semantic reports, and 16,916 discrepancies. The 29 accepted pairs contribute 15,587 discrepancies; two review-only pairs contribute 1,329.

## Validate

```powershell
Set-Location backend\api
npm run build
node --test tests\hybridFieldExtraction.test.cjs

Set-Location ..\..\frontend
npm run build
```

The corpus is a diagnostic baseline. It must not be interpreted as an exact post-patch score until the updated frontend widget merge is replayed through a browser, because AcroForm extraction is intentionally owned by PDF.js in the designer.