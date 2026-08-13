# Phase 2 Semantic Patch Catalog

## Evidence Scope

The merged corpus contains 51 paired forms, 16,227 XFDL fillable controls, 11,663 predicted fillable fields, and 40,779 categorized discrepancies. Counts below identify high/medium-confidence evidence first; five review-only records remain in the corpus but are not used to justify broad rules.

Accepted forms: ACORD 80, 81, 82, 83, 88, 126, 127, 130, 131, 132, and 133; ARGO AC-SUP090; Lancer R-LMC_AP001; Merchants MG_71; Protective Large Fleet; Quaker AV005; and Quaker Special Risk.

## New Corpus Append

The append added 35 XFDLs and 32 PDFs without changing the original 28 ground-truth datasets or existing pairing rows. It produced 29 new matched pairs, two review pairs, four unmatched XFDLs, and 31 append-only semantic reports. The original 20 semantic reports retain their August 11 generation timestamps; the 31 new reports have August 12 timestamps.

| Category | New matched evidence | New review-only evidence |
| --- | ---: | ---: |
| Semantic label mismatch | 3,664 | 388 |
| Candidate ranking error | 1,056 | 45 |
| Field-type misclassification | 497 | 81 |
| Table detection error | 2,896 | 247 |
| Checkbox/Yes-No pairing error | 11 | 0 |
| Suppression error | 2,259 | 148 |
| Grouping error | 2,874 | 269 |
| Label/value pairing error | 0 | 0 |
| Unmapped fillable field | 2,330 | 151 |
| **Total** | **15,587** | **1,329** |

The accepted append is led by ARGO G1000, Western Heritage WHI-APP-138, Westport WIC1107, Philadelphia INTEG-TECH-APP, NFIP FEMA Form 086, and Philadelphia Salon and Day Spa. Their discrepancies reinforce the existing widget recovery, table metadata, independent grouping, strict suppression, typing, and candidate-ranking corrections. No new discrepancy category or independently supported root cause was found. The Hartford CB and LP pairs remain review-only and do not justify generalized mapping rules.

## Patch 1: Semantic Label Mismatches

- **Errors resolved:** 2,736 trusted baseline mismatches. Examples include ACORD 80 `Producer_ContactPerson_PhoneNumber_A`, `Producer_FaxNumber_A`, `NamedInsured_FullName_A`, and `Policy_PolicyNumberIdentifier_A`.
- **Cause:** OCR-derived value regions could inherit a nearby but incorrect label, while explicit PDF widget names were discarded.
- **Correction:** `pdfToDesignerData` extracts stable AcroForm names; `mergePdfWidgets` uses them as semantic labels and preserves a reliable overlapping DI label box when present. Directional checkbox label scoring prefers same-row right-hand labels.
- **Updated code:** `frontend/src/utils/pdfToImages.ts`, `frontend/src/designer/ai/PdfImportModal.tsx`, and `backend/api/src/extraction/hybridFieldExtraction.ts` (`selectionLabelDistance`).
- **Regression:** `classifies typed blanks and preserves directional Yes/No choice groups` verifies YES and NO are attached to the correct marks.
- **Validation:** frontend build; backend focused suite; 4,859 explicit widget names overlap XFDL semantic SIDs across accepted pairs.

## Patch 2: Candidate Ranking Errors

- **Errors resolved:** 2,986 trusted baseline ranking errors. Examples include ACORD 80 `Form_CompletionDate_A`, `Producer_ContactPerson_FullName_A`, and `Producer_ContactPerson_EmailAddress_A`.
- **Cause:** fillable PDF widget identities never reached `mapFields`; generic OCR labels therefore drove dictionary ranking.
- **Correction:** explicit widget names become promoted catalog semantics and flow through the existing deterministic `promotedDictionarySuggestions` path. The fast catalog path is retained because a trial of the legacy full reducer reduced canonical accuracy and changed the ACORD-scale test from under 5 seconds to 25 seconds.
- **Updated code:** `frontend/src/utils/pdfToImages.ts`, `frontend/src/designer/ai/PdfImportModal.tsx`, `backend/api/src/types/extractDocumentContract.ts`, and `backend/api/src/api/mapFields.ts`.
- **Regression:** `mapping flow ranks generic address and contractor license fields using document context`; the ACORD 125-scale test also enforces fast deterministic ranking.
- **Validation:** backend suite 12/12 in 3.9 seconds; 4,859 accepted-pair widget names have exact XFDL SID overlap.

