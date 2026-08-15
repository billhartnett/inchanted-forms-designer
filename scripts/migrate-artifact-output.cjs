const fs = require('fs');
const path = require('path');
const {
  autonomousRunsRoot,
  diagnosticsRoot,
  externalPath,
  guardrails,
  outputRoot,
  productionSnapshot,
  validationOutput,
} = require('./artifact-output-paths.cjs');

const repoRoot = path.resolve(__dirname, '..');

function copyIfPresent(source, target) {
  if (!fs.existsSync(source)) return false;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true, force: true });
  return true;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function annotateSnapshot(name) {
  const root = productionSnapshot(name);
  const manifestPath = path.join(root, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return;
  const manifest = readJson(manifestPath);
  const snapshots = Object.fromEntries(Object.entries(manifest.snapshots || {}).map(([key, snapshot]) => {
    const relativePath = snapshot.path && !path.isAbsolute(snapshot.path) ? snapshot.path : key;
    return [key, {
      ...snapshot,
      path: externalPath(path.join(root, relativePath)),
    }];
  }));
  writeJson(manifestPath, {
    ...manifest,
    outputPath: externalPath(root),
    outputArchitecture: 'F:/acord-output/production-snapshots',
    snapshots,
    guardrails: {
      ...(manifest.guardrails || {}),
      noRecordPurge: true,
      noDiscrepancyRegeneration: true,
      noOntologyChange: true,
      noMetricChange: true,
    },
  });
}

function annotateValidation(version) {
  const root = validationOutput(version);
  const manifestPath = path.join(root, 'snapshot-manifest.json');
  if (!fs.existsSync(manifestPath)) return;
  const manifest = readJson(manifestPath);
  const restorePoint = manifest.restorePoint || manifest.baselineRestorePoint;
  writeJson(manifestPath, {
    ...manifest,
    outputPath: externalPath(root),
    restorePointPath: restorePoint ? externalPath(productionSnapshot(restorePoint)) : undefined,
    guardrails,
  });
}

function main() {
  fs.mkdirSync(outputRoot, { recursive: true });
  fs.mkdirSync(autonomousRunsRoot, { recursive: true });
  fs.mkdirSync(diagnosticsRoot, { recursive: true });

  const copiedSnapshots = [];
  for (const name of ['RP-3', 'RP-3M', 'RP-4']) {
    if (copyIfPresent(path.join(repoRoot, 'restore-points', name), productionSnapshot(name))) {
      annotateSnapshot(name);
      copiedSnapshots.push(name);
    }
  }

  const copiedValidations = [];
  for (let version = 50; version <= 60; version += 1) {
    const source = path.join(repoRoot, `corpus-validation-v${version}`);
    const target = validationOutput(version);
    if (copyIfPresent(source, target)) {
      annotateValidation(version);
      copiedValidations.push(version);
    }
  }

  const copiedDiagnostics = [];
  const diagnosticSources = [
    ['semantic-errors', path.join(repoRoot, 'semantic-patches', 'semantic-errors')],
    ['semantic-snapshots', path.join(repoRoot, 'semantic-patches', 'current-output')],
    ['backend-api', path.join(repoRoot, 'backend', 'api', 'tests', 'diagnostics')],
    ['repo-debug', path.join(repoRoot, 'debug')],
  ];
  for (const [name, source] of diagnosticSources) {
    if (copyIfPresent(source, path.join(diagnosticsRoot, name))) copiedDiagnostics.push(name);
  }

  writeJson(path.join(outputRoot, 'output-architecture-manifest.json'), {
    schemaVersion: 'acord-output-architecture.v1',
    activatedAt: new Date().toISOString(),
    outputRoot: externalPath(outputRoot),
    autonomousRuns: externalPath(autonomousRunsRoot),
    validationOutput: externalPath(path.join(outputRoot, 'validation-output')),
    diagnostics: externalPath(diagnosticsRoot),
    productionSnapshots: externalPath(path.join(outputRoot, 'production-snapshots')),
    copiedSnapshots,
    copiedValidations,
    copiedDiagnostics,
    guardrails,
  });

  process.stdout.write(JSON.stringify({
    outputRoot: externalPath(outputRoot),
    copiedSnapshots,
    copiedValidations,
    copiedDiagnostics,
    guardrails,
  }, null, 2) + '\n');
}

main();
