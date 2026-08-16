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
const { getAcordOntology } = require('../shared/src/acord/ontology.js');
const {
  getOntologyBundles,
  validateOntologyBundleSignatures,
} = require('../shared/src/acord/multiOntology.js');
const { getCrossFormUnificationGraph } = require('../shared/src/quality/semanticFusion.js');

const PHASE = 31;
const PARENT_ONTOLOGY = 'phase30-semantic-truth-rewrite';
const BASELINE = 'RP-7';
const METRIC_VERSION = 'collapse-aware-metric.v35';
const GROUND_TRUTH_ROOT = path.join(
  repoRoot,
  'training-data',
  'acord-labeled_XFDL',
  'ground-truth',
);
const SEMANTIC_EXPANSIONS = Object.freeze([
  {
    acordCode: 'CommercialProperty.Building.LocationAddress',
    semanticPaths: ['Location_PhysicalAddress_LineOne'],
  },
  {
    acordCode: 'GeneralInfo.NamedInsured',
    semanticPaths: ['NamedInsured_FullName'],
  },
  {
    acordCode: 'GeneralInfo.MailingAddress.Line1',
    semanticPaths: ['NamedInsured_MailingAddress_LineOne'],
  },
  {
    acordCode: 'GeneralInfo.MailingAddress.City',
    semanticPaths: ['NamedInsured_MailingAddress_CityName'],
  },
  {
    acordCode: 'GeneralInfo.MailingAddress.State',
    semanticPaths: ['NamedInsured_MailingAddress_StateOrProvinceCode'],
  },
  {
    acordCode: 'GeneralInfo.MailingAddress.PostalCode',
    semanticPaths: ['NamedInsured_MailingAddress_PostalCode'],
  },
]);
const UNIFICATION_BRIDGES = Object.freeze([
  {
    canonicalCode: 'GeneralInfo.NamedInsured',
    graphCodes: ['Applicant.Name', 'Insured.Name', 'GeneralInfo.NamedInsured'],
    evidencePath: 'NamedInsured_FullName',
  },
  {
    canonicalCode: 'GeneralInfo.MailingAddress.Line1',
    graphCodes: ['Applicant.Address.Street', 'GeneralInfo.MailingAddress.Street'],
    evidencePath: 'NamedInsured_MailingAddress_LineOne',
  },
  {
    canonicalCode: 'CommercialProperty.Building.LocationAddress',
    graphCodes: ['CommercialLines.Location.Address.Street', 'Location.Address.Street'],
    evidencePath: 'Location_PhysicalAddress_LineOne',
  },
]);
const ADDRESS_COMPONENTS = Object.freeze([
  {
    component: 'line1',
    canonicalComponentId: 'phase31.address.line1',
    bindings: [
      { structure: 'NamedInsured.mailingAddress', semanticPath: 'NamedInsured_MailingAddress_LineOne', graphCode: 'GeneralInfo.MailingAddress.Street' },
      { structure: 'NamedInsured.physicalAddress', semanticPath: 'NamedInsured_PhysicalAddress_LineOne' },
      { structure: 'Applicant.address', graphCode: 'Applicant.Address.Street' },
      { structure: 'Insured.address', status: 'unresolved' },
      { structure: 'CommercialProperty.locationAddress', semanticPath: 'Location_PhysicalAddress_LineOne', graphCode: 'Location.Address.Street' },
    ],
  },
  {
    component: 'city',
    canonicalComponentId: 'phase31.address.city',
    bindings: [
      { structure: 'NamedInsured.mailingAddress', semanticPath: 'NamedInsured_MailingAddress_CityName' },
      { structure: 'NamedInsured.physicalAddress', semanticPath: 'NamedInsured_PhysicalAddress_CityName' },
      { structure: 'Applicant.address', graphCode: 'Applicant.Address.City' },
      { structure: 'Insured.address', graphCode: 'Insured.Address.City' },
      { structure: 'CommercialProperty.locationAddress', semanticPath: 'Location_PhysicalAddress_CityName' },
    ],
  },
  {
    component: 'stateOrProvince',
    canonicalComponentId: 'phase31.address.state-or-province',
    bindings: [
      { structure: 'NamedInsured.mailingAddress', semanticPath: 'NamedInsured_MailingAddress_StateOrProvinceCode' },
      { structure: 'NamedInsured.physicalAddress', semanticPath: 'NamedInsured_PhysicalAddress_StateOrProvinceCode' },
      { structure: 'Applicant.address', status: 'unresolved' },
      { structure: 'Insured.address', status: 'unresolved' },
      { structure: 'CommercialProperty.locationAddress', semanticPath: 'Location_PhysicalAddress_StateOrProvinceCode' },
    ],
  },
  {
    component: 'postalCode',
    canonicalComponentId: 'phase31.address.postal-code',
    bindings: [
      { structure: 'NamedInsured.mailingAddress', semanticPath: 'NamedInsured_MailingAddress_PostalCode' },
      { structure: 'NamedInsured.physicalAddress', semanticPath: 'NamedInsured_PhysicalAddress_PostalCode' },
      { structure: 'Applicant.address', status: 'unresolved' },
      { structure: 'Insured.address', status: 'unresolved' },
      { structure: 'CommercialProperty.locationAddress', semanticPath: 'Location_PhysicalAddress_PostalCode' },
    ],
  },
]);