## Patch 3: Field-Type Misclassification

- **Errors resolved:** 1,131 trusted baseline type mismatches. Examples include ACORD 80 phone/fax fields and policy-number/count fields.
- **Cause:** typed blanks used label regexes that omitted phone and fax; explicit PDF field kinds were unavailable.
- **Correction:** typed-blank inference recognizes phone/fax as numeric, preserves date/currency/percentage rules, and uses PDF widget kinds for checkbox, dropdown, signature, and semantically named typed fields.
- **Updated code:** `inferValueType` in `backend/api/src/extraction/hybridFieldExtraction.ts` and `widgetValueType` in `frontend/src/utils/pdfToImages.ts`.
- **Regression:** `classifies typed blanks and preserves directional Yes/No choice groups` asserts numeric phone, date, currency, percentage, and checkbox behavior. Existing tests cover narrow numeric blanks.
- **Validation:** backend suite 12/12; frontend TypeScript/Vite build passes.

## Patch 4: Table Detection

- **Errors resolved:** 2,369 trusted baseline table errors. Examples include ACORD 80 `Producer_FullName_A`, `NamedInsured_FullName_A`, and address fields; ACORD 127 driver rows are also affected.
- **Cause:** DI table coordinates were captured, but label/value pair IDs replaced row identity and paired blank cells did not register their row in table summaries.
- **Correction:** paired table inputs retain `tableId`, `rowIndex`, and `columnIndex`, receive an independent semantic row ID, and register that row in `groupedStructures.tables`. Widget replacements inherit table metadata from overlapping DI regions.
- **Updated code:** `backend/api/src/extraction/hybridFieldExtraction.ts`, `backend/api/src/types/extractDocumentContract.ts`, `backend/api/src/api/mapFields.ts`, and `frontend/src/designer/ai/PdfImportModal.tsx`.
- **Regression:** `splits business labels and adjacent blank boxes into semantic labels and inputs` now asserts all inferred table rows and field memberships.
- **Validation:** backend suite 12/12; mapping contract returns row/column/table metadata unchanged.

## Patch 5: Checkbox and Yes/No Pairing

- **Errors resolved:** 56 trusted baseline pairing errors. Examples include ACORD 80 replacement-cost and policy-payment indicators and ACORD 127 status choices.
- **Cause:** nearest-label selection used center distance, and checkbox groups were not propagated onto catalog fields.
- **Correction:** same-row directional scoring selects labels to the right of a mark; checkbox groups write `semanticGroupIds`; multi-mark groups are typed as `yes-no` or `choice-set`.
- **Updated code:** `selectionLabelDistance`, `buildCheckboxGroups`, and semantic-group construction in `backend/api/src/extraction/hybridFieldExtraction.ts`.
- **Regression:** `classifies typed blanks and preserves directional Yes/No choice groups` checks labels, group kind, field IDs, and membership propagation.
- **Validation:** backend suite 12/12.

## Patch 6: Suppression

