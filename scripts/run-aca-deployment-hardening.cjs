const fs = require('fs');
const path = require('path');
const {
  currentProductionSnapshot,
  diagnosticOutput,
  externalPath,
  productionSnapshot,
  repoRoot,
} = require('./artifact-output-paths.cjs');

const baselineArg = process.argv.slice(2).find((arg) => arg.startsWith('--baseline='));
const baselineRoot = baselineArg
  ? productionSnapshot(baselineArg.split('=')[1])
  : currentProductionSnapshot();
const manifest = readJson(path.join(baselineRoot, 'manifest.json'));
const restorePoint = manifest.restorePoint;
const outputRoot = diagnosticOutput('aca-deployment-hardening', restorePoint);
const liveBaseUrl = String(process.env.ACA_PRODUCTION_BASE_URL || 'https://inchanted-api-production.greenriver-7266e28c.eastus.azurecontainerapps.io').replace(/\/$/, '');

function readJson(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Missing required file: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8').replace(/^\uFEFF/, '');
}

function count(text, pattern) {
  return [...text.matchAll(pattern)].length;
}

async function fetchJson(route) {
  try {
    const response = await fetch(`${liveBaseUrl}${route}`, { signal: AbortSignal.timeout(10000) });
    const body = await response.json();
    return { reachable: true, status: response.status, ok: response.ok, body };
  } catch (error) {
    return { reachable: false, status: null, ok: false, error: error.message };
  }
}