function stableSerialize(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(',')}]`;
  }
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

function collectInvalidReferences(ontology) {
  const codes = new Set(Object.keys(ontology.nodes));
  const relationNames = [
    'parentCodes',
    'childCodes',
    'mutuallyExclusiveCodes',
    'requiredSiblingCodes',
  ];
  const invalid = [];

  for (const [acordCode, node] of Object.entries(ontology.nodes)) {
    for (const relation of relationNames) {
      for (const relatedCode of node[relation]) {
        if (!codes.has(relatedCode)) {
          invalid.push({ acordCode, relation, relatedCode });
        }
      }
    }
  }
  return invalid;
}

function collectCorpusEvidence() {
  const manifestPath = path.join(GROUND_TRUTH_ROOT, 'manifest.json');
  const manifestBytes = fs.readFileSync(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString('utf8').replace(/^\uFEFF/, ''));
  const bySemanticPath = new Map();

  for (const form of manifest.forms) {
    const datasetPath = path.join(GROUND_TRUTH_ROOT, form.datasetFile);
    const dataset = JSON.parse(fs.readFileSync(datasetPath, 'utf8').replace(/^\uFEFF/, ''));
    const perForm = new Map();
    for (const field of dataset.fields || []) {
      const semanticPath = field.semantic?.semanticPath;
      if (!semanticPath) continue;
      const record = perForm.get(semanticPath) || {
        instanceCount: 0,
        fieldTypes: new Set(),
        fieldTypeCounts: new Map(),
      };
      record.instanceCount += 1;
      if (field.fieldType) {
        record.fieldTypes.add(field.fieldType);
        record.fieldTypeCounts.set(
          field.fieldType,
          (record.fieldTypeCounts.get(field.fieldType) || 0) + 1,
        );
      }
      perForm.set(semanticPath, record);
    }
    for (const [semanticPath, record] of perForm.entries()) {
      const evidence = bySemanticPath.get(semanticPath) || {
        forms: [],
        instanceCount: 0,
        fieldTypes: new Set(),
        fieldTypeCounts: new Map(),
      };
      evidence.forms.push(form.datasetFile);
      evidence.instanceCount += record.instanceCount;
      for (const fieldType of record.fieldTypes) evidence.fieldTypes.add(fieldType);
      for (const [fieldType, count] of record.fieldTypeCounts.entries()) {
        evidence.fieldTypeCounts.set(
          fieldType,
          (evidence.fieldTypeCounts.get(fieldType) || 0) + count,
        );
      }
      bySemanticPath.set(semanticPath, evidence);
    }
  }

  return {
    manifest: {
      schemaVersion: manifest.schemaVersion,
      formCount: manifest.formCount,
      fieldCount: manifest.totals.fields,
      sha256: sha256(manifestBytes),
    },
    bySemanticPath,
  };
}

function buildSemanticExpansion(canonicalOntology) {
  const corpus = collectCorpusEvidence();
  const graph = getCrossFormUnificationGraph();
  const graphCodes = Array.from(new Set(
    graph.edges.flatMap((edge) => [edge.sourceCode, edge.targetCode]),
  )).sort((left, right) => left.localeCompare(right));
  const concepts = SEMANTIC_EXPANSIONS.map((expansion) => {
    if (!canonicalOntology.nodes[expansion.acordCode]) {
      throw new Error(`Semantic expansion target is not canonical: ${expansion.acordCode}`);
    }
    const evidence = expansion.semanticPaths.map((semanticPath) => {
      const record = corpus.bySemanticPath.get(semanticPath);
      if (!record || record.forms.length < 3) {
        throw new Error(`Insufficient cross-form evidence for ${semanticPath}`);
      }
      const fieldTypeCounts = Object.fromEntries(
        Array.from(record.fieldTypeCounts.entries())
          .sort(([left], [right]) => left.localeCompare(right)),
      );
      const dominantFieldType = Object.entries(fieldTypeCounts)
        .sort(([, left], [, right]) => right - left)[0][0];
      const fieldTypeOutlierCount = record.instanceCount - fieldTypeCounts[dominantFieldType];
      return {
        semanticPath,
        formCount: record.forms.length,
        instanceCount: record.instanceCount,
        fieldTypes: Array.from(record.fieldTypes).sort((left, right) => left.localeCompare(right)),
        fieldTypeCounts,
        dominantFieldType,
        fieldTypeOutlierCount,
        forms: record.forms.sort((left, right) => left.localeCompare(right)),
      };
    });
    return {
      acordCode: expansion.acordCode,
      status: 'candidate-alias',
      aliasesAdded: [...expansion.semanticPaths],
      evidence,
    };
  }).sort((left, right) => left.acordCode.localeCompare(right.acordCode));
  const bridges = UNIFICATION_BRIDGES.map((bridge) => {
    if (!canonicalOntology.nodes[bridge.canonicalCode]) {
      throw new Error(`Unification bridge target is not canonical: ${bridge.canonicalCode}`);
    }
    const missingGraphCodes = bridge.graphCodes.filter((code) => !graphCodes.includes(code));
    if (missingGraphCodes.length > 0) {
      throw new Error(`Unification bridge codes are absent from the graph: ${missingGraphCodes.join(', ')}`);
    }
    const group = graph.groups.find((candidate) =>
      bridge.graphCodes.every((code) => candidate.equivalentCodes.includes(code)));
    if (!group) {
      throw new Error(`Unification bridge crosses graph groups: ${bridge.canonicalCode}`);
    }
    const concept = concepts.find((candidate) =>
      candidate.acordCode === bridge.canonicalCode &&
      candidate.aliasesAdded.includes(bridge.evidencePath));
    if (!concept) {
      throw new Error(`Unification bridge lacks candidate evidence: ${bridge.canonicalCode}`);
    }
    const evidence = concept.evidence.find((candidate) =>
      candidate.semanticPath === bridge.evidencePath);
    return {
      status: 'candidate-bridge',
      groupId: group.groupId,
      canonicalCode: bridge.canonicalCode,
      graphCodes: [...bridge.graphCodes].sort((left, right) => left.localeCompare(right)),
      evidencePath: bridge.evidencePath,
      evidenceFormCount: evidence.formCount,
      preservesEntityRoleContext: true,
    };
  }).sort((left, right) => left.canonicalCode.localeCompare(right.canonicalCode));
  const bridgedGraphCodes = Array.from(new Set(
    bridges.flatMap((bridge) => bridge.graphCodes),
  )).sort((left, right) => left.localeCompare(right));
  const graphOnlyCodes = graphCodes.filter((code) => !canonicalOntology.nodes[code]);
  const addressHarmonization = {
    schemaVersion: 'phase31-address-harmonization.v1',
    policy: {
      preserveStructureRole: true,
      mailingAndPhysicalRemainDistinct: true,
      graphVocabularyRequiresExplicitProvenance: true,
      unresolvedBindingsAreNotPromoted: true,
    },
    structures: [
      'NamedInsured.mailingAddress',
      'NamedInsured.physicalAddress',
      'Applicant.address',
      'Insured.address',
      'CommercialProperty.locationAddress',
    ],
    components: ADDRESS_COMPONENTS.map((definition) => ({
      component: definition.component,
      canonicalComponentId: definition.canonicalComponentId,
      bindings: definition.bindings.map((binding) => {
        if (binding.status === 'unresolved') {
          return {
            ...binding,
            status: 'unresolved',
            provenance: 'missing-corpus-and-graph-evidence',
          };
        }
        const evidence = binding.semanticPath
          ? corpus.bySemanticPath.get(binding.semanticPath)
          : null;
        if (binding.semanticPath && (!evidence || evidence.forms.length < 3)) {
          throw new Error(`Insufficient address evidence for ${binding.semanticPath}`);
        }
        if (binding.graphCode && !graphCodes.includes(binding.graphCode)) {
          throw new Error(`Address graph code is absent: ${binding.graphCode}`);
        }
        const fieldTypeCounts = evidence
          ? Object.fromEntries(Array.from(evidence.fieldTypeCounts.entries())
            .sort(([left], [right]) => left.localeCompare(right)))
          : undefined;
        return {
          ...binding,
          status: binding.semanticPath ? 'evidence-backed' : 'graph-inferred',
          provenance: binding.semanticPath && binding.graphCode
            ? 'corpus-and-unification-graph'
            : binding.semanticPath
              ? 'ground-truth-corpus'
              : 'unification-graph',
          ...(evidence ? {
            formCount: evidence.forms.length,
            instanceCount: evidence.instanceCount,
            fieldTypeCounts,
            forms: [...evidence.forms].sort((left, right) => left.localeCompare(right)),
          } : {}),
        };
      }),
    })),
  };
  const addressBindings = addressHarmonization.components.flatMap((component) => component.bindings);
  addressHarmonization.validation = {
    valid: true,
    componentCount: addressHarmonization.components.length,
    structureCount: addressHarmonization.structures.length,
    bindingCount: addressBindings.length,
    evidenceBackedBindingCount: addressBindings.filter(
      (binding) => binding.status === 'evidence-backed',
    ).length,
    graphInferredBindingCount: addressBindings.filter(
      (binding) => binding.status === 'graph-inferred',
    ).length,
    unresolvedBindingCount: addressBindings.filter(
      (binding) => binding.status === 'unresolved',
    ).length,
  };

  const candidateOntology = {
    ...canonicalOntology,
    ontologyId: `${canonicalOntology.ontologyId}:phase31-candidate`,
    version: 'phase31-candidate.1',
    generatedAt: 'deterministic-from-corpus',
    nodes: Object.fromEntries(
      Object.entries(canonicalOntology.nodes).map(([acordCode, node]) => {
        const concept = concepts.find((item) => item.acordCode === acordCode);
        return [acordCode, {
          ...node,
          aliases: Array.from(new Set([...node.aliases, ...(concept?.aliasesAdded || [])]))
            .sort((left, right) => left.localeCompare(right)),
        }];
      }),
    ),
  };
  candidateOntology.hash = sha256(stableSerialize(candidateOntology.nodes));

  return {
    corpus: corpus.manifest,
    policy: {
      minimumFormCount: 3,
      preserveEntityRoleContext: true,
      graphOnlyCodesAreNotPromoted: true,
    },
    concepts,
    candidateOntology,
    addressHarmonization,
    crossFormUnification: {
      graph,
      bridges,
      canonicalCodes: graphCodes.filter((code) => Boolean(canonicalOntology.nodes[code])),
      graphOnlyCodes,
      bridgedGraphOnlyCodes: graphOnlyCodes.filter((code) => bridgedGraphCodes.includes(code)),
      unresolvedGraphOnlyCodes: graphOnlyCodes.filter((code) => !bridgedGraphCodes.includes(code)),
      coverage: {
        edgeCount: graph.edges.length,
        groupCount: graph.groups.length,
        graphCodeCount: graphCodes.length,
        canonicalGraphCodeCount: graphCodes.filter(
          (code) => Boolean(canonicalOntology.nodes[code]),
        ).length,
        bridgeCount: bridges.length,
        bridgedGraphOnlyCodeCount: graphOnlyCodes.filter(
          (code) => bridgedGraphCodes.includes(code),
        ).length,
        unresolvedGraphOnlyCodeCount: graphOnlyCodes.filter(
          (code) => !bridgedGraphCodes.includes(code),
        ).length,
      },
    },
  };
}

function writeCandidate(outputPath, phaseRoot, artifact) {
  if (fs.existsSync(outputPath)) {
    if (!process.argv.includes('--evolve')) {
      throw new Error(`Refusing to overwrite existing ontology artifact: ${outputPath}`);
    }
    const current = JSON.parse(fs.readFileSync(outputPath, 'utf8').replace(/^\uFEFF/, ''));
    if (current.phase !== PHASE || current.status !== 'candidate') {
      throw new Error(`Existing artifact is not an evolvable Phase ${PHASE} candidate`);
    }
    const revisionsRoot = assertExternalOutput(path.join(phaseRoot, 'revisions'));
    const revisionPath = assertExternalOutput(path.join(
      revisionsRoot,
      `ontology-phase${PHASE}-${current.integrity.payloadSha256}.json`,
    ));
    fs.mkdirSync(revisionsRoot, { recursive: true });
    if (!fs.existsSync(revisionPath)) fs.copyFileSync(outputPath, revisionPath);
  }

  const temporaryPath = `${outputPath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, outputPath);
}

