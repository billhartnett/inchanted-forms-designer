# Semantic Correction Summary

## Baseline

The reconstructed Phase 2 baseline compares current Wave 9 extraction/mapping output with XFDL truth for 20 paired forms. It records 23,863 discrepancies over 9,067 fillable controls. Three weak edition/layout pairs are marked review-only, so the patches are driven by high/medium-confidence evidence.

| Theme | Trusted errors | Dominant correction |
| --- | ---: | --- |
| Missing fillable / suppression | 7,322 | Recover explicit AcroForm widgets instead of promoting OCR text |
| Candidate and label semantics | 5,722 | Preserve widget names and reliable DI label metadata |
| Table and semantic grouping | 3,937 | Separate pair IDs from row, choice, and address groups |
| Field typing | 1,131 | Combine typed-label rules with explicit widget kinds |
| Label/value relationships | 1,065 | Rewrite relationships when a widget replaces an inferred blank |
| Checkbox/Yes-No pairing | 56 | Directional labels and explicit choice groups |

## Dominant Themes

1. **Explicit controls beat inferred blanks.** The largest failure class came from treating DI OCR as the only fillable source. Ten accepted PDFs expose 5,446 widgets, including 4,859 names shared with XFDL SIDs. The designer now merges those exact controls while retaining DI semantics.
2. **Suppression stays strict.** The correction does not lower header/question/decorative-text thresholds. Non-field OCR remains excluded, and suppressed imported fields have a renderer-level fail-safe.
3. **Relationships need independent identities.** Label/value pairs, table rows, choice sets, and address blocks are different structures. `semanticGroupIds` prevents one relationship from overwriting another.
4. **Candidate ranking remains deterministic.** A trial route through the full legacy reducer degraded canonical rankings and increased ACORD-scale latency to 25 seconds. The final patch keeps the sub-5-second promoted dictionary path and improves its input semantics.
5. **Confidence is provenance-aware.** Review-only ACORD 84, 85, and 125 errors remain visible but do not drive generalized rules.

## Corpus Append

The append-safe update added 35 ground-truth datasets and paired 31 of them for replay: 29 matched and two review-only. Four new XFDLs remain unmatched. The merged semantic corpus now contains 51 forms, 16,227 truth fields, 11,663 predicted fillables, 8,697 matched fields, and 40,779 discrepancies.

The new forms contribute 16,916 discrepancies. Accepted pairs account for 15,587: 3,664 semantic-label, 1,056 candidate-ranking, 497 type, 2,896 table, 11 checkbox/Yes-No, 2,259 suppression, 2,874 grouping, zero label/value, and 2,330 unmapped-fillable errors. The two Hartford review pairs contribute the remaining 1,329 and are retained only as low-confidence evidence.

The append broadens the corpus into government, specialty, and carrier-branded forms. Its strongest pressures are semantic labels, table structure, grouping, suppression, and fillable recovery, all of which map to existing patches. Zero new label/value-pairing errors support the relationship-relinking correction. No new systemic correction was added because the new evidence did not establish a root cause outside the current nine-patch package.

## Expected Improvements

- Substantial fillable-field recovery on the 10 accepted PDFs with AcroForm widgets, bounded by 5,446 explicit widget records and deduplicated against DI blanks.
- Better top-candidate accuracy where widget names are semantic, especially the 4,859 accepted-pair names shared with XFDL SIDs.
- Stable table row/column metadata and independent row grouping for DI-recognized tables.
- Correct numeric phone/fax blanks and preserved date, currency, percent, checkbox, dropdown, and signature types.
- Correct same-row Yes/No labels and explicit choice-set membership.
- Address components grouped without losing label/value pair identity.
- No imported semantic-label overlays and no rendering of fields marked suppressed.

These are expected improvements, not claimed post-patch corpus totals. The baseline generator calls backend extraction directly, while widget recovery intentionally occurs in the browser's PDF.js import path. A browser replay is required to measure the final delta end to end.

## Validation Result

- Backend TypeScript/shared build: passed.
- Focused hybrid extraction and mapping suite: 12/12 passed in 3.9 seconds.
- Frontend Vite production build: passed.
- Edited-file diagnostics: no errors.
- Corpus generator syntax: passed.
- Append integrity: 28 original ground-truth datasets and all existing pairing rows preserved; 20 original semantic reports retained their generation timestamps.