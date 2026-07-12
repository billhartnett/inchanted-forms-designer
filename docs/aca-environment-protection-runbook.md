# ACA Deployment Environment Protection Runbook

This runbook explains how to configure GitHub Environments for the ACA deployment workflow and how staging to production promotion works.

Applies to workflow:
- `.github/workflows/deploy-aca.yml`

## Goals

- Bind deployment jobs to GitHub Environments (`staging`, `production`) so approvals, secrets, and audit logs are environment-scoped.
- Require a valid image digest before any deployment can run.
- Deploy to staging first, probe health, then promote the exact same image digest to production.

## Environment Setup In GitHub

Open GitHub repository settings:
- `Settings -> Environments`

Create these environments:
1. `staging`
2. `production`

### Configure `staging`

Recommended configuration:
- Deployment branches: restrict to your release policy (for example, tag-based and main).
- Required reviewers: optional. Leave unset if you do not want a hard approval gate.
- Wait timer: optional, if you want a cooling-off period before the staging deploy starts.

Notes:
- In GitHub, adding reviewers makes approval required. If you want truly optional reviewers for staging, do not add required reviewers and rely on normal team review practices.

### Configure `production`

Required configuration:
- Required reviewers: add your release approver group.
- Prevent self-review (recommended): enabled.
- Deployment branches: restrict to your release policy.
- Wait timer: optional.

This environment is the manual approval gate before production deploy.

## Secrets And Variables

The workflow uses environment-bound secrets because jobs are declared with `environment: staging` and `environment: production`.

Configure the following secrets in each environment (or at repo level if intentionally shared):

- `AZURE_CREDENTIALS`
- `AZURE_SUBSCRIPTION_ID`
- `ACA_RESOURCE_GROUP`
- `ACA_ENV_NAME`
- `ACA_APP_NAME`
- `ACR_NAME`
- `ACR_LOGIN_SERVER`

Recommendation:
- Keep production credentials in `production` environment secrets.
- Use separate staging resources or credentials where possible.

## Workflow Execution Flow

For tag pushes matching `v*` (and manual dispatch):

1. `resolve-image` job
- Attempts to download digest artifact produced by `build-image.yml`.
- Falls back to ACR lookup if artifact is unavailable.
- Emits immutable outputs (`tag`, `image`, `digest`).
- Fails fast if digest is missing or not `sha256:*`.

2. `deploy-staging` job (`environment: staging`)
- Uses the resolved outputs.
- Refuses to run without digest.
- Applies ACA manifest.
- Pins deployed image to the exact resolved digest.
- Runs probes:
  - `/api/ping`
  - `/api/gethealth`
  - `/api/version`

3. `deploy-production` job (`environment: production`)
- Starts only after `resolve-image` and `deploy-staging` succeed.
- Pauses for production environment approval when required reviewers are configured.
- Deploys the same resolved digest used in staging.
- Runs the same probe set.

## Promotion Guarantee

Promotion is digest-based, not tag-based.

That means:
- Staging and production deploy the same immutable image (`<repo>@sha256:...`).
- Re-tagging does not change what is promoted after digest resolution.

## Operational Checks

Before release:
1. Confirm `build-image.yml` completed and published `backend-image-digest` artifact.
2. Confirm `staging` and `production` environment secrets are present.
3. Confirm production required reviewers are configured.

During release:
1. Trigger on a `v*` tag or run manual dispatch.
2. Verify staging probes pass.
3. Approve production deployment in the environment approval UI.
4. Verify production probes pass.

If deployment is blocked:
- Check `resolve-image` logs for digest resolution failure.
- Check environment protection events for pending approval.
- Check missing environment secrets in the target environment.

## Troubleshooting

Digest not found:
- Ensure the image tag exists in ACR.
- Ensure `build-image.yml` pushed image and uploaded digest artifact.

Staging passes but production does not start:
- Verify `production` environment approval is completed.
- Verify production environment has required secrets.

Probes fail:
- Review latest ACA revision and container logs.
- Confirm ingress FQDN resolves and app is listening on port 8080.
