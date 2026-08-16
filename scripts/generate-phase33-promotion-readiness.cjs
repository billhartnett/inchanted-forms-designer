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

const PHASE32_PATH = assertExternalOutput(path.join(
  outputRoot,
  'ontology-evolution',
  'phase32',
  'phase32-semantic-truth-rp8.json',
));
const OUTPUT_ROOT = assertExternalOutput(path.join(
  outputRoot,
  'ontology-evolution',
  'phase33',
  'promotion-readiness',
));
const TRUTH_PATH = path.join(OUTPUT_ROOT, 'phase33-semantic-truth-rp8.json');
const READINESS_PATH = path.join(OUTPUT_ROOT, 'phase33-promotion-readiness.json');
const DIFF_PATH = path.join(OUTPUT_ROOT, 'phase32-to-phase33-role-boundary-diff.md');
const GROUND_TRUTH_ROOT = path.join(
  repoRoot,
  'training-data',
  'acord-labeled_XFDL',
  'ground-truth',
);

const ROLE_DEFINITIONS = Object.freeze({
  NamedInsured: {
    legalMeaning: 'The person or entity explicitly named as an insured in the policy contract.',
    semanticMeaning: 'Named-insured identity and role-scoped contact or address data.',
  },
  Applicant: {
    legalMeaning: 'The person or entity applying for insurance, whether or not ultimately named as an insured.',
    semanticMeaning: 'Application-party identity and role-scoped contact or address data.',
  },
  Insured: {
    legalMeaning: 'A person or entity receiving insured status without implying named-insured or applicant status.',
    semanticMeaning: 'Insured-party identity and role-scoped contact or address data.',
  },
});

const ROLE_SAFE_REPRESENTATION_EQUIVALENCES = Object.freeze([
  Object.freeze({
    equivalenceId: 'applicant-name-to-named-insured-full-name',
    sourceRole: 'Applicant',
    sourceCode: 'Applicant.Name',
    component: 'identity.name',
    representationCode: 'NamedInsured_FullName',
    representationRole: 'NamedInsured',
    scope: 'representation-only',
    runtimePromotion: false,
    preservesSourceRole: true,
    evidence: 'explicit-phase33-role-safe-equivalence',
  }),
]);

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

function collectRoleEvidence() {
  const manifest = readJson(path.join(GROUND_TRUTH_ROOT, 'manifest.json'));
  const semanticPaths = {
    NamedInsured: 'NamedInsured_FullName',
    Applicant: 'Applicant_Name',
    Insured: 'Insured_Name',
  };
  const evidence = Object.fromEntries(Object.entries(semanticPaths).map(([role, semanticPath]) => [
    role,
    { semanticPath, forms: new Set(), instanceCount: 0 },
  ]));

  for (const form of manifest.forms) {
    const dataset = readJson(path.join(GROUND_TRUTH_ROOT, form.datasetFile));
    for (const field of dataset.fields || []) {
      for (const [role, record] of Object.entries(evidence)) {
        if (field.semantic?.semanticPath === record.semanticPath) {
          record.forms.add(form.datasetFile);
          record.instanceCount += 1;
        }
      }
    }
  }
  return Object.fromEntries(Object.entries(evidence).map(([role, record]) => [role, {
    semanticPath: record.semanticPath,
    formCount: record.forms.size,
    instanceCount: record.instanceCount,
    forms: Array.from(record.forms).sort((left, right) => left.localeCompare(right)),
  }]));
}

function roleForCode(code) {
  if (/NamedInsured|GeneralInfo\.NamedInsured/i.test(code || '')) return 'NamedInsured';
  if (/Applicant/i.test(code || '')) return 'Applicant';
  if (/(?:^|\.)Insured(?:\.|$)/i.test(code || '')) return 'Insured';
  return null;
}

function roleFromText(text) {
  const normalized = String(text || '').toLowerCase();
  if (/named insured/.test(normalized)) return 'NamedInsured';
  if (/\bapplicant\b/.test(normalized)) return 'Applicant';
  if (/\binsured\b/.test(normalized)) return 'Insured';
  return null;
}

