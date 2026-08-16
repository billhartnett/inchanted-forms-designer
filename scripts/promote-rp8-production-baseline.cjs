const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  assertExternalOutput,
  currentProductionSnapshot,
  externalPath,
  outputRoot,
  productionSnapshot,
  productionSnapshotsRoot,
  updateCurrentProductionSnapshot,
} = require('./artifact-output-paths.cjs');

const dryRun = process.argv.includes('--dry-run');
const SOURCE_NAME = 'RP-7';
const TARGET_NAME = 'RP-8';
const sourceRoot = productionSnapshot(SOURCE_NAME);
const targetRoot = productionSnapshot(TARGET_NAME);
const stagingRoot = assertExternalOutput(path.join(productionSnapshotsRoot, `.${TARGET_NAME}-staging`));
const evolutionRoot = assertExternalOutput(path.join(outputRoot, 'ontology-evolution'));
const artifactPaths = {
  ontologyPhase31: path.join(evolutionRoot, 'phase31', 'ontology-phase31.json'),
  truthPhase31: path.join(evolutionRoot, 'phase31', 'rp8-evaluation', 'phase31-semantic-truth-rp8.json'),
  truthPhase32: path.join(evolutionRoot, 'phase32', 'phase32-semantic-truth-rp8.json'),
  truthPhase33: path.join(evolutionRoot, 'phase33', 'promotion-readiness', 'phase33-semantic-truth-rp8.json'),
  readinessPhase33: path.join(evolutionRoot, 'phase33', 'promotion-readiness', 'phase33-promotion-readiness.json'),
  phase33Diff: path.join(evolutionRoot, 'phase33', 'promotion-readiness', 'phase32-to-phase33-role-boundary-diff.md'),
};
const capturedDirectories = [
  'truth-corpus',
  'semantic-error',
  'discrepancy-metric',
  'validator-state',
  'engine-state',
  'build-metadata',
];

