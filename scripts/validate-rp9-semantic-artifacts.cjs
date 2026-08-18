const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const artifactRoot = path.join(repoRoot, 'acord-artifacts');
const files = {
  truth: path.join(artifactRoot, 'authoritative-semantic-truth-rp9.json'),
  lineage: path.join(artifactRoot, 'rp9-ontology-lineage.json'),
  bundles: path.join(artifactRoot, 'rp9-category-bundles.json'),
  rp8Truth: path.join(artifactRoot, 'authoritative-semantic-truth-rp8.json'),
  rp8Lineage: path.join(artifactRoot, 'rp8-ontology-lineage.json'),
  phase33: path.join(artifactRoot, 'phase33-semantic-truth-rp8.json'),
};

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function canonicalFileSha256(bytes) { return sha256(bytes.toString('utf8').replace(/\r\n/g, '\n')); }
function read(filePath) { const bytes = fs.readFileSync(filePath); return { bytes, value: JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, '')) }; }
function payloadHash(value) { const { integrity: _integrity, ...payload } = value; return sha256(stableSerialize(payload)); }

const artifacts = Object.fromEntries(Object.entries(files).map(([name, filePath]) => [name, read(filePath)]));
const { truth, lineage, bundles, rp8Truth, rp8Lineage, phase33 } = Object.fromEntries(Object.entries(artifacts).map(([name, artifact]) => [name, artifact.value]));
const checks = {};
for (const name of ['truth', 'lineage', 'bundles', 'rp8Truth', 'rp8Lineage', 'phase33']) {
  checks[`${name}PayloadHash`] = payloadHash(artifacts[name].value) === artifacts[name].value.integrity.payloadSha256;
}
checks.truthToBundles = bundles.semanticTruthPayloadSha256 === truth.integrity.payloadSha256;
checks.lineageToTruthPayload = lineage.artifacts.authoritativeSemanticTruth.payloadSha256 === truth.integrity.payloadSha256;
checks.lineageToTruthFile = lineage.artifacts.authoritativeSemanticTruth.fileSha256 === canonicalFileSha256(artifacts.truth.bytes);
checks.lineageToBundlesPayload = lineage.artifacts.categoryBundles.payloadSha256 === bundles.integrity.payloadSha256;
checks.lineageToBundlesFile = lineage.artifacts.categoryBundles.fileSha256 === canonicalFileSha256(artifacts.bundles.bytes);
checks.lineageToPhase33 = lineage.artifacts.phase33Policy.payloadSha256 === phase33.integrity.payloadSha256 && lineage.artifacts.phase33Policy.fileSha256 === canonicalFileSha256(artifacts.phase33.bytes);
checks.parentRp8Truth = truth.lineage.parent.semanticTruthPayloadSha256 === rp8Truth.integrity.payloadSha256 && truth.lineage.parent.semanticTruthFileSha256 === canonicalFileSha256(artifacts.rp8Truth.bytes);
checks.parentRp8Lineage = truth.lineage.parent.ontologyLineagePayloadSha256 === rp8Lineage.integrity.payloadSha256 && truth.lineage.parent.ontologyLineageFileSha256 === canonicalFileSha256(artifacts.rp8Lineage.bytes);
checks.rp9StagingActive =
  truth.activation.state === 'staging-active' &&
  truth.activation.scope === 'staging' &&
  lineage.activation.state === 'staging-active' &&
  lineage.activation.scope === 'staging';
checks.rp8RemainsProductionActive =
  truth.guardrails.rp8RemainsProductionActive === true &&
  lineage.activation.currentProductionBaseline === 'RP-8' &&
  lineage.activation.productionPromoted === false;
checks.stagingGateDeclared =
  truth.activation.requiredEnvironment?.SEMANTIC_BASELINE === 'RP-9' &&
  truth.activation.requiredEnvironment?.DEPLOYMENT_ENVIRONMENT === 'staging';
checks.phase33Compatible = truth.validation.phase33Compatible === true && lineage.validation.phase33Compatible === true;

