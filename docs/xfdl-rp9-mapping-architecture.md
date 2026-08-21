# XFDL-First RP-9 Mapping Architecture

## Status

Staging-only implementation for XFDL-backed ACORD and supplemental forms. Production remains on the existing RP-8 pipeline.

## Authority Order

1. **XFDL** is the semantic source of truth for field identity, labels, help text, control/answer type, page membership, grouping prefix, and geometry.
2. **RP-9** is the only mapping target. XFDL semantic paths resolve directly to RP-9 canonical nodes or through explicit representation bridges.
3. **LayoutLMv3** validates XFDL/RP-9 candidates. It contributes evidence but does not replace an authoritative XFDL match. It may provide a candidate only when XFDL cannot resolve an unlabeled field.
4. **Geometry**, **section membership**, and extractor-declared table structure are secondary alignment signals.

```mermaid
flowchart LR
  A[Authoritative XFDL] --> B[XFDL semantic index]
  P[PDF extraction blocks] --> C[Block to XFDL matcher]
  B --> C
  C --> D[RP-9 canonical resolver]
  L[LayoutLMv3 evidence] --> E[Simple scorer]
  D --> E
  S[RP-9 section alignment] --> E
  G[Normalized geometry] --> E
  T[Declared table row and column context] --> E
  E --> F[Canonical mappings]
```

## Parsed XFDL Semantics

The parser reads:

- control SID and normalized semantic path
- control type (`field`, `check`, `combobox`, `popup`, `signature`)
- answer type (`text`, `boolean`, `select`, `date`, `number`, `currency`, `percent`, `signature`)
- nearest semantically relevant label
- help text
- page number
- absolute geometry
- inferred section membership
- semantic-path group prefix

The parser supports plain XML and `base64-gzip` XFDL envelopes. Runtime indexes are selected for ACORD 125, ACORD 126, ACORD 130, and supplemental applications by source/family identity.

Label matching expands these representation aliases before comparison:

- Producer / Agency / Agent / Broker
- Applicant / Named Insured
- Address / Mailing Address
- City / Town
- State / Province
- Zip / Postal Code

Seven ACORD 125 General Information questions are recognized from their authoritative XFDL help text: parent/subsidiary status, formal safety program, flammable/explosive/chemical exposure, other insurance, declined/cancelled/non-renewed coverage, and abuse/discrimination/negligent-hiring claims.

## Question Binding

Question families are bound after candidate scoring and before canonical RP-9 projection:

1. Extractor-provided `questionAnswerPairs` bind real question and answer block IDs authoritatively.
2. When no extractor pair exists, matching XFDL `questionFamilyId` values bind a question label control to its boolean answer control.
3. A binding is emitted only when both mappings are on the same page and both bounding boxes have positive width and height.
4. One aggregate `Question.Text` node contains the attached `Question.BooleanAnswer`, while the two underlying mappings retain their original placement geometry.

The response exposes `questionBindings` with this shape:

- structural question: `Question.Text`, `fillable: false`, question block geometry
- attached answer: `Question.BooleanAnswer`, `fillable: true`, with `controls[]` containing every Yes/No checkbox or radio placement
- source: `extractor-pair` or `xfdl-family`

Question mappings remain in `mappings` for semantic review but are excluded from `mappedFields`. Boolean answer mappings remain fillable. The binder never synthesizes a canvas block or places a mapping over empty space.

Markel supplemental forms encode question text in checkbox help values rather than separate XFDL labels. For those forms, XFDL identifies the boolean family and the PDF extractor supplies the real question-text block and authoritative pair.

## Cross-Form Reconstruction

The semantic index runs a deterministic reconstruction pass before scoring:

1. Adjacent XFDL label fragments are merged by bounded horizontal/vertical overlap, preserving source SIDs.
2. Nearby left-side labels become row headers; nearby overlapping labels above the control become column headers.
3. The reconstructed label combines row header, column header, and local label without changing the control geometry.
4. Numeric semantics are inferred from reconstructed text, semantic path, XFDL help/type metadata, and symbols such as `$`, `%`, `per $100`, and `per $1,000`.
5. The resulting concept and section are resolved only to canonical RP-9 nodes.

Supported supplemental numeric concepts:

