 # inchanted Forms Designer — Agent Instructions

 This is the primary workspace instruction file for AI coding agents in this repository.

## What This Repo Is

This is an ACORD-centric forms platform with three coordinated areas:

1. PDF and OCR extraction.
2. ACORD semantic mapping and XML generation.
3. A Canva-like React designer for reviewing and refining actual fillable fields.

Keep those stages distinct. Labels are semantic anchors; they are not canvas overlays.

## Non-Negotiables

- Preserve the extraction -> mapping -> designer -> structured output pipeline.
- Do not introduce OCR text overlays, duplicate labels, meaningless bounding boxes, or noisy canvas artifacts.
- Treat field IDs, page indices, grouping, and persisted designer state as stable unless a change explicitly requires migration.
- Prefer correctness and semantic clarity over shortcuts, especially for ACORD label selection and field typing.
- If a field is ambiguous, rank ACORD candidates and explain the mapping rationale instead of forcing a guess.

## Repository Shape

- [frontend/README.md](frontend/README.md) covers the Vite frontend baseline.
- [backend/api/local.settings.example.json](backend/api/local.settings.example.json) shows the Azure Functions environment shape.
- Backend business logic lives under [backend/api/src/services/](backend/api/src/services/).
- Designer state and canvas behavior live under [frontend/src/designer/](frontend/src/designer/) and [frontend/src/canvas/](frontend/src/canvas/).

## Commands To Know

- Root: `pnpm install`
- Frontend: `npm run dev`, `npm run build`, `npm run preview` from [frontend/](frontend/)
- Backend: `npm run build`, `npm start` from [backend/api/](backend/api/)
- Shared package: `npm run build` from [shared/](shared/)

## Architecture Notes

- The backend uses Azure Functions v4 and registers functions explicitly through the entrypoint, so new handlers must be imported there.
- Backend compilation is in-place TypeScript output, not a separate `dist` folder.
- The frontend uses React, Vite, Konva, and Zustand; designer state changes should stay predictable and undo-friendly.
- ACORD mapping relies on service code and reference data, not ad hoc heuristics alone.

## Common Pitfalls

- Do not regenerate field IDs casually; it breaks grouping and persisted selections.
- Be careful with page index conversions when reasoning about multi-page fields.
- Preserve service-relative paths when touching backend data loading.
- If a change affects mapping or extraction semantics, validate both the field model and the generated output shape.

## Runtime Artifacts

- Treat emulator and runtime output as local-only data. Do not commit generated runtime artifacts.
- Keep these paths untracked in git:
	- backend/api/__blobstorage__/
	- backend/api/__queuestorage__/
	- [backend/api/AzuriteConfig](backend/api/AzuriteConfig)
	- [backend/api/tests/diagnostics/](backend/api/tests/diagnostics/)
- If diagnostics outputs are needed for discussion, summarize results in markdown docs or PR text instead of committing raw runtime JSON snapshots.
- If a new local emulator or cache directory is introduced, add it to [.gitignore](.gitignore) in the same change.

## When Editing

- Keep changes minimal and local.
- Link to existing docs instead of copying them here.
- If the task seems frontend-specific or backend-specific, consider creating a narrower instruction file later rather than expanding this one.
