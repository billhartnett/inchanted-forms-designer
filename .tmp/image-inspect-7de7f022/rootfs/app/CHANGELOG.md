# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project uses milestone tags for release tracking.

## [Unreleased]

### Added
- Placeholder for upcoming changes.

### Changed
- Placeholder for upcoming changes.

### Removed
- Placeholder for upcoming changes.

### Fixed
- Placeholder for upcoming changes.

### Security
- Placeholder for upcoming changes.

## [v9-backend-migration-phase3] - 2026-07-12

### Added
- Express-native backend runtime entrypoint and middleware pipeline in `backend/api/src/server.ts`.
- Full route registration surface for migrated handlers via `backend/api/src/api/registerRoutes.ts`.
- Health and version payload builders in `backend/api/src/health/`.
- Containerization and deployment artifacts for ACA:
  - `backend/api/Dockerfile`
  - `backend/api/deploy/aca/containerapp.yaml`
  - `backend/api/deploy/aca/env.example.json`
  - `backend/api/deploy/aca/commands.md`
- New dedicated GitHub Actions workflow set:
  - `.github/workflows/ci-backend.yml`
  - `.github/workflows/build-image.yml`
  - `.github/workflows/deploy-aca.yml`
  - `.github/workflows/deploy-frontend.yml`

### Changed
- Migrated backend runtime from Azure Functions host-first execution to Express-native service hosting.
- Migrated API surface to route modules with adapter-based compatibility:
  - 54 handlers mapped across 63 routes.
- Hardened backend image build and runtime defaults for container execution:
  - production Node runtime behavior
  - fixed service port (8080)
  - start command aligned to Express entrypoint
- Modernized CI/CD architecture by replacing monolithic/legacy gate workflows with dedicated backend, image, ACA deploy, and frontend deploy workflows.
- Implemented environment-gated promotion path in ACA deployment workflow:
  - `staging` deployment first
  - protected `production` promotion using GitHub Environments
  - same digest promotion from staging to production

### Removed
- Legacy gating workflows tied to strict-mode/replay/drift quality gates:
  - `.github/workflows/drift-gates.yml`
  - `.github/workflows/pr-label-strict-mode.yml`
  - `.github/workflows/pr-label-wave6-replay-strict.yml`
  - `.github/workflows/wave5-strict-mode-gates.yml`
  - `.github/workflows/wave6-replay-gates.yml`
- Legacy workflow entrypoint `.github/workflows/main_forms-designer.yml` (replaced by dedicated frontend deploy workflow).

### Fixed
- CI backend TypeScript compile checks by using deterministic local TypeScript binary invocation in workflow automation.
- Build-image workflow stability by replacing invalid job-level secret gating with step-level prerequisite checks and safe skip behavior when secrets are not configured.
- Consolidated health/version endpoint checks in CI and ACA deployment probes for Express-native runtime verification (`/api/ping`, `/api/gethealth`, `/api/version`).

### Security
- Added deployment controls using GitHub Environments for staging and production promotion gates.
- Enabled production approval gate support through environment-level protection policies and reviewer requirements.
- Enforced digest-based deployment safety checks to prevent promotion without a resolved immutable image digest.

[unreleased]: https://github.com/billhartnett/inchanted-forms-designer/compare/v9-backend-migration-phase3...HEAD
[v9-backend-migration-phase3]: https://github.com/billhartnett/inchanted-forms-designer/releases/tag/v9-backend-migration-phase3