- `Integer`, `Decimal`, `CurrencyAmount`, `Percentage`
- `Payroll.Amount`, `Payroll.Percentage`
- `GrossReceipts.Amount`, `Exposure.Amount`, `Hazard.Percentage`
- `Rate.Per100`, `Rate.Per1000`, `Premium.Amount`
- `Classification.Code`, `Classification.Description`

Supplemental section reconstruction maps to these RP-9 section bundles:

- `Section.SupplementalInformation`
- `Section.PayrollExposure`
- `Section.Classification`
- `Section.Rating`
- existing `Section.PremisesInformation` where premises/location evidence controls

Each mapping may expose `semanticLabel`, `reconstructedNumericType`, `reconstructedSection`, `reconstructedSectionNodeId`, and `tableContext`. These enrich the field without changing its stable ID, page, bounding box, or question binding.

The designer prefers the reconstructed semantic label and numeric type, renders BooleanAnswer controls through the existing checkbox path, and displays row/column context plus reconstructed section in the binding details panel.

## Scoring

The initial score is intentionally small and inspectable:

$$
S = 0.50X + 0.20L + 0.10R + 0.10G + 0.10T
$$

Where:

- $X$: XFDL label/path/help and answer-type match
- $L$: LayoutLMv3 validation probability for the RP-9 node
- $R$: RP-9 section alignment
- $G$: normalized geometry alignment
- $T$: row/column context from an extractor-declared table

Every XFDL suggestion includes the five component scores and its XFDL SID/path provenance. Global type rules precede ranking and remain canonical-only:

- checkbox/radio → `Question.BooleanAnswer`
- currency → `CurrencyAmount`
- percentage → `Percentage`

## Staging Gate

The XFDL-first branch activates only when all conditions hold:

- `SEMANTIC_BASELINE=RP-9`
- `DEPLOYMENT_ENVIRONMENT=staging`
- `XFDL_PRIMARY_MAPPING=1`
- source/family resolves to a packaged authoritative XFDL

The branch bypasses:

- `mapBlocksWithAcord`
- promoted dictionary suggestions
- RP-8/Wave heuristic fallback
- reducer arbitration artifacts
- multi-stage usability inference

The existing pipeline remains available outside this gate.

## Initial Implementation

- `backend/api/src/services/xfdlRp9MappingPipeline.ts`
  - XFDL parser/index
  - explicit XFDL-to-RP-9 representation bridges
  - block matcher
  - LayoutLM validator/fallback
  - five-component scorer and global type rules
  - plain and compressed XFDL envelope support
  - dynamic ACORD/supplemental XFDL selection
  - pipeline diagnostics
- `backend/api/src/api/mapFields.ts`
  - staging-gated pipeline routing
  - response contract: `mappingPipeline` and `xfdlDiagnostics`
- `backend/api/tests/xfdlRp9MappingPipeline.test.cjs`
  - parser, canonical resolution, scoring, binding placement, fillability, API contract, and staging isolation
- `backend/api/scripts/validate-xfdl-rp9-multi-form.cjs`
  - repeatable local or live ACORD 125/126/130 and Markel question-binding report
- `backend/api/scripts/validate-xfdl-rp9-reconstruction.cjs`
  - repeatable local or live reconstruction report for ACORD, Markel, Hartford, Philadelphia, Travelers, and Chubb forms

## Follow-Up Plan

1. Replace regex XML parsing with a streaming XML parser once the runtime dependency is approved.
2. Generate versioned XFDL semantic indexes at build time for the full XFDL corpus.
3. Add explicit XFDL section boundaries and repeated-group identities instead of prefix inference.
4. Expand semantic-path bridges into a generated, integrity-checked XFDL-to-RP-9 crosswalk.
5. Calibrate geometry transforms between XFDL and each rendered PDF revision.
6. Connect the staging LayoutLMv3 service and validate ambiguous/unlabeled-field behavior on page images.
7. Run side-by-side staging evaluation against the current RP-9 pipeline before considering any broader rollout.

## Non-Goals for This Slice

- No production activation.
- No removal of the existing production pipeline.
- No claim that every XFDL control currently resolves to RP-9; unresolved controls remain explicit and receive no legacy fallback.
- No LayoutLMv3 promotion when XFDL already provides an authoritative canonical match.
