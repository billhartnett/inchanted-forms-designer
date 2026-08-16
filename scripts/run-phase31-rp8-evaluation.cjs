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

const PHASE31_PATH = assertExternalOutput(path.join(
  outputRoot,
  'ontology-evolution',
  'phase31',
  'ontology-phase31.json',
));
const OUTPUT_ROOT = assertExternalOutput(path.join(
  outputRoot,
  'ontology-evolution',
  'phase31',
  'rp8-evaluation',
));
const INPUTS = [
  'mapfields_backend_acord125.json',
  'mapfields_backend_contractors.json',
];

function readJson(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Missing required file: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
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
  return sha256(fs.readFileSync(filePath));
}

function selectedCandidate(mapping) {
  const sources = [
    ['wave9Decision', mapping.wave9Decision],
    ['chosen', mapping.chosen],
    ['topCandidate', mapping.topCandidate],
    ['suggestions[0]', mapping.suggestions?.[0]],
  ];
  const selected = sources.find(([, candidate]) => candidate?.acordCode);
  return selected ? { source: selected[0], candidate: selected[1] } : null;
}

function buildAlignmentIndex(candidate) {
  const aliases = new Map();
  for (const concept of candidate.semanticExpansion.concepts) {
    for (const alias of concept.aliasesAdded) {
      aliases.set(alias, {
        canonicalCode: concept.acordCode,
        reason: 'evidence-backed-alias',
        evidence: concept.evidence.find((item) => item.semanticPath === alias),
      });
    }
  }

  const bridges = new Map();
  for (const bridge of candidate.semanticExpansion.crossFormUnification.bridges) {
    for (const graphCode of bridge.graphCodes) {
      bridges.set(graphCode, {
        canonicalCode: bridge.canonicalCode,
        reason: 'cross-form-bridge',
        bridge,
      });
    }
  }

  const addressBindings = new Map();
  for (const component of candidate.semanticExpansion.addressHarmonization.components) {
    for (const binding of component.bindings) {
      for (const code of [binding.semanticPath, binding.graphCode].filter(Boolean)) {
        const current = addressBindings.get(code) || [];
        current.push({
          component: component.component,
          canonicalComponentId: component.canonicalComponentId,
          structure: binding.structure,
          status: binding.status,
          provenance: binding.provenance,
        });
        addressBindings.set(code, current);
      }
    }
  }
  return { aliases, bridges, addressBindings };
}

function resolveCode(code, index) {
  const alias = index.aliases.get(code);
  const bridge = index.bridges.get(code);
  const resolution = alias || bridge;
  return {
    beforeCode: code,
    afterCode: resolution?.canonicalCode || code,
    reason: resolution?.reason || 'unchanged',
    evidence: resolution?.evidence ? {
      semanticPath: resolution.evidence.semanticPath,
      formCount: resolution.evidence.formCount,
      instanceCount: resolution.evidence.instanceCount,
      dominantFieldType: resolution.evidence.dominantFieldType,
      fieldTypeOutlierCount: resolution.evidence.fieldTypeOutlierCount,
    } : null,
    bridge: resolution?.bridge ? {
      groupId: resolution.bridge.groupId,
      evidencePath: resolution.bridge.evidencePath,
      evidenceFormCount: resolution.bridge.evidenceFormCount,
    } : null,
    addressBindings: index.addressBindings.get(code) || [],
  };
}

function projectDecision(mapping, fixture, familyId, index) {
  const selected = selectedCandidate(mapping);
  if (!selected) {
    return {
      fixture,
      familyId,
      blockId: mapping.blockId,
      page: mapping.page,
      text: mapping.text,
      status: 'unmapped-preserved',
      rp7: null,
      phase31: null,
      delta: null,
    };
  }

  const candidate = selected.candidate;
  const resolution = resolveCode(candidate.acordCode, index);
  const confidence = Number(
    candidate.confidenceScore ?? candidate.normalizedConfidenceScore ?? 0,
  );
  const changed = resolution.afterCode !== resolution.beforeCode;
  const ontologyTouched = resolution.reason !== 'unchanged';
  return {
    fixture,
    familyId,
    blockId: mapping.blockId,
    page: mapping.page,
    text: mapping.text,
    status: changed
      ? 'canonical-code-change'
      : ontologyTouched
        ? 'canonical-code-preserved'
        : 'unchanged',
    rp7: {
      source: selected.source,
      acordCode: resolution.beforeCode,
      label: candidate.label || null,
      confidence,
      suppressed: Boolean(
        mapping.suppressionMetadata?.suppressed || mapping.wave9Suppression?.suppressed,
      ),
    },
    phase31: {
      acordCode: resolution.afterCode,
      confidence,
      rankingPosition: 1,
      activation: 'evaluation-only',
    },
    delta: {
      codeChanged: changed,
      confidenceDelta: 0,
      rankingChanged: false,
      reason: resolution.reason,
      evidence: resolution.evidence,
      bridge: resolution.bridge,
      addressBindings: resolution.addressBindings,
    },
  };
}

