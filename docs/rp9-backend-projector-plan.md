# RP-9 Backend Projector Plan

## Status

RP-9 is staging-active behind `SEMANTIC_BASELINE=RP-9` and `DEPLOYMENT_ENVIRONMENT=staging`. RP-8 remains the production baseline. This plan does not authorize deployment or production promotion.

## Implemented

- Versioned semantic-runtime facade with RP-8 default behavior.
- RP-9 artifact/hash/lineage/Phase 33 validation.
- Staging-only fail-closed environment gate.
- Canonical alias projection for Producer, dates, signatures, premises, general Q/A, and section nodes.
- Canonical-first final selection; dictionary-only candidates cannot be selected.
- Multi-instance family and instance-key projection.
- Mapping responses include RP-9 metadata, canonical nodes, semantic sections, and category bundles.
- Structural section/Q&A nodes are excluded from `mappedFields` canvas output.
- Version-matched truth, lineage, and category-bundle endpoints.

## Inputs

- `acord-artifacts/authoritative-semantic-truth-rp9.json`
- `acord-artifacts/rp9-ontology-lineage.json`
- `acord-artifacts/rp9-category-bundles.json`
- Existing Phase 33 strict role-boundary policy

## Runtime Work

1. Preserve role identity in `(role, component, instance-family-key)` form. `Agent` may normalize to `Producer`; Applicant, NamedInsured, Insured, and Producer must not collapse.
2. Resolve multi-instance keys before selection:
   - producer: `producerIndex`
   - producer contact: `producerIndex + contactIndex`
   - premises: `locationIndex`
   - building: `locationIndex + buildingIndex`
   - signatures: signer role/index + signature index
   - general Q/A: section occurrence + question index
3. Keep dictionary-only candidates as review alternatives; never report them as ontology nodes or select them as canonical mappings.
4. Add staging ACA environment variables and image build assertions only in a separate deployment change.
5. Capture staging ACORD 125/126/130 and multi-premises response baselines before promotion review.

## Validation Gates

- Deterministic artifact regeneration produces identical payload hashes.
- Tampered truth, lineage, category bundle, or parent hashes fail startup in RP-9 mode.
- RP-8 mode remains byte-for-byte compatible for existing regression fixtures.
- Producer, form-date, signature, premises, and general Q/A fixture tests cover canonical-first selection.
- Applicant signature stays Applicant when represented by `NamedInsured_Signature` evidence.
- Agent labels resolve to Producer without creating a distinct legal role.
- ACORD 125, 126, 130, and multi-premises fixtures verify stable family keys.
- Full extraction, mapping, designer, and structured-output contracts pass before any promotion review.

## Promotion Boundary

Do not change `current`, `PRODUCTION_BASELINE`, ACA environment variables, or production snapshot pointers during implementation. RP-9 activation requires a separate readiness artifact and explicit promotion decision.