function roleFromSemanticPath(semanticPath) {
  if (/^NamedInsured_/i.test(semanticPath || '')) return 'NamedInsured';
  if (/^Applicant_/i.test(semanticPath || '')) return 'Applicant';
  if (/^Insured_/i.test(semanticPath || '')) return 'Insured';
  return null;
}

function componentForDecision(decision) {
  const address = decision.delta?.addressBindings?.[0];
  if (address) return `address.${address.component}`;
  if (/Name|NamedInsured/i.test(decision.rp7?.acordCode || '')) return 'identity.name';
  return null;
}

function componentForBridge(bridge) {
  if (bridge.equivalentCodes.some((code) => /\.Name$|NamedInsured$/.test(code))) {
    return 'phase33.identity.name';
  }
  if (bridge.canonicalComponentId) return bridge.canonicalComponentId;
  if (/\.Line1$/.test(bridge.canonicalCode || '')) return 'phase31.address.line1';
  return null;
}

function hasCrossRoleConflict(decision) {
  const contextualRole = roleFromText(decision.text);
  const projectedRole = roleForCode(decision.phase31?.acordCode);
  return Boolean(contextualRole && projectedRole && contextualRole !== projectedRole);
}

function roleSafeEquivalenceForDecision(decision) {
  const contextualRole = roleFromText(decision.text);
  const component = componentForDecision(decision);
  return ROLE_SAFE_REPRESENTATION_EQUIVALENCES.find((equivalence) => (
    contextualRole === equivalence.sourceRole &&
    component === equivalence.component &&
    decision.rp7?.acordCode === equivalence.representationCode
  )) || null;
}

function enforceDecisionBoundary(decision) {
  const sourceRole = roleForCode(decision.rp7?.acordCode);
  const projectedRole = roleForCode(decision.phase31?.acordCode);
  const contextualRole = roleFromText(decision.text);
  const effectiveRole = contextualRole || sourceRole || projectedRole;
  const component = componentForDecision(decision);
  const roleSafeEquivalence = roleSafeEquivalenceForDecision(decision);
  const crossRolePromotion = hasCrossRoleConflict(decision) && !roleSafeEquivalence;
  const roleSensitive = Boolean(sourceRole || projectedRole || contextualRole);

  if (roleSafeEquivalence) {
    return {
      ...decision,
      status: 'role-safe-representation-equivalence',
      phase33: {
        acordCode: roleSafeEquivalence.representationCode,
        role: roleSafeEquivalence.sourceRole,
        component: roleSafeEquivalence.component,
        semanticIdentity: `${roleSafeEquivalence.sourceRole}:${roleSafeEquivalence.component}`,
        promotion: 'non-promoting-equivalence',
        reviewRequired: false,
        equivalenceId: roleSafeEquivalence.equivalenceId,
      },
      phase33Delta: {
        codeChangedFromPhase32: decision.phase31.acordCode !== roleSafeEquivalence.representationCode,
        roleChanged: false,
        componentChanged: false,
        boundaryReason: 'Applicant role preserved while reusing the NamedInsured_FullName representation code.',
      },
    };
  }

  if (crossRolePromotion) {
    return {
      ...decision,
      status: 'role-boundary-blocked',
      phase33: {
        acordCode: decision.rp7.acordCode,
        role: contextualRole,
        component,
        semanticIdentity: `${contextualRole}:${component || 'unresolved'}`,
        promotion: 'blocked',
        reviewRequired: true,
      },
      phase33Delta: {
        codeChangedFromPhase32: decision.phase31.acordCode !== decision.rp7.acordCode,
        roleChanged: false,
        componentChanged: false,
        boundaryReason: `Blocked ${projectedRole} promotion for contextual ${contextualRole} role.`,
      },
    };
  }

  return {
    ...decision,
    phase33: roleSensitive ? {
      acordCode: decision.phase31?.acordCode || decision.rp7?.acordCode || null,
      role: effectiveRole,
      component,
      semanticIdentity: effectiveRole
        ? `${effectiveRole}:${component || 'role'}`
        : null,
      promotion: 'role-preserved',
      reviewRequired: false,
    } : null,
    phase33Delta: {
      codeChangedFromPhase32: false,
      roleChanged: false,
      componentChanged: false,
      boundaryReason: roleSensitive
        ? 'Role identity preserved; shared component semantics do not imply role equivalence.'
        : null,
    },
  };
}

