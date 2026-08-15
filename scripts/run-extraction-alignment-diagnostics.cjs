const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  currentProductionSnapshot,
  diagnosticOutput,
  externalPath,
  productionSnapshot,
  repoRoot,
} = require('./artifact-output-paths.cjs');

const baselineArg = process.argv.slice(2).find((arg) => arg.startsWith('--baseline='));
const baselineName = baselineArg ? baselineArg.split('=')[1] : null;
const baselineRoot = baselineName ? productionSnapshot(baselineName) : currentProductionSnapshot();
const baselineManifest = readJson(path.join(baselineRoot, 'manifest.json'));
const restorePoint = baselineManifest.restorePoint;
const truthRoot = path.join(baselineRoot, 'truth-corpus');
const outputRoot = diagnosticOutput('extraction-alignment', restorePoint);

function readJson(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Missing required file: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function countBy(items, key) {
  return items.reduce((counts, item) => {
    const value = String(item?.[key] || 'unknown');
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
}

function sameCounts(left, right) {
  const keys = new Set([...Object.keys(left || {}), ...Object.keys(right || {})]);
  return [...keys].every((key) => Number(left?.[key] || 0) === Number(right?.[key] || 0));
}

function main() {
  const corpusManifest = readJson(path.join(truthRoot, 'manifest.json'));
  const results = corpusManifest.forms.map((formEntry) => {
    const datasetPath = path.join(truthRoot, formEntry.datasetFile);
    const dataset = readJson(datasetPath);
    const sourcePath = path.resolve(repoRoot, dataset.source.relativePath);
    const pages = Array.isArray(dataset.pages) ? dataset.pages : [];
    const fields = Array.isArray(dataset.fields) ? dataset.fields : [];
    const labels = Array.isArray(dataset.labels) ? dataset.labels : [];
    const tables = Array.isArray(dataset.tables) ? dataset.tables : [];
    const groups = Array.isArray(dataset.groups) ? dataset.groups : [];
    const diagnostics = Array.isArray(dataset.diagnostics) ? dataset.diagnostics : [];
    const pageByIndex = new Map(pages.map((page) => [page.index, page]));
    const invalidPageReferences = fields.filter((field) => {
      const page = pageByIndex.get(field.pageIndex);
      return !page || page.number !== field.pageNumber || page.sid !== field.pageSid;
    }).length;
    const fieldsWithGeometry = fields.filter((field) =>
      field.geometry && Number.isFinite(field.geometry.x) && Number.isFinite(field.geometry.y) &&
      Number.isFinite(field.geometry.width) && Number.isFinite(field.geometry.height),
    ).length;
    const fieldsWithResolvedLabels = fields.filter((field) => Boolean(field.label?.visualLabel || field.label?.helpLabel)).length;
    const boundFieldCount = fields.filter((field) => Boolean(field.binding?.dataPath || field.binding?.boundOption)).length;
    const unmappedFillableCount = fields.filter((field) => field.role === 'fillable-field' && field.semantic?.mapped !== true).length;
    const computed = {
      pageCount: pages.length,
      fieldCount: fields.length,
      fieldTypeCounts: countBy(fields, 'fieldType'),
      labelCount: labels.length,
      bindingCount: boundFieldCount,
      boundFieldCount,
      tableCount: tables.length,
      groupCount: groups.length,
      unmappedFillableCount,
      fieldsWithGeometry,
      fieldsWithResolvedLabels,
    };
    const expected = formEntry.statistics || dataset.statistics || {};
    const sourceExists = fs.existsSync(sourcePath);
    const sourceHash = sourceExists ? sha256(sourcePath) : null;
    const checks = {
      datasetExists: true,
      sourceExists,
      sourceHashMatchesDataset: sourceHash === dataset.source.sha256,
      sourceHashMatchesManifest: sourceHash === formEntry.sha256,
      pageCountAligned: computed.pageCount === expected.pageCount,
      fieldCountAligned: computed.fieldCount === expected.fieldCount,
      fieldTypesAligned: sameCounts(computed.fieldTypeCounts, expected.fieldTypeCounts),
      labelCountAligned: computed.labelCount === expected.labelCount,
      bindingCountAligned: computed.bindingCount === expected.bindingCount,
      tableCountAligned: computed.tableCount === expected.tableCount,
      groupCountAligned: computed.groupCount === expected.groupCount,
      geometryAligned: computed.fieldsWithGeometry === expected.fieldsWithGeometry,
      labelsResolved: computed.fieldsWithResolvedLabels === expected.fieldsWithResolvedLabels,
      noInvalidPageReferences: invalidPageReferences === 0,
      unmappedFillableFieldsAligned: unmappedFillableCount === expected.unmappedFillableCount,
      noDatasetErrors: diagnostics.filter((item) => item?.severity === 'error').length === 0,
    };
    return {
      sourceFile: formEntry.sourceFile,
      datasetFile: formEntry.datasetFile,
      aligned: Object.values(checks).every(Boolean),
      checks,
      computed,
      invalidPageReferences,
      diagnosticCount: diagnostics.length,
    };
  });

  const alignedForms = results.filter((result) => result.aligned).length;
  const report = {
    schemaVersion: 'extraction-alignment-diagnostics.v1',
    generatedAt: new Date().toISOString(),
    baselineRestorePoint: restorePoint,
    baselinePath: externalPath(baselineRoot),
    outputPath: externalPath(outputRoot),
    summary: {
      forms: results.length,
      alignedForms,
      misalignedForms: results.length - alignedForms,
      pages: results.reduce((sum, result) => sum + result.computed.pageCount, 0),
      fields: results.reduce((sum, result) => sum + result.computed.fieldCount, 0),
      fieldsWithGeometry: results.reduce((sum, result) => sum + result.computed.fieldsWithGeometry, 0),
      fieldsWithResolvedLabels: results.reduce((sum, result) => sum + result.computed.fieldsWithResolvedLabels, 0),
      invalidPageReferences: results.reduce((sum, result) => sum + result.invalidPageReferences, 0),
      aligned: alignedForms === results.length,
    },
    guardrails: {
      baselineReadOnly: true,
      noPurge: true,
      noOntologyChange: true,
      noMetricModification: true,
    },
    results,
  };
  fs.mkdirSync(outputRoot, { recursive: true });
  const reportPath = path.join(outputRoot, 'extraction-alignment-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  process.stdout.write(JSON.stringify({ ...report.summary, baselineRestorePoint: restorePoint, reportPath: externalPath(reportPath) }, null, 2) + '\n');
  if (!report.summary.aligned) process.exitCode = 1;
}

main();