function readBytes(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Missing required file: ${filePath}`);
  return fs.readFileSync(filePath);
}

function readJson(filePath) {
  return JSON.parse(readBytes(filePath).toString('utf8').replace(/^\uFEFF/, ''));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function hashFile(filePath) {
  return sha256(readBytes(filePath));
}

function listFiles(root) {
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
    hash.update(readBytes(filePath));
  }
  return { fileCount: files.length, hash: hash.digest('hex') };
}

function hashValue(value) {
  return sha256(JSON.stringify(value));
}

function copyFile(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
}

function copyDirectory(source, target) {
  fs.cpSync(source, target, { recursive: true, force: false, errorOnExist: true });
}

function assertChecks(checks, context) {
  const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  if (failed.length > 0) throw new Error(`${context} failed: ${failed.join(', ')}`);
}

function main() {
  const currentRoot = currentProductionSnapshot();
  const sourceManifestPath = path.join(sourceRoot, 'manifest.json');
  const sourceManifestBytes = readBytes(sourceManifestPath);
  const sourceManifest = JSON.parse(sourceManifestBytes.toString('utf8').replace(/^\uFEFF/, ''));
  const ontologyPhase31Bytes = readBytes(artifactPaths.ontologyPhase31);
  const truthPhase31Bytes = readBytes(artifactPaths.truthPhase31);
  const truthPhase32Bytes = readBytes(artifactPaths.truthPhase32);
  const truthPhase33Bytes = readBytes(artifactPaths.truthPhase33);
  const readinessPhase33Bytes = readBytes(artifactPaths.readinessPhase33);
  readBytes(artifactPaths.phase33Diff);

  const ontologyPhase31 = JSON.parse(ontologyPhase31Bytes.toString('utf8').replace(/^\uFEFF/, ''));
  const truthPhase31 = JSON.parse(truthPhase31Bytes.toString('utf8').replace(/^\uFEFF/, ''));
  const truthPhase32 = JSON.parse(truthPhase32Bytes.toString('utf8').replace(/^\uFEFF/, ''));
  const truthPhase33 = JSON.parse(truthPhase33Bytes.toString('utf8').replace(/^\uFEFF/, ''));
  const readinessPhase33 = JSON.parse(readinessPhase33Bytes.toString('utf8').replace(/^\uFEFF/, ''));
  const sourceState = hashDirectory(sourceRoot);
  const activeOntology = truthPhase33.phaseId;
  const promotionChecks = {
    currentBaselineIsRp7: path.resolve(currentRoot) === path.resolve(sourceRoot),
    rp7RestorePointValid: sourceManifest.restorePoint === SOURCE_NAME,
    rp7SafeToFreeze: sourceManifest.safeFreeze?.safeToFreeze === true,
    rp7Immutable: sourceManifest.guardrails?.immutable === true,
    phase31CandidateInactive: ontologyPhase31.status === 'candidate' && ontologyPhase31.activation?.state === 'inactive',
    phase31TruthTargetsRp8: truthPhase31.targetRestorePoint === TARGET_NAME,
    phase32CandidateInactive: truthPhase32.status === 'candidate' && truthPhase32.activation?.state === 'inactive',
    phase33CandidateInactive: truthPhase33.status === 'evaluation-candidate' && truthPhase33.activation?.state === 'inactive',
    phase31To32LineageValid: truthPhase32.lineage?.parentCandidatePayloadSha256 === ontologyPhase31.integrity?.payloadSha256,
    phase32To33LineageValid: truthPhase33.lineage?.parentPayloadSha256 === truthPhase32.integrity?.payloadSha256,
    readinessTruthLineageValid: readinessPhase33.semanticTruthPayloadSha256 === truthPhase33.integrity?.payloadSha256,
    rp7LineageValid: truthPhase33.lineage?.rp7ManifestSha256 === sha256(sourceManifestBytes),
    readinessTargetsRp8: readinessPhase33.targetRestorePoint === TARGET_NAME,
    promotionReady: readinessPhase33.promotionReady === true && readinessPhase33.decision === 'ready',
    noBlockedRoleDecisions: readinessPhase33.summary?.roleBoundaryBlockedDecisions === 0,
    noRolePromotingBridges: readinessPhase33.summary?.rolePromotingBridges === 0,
    roleSafeEquivalenceNonPromoting: readinessPhase33.checks?.roleSafeEquivalencesNonPromoting === true,
    stableFieldIds: truthPhase33.guardrails?.noFieldIdChange === true,
    stablePageIndices: truthPhase33.guardrails?.noPageIndexChange === true,
    confidencePreserved: truthPhase33.guardrails?.noConfidenceChange === true,
    rankingPreserved: truthPhase33.guardrails?.noRankingChange === true,
  };
  assertChecks(promotionChecks, 'RP-8 promotion readiness');

  if (dryRun) {
    process.stdout.write(`${JSON.stringify({
      dryRun: true,
      sourceRestorePoint: SOURCE_NAME,
      targetRestorePoint: TARGET_NAME,
      activeOntology,
      promotionReady: true,
      promotionChecks,
      sourceState,
    }, null, 2)}\n`);
    return;
  }
  if (fs.existsSync(targetRoot)) throw new Error(`${TARGET_NAME} already exists; refusing to overwrite immutable production state`);
  if (fs.existsSync(stagingRoot)) throw new Error(`Staging path already exists: ${stagingRoot}`);

  let targetCreated = false;
  try {
    fs.mkdirSync(stagingRoot, { recursive: false });
    for (const directory of capturedDirectories) {
      copyDirectory(path.join(sourceRoot, directory), path.join(stagingRoot, directory));
    }

    const sourceArtifacts = [
      ['ontology-lineage/ontology-phase31.json', artifactPaths.ontologyPhase31],
      ['semantic-truth/phase31-semantic-truth-rp8.json', artifactPaths.truthPhase31],
      ['semantic-truth/phase32-semantic-truth-rp8.json', artifactPaths.truthPhase32],
      ['semantic-truth/phase33-semantic-truth-rp8.json', artifactPaths.truthPhase33],
      ['semantic-truth/phase33-promotion-readiness.json', artifactPaths.readinessPhase33],
      ['semantic-truth/phase32-to-phase33-role-boundary-diff.md', artifactPaths.phase33Diff],
    ];
    for (const [relativeTarget, source] of sourceArtifacts) {
      copyFile(source, path.join(stagingRoot, relativeTarget));
    }

    const promotedAt = new Date().toISOString();
    const artifactLineage = {
      phase31: {
        phaseId: ontologyPhase31.phaseId,
        payloadSha256: ontologyPhase31.integrity.payloadSha256,
        fileSha256: sha256(ontologyPhase31Bytes),
      },
      phase31SemanticTruth: {
        payloadSha256: truthPhase31.integrity.payloadSha256,
        fileSha256: sha256(truthPhase31Bytes),
      },
      phase32: {
        phaseId: truthPhase32.phaseId,
        payloadSha256: truthPhase32.integrity.payloadSha256,
        fileSha256: sha256(truthPhase32Bytes),
      },
      phase33: {
        phaseId: truthPhase33.phaseId,
        payloadSha256: truthPhase33.integrity.payloadSha256,
        fileSha256: sha256(truthPhase33Bytes),
      },
      promotionReadiness: {
        payloadSha256: readinessPhase33.integrity.payloadSha256,
        fileSha256: sha256(readinessPhase33Bytes),
      },
    };
    const authoritativePayload = {
      ...truthPhase33,
      schemaVersion: 'rp8-authoritative-semantic-truth.v1',
      generatedAt: promotedAt,
      status: 'active-production-baseline',
      restorePoint: TARGET_NAME,
      activation: {
        state: 'active',
        runtimeChanged: true,
        productionBaselineChanged: true,
        promotedAt,
        promotedFrom: SOURCE_NAME,
      },
      lineage: {
        parentRestorePoint: SOURCE_NAME,
        parentManifestSha256: sha256(sourceManifestBytes),
        parentSnapshot: sourceState,
        artifacts: artifactLineage,
      },
      promotion: {
        readinessDecision: readinessPhase33.decision,
        readinessPayloadSha256: readinessPhase33.integrity.payloadSha256,
        explicit: true,
      },
    };
    delete authoritativePayload.integrity;
    const authoritative = {
      ...authoritativePayload,
      integrity: {
        algorithm: 'sha256',
        payloadSha256: sha256(stableSerialize(authoritativePayload)),
      },
    };
    const authoritativePath = path.join(stagingRoot, 'semantic-truth', 'authoritative-semantic-truth-rp8.json');
    writeJson(authoritativePath, authoritative);

    const ontologyLineagePayload = {
      schemaVersion: 'production-ontology-lineage.v1',
      generatedAt: promotedAt,
      restorePoint: TARGET_NAME,
      parentRestorePoint: SOURCE_NAME,
      parentOntology: sourceManifest.readiness?.ontology,
      canonicalOntology: ontologyPhase31.phaseId,
      stabilizationPhase: truthPhase32.phaseId,
      activeSemanticPolicy: truthPhase33.phaseId,
      activeOntology,
      artifacts: artifactLineage,
      roleBoundaryPolicy: truthPhase33.roleBoundaryPolicy,
      roleSafeRepresentationEquivalences: truthPhase33.evidence?.roleSafeRepresentationEquivalences || [],
    };
    const ontologyLineage = {
      ...ontologyLineagePayload,
      integrity: {
        algorithm: 'sha256',
        payloadSha256: sha256(stableSerialize(ontologyLineagePayload)),
      },
    };
    const ontologyLineagePath = path.join(stagingRoot, 'ontology-lineage', 'rp8-ontology-lineage.json');
    writeJson(ontologyLineagePath, ontologyLineage);

    const semanticIndexPath = path.join(stagingRoot, 'semantic-error', 'index.json');
    const semanticIndex = readJson(semanticIndexPath);
    semanticIndex.collapseAwareMetric.ontology = activeOntology;
    semanticIndex.authoritativeSemanticTruth = {
      restorePoint: TARGET_NAME,
      path: 'semantic-truth/authoritative-semantic-truth-rp8.json',
      payloadSha256: authoritative.integrity.payloadSha256,
    };
    semanticIndex.ontologyLineage = {
      path: 'ontology-lineage/rp8-ontology-lineage.json',
      payloadSha256: ontologyLineage.integrity.payloadSha256,
    };
    writeJson(semanticIndexPath, semanticIndex);

    const engineStatePath = path.join(stagingRoot, 'engine-state', 'production-state-snapshot.json');
    const engineState = readJson(engineStatePath);
    engineState.restorePoint = TARGET_NAME;
    engineState.createdAt = promotedAt;
    engineState.semanticTruthOntology = {
      ontology: activeOntology,
      status: 'active',
      source: 'semantic-truth/authoritative-semantic-truth-rp8.json',
      notes: 'Phase 33 role-safe semantic truth promoted explicitly for RP-8.',
    };
    if (engineState.reductionStatus) engineState.reductionStatus.ontology = activeOntology;
    writeJson(engineStatePath, engineState);

    const sourceStateAfterCopy = hashDirectory(sourceRoot);
    const semanticIndexFinal = readJson(semanticIndexPath);
    const engineStateFinal = readJson(engineStatePath);
    const truthCorpusState = hashDirectory(path.join(stagingRoot, 'truth-corpus'));
    const semanticErrorState = hashDirectory(path.join(stagingRoot, 'semantic-error'));
    const semanticTruthState = hashDirectory(path.join(stagingRoot, 'semantic-truth'));
    const ontologyLineageState = hashDirectory(path.join(stagingRoot, 'ontology-lineage'));
    const metricHash = hashValue(semanticIndexFinal.collapseAwareMetric);
    const ontologyHash = hashValue({ ontology: semanticIndexFinal.collapseAwareMetric.ontology });
    const freezeChecks = {
      ...promotionChecks,
      rp7SnapshotUnchanged: sourceStateAfterCopy.hash === sourceState.hash && sourceStateAfterCopy.fileCount === sourceState.fileCount,
      truthCorpusPreserved: truthCorpusState.hash === sourceManifest.integrity.truthCorpus.hash && truthCorpusState.fileCount === sourceManifest.integrity.truthCorpus.fileCount,
      metricVersionPreserved: semanticIndexFinal.collapseAwareMetric.metricVersion === sourceManifest.readiness.metricVersion,
      engineOntologyAligned: engineStateFinal.semanticTruthOntology.ontology === activeOntology,
      semanticIndexOntologyAligned: semanticIndexFinal.collapseAwareMetric.ontology === activeOntology,
      authoritativeTruthIntegrity: hashFile(authoritativePath) === sha256(Buffer.from(`${JSON.stringify(authoritative, null, 2)}\n`)),
      ontologyLineageIntegrity: hashFile(ontologyLineagePath) === sha256(Buffer.from(`${JSON.stringify(ontologyLineage, null, 2)}\n`)),
      capturedSnapshotsComplete: capturedDirectories.every((directory) => fs.existsSync(path.join(stagingRoot, directory))),
    };
    assertChecks(freezeChecks, 'RP-8 safe-freeze');

    const manifest = {
      schemaVersion: 'production-snapshot-manifest.v1',
      restorePoint: TARGET_NAME,
      createdAt: promotedAt,
      label: 'Phase 33 semantic-truth production baseline',
      stage: 'explicit-semantic-promotion',
      sourceRestorePoint: SOURCE_NAME,
      parentRestorePoint: SOURCE_NAME,
      outputPath: externalPath(targetRoot),
      lineage: [...(sourceManifest.lineage || []), SOURCE_NAME],
      snapshots: Object.fromEntries(capturedDirectories.map((directory) => [directory, {
        path: externalPath(path.join(targetRoot, directory)),
        source: externalPath(path.join(sourceRoot, directory)),
        status: 'captured',
      }])),
      semanticTruth: {
        path: externalPath(path.join(targetRoot, 'semantic-truth', 'authoritative-semantic-truth-rp8.json')),
        payloadSha256: authoritative.integrity.payloadSha256,
        state: semanticTruthState,
      },
      ontologyLineage: {
        path: externalPath(path.join(targetRoot, 'ontology-lineage', 'rp8-ontology-lineage.json')),
        payloadSha256: ontologyLineage.integrity.payloadSha256,
        state: ontologyLineageState,
      },
      safeFreeze: { safeToFreeze: true, checks: freezeChecks },
      integrity: {
        metricHash,
        ontologyHash,
        truthCorpus: truthCorpusState,
        semanticError: semanticErrorState,
        semanticTruth: semanticTruthState,
        ontologyLineage: ontologyLineageState,
        parentSnapshot: sourceState,
      },
      readiness: {
        readiness: 'phase33-promotion-ready-applied',
        convergenceReached: sourceManifest.readiness.convergenceReached,
        stopReason: sourceManifest.readiness.stopReason,
        cyclesCompleted: sourceManifest.readiness.cyclesCompleted,
        totalErrors: sourceManifest.readiness.totalErrors,
        metricVersion: semanticIndexFinal.collapseAwareMetric.metricVersion,
        ontology: activeOntology,
        phase33PayloadSha256: truthPhase33.integrity.payloadSha256,
        promotionReadinessPayloadSha256: readinessPhase33.integrity.payloadSha256,
      },
      guardrails: {
        noRecordPurge: true,
        noDiscrepancyRegeneration: true,
        noMetricChange: true,
        stableFieldIds: true,
        stablePageIndices: true,
        noRoleCollapse: true,
        immutable: true,
      },
    };
    writeJson(path.join(stagingRoot, 'manifest.json'), manifest);

    fs.renameSync(stagingRoot, targetRoot);
    targetCreated = true;
    const pointer = updateCurrentProductionSnapshot(TARGET_NAME);
    const promotedCurrent = currentProductionSnapshot();
    if (path.resolve(promotedCurrent) !== path.resolve(targetRoot)) {
      updateCurrentProductionSnapshot(SOURCE_NAME);
      throw new Error('RP-8 pointer verification failed; current baseline restored to RP-7');
    }
    const finalSourceState = hashDirectory(sourceRoot);
    if (finalSourceState.hash !== sourceState.hash || finalSourceState.fileCount !== sourceState.fileCount) {
      updateCurrentProductionSnapshot(SOURCE_NAME);
      throw new Error('RP-7 changed during promotion; current baseline restored to RP-7');
    }

    process.stdout.write(`${JSON.stringify({
      sourceRestorePoint: SOURCE_NAME,
      targetRestorePoint: TARGET_NAME,
      currentProductionBaseline: TARGET_NAME,
      outputPath: externalPath(targetRoot),
      activeOntology,
      semanticTruthPayloadSha256: authoritative.integrity.payloadSha256,
      ontologyLineagePayloadSha256: ontologyLineage.integrity.payloadSha256,
      rp7Frozen: true,
      rp7Snapshot: sourceState,
      safeToFreeze: true,
      pointer: { type: pointer.type, target: externalPath(pointer.target) },
    }, null, 2)}\n`);
  } catch (error) {
    if (!targetCreated && fs.existsSync(stagingRoot)) fs.rmSync(stagingRoot, { recursive: true, force: true });
    throw error;
  }
}

main();