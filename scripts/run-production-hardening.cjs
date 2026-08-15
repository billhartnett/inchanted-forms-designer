const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
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
const outputRoot = diagnosticOutput('production-hardening', restorePoint);

function readJson(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Missing required file: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function listFiles(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(root, entry.name);
    return entry.isDirectory() ? listFiles(entryPath) : [entryPath];
  });
}

function hashDirectory(root) {
  const hash = crypto.createHash('sha256');
  const files = listFiles(root).sort();
  for (const filePath of files) {
    hash.update(path.relative(root, filePath).replace(/\\/g, '/'));
    hash.update(fs.readFileSync(filePath));
  }
  return { fileCount: files.length, hash: hash.digest('hex') };
}

function inspectFrontendBundles() {
  const distRoot = path.join(repoRoot, 'frontend', 'dist');
  const assetsRoot = path.join(distRoot, 'assets');
  const indexHtml = fs.readFileSync(path.join(distRoot, 'index.html'), 'utf8');
  const entryMatch = indexHtml.match(/<script[^>]+src="([^"]+\.js)"/);
  const entryPath = entryMatch ? path.join(distRoot, entryMatch[1].replace(/^\//, '')) : null;
  const chunks = fs.readdirSync(assetsRoot)
    .filter((name) => name.endsWith('.js'))
    .map((name) => ({ name, bytes: fs.statSync(path.join(assetsRoot, name)).size }))
    .sort((left, right) => right.bytes - left.bytes);
  const applicationChunks = chunks.filter((chunk) => !chunk.name.includes('.worker.'));
  const workerChunks = chunks.filter((chunk) => chunk.name.includes('.worker.'));
  return {
    budgetBytes: 500 * 1024,
    entry: entryPath ? { name: path.basename(entryPath), bytes: fs.statSync(entryPath).size } : null,
    applicationChunks,
    workerChunks,
    largestApplicationChunkBytes: applicationChunks[0]?.bytes || 0,
  };
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return {
    command: [command, ...args].join(' '),
    passed: result.status === 0,
    exitCode: result.status,
    error: result.error?.message || null,
  };
}

function runNpm(args) {
  const npmCli = process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  return run(process.execPath, [npmCli, ...args]);
}

function main() {
  fs.mkdirSync(outputRoot, { recursive: true });
  const currentRoot = currentProductionSnapshot();
  const steps = {
    extractionAlignment: run(process.execPath, ['scripts/run-extraction-alignment-diagnostics.cjs', `--baseline=${restorePoint}`]),
    mappingEngineAlignment: run(process.execPath, ['scripts/run-mapping-engine-alignment-diagnostics.cjs', `--baseline=${restorePoint}`]),
    sharedBuild: runNpm(['--prefix', 'shared', 'run', 'build']),
    frontendBuild: runNpm(['--prefix', 'frontend', 'run', 'build']),
    backendBuild: runNpm(['--prefix', 'backend/api', 'run', 'build']),
  };
  const extractionReport = readJson(path.join(diagnosticOutput('extraction-alignment', restorePoint), 'extraction-alignment-report.json'));
  const mappingReport = readJson(path.join(diagnosticOutput('mapping-engine-alignment', restorePoint), 'mapping-engine-alignment-report.json'));
  const truthState = hashDirectory(path.join(baselineRoot, 'truth-corpus'));
  const semanticState = hashDirectory(path.join(baselineRoot, 'semantic-error'));
  const bundles = inspectFrontendBundles();
  const requiredSnapshots = ['truth-corpus', 'semantic-error', 'discrepancy-metric', 'validator-state', 'engine-state', 'build-metadata'];
  const parentRoot = manifest.parentRestorePoint ? productionSnapshot(manifest.parentRestorePoint) : null;
  const checks = {
    baselineIsCurrent: path.resolve(currentRoot) === path.resolve(baselineRoot),
    safeToFreeze: manifest.safeFreeze?.safeToFreeze === true,
    immutableBaseline: manifest.guardrails?.immutable === true,
    exactZeroConvergence: manifest.readiness?.convergenceReached === true && manifest.readiness?.totalErrors === 0,
    lineageParentExists: Boolean(parentRoot && fs.existsSync(path.join(parentRoot, 'manifest.json'))),
    snapshotsComplete: requiredSnapshots.every((directory) => fs.existsSync(path.join(baselineRoot, directory))),
    truthCorpusIntegrity: truthState.fileCount === manifest.integrity?.truthCorpus?.fileCount && truthState.hash === manifest.integrity?.truthCorpus?.hash,
    semanticErrorIntegrity: semanticState.fileCount === manifest.integrity?.semanticError?.fileCount && semanticState.hash === manifest.integrity?.semanticError?.hash,
    extractionAligned: steps.extractionAlignment.passed && extractionReport.summary?.aligned === true,
    mappingEngineAligned: steps.mappingEngineAlignment.passed && mappingReport.aligned === true,
    sharedBuildPassed: steps.sharedBuild.passed,
    frontendBuildPassed: steps.frontendBuild.passed,
    backendBuildPassed: steps.backendBuild.passed,
    initialBundleWithinBudget: Boolean(bundles.entry && bundles.entry.bytes <= bundles.budgetBytes),
    applicationChunksWithinBudget: bundles.applicationChunks.every((chunk) => chunk.bytes <= bundles.budgetBytes),
    pdfWorkerIsolated: bundles.workerChunks.length > 0,
  };
  const hardened = Object.values(checks).every(Boolean);
  const currentReportPath = path.join(outputRoot, 'production-hardening-report.json');
  const previousReport = fs.existsSync(currentReportPath) ? readJson(currentReportPath) : null;
  const reportSequence = Number(previousReport?.reportSequence || 1) + 1;
  const report = {
    schemaVersion: 'production-hardening-report.v1',
    reportSequence,
    generatedAt: new Date().toISOString(),
    baselineRestorePoint: restorePoint,
    baselinePath: externalPath(baselineRoot),
    currentProductionPath: externalPath(currentRoot),
    outputPath: externalPath(outputRoot),
    status: hardened ? 'production-hardening-pass' : 'production-hardening-blocked',
    hardened,
    checks,
    steps,
    integrity: { truthCorpus: truthState, semanticError: semanticState },
    bundles,
    alignmentReports: {
      extraction: extractionReport.outputPath,
      mappingEngine: mappingReport.outputPath,
    },
    guardrails: {
      baselineReadOnly: true,
      noPurge: true,
      noDiscrepancyRegeneration: true,
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
    reportSequence,
    reportPath: externalPath(currentReportPath),
    historyPath: externalPath(historyPath),
  }, null, 2) + '\n');
  if (!hardened) process.exitCode = 1;
}

main();
