const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  currentProductionSnapshot,
  diagnosticOutput,
  externalPath,
  productionSnapshot,
} = require('./artifact-output-paths.cjs');

const baselineArg = process.argv.slice(2).find((arg) => arg.startsWith('--baseline='));
const baselineRoot = baselineArg
  ? productionSnapshot(baselineArg.split('=')[1])
  : currentProductionSnapshot();

function readJson(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Missing required file: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function hashValue(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function main() {
  const manifest = readJson(path.join(baselineRoot, 'manifest.json'));
  const engine = readJson(path.join(baselineRoot, 'engine-state', 'production-state-snapshot.json'));
  const semantic = readJson(path.join(baselineRoot, 'semantic-error', 'index.json'));
  const restorePoint = manifest.restorePoint;
  const categoryCounts = semantic.summary?.categoryCounts || {};
  const domains = {
    semantic_label_mismatch: Number(engine.labelValueSemantic?.labelMismatchCount || 0),
    candidate_ranking_error: Number(engine.fillableFieldReconciliation?.candidateRankingErrorCount || 0),
    table_detection_error: Number(engine.tableSegmentation?.tableDetectionErrorCount || 0),
    suppression_error: Number(engine.groupingSuppression?.suppressionErrorCount || 0),
    grouping_error: Number(engine.groupingSuppression?.groupingErrorCount || 0),
    label_value_pairing_error: Number(engine.labelValueSemantic?.labelValuePairingErrorCount || 0),
    unmapped_fillable_field: Number(engine.fillableFieldReconciliation?.unmappedFillableFieldCount || 0),
  };
  const domainAlignment = Object.fromEntries(Object.entries(domains).map(([category, engineCount]) => {
    const semanticCount = Number(categoryCounts[category] || 0);
    return [category, { semanticCount, engineCount, delta: engineCount - semanticCount, aligned: engineCount === semanticCount }];
  }));
  const semanticOnlyCategories = {
    field_type_misclassification: Number(categoryCounts.field_type_misclassification || 0),
    checkbox_yes_no_pairing_error: Number(categoryCounts.checkbox_yes_no_pairing_error || 0),
  };
  const semanticTotal = Object.values(categoryCounts).reduce((sum, value) => sum + Number(value || 0), 0);
  const metricHash = hashValue(semantic.collapseAwareMetric);
  const ontologyHash = hashValue({ ontology: semantic.collapseAwareMetric?.ontology });
  const correctionDomains = [
    'groupingSuppression',
    'tableSegmentation',
    'fillableFieldReconciliation',
    'labelValueSemantic',
  ];
  const correctionEnablement = Object.fromEntries(correctionDomains.map((domain) => [domain, {
    activeReductionApplied: engine[domain]?.activeReductionApplied === true,
    mutationPropagationEnabled: engine[domain]?.mutationPropagationEnabled === true,
    correctionMode: engine[domain]?.correctionMode || null,
    aligned: engine[domain]?.activeReductionApplied === true &&
      engine[domain]?.mutationPropagationEnabled === true &&
      engine[domain]?.correctionMode === 'enabled',
  }]));
  const checks = {
    allMappedDomainsAligned: Object.values(domainAlignment).every((domain) => domain.aligned),
    semanticOnlyCategoriesConverged: Object.values(semanticOnlyCategories).every((count) => count === 0),
    semanticSummaryTotalAligned: semanticTotal === Number(semantic.summary?.errors || 0),
    semanticErrorsConverged: semanticTotal === 0,
    correctionDomainsEnabled: Object.values(correctionEnablement).every((domain) => domain.aligned),
    structuralCoverageComplete: Number(engine.structuralSchema?.structuralCoverage ?? engine.structuralSchema?.coverage) === 1,
    mutationPropagationEnabled: engine.mutationPropagation?.enabled === true,
    metricVersionAligned: engine.discrepancyMetric?.metricVersion === semantic.collapseAwareMetric?.metricVersion,
    ontologyAligned: engine.semanticTruthOntology?.ontology === semantic.collapseAwareMetric?.ontology,
    metricHashAligned: metricHash === manifest.integrity?.metricHash,
    ontologyHashAligned: ontologyHash === manifest.integrity?.ontologyHash,
    safeFreezePreserved: manifest.safeFreeze?.safeToFreeze === true,
    immutableBaseline: manifest.guardrails?.immutable === true,
  };
  const aligned = Object.values(checks).every(Boolean);
  const outputRoot = diagnosticOutput('mapping-engine-alignment', restorePoint);
  const report = {
    schemaVersion: 'mapping-engine-alignment-diagnostics.v1',
    generatedAt: new Date().toISOString(),
    baselineRestorePoint: restorePoint,
    baselinePath: externalPath(baselineRoot),
    outputPath: externalPath(outputRoot),
    aligned,
    checks,
    domainAlignment,
    semanticOnlyCategories,
    correctionEnablement,
    contracts: {
      metricVersion: semantic.collapseAwareMetric?.metricVersion,
      ontology: semantic.collapseAwareMetric?.ontology,
      metricHash,
      ontologyHash,
    },
    summary: {
      semanticTotalErrors: semanticTotal,
      engineDomainTotalErrors: Object.values(domains).reduce((sum, value) => sum + value, 0),
      alignedDomains: Object.values(domainAlignment).filter((domain) => domain.aligned).length,
      totalDomains: Object.keys(domainAlignment).length,
      structuralCoverage: Number((engine.structuralSchema?.structuralCoverage ?? engine.structuralSchema?.coverage) || 0),
      aligned,
    },
    guardrails: {
      baselineReadOnly: true,
      noPurge: true,
      noDiscrepancyRegeneration: true,
      noOntologyChange: true,
      noMetricModification: true,
    },
  };
  fs.mkdirSync(outputRoot, { recursive: true });
  const reportPath = path.join(outputRoot, 'mapping-engine-alignment-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  process.stdout.write(JSON.stringify({
    baselineRestorePoint: restorePoint,
    ...report.summary,
    metricVersion: report.contracts.metricVersion,
    ontology: report.contracts.ontology,
    reportPath: externalPath(reportPath),
  }, null, 2) + '\n');
  if (!aligned) process.exitCode = 1;
}

main();