- **Errors resolved:** 3,647 trusted baseline suppression discrepancies, dominated by fillable controls absent from extraction. Examples include ACORD 80 producer address fields and insurer/product identifiers.
- **Cause:** the OCR-only blank detector could not see AcroForm rectangles. Relaxing text promotion would also promote section headers, DI text, questions, and decoration.
- **Correction:** explicit PDF widgets are merged as fillable controls instead of weakening suppression. Existing strict `mappedFields` filtering remains. `FieldRenderer` now refuses to draw an imported field carrying `wave9Suppression.suppressed`; imported semantic labels remain metadata and are not painted over the PDF.
- **Updated code:** `frontend/src/utils/pdfToImages.ts`, `frontend/src/designer/ai/PdfImportModal.tsx`, and `frontend/src/components/designer/FieldRenderer.tsx`.
- **Regression:** existing strict-role test verifies titles, headers, footers, sections, OCR text, questions, and decorative text are not promoted. Renderer behavior is compile-validated.
- **Validation:** frontend build passes; 5,446 explicit widgets are available across 10 accepted forms without promoting OCR presentation text.

## Patch 7: Grouping

- **Errors resolved:** 1,568 trusted baseline grouping errors. Examples include ACORD 80 policy-status fields and address components and ACORD 127 driver/table rows.
- **Cause:** one `groupId` represented label/value pairing, table rows, and semantic groups, causing identities to overwrite each other.
- **Correction:** `semanticGroupIds` and `groupedStructures.semanticGroups` independently represent table rows, Yes/No and choice sets, and geometry-clustered address blocks. `groupId` remains the stable label/value pair identity. The designer prefers semantic group IDs when constructing field groups.
- **Updated code:** extraction contract, `buildAddressGroups`, table/checkbox group construction, `mapFields`, and `PdfImportModal`.
- **Regression:** table-row assertions plus `groups adjacent address fields without replacing label/value pair identity`.
- **Validation:** backend suite 12/12; frontend build passes.

## Patch 8: Label/Value Pairing

- **Errors resolved:** 1,065 trusted baseline pairing errors. Examples include ACORD 80 marital-status, state/province, deductible, and coverage fields.
- **Cause:** replacing DI-inferred rectangles with explicit PDF widgets could otherwise orphan label/input and question/answer links.
- **Correction:** overlap matching transfers label boxes and rewrites `labelInputPairs`, `questionAnswerPairs`, checkbox groups, and semantic groups from replaced DI IDs to stable widget IDs.
- **Updated code:** `mergePdfWidgets` in `frontend/src/designer/ai/PdfImportModal.tsx` and label-pair propagation in `backend/api/src/api/mapFields.ts`.
- **Regression:** business-label and address-group tests assert pair identity, label boxes, and semantic grouping survive together.
- **Validation:** backend suite 12/12; frontend build passes.

## Patch 9: Unmapped but Fillable Fields

- **Errors resolved:** 3,675 trusted baseline missing/unmapped fields. Examples include ACORD 80 producer address fields and `Producer_CustomerIdentifier_A`; similar gaps occur on every accepted form.
- **Cause:** DI layout extraction returns text, tables, and selection marks but does not guarantee AcroForm widget rectangles.
- **Correction:** PDF.js extracts every Widget annotation in the same pass as page rendering. Widgets receive stable IDs, 96-DPI top-left geometry, explicit type, and semantic field name; overlap deduplication replaces inferred blanks rather than creating duplicates. `pdf_widget` and `select` are accepted by the backend extraction contract and strict promotion gate.
- **Updated code:** `frontend/src/utils/pdfToImages.ts`, `frontend/src/designer/ai/PdfImportModal.tsx`, `backend/api/src/types/extractDocumentContract.ts`, `backend/api/src/api/mapFields.ts`, and `backend/api/src/extraction/hybridFieldExtraction.ts`.
- **Regression:** strict promotion tests cover role/geometry filtering and ACORD-scale catalogs; widget annotation APIs are compile-validated against installed PDF.js.
- **Validation:** frontend build passes; pairing inventory confirms 5,446 widgets on 10 accepted forms, 4,859 with shared semantic names. Seven accepted PDFs have no widgets and continue through DI-only extraction.

## Validation Commands

```powershell
Set-Location backend\api
npm run build
node --test tests\hybridFieldExtraction.test.cjs

Set-Location ..\..\frontend
npm run build

Set-Location ..
node --check semantic-patches\generate-semantic-errors.cjs
git diff --check
```