function buildMarkdown(report) {
  const lines = [
    '# RP-7 vs Phase 31 Mapping Decision Diff',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    'Phase 31 is evaluated offline and remains inactive. RP-7 remains the runtime baseline.',
    '',
    '## Summary',
    '',
    '| Metric | Value |',
    '|---|---:|',
    `| Captured mappings | ${report.summary.totalDecisions} |`,
    `| Canonical code changes | ${report.summary.changedDecisions} |`,
    `| Canonical codes preserved with Phase 31 evidence | ${report.summary.touchedButUnchangedDecisions} |`,
    `| Confidence changes | ${report.summary.confidenceChanges} |`,
    `| Ranking changes | ${report.summary.rankingChanges} |`,
    `| Unmapped decisions preserved | ${report.summary.unmappedDecisions} |`,
    '',
    '## Decision Changes',
    '',
    '| Fixture | Block | Page | Text | RP-7 | Phase 31 | Basis |',
    '|---|---|---:|---|---|---|---|',
  ];
  for (const decision of report.decisionDiffs) {
    const basis = [
      decision.delta.reason,
      decision.delta.evidence ? `${decision.delta.evidence.formCount}-form evidence` : null,
      decision.delta.bridge ? `bridge ${decision.delta.bridge.groupId}` : null,
      decision.delta.addressBindings.length
        ? `address ${decision.delta.addressBindings.map((item) => item.component).join(',')}`
        : null,
    ].filter(Boolean).join('; ');
    lines.push(`| ${decision.fixture} | ${decision.blockId} | ${decision.page} | ${String(decision.text || '').replace(/\|/g, '\\|')} | ${decision.rp7.acordCode} | ${decision.phase31.acordCode} | ${basis} |`);
  }
  lines.push(
    '',
    '## Bridge-Aligned Decisions Preserved',
    '',
    '| Fixture | Block | Page | Code | Bridge |',
    '|---|---|---:|---|---|',
  );
  for (const decision of report.preservedAlignments) {
    lines.push(`| ${decision.fixture} | ${decision.blockId} | ${decision.page} | ${decision.rp7.acordCode} | ${decision.delta.bridge?.groupId || 'n/a'} |`);
  }
  lines.push(
    '',
    '## Interpretation',
    '',
    '- Changes are canonical code projections, not live reranking results.',
    '- Confidence, rank position, suppression, geometry, field IDs, and page indices are preserved.',
    '- Address roles remain distinct under the Phase 31 harmonization policy.',
    '- Unresolved address bindings and graph-only codes are not promoted.',
    '',
  );
  return `${lines.join('\n')}\n`;
}

