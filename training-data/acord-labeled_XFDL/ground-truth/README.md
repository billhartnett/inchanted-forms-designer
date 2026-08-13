# XFDL Ground-Truth Dataset

This directory contains one normalized JSON dataset for each XFDL form directly under `training-data/`, plus `manifest.json` and `schema.json`.

`xfdl-pdf-mapping.json` pairs each source XFDL with the corresponding PDF when evidence supports a unique assignment. It retains review-only and unmatched records instead of forcing uncertain pairs.

Regenerate from the repository root:

```powershell
node training-data/scripts/extract-xfdl-ground-truth.cjs training-data training-data/acord-labeled_XFDL/ground-truth
node training-data/scripts/pair-xfdl-pdfs.cjs test-fixtures/pdf training-data/acord-labeled_XFDL/ground-truth/xfdl-pdf-mapping.json
```

## Ground-Truth Rules

- `field` and `check` XFDL controls are fillable fields.
- `label` elements are semantic anchors. They are not fillable fields or canvas overlays.
- Buttons, lines, boxes, spacers, images, and labels are retained in `suppression.suppressedElements` with geometry and exclusion reasons.
- Geometry, formats, bindings, defaults, help, tab order, and behavior expressions are explicit XFDL facts.
- Field types are normalized from the control tag, `fieldType`, and `format`.
- Visual-label associations, tables, and semantic-family groups are inferred and include confidence/provenance.
- `xfdl-within-container` groups are explicit relationships from `itemlocation/within`.
- Compute expressions are preserved verbatim and are never executed by the extractor.
- `Unmapped_*` controls remain fillable ground truth and are listed separately rather than suppressed.

## Main Records

- `pages`: page identity and dimensions.
- `fields`: geometry, normalized/source types, semantic path, default value, binding, labels, behavior, suppression, and optional table cell.
- `labels`: all visual semantic anchors and their geometry.
- `tables`: spatially inferred row/column/cell structure.
- `groups`: explicit container groups and inferred semantic families.
- `dataModel.bindings`: exact XFDL data paths and bound controls.
- `suppression`: excluded presentation/operational elements, conditional fields, and unmapped fillable controls.
- `diagnostics`: unresolved or malformed source facts; nothing is silently dropped.

Coordinates use native XFDL layout units. `pageIndex` is zero-based; `pageNumber` follows the source page identity.