const nodes = truth.canonicalOntology.nodes;
const nodeIds = new Set(Object.keys(nodes));
const requiredNodes = [
  'Producer.Identity.FullName', 'Producer.Address.Line1', 'Producer.Address.City', 'Producer.Contact.Phone', 'Producer.Contact.Email',
  'Form.Date.Completed', 'Form.Date.Signed', 'Signature.Applicant', 'Signature.Producer',
  'Premises.Location.Identifier', 'Premises.Building.Identifier', 'Premises.Address.Line1', 'Premises.Address.City',
  'GeneralInformation.Question', 'GeneralInformation.Answer',
  'Section.ProducerInformation', 'Section.ApplicantInformation', 'Section.PremisesInformation', 'Section.GeneralInformation',
];
checks.requiredNodesPresent = requiredNodes.every((id) => nodeIds.has(id));
checks.stableIdentifiers = [...nodeIds].every((id) => /^[A-Z][A-Za-z0-9]*(\.[A-Z][A-Za-z0-9]*)+$/.test(id));
checks.nodeCount = nodeIds.size === truth.validation.nodeCount && nodeIds.size === lineage.nodeCount;
checks.ontologyHash = sha256(stableSerialize(nodes)) === truth.canonicalOntology.hash && truth.canonicalOntology.hash === bundles.ontologyHash && bundles.ontologyHash === lineage.ontologyHash;
checks.referencesValid = Object.values(nodes).every((node) => ['parentCodes', 'childCodes', 'mutuallyExclusiveCodes', 'requiredSiblingCodes'].every((relation) => (node[relation] || []).every((id) => nodeIds.has(id))));
checks.aliasesPresent = Object.values(nodes).every((node) => Array.isArray(node.aliases) && node.aliases.includes(node.acordCode));
checks.newNodeEvidence = Object.values(nodes).filter((node) => node.inheritedFrom !== 'RP-8').every((node) => node.evidence && (node.evidence.formCount > 0 || node.evidence.evidenceType === 'structural-section-model' || node.evidence.evidenceType === 'structural-section-heading' || node.evidence.evidenceType === 'combined-semantic-paths'));
checks.instanceFamiliesPresent = Object.values(nodes).every((node) => node.instanceFamily?.familyId && Array.isArray(node.instanceFamily.instanceKey) && node.instanceFamily.instanceKey.length > 0);
checks.bundleReferencesValid = [...bundles.groups, ...bundles.sections].every((bundle) => bundle.nodeCount === bundle.nodeIds.length && bundle.nodeIds.every((id) => nodeIds.has(id)));
checks.allNodesBundled = bundles.validation.allNodesBundled === true;
checks.roleBoundariesPreserved = truth.roleBoundaryPolicy.crossRolePromotionProhibited === true && truth.roleBoundaryPolicy.roleLevelCollapsingProhibited === true;
checks.agentAliasSafe = truth.roleBoundaryPolicy.roleAliases.Agent === 'Producer' && truth.roleSafeEquivalences.some((item) => item.equivalenceId === 'agent-role-to-producer-role' && item.runtimePromotion === false);
checks.applicantSignatureSafe = truth.roleSafeEquivalences.some((item) => item.equivalenceId === 'applicant-signature-named-insured-representation' && item.preservesSourceRole === true && item.runtimePromotion === false);
checks.multiInstanceFamilies = Object.keys(truth.multiInstanceFamilies).length === truth.validation.multiInstanceFamilyCount && ['party.producer', 'premises.location', 'premises.building', 'general-information.question-answer'].every((id) => truth.multiInstanceFamilies[id]);

const failedChecks = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
const report = {
  schemaVersion: 'rp9-semantic-artifact-validation.v1',
  valid: failedChecks.length === 0,
  failedChecks,
  checks,
  summary: {
    nodeCount: nodeIds.size,
    addedNodeCount: truth.validation.addedNodeCount,
    groupBundleCount: bundles.groups.length,
    sectionBundleCount: bundles.sections.length,
    multiInstanceFamilyCount: Object.keys(truth.multiInstanceFamilies).length,
    roleSafeEquivalenceCount: truth.roleSafeEquivalences.length,
    truthPayloadSha256: truth.integrity.payloadSha256,
    lineagePayloadSha256: lineage.integrity.payloadSha256,
    categoryBundlesPayloadSha256: bundles.integrity.payloadSha256,
    ontologyHash: truth.canonicalOntology.hash,
  },
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.valid) process.exitCode = 1;
