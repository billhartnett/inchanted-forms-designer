const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  diagnosticOutput,
  externalPath,
  guardrails,
  latestAutonomousRun,
  productionSnapshot,
  productionSnapshotsRoot,
} = require('./artifact-output-paths.cjs');

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const nameArg = process.argv.slice(2).find((arg) => arg.startsWith('--name='));
const sourceArg = process.argv.slice(2).find((arg) => arg.startsWith('--source='));
const sourceName = sourceArg ? sourceArg.split('=')[1] : 'RP-3M';
const sourceRoot = productionSnapshot(sourceName);
const runRoot = latestAutonomousRun();

function readJson(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Missing required file: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function hashValue(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
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

function numericSnapshots() {
  if (!fs.existsSync(productionSnapshotsRoot)) return [];
  return fs.readdirSync(productionSnapshotsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^RP-\d+$/.test(entry.name))
    .map((entry) => ({ name: entry.name, number: Number(entry.name.slice(3)) }))
    .sort((left, right) => left.number - right.number);
}

function categoryCounts(index) {
  return index.summary?.categoryCounts || {};
}

function structuralCounts(engine) {
  return {
    groupingErrorCount: Number(engine.groupingSuppression?.groupingErrorCount || 0),
    suppressionErrorCount: Number(engine.groupingSuppression?.suppressionErrorCount || 0),
    tableDetectionErrorCount: Number(engine.tableSegmentation?.tableDetectionErrorCount || 0),
    candidateRankingErrorCount: Number(engine.fillableFieldReconciliation?.candidateRankingErrorCount || 0),
    unmappedFillableFieldCount: Number(engine.fillableFieldReconciliation?.unmappedFillableFieldCount || 0),
    labelMismatchCount: Number(engine.labelValueSemantic?.labelMismatchCount || 0),
    labelValuePairingErrorCount: Number(engine.labelValueSemantic?.labelValuePairingErrorCount || 0),
  };
}

function diffCounts(previous, current) {
  const keys = [...new Set([...Object.keys(previous), ...Object.keys(current)])].sort();
  return Object.fromEntries(keys.map((key) => [key, {
    previous: Number(previous[key] || 0),
    current: Number(current[key] || 0),
    delta: Number(current[key] || 0) - Number(previous[key] || 0),
  }]));
}

function copyDirectory(source, target) {
  fs.mkdirSync(target, { recursive: true });
  if (fs.existsSync(source)) fs.cpSync(source, target, { recursive: true, force: false });
}

function main() {
  const snapshots = numericSnapshots();
  const previous = snapshots.at(-1);
  if (!previous) throw new Error('No numeric production snapshot exists for lineage comparison');

  const targetName = nameArg ? nameArg.split('=')[1] : `RP-${previous.number + 1}`;
  if (!/^RP-\d+$/.test(targetName)) throw new Error(`Invalid production snapshot name: ${targetName}`);
  const targetRoot = productionSnapshot(targetName);
  const previousRoot = productionSnapshot(previous.name);

  const sourceManifest = readJson(path.join(sourceRoot, 'manifest.json'));
  const previousManifest = readJson(path.join(previousRoot, 'manifest.json'));
  const sourceSemantic = readJson(path.join(sourceRoot, 'semantic-error', 'index.json'));
  const previousSemantic = readJson(path.join(previousRoot, 'semantic-error', 'index.json'));
  const sourceEngine = readJson(path.join(sourceRoot, 'engine-state', 'production-state-snapshot.json'));
  const previousEngine = readJson(path.join(previousRoot, 'engine-state', 'production-state-snapshot.json'));
  const autonomousSummary = readJson(path.join(runRoot, 'autonomous-summary.json'));
  const convergenceReport = readJson(path.join(runRoot, 'final-convergence-report.json'));

  const sourceMetricHash = hashValue(sourceSemantic.collapseAwareMetric);
  const previousMetricHash = hashValue(previousSemantic.collapseAwareMetric);
  const sourceOntologyHash = hashValue({ ontology: sourceSemantic.collapseAwareMetric?.ontology });
  const previousOntologyHash = hashValue({ ontology: previousSemantic.collapseAwareMetric?.ontology });
  const sourceTruth = hashDirectory(path.join(sourceRoot, 'truth-corpus'));
  const previousTruth = hashDirectory(path.join(previousRoot, 'truth-corpus'));
  const sourceSemanticFiles = hashDirectory(path.join(sourceRoot, 'semantic-error'));
  const previousSemanticFiles = hashDirectory(path.join(previousRoot, 'semantic-error'));

  const drift = {
    schemaVersion: 'production-baseline-drift.v1',
    generatedAt: new Date().toISOString(),
    previousBaseline: previous.name,
    candidateBaseline: sourceName,
    autonomousRun: externalPath(runRoot),
    semantic: {
      categoryCounts: diffCounts(categoryCounts(previousSemantic), categoryCounts(sourceSemantic)),
      previousFileState: previousSemanticFiles,
      candidateFileState: sourceSemanticFiles,
    },
    structural: diffCounts(structuralCounts(previousEngine), structuralCounts(sourceEngine)),
    truthCorpus: {
      previous: previousTruth,
      candidate: sourceTruth,
      filesPreserved: sourceTruth.fileCount >= previousTruth.fileCount,
      changed: sourceTruth.hash !== previousTruth.hash,
    },
    immutableContracts: {
      metricHashUnchanged: sourceMetricHash === previousMetricHash,
      ontologyHashUnchanged: sourceOntologyHash === previousOntologyHash,
      metricVersion: sourceSemantic.collapseAwareMetric?.metricVersion,
      ontology: sourceSemantic.collapseAwareMetric?.ontology,
    },
  };

  const checks = {
    autonomousRunConverged: autonomousSummary.convergenceReached === true,
    convergenceReportSafe: convergenceReport.safeToEvaluateForFreeze === true,
    totalErrorsConverged: autonomousSummary.finalTotalErrors === 0 || autonomousSummary.stopReason === 'sustained-low-delta',
    metricUnchanged: drift.immutableContracts.metricHashUnchanged,
    ontologyUnchanged: drift.immutableContracts.ontologyHashUnchanged,
    truthRecordsPreserved: drift.truthCorpus.filesPreserved,
    semanticRecordsPreserved: sourceSemanticFiles.fileCount >= previousSemanticFiles.fileCount,
    noPurgeGuardrail: sourceManifest.guardrails?.noRecordPurge === true,
    noDiscrepancyRegenerationGuardrail: sourceManifest.guardrails?.noDiscrepancyRegeneration === true,
    noOntologyChangeGuardrail: sourceManifest.guardrails?.noOntologyChange === true,
    noMetricChangeGuardrail: sourceManifest.guardrails?.noMetricChange === true,
    runNoPurgeGuardrail: autonomousSummary.guardrails?.noPurge === true,
    runNoDiscrepancyRegenerationGuardrail: autonomousSummary.guardrails?.noDiscrepancyRegeneration === true,
    runNoOntologyChangeGuardrail: autonomousSummary.guardrails?.noOntologyChange === true,
    runNoMetricModificationGuardrail: autonomousSummary.guardrails?.noMetricModification === true,
  };
  const safeToFreeze = Object.values(checks).every(Boolean);

  const freezeReport = {
    schemaVersion: 'production-safe-freeze-check.v1',
    generatedAt: new Date().toISOString(),
    candidateRestorePoint: targetName,
    sourceRestorePoint: sourceName,
    previousRestorePoint: previous.name,
    sourcePath: externalPath(sourceRoot),
    targetPath: externalPath(targetRoot),
    autonomousRunPath: externalPath(runRoot),
    safeToFreeze,
    checks,
    drift,
    guardrails,
  };

  const diagnosticsDir = diagnosticOutput('baseline-drift', `${previous.name}-to-${targetName}`);
  writeJson(path.join(diagnosticsDir, 'drift-report.json'), drift);
  writeJson(path.join(diagnosticsDir, 'safe-freeze-report.json'), freezeReport);

  if (dryRun) {
    process.stdout.write(JSON.stringify({ dryRun: true, targetName, safeToFreeze, diagnosticsPath: externalPath(diagnosticsDir), checks }, null, 2) + '\n');
    return;
  }
  if (!safeToFreeze) throw new Error(`Safe-to-freeze checks failed for ${targetName}`);
  if (fs.existsSync(targetRoot)) throw new Error(`${targetName} already exists; refusing to overwrite it`);

  const capturedDirectories = ['truth-corpus', 'semantic-error', 'discrepancy-metric', 'validator-state', 'engine-state', 'build-metadata'];
  for (const directory of capturedDirectories) {
    copyDirectory(path.join(sourceRoot, directory), path.join(targetRoot, directory));
  }
  writeJson(path.join(targetRoot, 'validator-state', 'autonomous-convergence-summary.json'), autonomousSummary);
  writeJson(path.join(targetRoot, 'validator-state', 'final-convergence-report.json'), convergenceReport);
  writeJson(path.join(targetRoot, 'validator-state', 'baseline-drift-report.json'), drift);
  writeJson(path.join(targetRoot, 'validator-state', 'safe-freeze-report.json'), freezeReport);

  const previousLineage = Array.isArray(previousManifest.lineage) ? previousManifest.lineage : [];
  const manifest = {
    schemaVersion: 'production-snapshot-manifest.v1',
    restorePoint: targetName,
    createdAt: new Date().toISOString(),
    label: 'Automated converged production baseline',
    stage: 'automated-safe-freeze',
    sourceRestorePoint: sourceName,
    parentRestorePoint: previous.name,
    outputPath: externalPath(targetRoot),
    autonomousRunPath: externalPath(runRoot),
    lineage: [...previousLineage, previous.name],
    snapshots: Object.fromEntries(capturedDirectories.map((directory) => [directory, {
      path: externalPath(path.join(targetRoot, directory)),
      source: externalPath(path.join(sourceRoot, directory)),
      status: 'captured',
    }])),
    drift,
    safeFreeze: { safeToFreeze, checks },
    integrity: {
      metricHash: sourceMetricHash,
      ontologyHash: sourceOntologyHash,
      truthCorpus: sourceTruth,
      semanticError: sourceSemanticFiles,
    },
    readiness: {
      readiness: 'automated-production-snapshot-created',
      convergenceReached: autonomousSummary.convergenceReached,
      stopReason: autonomousSummary.stopReason,
      cyclesCompleted: autonomousSummary.cyclesCompleted,
      totalErrors: autonomousSummary.finalTotalErrors,
      metricVersion: sourceSemantic.collapseAwareMetric?.metricVersion,
      ontology: sourceSemantic.collapseAwareMetric?.ontology,
    },
    guardrails: {
      noRecordPurge: true,
      noDiscrepancyRegeneration: true,
      noOntologyChange: true,
      noMetricChange: true,
      immutable: true,
    },
  };
  writeJson(path.join(targetRoot, 'manifest.json'), manifest);

  process.stdout.write(JSON.stringify({
    restorePoint: targetName,
    parentRestorePoint: previous.name,
    sourceRestorePoint: sourceName,
    outputPath: externalPath(targetRoot),
    safeToFreeze,
    driftReport: externalPath(path.join(diagnosticsDir, 'drift-report.json')),
    totalErrors: autonomousSummary.finalTotalErrors,
    guardrails,
  }, null, 2) + '\n');
}

main();