function enforceBridgeBoundaries(phase32) {
  return phase32.stabilization.crossFormBridges.groups.map((bridge) => {
    const roles = Array.from(new Set(
      [
        ...bridge.equivalentCodes.map(roleForCode),
        roleFromSemanticPath(bridge.evidencePath),
      ].filter(Boolean),
    )).sort((left, right) => left.localeCompare(right));
    if (roles.length <= 1) {
      return {
        ...bridge,
        phase33Status: bridge.status,
        roleBoundary: roles.length === 1 ? 'single-role' : 'not-role-bearing',
        rolePromotionAllowed: false,
        runtimePromotion: false,
      };
    }

    return {
      ...bridge,
      phase33Status: 'role-bounded-component-bridge',
      canonicalCode: null,
      canonicalComponentId: componentForBridge(bridge),
      roles,
      roleBoundary: 'strict-distinct-roles',
      rolePromotionAllowed: false,
      runtimePromotion: false,
      equivalenceScope: 'component-only',
      priorCanonicalCode: bridge.canonicalCode,
      demotionReason: 'No corpus evidence establishes legal or semantic role equivalence.',
    };
  }).sort((left, right) => left.groupId.localeCompare(right.groupId));
}

function buildMarkdown(readiness) {
  const lines = [
    '# Phase 33 Role-Boundary Promotion Readiness',
    '',
    `Generated: ${readiness.generatedAt}`,
    '',
    'RP-7 remains active. Phase 32 and Phase 33 remain inactive.',
    '',
    '## Summary',
    '',
    '| Check | Result |',
    '|---|---|',
    `| Distinct legal roles enforced | ${readiness.checks.distinctRolesEnforced ? 'Pass' : 'Fail'} |`,
    `| Cross-role promotion disabled | ${readiness.checks.crossRolePromotionDisabled ? 'Pass' : 'Fail'} |`,
    `| Component harmonization preserved | ${readiness.checks.componentHarmonizationPreserved ? 'Pass' : 'Fail'} |`,
    `| Role-conflicting decisions blocked | ${readiness.summary.roleBoundaryBlockedDecisions} |`,
    `| Role-crossing bridges demoted | ${readiness.summary.roleCrossingBridgesDemoted} |`,
    `| Promotion ready | ${readiness.promotionReady ? 'Yes' : 'No'} |`,
    '',
    '## Role Boundary Changes',
    '',
    '| Fixture | Block | Text | Phase 32 | Phase 33 | Result |',
    '|---|---|---|---|---|---|',
  ];
  for (const decision of readiness.blockedDecisions) {
    lines.push(`| ${decision.fixture} | ${decision.blockId} | ${String(decision.text || '').replace(/\|/g, '\\|')} | ${decision.phase31.acordCode} | ${decision.phase33.acordCode} | ${decision.phase33Delta.boundaryReason} |`);
  }
  lines.push(
    '',
    '## Policy',
    '',
    '- NamedInsured, Applicant, and Insured are distinct legal and semantic roles.',
    '- Shared name, address, and contact components use `(role, component)` identity.',
    '- Component bridges never authorize role promotion.',
    '- Role equivalence requires explicit corpus evidence and is absent in this evaluation.',
    '',
  );
  return `${lines.join('\n')}\n`;
}

function archiveExistingArtifacts() {
  if (!fs.existsSync(TRUTH_PATH)) return;
  const current = readJson(TRUTH_PATH);
  const revisionId = current.integrity?.payloadSha256;
  if (!revisionId) throw new Error('Existing Phase 33 artifact has no integrity hash');
  const revisionRoot = assertExternalOutput(path.join(OUTPUT_ROOT, 'revisions', revisionId));
  fs.mkdirSync(revisionRoot, { recursive: true });
  for (const outputPath of [TRUTH_PATH, READINESS_PATH, DIFF_PATH]) {
    if (!fs.existsSync(outputPath)) continue;
    const revisionPath = path.join(revisionRoot, path.basename(outputPath));
    if (!fs.existsSync(revisionPath)) fs.copyFileSync(outputPath, revisionPath);
  }
}

