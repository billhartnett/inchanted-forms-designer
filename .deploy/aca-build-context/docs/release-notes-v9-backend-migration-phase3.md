# Release Notes: v9-backend-migration-phase3

## Summary

This milestone completes the backend runtime migration to Express-native hosting, finalizes route migration, hardens container delivery for Azure Container Apps (ACA), and modernizes CI/CD into dedicated workflows with environment-gated promotion.

## Highlights

### Express-native backend migration
- Replaced Functions host-first runtime flow with an Express-native server entrypoint and middleware stack.
- Standardized runtime behavior around service-host operation and health/version endpoint consistency.

### Route migration completion
- Migrated 54 handlers across 63 routes into route-module registration.
- Preserved business logic compatibility with adapter-based request handling.

### Dockerfile hardening
- Hardened backend image build/runtime defaults for production container use.
- Locked runtime start path to Express entrypoint and standardized container port behavior.

### ACA deployment artifacts
- Added deployment-ready ACA files under `backend/api/deploy/aca/`:
  - `containerapp.yaml`
  - `env.example.json`
  - `commands.md`
- Added backend container build definition in `backend/api/Dockerfile`.

### CI/CD modernization
- Replaced legacy gate workflows with four dedicated workflows:
  - `ci-backend.yml`
  - `build-image.yml`
  - `deploy-aca.yml`
  - `deploy-frontend.yml`
- Removed strict-mode/replay/drift legacy workflow set.

### Environment-gated staging to production promotion
- Added GitHub Environment-aware deploy flow in ACA pipeline:
  - Deploy to `staging` first
  - Execute health probes (`/api/ping`, `/api/gethealth`, `/api/version`)
  - Require production environment approval before promotion
  - Promote the same resolved image digest to `production`

## Keep a Changelog Classification

### Added
- Express server runtime and route registrar.
- Health/version payload modules.
- ACA deploy artifacts and hardened Dockerfile.
- Dedicated CI/CD workflows.

### Changed
- Runtime architecture shifted to Express-native backend hosting.
- API route topology migrated to module-based registration.
- Deployment flow moved to staged, environment-gated promotion.

### Removed
- Legacy strict/replay/drift gating workflows.
- Legacy monolithic frontend-deploy workflow filename.

### Fixed
- Backend CI TypeScript compile invocation reliability.
- Build-image workflow gating behavior when required secrets are missing.

### Security
- Environment-level deployment controls for staging and production.
- Digest-presence and digest-promotion safety checks.

## GitHub Release Body (Copy/Paste)

```markdown
## Summary

This milestone completes the backend runtime migration to Express-native hosting, finalizes route migration, hardens container delivery for Azure Container Apps (ACA), and modernizes CI/CD into dedicated workflows with environment-gated promotion.

## Highlights

### Express-native backend migration
- Replaced Functions host-first runtime flow with an Express-native server entrypoint and middleware stack.
- Standardized runtime behavior around service-host operation and health/version endpoint consistency.

### Route migration completion
- Migrated 54 handlers across 63 routes into route-module registration.
- Preserved business logic compatibility with adapter-based request handling.

### Dockerfile hardening
- Hardened backend image build/runtime defaults for production container use.
- Locked runtime start path to Express entrypoint and standardized container port behavior.

### ACA deployment artifacts
- Added deployment-ready ACA files under `backend/api/deploy/aca/`:
  - `containerapp.yaml`
  - `env.example.json`
  - `commands.md`
- Added backend container build definition in `backend/api/Dockerfile`.

### CI/CD modernization
- Replaced legacy gate workflows with four dedicated workflows:
  - `ci-backend.yml`
  - `build-image.yml`
  - `deploy-aca.yml`
  - `deploy-frontend.yml`
- Removed strict-mode/replay/drift legacy workflow set.

### Environment-gated staging to production promotion
- Added GitHub Environment-aware deploy flow in ACA pipeline:
  - Deploy to `staging` first
  - Execute health probes (`/api/ping`, `/api/gethealth`, `/api/version`)
  - Require production environment approval before promotion
  - Promote the same resolved image digest to `production`

## Change Classification

### Added
- Express server runtime and route registrar.
- Health/version payload modules.
- ACA deploy artifacts and hardened Dockerfile.
- Dedicated CI/CD workflows.

### Changed
- Runtime architecture shifted to Express-native backend hosting.
- API route topology migrated to module-based registration.
- Deployment flow moved to staged, environment-gated promotion.

### Removed
- Legacy strict/replay/drift gating workflows.
- Legacy monolithic frontend-deploy workflow filename.

### Fixed
- Backend CI TypeScript compile invocation reliability.
- Build-image workflow gating behavior when required secrets are missing.

### Security
- Environment-level deployment controls for staging and production.
- Digest-presence and digest-promotion safety checks.
```
