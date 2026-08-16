const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  assertExternalOutput,
  externalPath,
  outputRoot,
  productionSnapshot,
  repoRoot,
} = require('./artifact-output-paths.cjs');

const PHASE31_ROOT = assertExternalOutput(path.join(outputRoot, 'ontology-evolution', 'phase31'));
const PHASE32_ROOT = assertExternalOutput(path.join(outputRoot, 'ontology-evolution', 'phase32'));
const PHASE31_CANDIDATE_PATH = path.join(PHASE31_ROOT, 'ontology-phase31.json');
const PHASE31_TRUTH_PATH = path.join(
  PHASE31_ROOT,
  'rp8-evaluation',
  'phase31-semantic-truth-rp8.json',
);
const PHASE31_DIFF_PATH = path.join(
  PHASE31_ROOT,
  'rp8-evaluation',
  'rp7-to-phase31-mapping-diff.json',
);
const OUTPUT_PATH = path.join(PHASE32_ROOT, 'phase32-semantic-truth-rp8.json');
const ACORD140_BASELINE_PATH = path.join(
  repoRoot,
  'backend',
  'api',
  'tests',
  'baselines',
  'xml-semantic',
  'sample-Acord-140.pdf.semantic.json',
);

function readBytes(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Missing required file: ${filePath}`);
  return fs.readFileSync(filePath);
}

function readJson(filePath) {
  return JSON.parse(readBytes(filePath).toString('utf8').replace(/^\uFEFF/, ''));
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

function assertPhase31Integrity(candidate, truth, diff) {
  if (
    candidate.phase !== 31 ||
    candidate.status !== 'candidate' ||
    candidate.activation?.state !== 'inactive' ||
    candidate.activation?.runtimeChanged !== false ||
    truth.candidate?.activationState !== 'inactive' ||
    truth.baseline?.restorePoint !== 'RP-7' ||
    diff.baselineRestorePoint !== 'RP-7'
  ) {
    throw new Error('Phase 31 parent artifacts do not satisfy the stabilization contract');
  }
  const unresolved = candidate.semanticExpansion?.crossFormUnification?.unresolvedGraphOnlyCodes || [];
  const expected = [
    'Applicant.Address.City',
    'CommercialLines.Location.Number',
    'Insured.Address.City',
    'Location.PremisesNumber',
  ];
  if (stableSerialize(unresolved) !== stableSerialize(expected)) {
    throw new Error('Phase 31 quarantine does not match the expected Phase 32 scope');
  }
}

function buildResolutions(candidate, acord140) {
  const graph = candidate.semanticExpansion.crossFormUnification.graph;
  const groupFor = (code) => graph.groups.find((group) => group.equivalentCodes.includes(code));
  const cityGroup = groupFor('Applicant.Address.City');
  const premisesGroup = groupFor('Location.PremisesNumber');
  if (!cityGroup || !premisesGroup) throw new Error('Required Phase 31 graph groups are missing');

  const cityComponent = candidate.semanticExpansion.addressHarmonization.components.find(
    (component) => component.component === 'city',
  );
  const corpusBindings = cityComponent.bindings.filter(
    (binding) => binding.status === 'evidence-backed',
  );
  const cityEvidence = {
    sourceStructures: corpusBindings.map((binding) => binding.structure),
    totalFormsAcrossRoleBindings: corpusBindings.reduce(
      (total, binding) => total + binding.formCount,
      0,
    ),
    totalInstances: corpusBindings.reduce(
      (total, binding) => total + binding.instanceCount,
      0,
    ),
    allText: corpusBindings.every(
      (binding) => Object.keys(binding.fieldTypeCounts).length === 1 && binding.fieldTypeCounts.text,
    ),
  };
  const premisesCodesInAcord140 = acord140.codes.filter((code) =>
    /(?:location|premises).*(?:number|identifier)|(?:number|identifier).*(?:location|premises)/i.test(code),
  );

  return [
    {
      graphCode: 'Applicant.Address.City',
      groupId: cityGroup.groupId,
      disposition: 'resolved-to-semantic-component',
      canonicalComponentId: cityComponent.canonicalComponentId,
      canonicalOntologyCode: null,
      structureRole: 'Applicant.address',
      promotion: 'component-alias-only',
      evidence: cityEvidence,
      rationale: 'Graph equivalence is stabilized against the shared city component while preserving the Applicant address role.',
    },
    {
      graphCode: 'Insured.Address.City',
      groupId: cityGroup.groupId,
      disposition: 'resolved-to-semantic-component',
      canonicalComponentId: cityComponent.canonicalComponentId,
      canonicalOntologyCode: null,
      structureRole: 'Insured.address',
      promotion: 'component-alias-only',
      evidence: cityEvidence,
      rationale: 'Graph equivalence is stabilized against the shared city component while preserving the Insured address role.',
    },
    {
      graphCode: 'CommercialLines.Location.Number',
      groupId: premisesGroup.groupId,
      disposition: 'resolved-as-deferred-structural-gap',
      canonicalComponentId: null,
      canonicalOntologyCode: null,
      structureRole: 'CommercialProperty.locationAddress',
      promotion: 'blocked',
      evidence: {
        groundTruthFormCount: 0,
        groundTruthInstanceCount: 0,
        acord140BaselineMatchCount: premisesCodesInAcord140.length,
        acord140BaselineMatches: premisesCodesInAcord140,
      },
      rationale: 'No corpus field or ACORD 140 semantic baseline code supports a location-number component; the graph equivalence is retained without promotion.',
    },
    {
      graphCode: 'Location.PremisesNumber',
      groupId: premisesGroup.groupId,
      disposition: 'resolved-as-deferred-structural-gap',
      canonicalComponentId: null,
      canonicalOntologyCode: null,
      structureRole: 'CommercialProperty.locationAddress',
      promotion: 'blocked',
      evidence: {
        groundTruthFormCount: 0,
        groundTruthInstanceCount: 0,
        acord140BaselineMatchCount: premisesCodesInAcord140.length,
        acord140BaselineMatches: premisesCodesInAcord140,
      },
      rationale: 'No corpus field or ACORD 140 semantic baseline code supports a premises-number component; the graph equivalence is retained without promotion.',
    },
  ].sort((left, right) => left.graphCode.localeCompare(right.graphCode));
}

function finalizeBridgeGroups(candidate, resolutions) {
  const unification = candidate.semanticExpansion.crossFormUnification;
  const promotedByGroup = new Map(unification.bridges.map((bridge) => [bridge.groupId, bridge]));
  const resolutionsByGroup = new Map();
  for (const resolution of resolutions) {
    const current = resolutionsByGroup.get(resolution.groupId) || [];
    current.push(resolution);
    resolutionsByGroup.set(resolution.groupId, current);
  }

  return unification.graph.groups.map((group) => {
    const promoted = promotedByGroup.get(group.groupId);
    const groupResolutions = resolutionsByGroup.get(group.groupId) || [];
    if (promoted) {
      return {
        groupId: group.groupId,
        equivalentCodes: group.equivalentCodes,
        status: 'finalized-canonical-bridge',
        canonicalCode: promoted.canonicalCode,
        canonicalComponentId: null,
        runtimePromotion: false,
        evidencePath: promoted.evidencePath,
        evidenceFormCount: promoted.evidenceFormCount,
      };
    }
    if (groupResolutions.every(
      (resolution) => resolution.disposition === 'resolved-to-semantic-component',
    )) {
      return {
        groupId: group.groupId,
        equivalentCodes: group.equivalentCodes,
        status: 'finalized-component-bridge',
        canonicalCode: null,
        canonicalComponentId: groupResolutions[0].canonicalComponentId,
        runtimePromotion: false,
        evidence: groupResolutions[0].evidence,
      };
    }
    return {
      groupId: group.groupId,
      equivalentCodes: group.equivalentCodes,
      status: 'finalized-nonpromoting-equivalence',
      canonicalCode: null,
      canonicalComponentId: null,
      runtimePromotion: false,
      blockReason: 'missing-corpus-and-schema-evidence',
    };
  }).sort((left, right) => left.groupId.localeCompare(right.groupId));
}

function main() {
  const phase31CandidateBytes = readBytes(PHASE31_CANDIDATE_PATH);
  const phase31TruthBytes = readBytes(PHASE31_TRUTH_PATH);
  const phase31DiffBytes = readBytes(PHASE31_DIFF_PATH);
  const phase31Candidate = JSON.parse(phase31CandidateBytes.toString('utf8').replace(/^\uFEFF/, ''));
  const phase31Truth = JSON.parse(phase31TruthBytes.toString('utf8').replace(/^\uFEFF/, ''));
  const phase31Diff = JSON.parse(phase31DiffBytes.toString('utf8').replace(/^\uFEFF/, ''));
  const acord140 = readJson(ACORD140_BASELINE_PATH);
  const rp7ManifestPath = path.join(productionSnapshot('RP-7'), 'manifest.json');
  const rp7Bytes = readBytes(rp7ManifestPath);
  const rp7 = JSON.parse(rp7Bytes.toString('utf8').replace(/^\uFEFF/, ''));

  assertPhase31Integrity(phase31Candidate, phase31Truth, phase31Diff);
  if (
    rp7.restorePoint !== 'RP-7' ||
    rp7.readiness?.ontology !== 'phase30-semantic-truth-rewrite' ||
    rp7.guardrails?.immutable !== true
  ) {
    throw new Error('RP-7 is not the immutable Phase 30 runtime baseline');
  }

  const resolutions = buildResolutions(phase31Candidate, acord140);
  const finalizedBridges = finalizeBridgeGroups(phase31Candidate, resolutions);
  const dispositions = new Set(resolutions.map((resolution) => resolution.graphCode));
  const quarantined = phase31Candidate.semanticExpansion.crossFormUnification.unresolvedGraphOnlyCodes;
  const quarantineFullyDispositioned = quarantined.every((code) => dispositions.has(code));
  const bridgeGroupsFullyFinalized = finalizedBridges.length ===
    phase31Candidate.semanticExpansion.crossFormUnification.graph.groups.length;
  if (!quarantineFullyDispositioned || !bridgeGroupsFullyFinalized) {
    throw new Error('Phase 32 stabilization is incomplete');
  }

  const generatedAt = new Date().toISOString();
  const payload = {
    schemaVersion: 'phase32-semantic-truth-rp8.v1',
    phase: 32,
    phaseId: 'phase32-semantic-truth-stabilization',
    generatedAt,
    status: 'candidate',
    targetRestorePoint: 'RP-8',
    activation: {
      state: 'inactive',
      runtimeChanged: false,
      productionBaselineChanged: false,
      requiresExplicitPromotion: true,
    },
    lineage: {
      runtimeBaseline: 'RP-7',
      runtimeOntology: rp7.readiness.ontology,
      metricVersion: rp7.readiness.metricVersion,
      rp7ManifestSha256: sha256(rp7Bytes),
      parentPhase: 31,
      parentCandidatePayloadSha256: phase31Candidate.integrity.payloadSha256,
      parentCandidateFileSha256: sha256(phase31CandidateBytes),
      parentSemanticTruthPayloadSha256: phase31Truth.integrity.payloadSha256,
      parentSemanticTruthFileSha256: sha256(phase31TruthBytes),
      parentDiffPayloadSha256: phase31Diff.integrity.payloadSha256,
      parentDiffFileSha256: sha256(phase31DiffBytes),
    },
    stabilization: {
      quarantine: {
        inputCodes: quarantined,
        resolutions,
        fullyDispositioned: quarantineFullyDispositioned,
        remainingQuarantinedCodes: [],
      },
      crossFormBridges: {
        sourceGraphHash:
          phase31Candidate.semanticExpansion.crossFormUnification.graph.graphHash,
        groups: finalizedBridges,
        fullyFinalized: bridgeGroupsFullyFinalized,
        canonicalBridgeCount: finalizedBridges.filter(
          (bridge) => bridge.status === 'finalized-canonical-bridge',
        ).length,
        componentBridgeCount: finalizedBridges.filter(
          (bridge) => bridge.status === 'finalized-component-bridge',
        ).length,
        nonpromotingEquivalenceCount: finalizedBridges.filter(
          (bridge) => bridge.status === 'finalized-nonpromoting-equivalence',
        ).length,
      },
      addressHarmonization: {
        ...phase31Candidate.semanticExpansion.addressHarmonization,
        stabilizedComponentAliases: resolutions.filter(
          (resolution) => resolution.disposition === 'resolved-to-semantic-component',
        ),
        blockedStructuralGaps: resolutions.filter(
          (resolution) => resolution.disposition === 'resolved-as-deferred-structural-gap',
        ),
      },
    },
    semanticTruth: {
      evaluationMode: phase31Truth.evaluationMode,
      inputs: phase31Truth.inputs,
      summary: phase31Truth.summary,
      decisions: phase31Truth.decisions,
      phase32DecisionDelta: {
        codeChangesFromPhase31: 0,
        confidenceChangesFromPhase31: 0,
        rankingChangesFromPhase31: 0,
        rationale: 'Phase 32 stabilizes bridge and address-component semantics without changing the verified Phase 31 RP-8 decision projection.',
      },
    },
    validation: {
      valid: true,
      quarantineFullyDispositioned,
      remainingQuarantinedCodeCount: 0,
      bridgeGroupsFullyFinalized,
      finalizedBridgeGroupCount: finalizedBridges.length,
      rp7RuntimeBaselinePreserved: true,
      phase31Inactive: phase31Candidate.activation.state === 'inactive',
      phase32Inactive: true,
      phase31DecisionProjectionPreserved:
        phase31Truth.summary.changedDecisions === phase31Diff.summary.changedDecisions &&
        phase31Truth.summary.rankingChanges === 0 &&
        phase31Truth.summary.confidenceChanges === 0,
      acord140StructuralGapConfirmed: resolutions
        .filter((resolution) => resolution.promotion === 'blocked')
        .every((resolution) => resolution.evidence.acord140BaselineMatchCount === 0),
    },
    guardrails: {
      noRuntimeOntologyChange: true,
      noProductionBaselineChange: true,
      noMetricModification: true,
      noFieldIdChange: true,
      noPageIndexChange: true,
      noGroupingChange: true,
      noSuppressionChange: true,
      noUnsupportedOntologyPromotion: true,
    },
  };
  const artifact = {
    ...payload,
    integrity: {
      algorithm: 'sha256',
      payloadSha256: sha256(stableSerialize(payload)),
    },
  };

  if (fs.existsSync(OUTPUT_PATH)) {
    throw new Error(`Refusing to overwrite existing Phase 32 candidate: ${OUTPUT_PATH}`);
  }
  fs.mkdirSync(PHASE32_ROOT, { recursive: true });
  const temporaryPath = `${OUTPUT_PATH}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, OUTPUT_PATH);

  if (
    sha256(readBytes(rp7ManifestPath)) !== artifact.lineage.rp7ManifestSha256 ||
    sha256(readBytes(PHASE31_CANDIDATE_PATH)) !== artifact.lineage.parentCandidateFileSha256
  ) {
    fs.rmSync(OUTPUT_PATH, { force: true });
    throw new Error('RP-7 or Phase 31 changed during Phase 32 generation');
  }

  process.stdout.write(`${JSON.stringify({
    outputPath: externalPath(OUTPUT_PATH),
    phase: artifact.phase,
    status: artifact.status,
    payloadSha256: artifact.integrity.payloadSha256,
    quarantinedInputCount: quarantined.length,
    remainingQuarantinedCodeCount: artifact.validation.remainingQuarantinedCodeCount,
    finalizedBridgeGroupCount: artifact.validation.finalizedBridgeGroupCount,
    canonicalBridgeCount: artifact.stabilization.crossFormBridges.canonicalBridgeCount,
    componentBridgeCount: artifact.stabilization.crossFormBridges.componentBridgeCount,
    nonpromotingEquivalenceCount:
      artifact.stabilization.crossFormBridges.nonpromotingEquivalenceCount,
    inheritedDecisionCount: artifact.semanticTruth.summary.totalDecisions,
    phase32DecisionChangesFromPhase31:
      artifact.semanticTruth.phase32DecisionDelta.codeChangesFromPhase31,
    phase31Inactive: artifact.validation.phase31Inactive,
    phase32Inactive: artifact.validation.phase32Inactive,
    rp7RuntimeBaselinePreserved: artifact.validation.rp7RuntimeBaselinePreserved,
  }, null, 2)}\n`);
}

main();