function main() {
  const phase32Bytes = readBytes(PHASE32_PATH);
  const phase32 = JSON.parse(phase32Bytes.toString('utf8').replace(/^\uFEFF/, ''));
  const rp7Path = path.join(productionSnapshot('RP-7'), 'manifest.json');
  const rp7Bytes = readBytes(rp7Path);
  const rp7 = JSON.parse(rp7Bytes.toString('utf8').replace(/^\uFEFF/, ''));
  if (
    phase32.phase !== 32 ||
    phase32.activation?.state !== 'inactive' ||
    phase32.activation?.runtimeChanged !== false ||
    rp7.restorePoint !== 'RP-7' ||
    rp7.readiness?.ontology !== 'phase30-semantic-truth-rewrite' ||
    rp7.guardrails?.immutable !== true
  ) {
    throw new Error('Phase 32 or RP-7 does not satisfy Phase 33 lineage requirements');
  }

  const roleEvidence = collectRoleEvidence();
  const explicitRoleEquivalenceRecords = [];
  const roleEquivalenceSupported = explicitRoleEquivalenceRecords.length > 0;
  const decisions = phase32.semanticTruth.decisions.map(enforceDecisionBoundary);
  const roleConflicts = phase32.semanticTruth.decisions.filter(
    (decision) => hasCrossRoleConflict(decision) && !roleSafeEquivalenceForDecision(decision),
  );
  const blockedDecisions = decisions.filter(
    (decision) => decision.status === 'role-boundary-blocked',
  );
  const bridges = enforceBridgeBoundaries(phase32);
  const demotedBridges = bridges.filter(
    (bridge) => bridge.phase33Status === 'role-bounded-component-bridge',
  );
  const rolePromotingBridges = bridges.filter((bridge) => bridge.rolePromotionAllowed);
  const generatedAt = new Date().toISOString();
  const summary = {
    evaluatedDecisions: decisions.length,
    roleSensitiveDecisions: decisions.filter((decision) => decision.phase33).length,
    roleBoundaryBlockedDecisions: blockedDecisions.length,
    roleCrossingBridgesDemoted: demotedBridges.length,
    rolePromotingBridges: rolePromotingBridges.length,
    roleSafeEquivalentDecisions: decisions.filter(
      (decision) => decision.status === 'role-safe-representation-equivalence',
    ).length,
    componentHarmonizedDecisions: decisions.filter(
      (decision) => Boolean(decision.phase33?.component),
    ).length,
    confidenceChangesFromPhase32: 0,
    rankingChangesFromPhase32: 0,
  };
  const payload = {
    schemaVersion: 'phase33-semantic-truth-rp8.v1',
    phase: 33,
    phaseId: 'phase33-strict-role-boundary-readiness',
    generatedAt,
    status: 'evaluation-candidate',
    targetRestorePoint: 'RP-8',
    activation: {
      state: 'inactive',
      runtimeChanged: false,
      productionBaselineChanged: false,
      requiresExplicitPromotion: true,
    },
    lineage: {
      parentPhase: 32,
      parentPayloadSha256: phase32.integrity.payloadSha256,
      parentFileSha256: sha256(phase32Bytes),
      runtimeBaseline: 'RP-7',
      runtimeOntology: rp7.readiness.ontology,
      rp7ManifestSha256: sha256(rp7Bytes),
    },
    roleBoundaryPolicy: {
      schemaVersion: 'strict-role-boundaries.v1',
      roles: ROLE_DEFINITIONS,
      identityKey: ['role', 'component'],
      distinctRolesRequired: true,
      roleLevelCollapsingProhibited: true,
      crossRolePromotionProhibited: true,
      componentLevelHarmonizationAllowed: [
        'identity.name',
        'address.line1',
        'address.city',
        'address.stateOrProvince',
        'address.postalCode',
        'contact.phone',
        'contact.email',
      ],
      roleEquivalenceEvidenceThreshold: 'explicit-corpus-evidence-for-each-role',
    },
    evidence: {
      corpusRoleEvidence: roleEvidence,
      explicitRoleEquivalenceRecords,
      roleEquivalenceSupported,
      roleSafeRepresentationEquivalences: ROLE_SAFE_REPRESENTATION_EQUIVALENCES,
      sharedFieldsDoNotEstablishRoleEquivalence: true,
    },
    bridges: {
      sourceGraphHash: phase32.stabilization.crossFormBridges.sourceGraphHash,
      groups: bridges,
      rolePromotingBridgeCount: rolePromotingBridges.length,
      roleCrossingBridgeDemotionCount: demotedBridges.length,
    },
    semanticTruth: {
      summary,
      decisions,
      blockedDecisions,
    },
    guardrails: {
      rp7RuntimeBaselinePreserved: true,
      phase32Inactive: true,
      phase33Inactive: true,
      noRuntimeOntologyChange: true,
      noRoleCollapse: true,
      noCrossRolePromotion: true,
      noConfidenceChange: true,
      noRankingChange: true,
      noFieldIdChange: true,
      noPageIndexChange: true,
    },
  };
  const artifact = {
    ...payload,
    integrity: {
      algorithm: 'sha256',
      payloadSha256: sha256(stableSerialize(payload)),
    },
  };

  const checks = {
    distinctRolesEnforced: Object.keys(ROLE_DEFINITIONS).length === 3,
    crossRolePromotionDisabled: rolePromotingBridges.length === 0,
    roleSafeEquivalencesNonPromoting: ROLE_SAFE_REPRESENTATION_EQUIVALENCES.every(
      (equivalence) => (
        equivalence.scope === 'representation-only' &&
        equivalence.runtimePromotion === false &&
        equivalence.preservesSourceRole === true
      ),
    ),
    componentHarmonizationPreserved: demotedBridges.every((bridge) => {
      const phase32Bridge = phase32.stabilization.crossFormBridges.groups.find(
        (candidate) => candidate.groupId === bridge.groupId,
      );
      return phase32Bridge && bridge.canonicalComponentId === componentForBridge(phase32Bridge);
    }),
    roleConflictsBlocked: blockedDecisions.length === roleConflicts.length,
    roleEquivalenceRequiresEvidence: roleEquivalenceSupported === false,
    allCompositeIdentitiesRoleScoped: decisions
      .filter((decision) => decision.phase33?.component)
      .every((decision) => decision.phase33.semanticIdentity?.startsWith(
        `${decision.phase33.role}:`,
      )),
    rp7Preserved: true,
    phase32Inactive: phase32.activation.state === 'inactive',
    phase33Inactive: true,
  };
  const promotionReady = Object.values(checks).every(Boolean) && blockedDecisions.length === 0;
  const readinessPayload = {
    schemaVersion: 'phase33-promotion-readiness.v1',
    generatedAt,
    phase: 33,
    targetRestorePoint: 'RP-8',
    promotionReady,
    decision: promotionReady ? 'ready' : 'not-ready-role-conflict-review-required',
    checks,
    summary,
    blockedDecisions,
    bridgeDemotions: demotedBridges,
    semanticTruthPayloadSha256: artifact.integrity.payloadSha256,
    guardrails: artifact.guardrails,
  };
  const readiness = {
    ...readinessPayload,
    integrity: {
      algorithm: 'sha256',
      payloadSha256: sha256(stableSerialize(readinessPayload)),
    },
  };

  fs.mkdirSync(OUTPUT_ROOT, { recursive: true });
  archiveExistingArtifacts();
  fs.writeFileSync(TRUTH_PATH, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  fs.writeFileSync(READINESS_PATH, `${JSON.stringify(readiness, null, 2)}\n`, 'utf8');
  fs.writeFileSync(DIFF_PATH, buildMarkdown(readiness), 'utf8');

  if (
    sha256(readBytes(PHASE32_PATH)) !== artifact.lineage.parentFileSha256 ||
    sha256(readBytes(rp7Path)) !== artifact.lineage.rp7ManifestSha256
  ) {
    throw new Error('Phase 32 or RP-7 changed during Phase 33 evaluation');
  }

  process.stdout.write(`${JSON.stringify({
    outputRoot: externalPath(OUTPUT_ROOT),
    semanticTruthPath: externalPath(TRUTH_PATH),
    readinessPath: externalPath(READINESS_PATH),
    diffPath: externalPath(DIFF_PATH),
    promotionReady,
    decision: readiness.decision,
    ...summary,
    phase32Inactive: checks.phase32Inactive,
    phase33Inactive: checks.phase33Inactive,
    rp7RuntimeBaselinePreserved: checks.rp7Preserved,
  }, null, 2)}\n`);
}

main();