function main() {
  const candidateBytes = fs.readFileSync(PHASE31_PATH);
  const candidate = JSON.parse(candidateBytes.toString('utf8').replace(/^\uFEFF/, ''));
  const rp7ManifestPath = path.join(productionSnapshot('RP-7'), 'manifest.json');
  const rp7Bytes = fs.readFileSync(rp7ManifestPath);
  const rp7 = JSON.parse(rp7Bytes.toString('utf8').replace(/^\uFEFF/, ''));
  if (
    candidate.phase !== 31 ||
    candidate.status !== 'candidate' ||
    candidate.activation?.state !== 'inactive' ||
    rp7.restorePoint !== 'RP-7' ||
    rp7.readiness?.ontology !== 'phase30-semantic-truth-rewrite' ||
    rp7.guardrails?.immutable !== true
  ) {
    throw new Error('Phase 31 candidate or RP-7 baseline contract is invalid');
  }

  const index = buildAlignmentIndex(candidate);
  const inputRecords = INPUTS.map((relativePath) => {
    const filePath = path.join(repoRoot, relativePath);
    const document = readJson(filePath);
    return {
      relativePath,
      filePath,
      sha256: hashFile(filePath),
      document,
    };
  });
  const decisions = inputRecords.flatMap(({ document }) => {
    const familyId = document.mappings.find(
      (mapping) => mapping.familyOntologyResolverOutput?.familyId,
    )?.familyOntologyResolverOutput.familyId || 'unknown-family';
    return document.mappings.map((mapping) =>
      projectDecision(mapping, document.fixture, familyId, index));
  });
  const changed = decisions.filter((decision) => decision.status === 'canonical-code-change');
  const touched = decisions.filter((decision) => decision.status === 'canonical-code-preserved');
  const unmapped = decisions.filter((decision) => decision.status === 'unmapped-preserved');
  const generatedAt = new Date().toISOString();
  const summary = {
    totalDecisions: decisions.length,
    changedDecisions: changed.length,
    touchedButUnchangedDecisions: touched.length,
    unchangedDecisions: decisions.length - changed.length - touched.length - unmapped.length,
    unmappedDecisions: unmapped.length,
    confidenceChanges: decisions.filter(
      (decision) => decision.delta && decision.delta.confidenceDelta !== 0,
    ).length,
    rankingChanges: decisions.filter(
      (decision) => decision.delta && decision.delta.rankingChanged,
    ).length,
    fixtures: inputRecords.length,
  };
  const semanticTruthPayload = {
    schemaVersion: 'phase31-semantic-truth-rp8-evaluation.v1',
    generatedAt,
    status: 'evaluation-candidate',
    targetRestorePoint: 'RP-8',
    baseline: {
      restorePoint: 'RP-7',
      ontology: rp7.readiness.ontology,
      metricVersion: rp7.readiness.metricVersion,
      manifestSha256: sha256(rp7Bytes),
      runtimeBaselineUnchanged: true,
    },
    candidate: {
      phase: candidate.phase,
      phaseId: candidate.phaseId,
      payloadSha256: candidate.integrity.payloadSha256,
      fileSha256: sha256(candidateBytes),
      activationState: candidate.activation.state,
      addressHarmonizationSchema:
        candidate.semanticExpansion.addressHarmonization.schemaVersion,
      unificationGraphHash:
        candidate.semanticExpansion.crossFormUnification.graph.graphHash,
    },
    evaluationMode: {
      type: 'offline-decision-projection',
      runtimeChanged: false,
      productionBaselineChanged: false,
      confidencePreserved: true,
      rankingPreserved: true,
      suppressionPreserved: true,
      geometryPreserved: true,
      limitation: 'Projects captured RP-7 decisions through Phase 31 canonicalization; it does not claim live model reranking.',
    },
    inputs: inputRecords.map((input) => ({
      path: input.relativePath,
      fixture: input.document.fixture,
      mappingCount: input.document.mappings.length,
      sha256: input.sha256,
    })),
    summary,
    decisions,
  };
  semanticTruthPayload.integrity = {
    algorithm: 'sha256',
    payloadSha256: sha256(stableSerialize(semanticTruthPayload)),
  };

  const report = {
    schemaVersion: 'phase31-rp7-mapping-decision-diff.v1',
    generatedAt,
    baselineRestorePoint: 'RP-7',
    candidatePhase: 31,
    targetRestorePoint: 'RP-8',
    summary,
    byFixture: Object.fromEntries(inputRecords.map(({ document }) => {
      const fixtureDecisions = decisions.filter((decision) => decision.fixture === document.fixture);
      return [document.fixture, {
        totalDecisions: fixtureDecisions.length,
        changedDecisions: fixtureDecisions.filter(
          (decision) => decision.status === 'canonical-code-change',
        ).length,
        touchedButUnchangedDecisions: fixtureDecisions.filter(
          (decision) => decision.status === 'canonical-code-preserved',
        ).length,
      }];
    })),
    decisionDiffs: changed,
    preservedAlignments: touched,
    guardrails: {
      phase31Inactive: candidate.activation.state === 'inactive',
      rp7RuntimeBaselinePreserved: true,
      rp7ManifestReadOnly: true,
      noLiveRerankingClaim: true,
    },
  };
  report.integrity = {
    algorithm: 'sha256',
    payloadSha256: sha256(stableSerialize(report)),
  };

  fs.mkdirSync(OUTPUT_ROOT, { recursive: true });
  const truthPath = path.join(OUTPUT_ROOT, 'phase31-semantic-truth-rp8.json');
  const reportPath = path.join(OUTPUT_ROOT, 'rp7-to-phase31-mapping-diff.json');
  const markdownPath = path.join(OUTPUT_ROOT, 'rp7-to-phase31-mapping-diff.md');
  fs.writeFileSync(truthPath, `${JSON.stringify(semanticTruthPayload, null, 2)}\n`, 'utf8');
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(markdownPath, buildMarkdown(report), 'utf8');

  if (sha256(fs.readFileSync(rp7ManifestPath)) !== semanticTruthPayload.baseline.manifestSha256) {
    throw new Error('RP-7 changed during Phase 31 evaluation');
  }
  process.stdout.write(`${JSON.stringify({
    outputRoot: externalPath(OUTPUT_ROOT),
    semanticTruthPath: externalPath(truthPath),
    diffReportPath: externalPath(reportPath),
    markdownReportPath: externalPath(markdownPath),
    ...summary,
    phase31Inactive: report.guardrails.phase31Inactive,
    rp7RuntimeBaselinePreserved: report.guardrails.rp7RuntimeBaselinePreserved,
  }, null, 2)}\n`);
}

main();