function main() {
  const baselineManifestPath = path.join(productionSnapshot(BASELINE), 'manifest.json');
  const baselineManifestBytes = fs.readFileSync(baselineManifestPath);
  const baselineManifest = JSON.parse(baselineManifestBytes.toString('utf8').replace(/^\uFEFF/, ''));
  if (
    baselineManifest.restorePoint !== BASELINE ||
    baselineManifest.readiness?.ontology !== PARENT_ONTOLOGY ||
    baselineManifest.readiness?.metricVersion !== METRIC_VERSION ||
    baselineManifest.guardrails?.immutable !== true
  ) {
    throw new Error(`${BASELINE} does not satisfy the Phase 31 lineage contract`);
  }

  const canonicalOntology = getAcordOntology();
  const bundles = getOntologyBundles();
  const semanticExpansion = buildSemanticExpansion(canonicalOntology);
  const signatureValidation = validateOntologyBundleSignatures(bundles);
  const invalidReferences = collectInvalidReferences(canonicalOntology);
  const canonicalCodes = Object.keys(canonicalOntology.nodes);
  const bundleNodeCountsMatch = bundles.every(
    (bundle) => Object.keys(bundle.ontology.nodes).length === canonicalCodes.length,
  );
  if (!signatureValidation.valid || invalidReferences.length > 0 || !bundleNodeCountsMatch) {
    throw new Error('Runtime ontology failed Phase 31 bootstrap validation');
  }

  const generatedAt = new Date().toISOString();
  const payload = {
    schemaVersion: 'ontology-evolution.v1',
    phase: PHASE,
    phaseId: 'phase31-semantic-expansion-cross-form-unification',
    status: 'candidate',
    generatedAt,
    lineage: {
      parentOntology: PARENT_ONTOLOGY,
      productionBaseline: BASELINE,
      metricVersion: METRIC_VERSION,
      parentOntologyHash: baselineManifest.integrity.ontologyHash,
      baselineManifestSha256: sha256(baselineManifestBytes),
    },
    activation: {
      state: 'inactive',
      runtimeChanged: false,
      productionBaselineChanged: false,
      requiresValidationAndExplicitPromotion: true,
    },
    evolution: {
      objective: 'Expand canonical semantics from recurring cross-form evidence and reconcile them with the existing unification graph.',
      changeSet: [
        ...semanticExpansion.concepts.map((concept) => ({
          type: 'add-evidence-backed-alias',
          acordCode: concept.acordCode,
          aliases: concept.aliasesAdded,
        })),
        {
          type: 'harmonize-address-components',
          schemaVersion: semanticExpansion.addressHarmonization.schemaVersion,
          components: semanticExpansion.addressHarmonization.components.map(
            (component) => component.canonicalComponentId,
          ),
          structures: semanticExpansion.addressHarmonization.structures,
          preservesStructureRole: true,
        },
      ],
      nextActions: [
        'Resolve graph-only codes against corpus-backed canonical concepts.',
        'Validate candidate changes against extraction, mapping, and structured output contracts.',
        'Promote only after drift review and an explicit production-baseline decision.',
      ],
    },
    contracts: {
      stableFieldIds: true,
      stablePageIndices: true,
      preserveGrouping: true,
      preservePersistedDesignerState: true,
      labelsAreSemanticAnchors: true,
      noOcrTextOverlays: true,
    },
    source: {
      repository: externalPath(repoRoot),
      canonicalModule: 'shared/src/acord/ontology.js',
      bundleModule: 'shared/src/acord/multiOntology.js',
      ontologyId: canonicalOntology.ontologyId,
      ontologyVersion: canonicalOntology.version,
      ontologyHash: canonicalOntology.hash,
    },
    canonicalOntology,
    bundles,
    semanticExpansion,
    validation: {
      valid: true,
      canonicalNodeCount: canonicalCodes.length,
      bundleCount: bundles.length,
      bundleNodeCountsMatch,
      signaturesValid: signatureValidation.valid,
      invalidBundleIds: signatureValidation.invalidBundleIds,
      invalidReferences,
      expandedConceptCount: semanticExpansion.concepts.length,
      evidenceBackedAliasCount: semanticExpansion.concepts.reduce(
        (total, concept) => total + concept.aliasesAdded.length,
        0,
      ),
      minimumEvidenceFormCount: Math.min(
        ...semanticExpansion.concepts.flatMap((concept) =>
          concept.evidence.map((evidence) => evidence.formCount)),
      ),
      candidateInvalidReferences: collectInvalidReferences(semanticExpansion.candidateOntology),
      fieldTypeOutlierCount: semanticExpansion.concepts.reduce(
        (total, concept) => total + concept.evidence.reduce(
          (conceptTotal, evidence) => conceptTotal + evidence.fieldTypeOutlierCount,
          0,
        ),
        0,
      ),
      addressHarmonizationValid: semanticExpansion.addressHarmonization.validation.valid,
      addressComponentCount: semanticExpansion.addressHarmonization.validation.componentCount,
      addressBindingCount: semanticExpansion.addressHarmonization.validation.bindingCount,
      unresolvedAddressBindingCount:
        semanticExpansion.addressHarmonization.validation.unresolvedBindingCount,
    },
  };
  const artifact = {
    ...payload,
    integrity: {
      algorithm: 'sha256',
      payloadSha256: sha256(stableSerialize(payload)),
    },
  };

  const phaseRoot = assertExternalOutput(path.join(outputRoot, 'ontology-evolution', `phase${PHASE}`));
  const outputPath = assertExternalOutput(path.join(phaseRoot, `ontology-phase${PHASE}.json`));
  fs.mkdirSync(phaseRoot, { recursive: true });
  writeCandidate(outputPath, phaseRoot, artifact);

  const baselineManifestSha256After = sha256(fs.readFileSync(baselineManifestPath));
  if (baselineManifestSha256After !== payload.lineage.baselineManifestSha256) {
    fs.rmSync(outputPath, { force: true });
    throw new Error(`${BASELINE} changed while generating the Phase 31 artifact`);
  }

  process.stdout.write(`${JSON.stringify({
    phase: PHASE,
    status: artifact.status,
    outputPath: externalPath(outputPath),
    payloadSha256: artifact.integrity.payloadSha256,
    canonicalNodeCount: artifact.validation.canonicalNodeCount,
    bundleCount: artifact.validation.bundleCount,
    signaturesValid: artifact.validation.signaturesValid,
    invalidReferenceCount: artifact.validation.invalidReferences.length,
    expandedConceptCount: artifact.validation.expandedConceptCount,
    evidenceBackedAliasCount: artifact.validation.evidenceBackedAliasCount,
    minimumEvidenceFormCount: artifact.validation.minimumEvidenceFormCount,
    graphOnlyCodeCount: artifact.semanticExpansion.crossFormUnification.graphOnlyCodes.length,
    unificationBridgeCount: artifact.semanticExpansion.crossFormUnification.bridges.length,
    unresolvedGraphOnlyCodeCount:
      artifact.semanticExpansion.crossFormUnification.unresolvedGraphOnlyCodes.length,
    fieldTypeOutlierCount: artifact.validation.fieldTypeOutlierCount,
    addressComponentCount: artifact.validation.addressComponentCount,
    addressBindingCount: artifact.validation.addressBindingCount,
    unresolvedAddressBindingCount: artifact.validation.unresolvedAddressBindingCount,
    productionBaselineUnchanged: true,
    activationState: artifact.activation.state,
  }, null, 2)}\n`);
}

main();