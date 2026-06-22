# Backend API

Azure Functions v4 backend for document extraction, ACORD semantic mapping, and form submission orchestration.

## Quick Start

```bash
# Build TypeScript
npm run build

# Start local emulator
npm start

# Run tests
npm test

# Run diagnostics
npm run diag:mapping
npm run diag:root-cause
```

## Structure

- [src/services/](src/services/) – core extraction, mapping, and orchestration logic
- [extractText/](extractText/) – Azure Document Intelligence OCR handler
- [mapFields/](mapFields/) – semantic field mapping handler
- [suggestLabels/](suggestLabels/) – AI label suggestion handler

## Important

**Do not commit runtime artifacts.** See [Runtime Artifacts](../AGENTS.md#runtime-artifacts) in AGENTS.md for full details.

Untracked paths include:
- `__blobstorage__/` (Azure Storage emulator)
- `__queuestorage__/` (Azure Queue emulator)
- `AzuriteConfig`
- `tests/diagnostics/` (generated evaluation reports)

If you add new emulator or cache directories, update [.gitignore](../.gitignore) immediately.
