# RP-9 Designer UI Plan

## Status

RP-9 UI work is staging-ready and evaluation-only. The production designer continues to display and verify RP-8 until RP-9 receives explicit promotion approval.

## Implemented

- Separate `build:rp9-staging` mode with local RP-9 truth/lineage/bundle hash validation.
- Versioned runtime badge and contract verification.
- Mapping-store persistence for semantic baseline, canonical nodes, sections, bundles, and families.
- Section navigation anchors that never become canvas fields.
- RP-9 canonical role/component/family/instance/category provenance in the mapping inspector.
- Existing production `build` remains RP-8-specific.

## Build Contract

1. Keep the existing RP-8 manifest and runtime verification unchanged for production builds.
2. Run staging browser tests against version-matched RP-9 authority endpoints.
3. Add persisted-state migration tests for section/family metadata before production promotion.

## Designer Model

1. Extend mapping metadata with canonical node ID, semantic kind, role, component, section, category bundles, and instance-family keys.
2. Render section nodes as navigation/grouping anchors, never as canvas fields or OCR overlays.
3. Render `GeneralInformation.Question` and `GeneralInformation.Answer` as linked semantic rows using the same question-family key.
4. Group premises fields by location and building keys without regenerating field IDs or changing page indices.
5. Group Producer identity/address/contact/signature by producer and contact keys.
6. Show role-safe representation provenance in mapping review. Do not visually merge Applicant, NamedInsured, Insured, and Producer.
7. Label Agent-origin fields as Producer semantics while retaining source label provenance.
8. Show canonical, role-safe representation, blocked, and dictionary-only states distinctly in the mapping inspector.

## Category UI

- Add RP-9 group bundles for address, contact, date, identity, premises, question-answer, section, and signature.
- Add section bundles for producer-information, applicant-information, premises-information, general-information, document, and signature.
- Use section bundles for navigation and filters; use group bundles for semantic clustering.
- Preserve stable dimensions and avoid creating canvas overlays for section headers.

## Validation Gates

- Build fails when RP-9 artifacts or hashes disagree.
- RP-8 production badge and API verification remain unchanged.
- RP-9 evaluation badge states `inactive candidate`, never `active`.
- ACORD 125 verifies Agent Name, date, premises, and general-information behavior.
- ACORD 126/130 verify Producer and signature fields.
- Multi-premises forms verify stable location/building grouping across pages.
- Persisted designer state round-trips without field-ID, page-index, or grouping drift.
- Browser tests verify no section node becomes a fillable field or duplicate label.

## Promotion Boundary

Do not deploy an RP-9 frontend manifest to the production Web App until the backend projector, corpus regressions, persisted-state tests, and explicit RP-9 promotion gate all pass.