async function main() {
  const deploymentWorkflow = readText('.github/workflows/deploy-aca.yml');
  const imageWorkflow = readText('.github/workflows/build-image.yml');
  const acaManifest = readText('backend/api/deploy/aca/containerapp.yaml');
  const dockerfile = readText('backend/api/Dockerfile');
  const dockerignore = readText('.dockerignore');
  const versionSource = readText('backend/api/src/health/version.ts');
  const productionHardening = readJson(path.join(diagnosticOutput('production-hardening', restorePoint), 'production-hardening-report.json'));
  const currentRoot = currentProductionSnapshot();

  const checks = {
    baselineIsCurrent: path.resolve(currentRoot) === path.resolve(baselineRoot),
    productionHardeningPassed: productionHardening.hardened === true,
    rp7BaselineBoundToRuntime: acaManifest.includes('name: PRODUCTION_BASELINE') && acaManifest.includes('value: "RP-7"'),
    runtimeReportsProductionBaseline: versionSource.includes('productionBaseline: process.env.PRODUCTION_BASELINE'),
    immutableImagePlaceholder: acaManifest.includes('image: <IMAGE_REFERENCE>') && !acaManifest.includes('<TAG>'),
    digestInjectedInBothEnvironments: count(deploymentWorkflow, /<IMAGE_REFERENCE>/g) === 2 && count(deploymentWorkflow, /needs\.resolve-image\.outputs\.image/g) >= 2,
    noTwoStepImagePinning: !deploymentWorkflow.includes('Pin deployed image to resolved digest'),
    activeDigestVerifiedInBothEnvironments: count(deploymentWorkflow, /Verify active image digest pin/g) === 2,
    startupProbeConfigured: acaManifest.includes('type: Startup') && acaManifest.includes('path: /api/ping'),
    readinessProbeConfigured: /type: Readiness[\s\S]*?path: \/api\/ops\/health/.test(acaManifest),
    livenessProbeConfigured: /type: Liveness[\s\S]*?path: \/api\/ping/.test(acaManifest),
    ingressPortAligned: acaManifest.includes('targetPort: 8080') && acaManifest.includes('value: "8080"'),
    minimumReplicaAvailable: acaManifest.includes('minReplicas: 1'),
    stagingPrecedesProduction: deploymentWorkflow.includes('- deploy-staging') && deploymentWorkflow.includes('environment: production'),
    productionHealthProbesConfigured: count(deploymentWorkflow, /Post-deploy health probes/g) === 2 && deploymentWorkflow.includes('/api/gethealth') && deploymentWorkflow.includes('/api/version'),
    deployedBaselineVerifiedInBothEnvironments: count(deploymentWorkflow, /version\.productionBaseline !== "RP-7"/g) === 2,
    deployedCommitVerifiedInBothEnvironments: count(deploymentWorkflow, /version\.gitCommitHash !== process\.env\.EXPECTED_COMMIT/g) === 2,
    stagingProductionParityConfigured: deploymentWorkflow.includes('Wave 8 parity check (staging vs production)'),
    imageBuildFailsClosed: !imageWorkflow.includes('should_skip') && imageWorkflow.includes('exit 1'),
    imageProvenanceEnabled: imageWorkflow.includes('--provenance=mode=max'),
    imageSbomEnabled: imageWorkflow.includes('--sbom=true'),
    deterministicInstalls: dockerfile.includes('npm --prefix shared ci') && dockerfile.includes('npm --prefix wave9 ci') && dockerfile.includes('npm --prefix backend/api ci'),
    wave9LockfilePresent: fs.existsSync(path.join(repoRoot, 'wave9', 'package-lock.json')),
    nonRootRuntime: /^USER node$/m.test(dockerfile),
    multiStageImage: count(dockerfile, /^FROM /gm) === 2,
    deferredRouteReadiness: readText('backend/api/src/server.ts').includes('migratedRoutesReady') && readText('backend/api/src/server.ts').includes('import("./api/registerRoutes.js")'),
    sensitiveBuildContextExcluded: ['.git', '**/node_modules', '**/.env.*', '**/local.settings.json'].every((entry) => dockerignore.includes(entry)),
  };

  const [ping, version] = await Promise.all([fetchJson('/api/ping'), fetchJson('/api/version')]);
  const liveVersion = version.body?.data || version.body || {};
  const live = {
    baseUrl: liveBaseUrl,
    ping,
    version,
    healthy: ping.ok === true && ping.body?.ok === true,
    reportedBaseline: liveVersion.productionBaseline || 'unassigned',
    baselineAligned: liveVersion.productionBaseline === restorePoint,
    deploymentRequired: liveVersion.productionBaseline !== restorePoint,
  };

  const ready = Object.values(checks).every(Boolean);
  fs.mkdirSync(outputRoot, { recursive: true });
  const currentReportPath = path.join(outputRoot, 'aca-deployment-hardening-report.json');
  const previous = fs.existsSync(currentReportPath) ? readJson(currentReportPath) : null;
  const reportSequence = Number(previous?.reportSequence || 0) + 1;
  const report = {
    schemaVersion: 'aca-deployment-hardening-report.v1',
    reportSequence,
    generatedAt: new Date().toISOString(),
    baselineRestorePoint: restorePoint,
    baselinePath: externalPath(baselineRoot),
    outputPath: externalPath(outputRoot),
    status: ready ? 'aca-deployment-ready' : 'aca-deployment-hardening-blocked',
    readyForDeployment: ready,
    checks,
    live,
    execution: {
      localDockerAvailable: false,
      imageBuildVerification: 'required-in-build-image-workflow',
      deploymentPerformed: false,
    },
    guardrails: {
      baselineReadOnly: true,
      noDeployment: true,
      noPurge: true,
      noOntologyChange: true,
      noMetricModification: true,
    },
  };
  const historyPath = path.join(outputRoot, 'history', `report-${String(reportSequence).padStart(4, '0')}.json`);
  fs.mkdirSync(path.dirname(historyPath), { recursive: true });
  fs.writeFileSync(currentReportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  fs.writeFileSync(historyPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  process.stdout.write(JSON.stringify({
    baselineRestorePoint: restorePoint,
    status: report.status,
    passedChecks: Object.values(checks).filter(Boolean).length,
    totalChecks: Object.keys(checks).length,
    failedChecks: Object.entries(checks).filter(([, passed]) => !passed).map(([check]) => check),
    liveHealthy: live.healthy,
    liveReportedBaseline: live.reportedBaseline,
    deploymentRequired: live.deploymentRequired,
    reportSequence,
    reportPath: externalPath(currentReportPath),
    historyPath: externalPath(historyPath),
  }, null, 2) + '\n');
  if (!ready) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
