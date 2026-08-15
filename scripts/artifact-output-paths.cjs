const path = require('path');
const fs = require('fs');

const repoRoot = path.resolve(__dirname, '..');
const outputRoot = path.resolve(process.env.ACORD_OUTPUT_ROOT || 'F:/acord-output');
const autonomousRunsRoot = path.join(outputRoot, 'autonomous-runs');
const validationOutputRoot = path.join(outputRoot, 'validation-output');
const diagnosticsRoot = path.join(outputRoot, 'diagnostics');
const productionSnapshotsRoot = path.join(outputRoot, 'production-snapshots');

const guardrails = Object.freeze({
  noPurge: true,
  noDiscrepancyRegeneration: true,
  noOntologyChange: true,
  noMetricModification: true,
});

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function assertExternalOutput(candidate) {
  const resolved = path.resolve(candidate);
  if (!isWithin(outputRoot, resolved)) {
    throw new Error(`Artifact output must be under ${outputRoot}: ${resolved}`);
  }
  if (isWithin(repoRoot, resolved)) {
    throw new Error(`Artifact output cannot be written inside the repository: ${resolved}`);
  }
  return resolved;
}

function validationOutput(version) {
  return assertExternalOutput(path.join(validationOutputRoot, `corpus-validation-v${version}`));
}

function productionSnapshot(name) {
  return assertExternalOutput(path.join(productionSnapshotsRoot, name));
}

function updateCurrentProductionSnapshot(name) {
  const snapshotRoot = productionSnapshot(name);
  const manifestPath = path.join(snapshotRoot, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Production snapshot does not exist: ${snapshotRoot}`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, ''));
  if (manifest.restorePoint !== name || manifest.safeFreeze?.safeToFreeze !== true || manifest.guardrails?.immutable !== true) {
    throw new Error(`Production snapshot is not eligible to become current: ${name}`);
  }

  const currentPath = assertExternalOutput(path.join(productionSnapshotsRoot, 'current'));
  fs.rmSync(currentPath, { recursive: true, force: true });
  try {
    fs.symlinkSync(snapshotRoot, currentPath, 'junction');
    return { path: currentPath, type: 'junction', target: snapshotRoot };
  } catch (error) {
    fs.mkdirSync(currentPath, { recursive: true });
    fs.writeFileSync(path.join(currentPath, 'pointer.json'), JSON.stringify({
      schemaVersion: 'current-production-snapshot.v1',
      updatedAt: new Date().toISOString(),
      restorePoint: name,
      target: externalPath(snapshotRoot),
      fallbackReason: error.message,
    }, null, 2) + '\n', 'utf8');
    return { path: currentPath, type: 'pointer-directory', target: snapshotRoot };
  }
}

function currentProductionSnapshot() {
  const currentPath = path.join(productionSnapshotsRoot, 'current');
  if (!fs.existsSync(currentPath)) throw new Error('No current production snapshot is configured');
  const pointerPath = path.join(currentPath, 'pointer.json');
  if (fs.existsSync(pointerPath)) {
    const pointer = JSON.parse(fs.readFileSync(pointerPath, 'utf8').replace(/^\uFEFF/, ''));
    return assertExternalOutput(pointer.target);
  }
  return assertExternalOutput(fs.realpathSync(currentPath));
}

function diagnosticOutput(...segments) {
  return assertExternalOutput(path.join(diagnosticsRoot, ...segments));
}

function createRunId(date = new Date()) {
  return `run-${date.toISOString().replace(/[:.]/g, '-')}`;
}

function autonomousRun(runId = process.env.ACORD_AUTONOMOUS_RUN_ID || createRunId()) {
  const normalized = runId.startsWith('run-') ? runId : `run-${runId}`;
  return assertExternalOutput(path.join(autonomousRunsRoot, normalized));
}

function updateLatestAutonomousRun(runRoot) {
  const resolvedRunRoot = assertExternalOutput(runRoot);
  const latestPath = assertExternalOutput(path.join(autonomousRunsRoot, 'latest'));
  fs.mkdirSync(autonomousRunsRoot, { recursive: true });
  fs.rmSync(latestPath, { recursive: true, force: true });
  try {
    fs.symlinkSync(resolvedRunRoot, latestPath, 'junction');
    return { path: latestPath, type: 'junction', target: resolvedRunRoot };
  } catch (error) {
    fs.mkdirSync(latestPath, { recursive: true });
    fs.writeFileSync(path.join(latestPath, 'pointer.json'), JSON.stringify({
      schemaVersion: 'autonomous-latest-pointer.v1',
      updatedAt: new Date().toISOString(),
      target: externalPath(resolvedRunRoot),
      fallbackReason: error.message,
    }, null, 2) + '\n', 'utf8');
    return { path: latestPath, type: 'pointer-directory', target: resolvedRunRoot };
  }
}

function latestAutonomousRun() {
  if (process.env.ACORD_AUTONOMOUS_RUN_ID) return autonomousRun(process.env.ACORD_AUTONOMOUS_RUN_ID);
  if (!fs.existsSync(autonomousRunsRoot)) {
    throw new Error(`No autonomous runs found under ${autonomousRunsRoot}`);
  }
  const latestPath = path.join(autonomousRunsRoot, 'latest');
  if (fs.existsSync(latestPath)) {
    const pointerPath = path.join(latestPath, 'pointer.json');
    if (fs.existsSync(pointerPath)) {
      const pointer = JSON.parse(fs.readFileSync(pointerPath, 'utf8').replace(/^\uFEFF/, ''));
      return assertExternalOutput(pointer.target);
    }
    const resolvedLatest = fs.realpathSync(latestPath);
    if (fs.existsSync(path.join(resolvedLatest, 'autonomous-summary.json'))) {
      return assertExternalOutput(resolvedLatest);
    }
  }
  const runNames = fs.readdirSync(autonomousRunsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('run-'))
    .map((entry) => entry.name)
    .sort()
    .reverse();
  const completedRun = runNames.find((name) => fs.existsSync(path.join(autonomousRunsRoot, name, 'autonomous-summary.json')));
  if (!completedRun) throw new Error(`No completed autonomous runs found under ${autonomousRunsRoot}`);
  return assertExternalOutput(path.join(autonomousRunsRoot, completedRun));
}

function externalPath(candidate) {
  return path.resolve(candidate).replace(/\\/g, '/');
}

module.exports = {
  repoRoot,
  outputRoot,
  autonomousRunsRoot,
  validationOutputRoot,
  diagnosticsRoot,
  productionSnapshotsRoot,
  guardrails,
  assertExternalOutput,
  validationOutput,
  productionSnapshot,
  updateCurrentProductionSnapshot,
  currentProductionSnapshot,
  diagnosticOutput,
  createRunId,
  autonomousRun,
  updateLatestAutonomousRun,
  latestAutonomousRun,
  externalPath,
};
