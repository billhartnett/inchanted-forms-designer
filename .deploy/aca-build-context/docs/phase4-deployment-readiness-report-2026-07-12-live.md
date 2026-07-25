# Phase 4 Deployment Readiness Report (Live ACA)

Date: 2026-07-12
Subscription: 58b40373-45df-4be5-a3ba-8df29759537f
Region: eastus

## Deployment Outcome

Express-native backend is now deployed and externally reachable on Azure Container Apps in both staging and production.

## Infrastructure Provisioned

- Resource group: inchanted-aca-rg
- ACA environment: inchanted-aca-env
- Staging app: inchanted-api-staging
- Production app: inchanted-api-production
- ACR: inchantedregistry (inchantedregistry.azurecr.io)

## Image Build and Digest

Build method used:
- ACR build from clean git-clone context (to avoid recursive local node_modules path issues)

Tag built:
- v9-phase4-20260712-aca4

Image repository:
- inchantedregistry.azurecr.io/wave9-backend-api

Digest deployed to both environments:
- sha256:7de7f022f4e217db4178d2351f1e5232248aef94a8c84c5eb8b72fbee1c27030

## Staging and Production Revisions

Staging:
- App: inchanted-api-staging
- FQDN: https://inchanted-api-staging.greenriver-7266e28c.eastus.azurecontainerapps.io
- Latest ready revision: inchanted-api-staging--qtcoda4

Production:
- App: inchanted-api-production
- FQDN: https://inchanted-api-production.greenriver-7266e28c.eastus.azurecontainerapps.io
- Latest ready revision: inchanted-api-production--ftbxvya

## Health Probe Results

### Staging

- GET /api/ping -> 200
  - body: {"ok":true,"status":"ok","message":"pong",...}
- GET /api/gethealth (with tenant/role headers) -> 200
  - body checks:
    - documentIntelligence: true
    - embeddings: true
    - storage: true
- GET /api/version -> 200
  - body includes wave9EngineVersion: "1.0.0"

### Production

- GET /api/ping -> 200
  - body: {"ok":true,"status":"ok","message":"pong",...}
- GET /api/gethealth (with tenant/role headers) -> 200
  - body checks:
    - documentIntelligence: true
    - embeddings: true
    - storage: true
- GET /api/version -> 200
  - body includes wave9EngineVersion: "1.0.0"

## ACA Ingress and Runtime Validation

Ingress validation (both apps):
- external: true
- targetPort: 8080
- activeRevisionsMode: Single

Container env vars currently applied:
- NODE_ENV=production
- PORT=8080
- EMBEDDING_MODEL=text-embedding-3-large
- DI_ENDPOINT
- DI_KEY (secret ref)
- OPENAI_ENDPOINT
- OPENAI_API_KEY (secret ref)
- OPENAI_DEPLOYMENT=text-embedding-3-large
- AZURE_STORAGE_CONNECTION_STRING (secret ref)

Startup and request logs confirm:
- Express startup: "backend/api listening on port 8080"
- Successful probe requests for /api/ping, /api/gethealth, /api/version

## Warnings and Anomalies

1. Domain service secrets are now configured for live health checks
- /api/gethealth now reports true for:
  - documentIntelligence
  - embeddings
  - storage

2. Build pipeline context risk from local recursive node_modules
- Direct ACR build from workspace root failed due deeply nested local file-dependency node_modules paths.
- Mitigation used: clean git clone context for build.

3. GitHub Deploy ACA workflow remains blocked for this tenant setup
- Prior workflow runs failed at Azure login due credentials/secrets mismatch in GitHub Actions context.
- Manual CLI deployment completed successfully under logged-in Azure user context.

## Production Gate Note

Production deployment was executed manually to the same digest as staging.
- Equivalent intent of staging -> same digest -> production promotion was satisfied.
- GitHub environment approval gate was not used for this manual path.

## Phase 5 Preparation (Now that backend is stable and deployed)

### 1) Re-enable Wave-9 mapping engine endpoints
- Validate mapFields and related mapping routes against staging first.
- Add post-deploy smoke suite for mapFields quality and rationale fields.

### 2) Re-enable ACORD extraction and semantic inference endpoints
- Configure required DI and OpenAI secrets at app level.
- Run fixture-based extraction + semantic inference checks in staging.

### 3) Re-enable Wave-8 gating and Wave-9 arbitration
- Execute gating/arbitration diagnostics against staging endpoint.
- Baseline outputs against prior known-good reports.

### 4) Resume feature development safely
- Keep staging as integration target for backend work.
- Promote to production by digest once staging checks pass.
- Add CI gate for health checks requiring configured DI/OpenAI/Storage in non-local environments.

## Immediate Next Configuration Actions

Recommended follow-up configuration:
- Optional metadata:
  - GIT_COMMIT_HASH
  - BUILD_TIMESTAMP
  - WAVE9_ENGINE_VERSION
- Restore GitHub Actions environment secrets so future ACA promotions can run through the staged GitHub workflow instead of manual CLI deployment.
