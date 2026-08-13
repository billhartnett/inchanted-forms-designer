const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const semanticIndexPath = path.join(repoRoot, 'semantic-patches', 'semantic-errors', 'index.json');
const groundTruthManifestPath = path.join(repoRoot, 'training-data', 'acord-labeled_XFDL', 'ground-truth', 'manifest.json');

const categoryOrder = [
  'semantic_label_mismatch',
  'candidate_ranking_error',
  'field_type_misclassification',
  'table_detection_error',
  'checkbox_yes_no_pairing_error',
  'suppression_error',
  'grouping_error',
  'label_value_pairing_error',
  'unmapped_fillable_field',
];

function slugify(value) {
  return String(value || 'form')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'form';
}

function classifyResidual(form) {
  const truthFields = Number(form.counts?.truthFields || 0);
  const counts = form.categoryCounts || {};
  const total = Number(form.counts?.errors || Object.values(counts).reduce((sum, n) => sum + Number(n || 0), 0));
  const backendSignals = [
    Number(counts.candidate_ranking_error || 0),
    Number(counts.field_type_misclassification || 0),
    Number(counts.label_value_pairing_error || 0),
    Number(counts.unmapped_fillable_field || 0),
  ].reduce((sum, value) => sum + value, 0);
  const designerSignals = [
    Number(counts.semantic_label_mismatch || 0),
    Number(counts.suppression_error || 0),
    Number(counts.grouping_error || 0),
  ].reduce((sum, value) => sum + value, 0);
  const layoutSignals = Number(counts.table_detection_error || 0);

  if (layoutSignals > 0 && layoutSignals >= Math.max(60, Math.round(truthFields * 0.12))) {
    return 'layout-driven edge case';
  }
  if (designerSignals > backendSignals && designerSignals >= Math.max(80, Math.round(total * 0.18))) {
    return 'designer residual';
  }
  if (backendSignals > designerSignals && backendSignals >= Math.max(90, Math.round(total * 0.18))) {
    return 'backend residual';
  }
  if (total <= 75) {
    return 'corpus anomaly';
  }
  return 'backend residual';
}

function buildSvgBars(title, data, width = 700, height = 180) {
  const max = Math.max(1, ...Object.values(data));
  const barWidth = (width - 120) / data.length;
  const rects = Object.entries(data).map(([label, value], index) => {
    const x = 30 + index * barWidth + 12;
    const h = Math.max(10, (value / max) * 120);
    const y = height - 28 - h;
    return `
      <g>
        <rect x="${x}" y="${y}" width="${Math.max(10, barWidth - 20)}" height="${h}" fill="#2563eb" opacity="0.8" rx="4"/>
        <text x="${x + 2}" y="${height - 8}" font-size="9" fill="#0f172a">${label.slice(0, 4)}</text>
      </g>`;
  }).join('');

  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="100%" height="100%" fill="#f8fafc"/>
    <text x="20" y="22" font-size="18" font-family="Arial" fill="#0f172a">${title}</text>
    ${rects}
  </svg>
  `;
}

function writeSnapshotSvg(outDir, fileName, title, data) {
  const svg = buildSvgBars(title, data);
  fs.writeFileSync(path.join(outDir, fileName), svg, 'utf8');
}

function main() {
  if (!fs.existsSync(semanticIndexPath)) {
    throw new Error(`Missing semantic discrepancy index: ${semanticIndexPath}`);
  }

  const semanticIndex = JSON.parse(fs.readFileSync(semanticIndexPath, 'utf8'));
  const groundTruthManifest = JSON.parse(fs.readFileSync(groundTruthManifestPath, 'utf8'));

  const formEntries = semanticIndex.forms || [];
  const comparisonRows = formEntries.map((entry) => {
    const form = entry.form || {};
    const counts = entry.counts || {};
    const categoryCounts = entry.categoryCounts || {};
    const formName = form.xfdlFile || 'unknown-form';
    const errorTotal = Number(counts.errors || Object.values(categoryCounts).reduce((sum, value) => sum + Number(value || 0), 0));
    const classified = classifyResidual(entry);
    const snapshotBase = slugify(form.xfdlFile || formName);

    return {
      form: formName,
      datasetFile: form.xfdlDatasetFile || `${snapshotBase}.ground-truth.json`,
      pdfFile: form.pdfFile || `${snapshotBase}.pdf`,
      pairStatus: form.pairStatus || 'matched',
      pairConfidence: form.pairConfidence || 'medium',
      counts: {
        truthFields: Number(counts.truthFields || 0),
        predictedFillableFields: Number(counts.predictedFillableFields || 0),
        matchedFields: Number(counts.matchedFields || 0),
        promotedFields: Number(counts.promotedFields || 0),
        errors: errorTotal,
      },
      categoryCounts,
      classification: classified,
      visualDiffSnapshot: `visual-diffs/${snapshotBase}.svg`,
      semanticDiffSnapshot: `semantic-diffs/${snapshotBase}.svg`,
      rootCauseNotes: {
        primaryCategory: categoryOrder
          .map((key) => ({ key, value: Number(categoryCounts[key] || 0) }))
          .sort((left, right) => right.value - left.value)[0]?.key || 'none',
        residualType: classified,
      },
    };
  });

  const totalTruthFields = comparisonRows.reduce((sum, row) => sum + Number(row.counts.truthFields || 0), 0);
  const totalMatchedFields = comparisonRows.reduce((sum, row) => sum + Number(row.counts.matchedFields || 0), 0);
  const totalPredictedFields = comparisonRows.reduce((sum, row) => sum + Number(row.counts.predictedFillableFields || 0), 0);
  const totalErrors = comparisonRows.reduce((sum, row) => sum + Number(row.counts.errors || 0), 0);

  const categoryTotals = categoryOrder.reduce((acc, key) => {
    acc[key] = comparisonRows.reduce((sum, row) => sum + Number((row.categoryCounts || {})[key] || 0), 0);
    return acc;
  }, {});

  const backendSemanticAccuracy = totalTruthFields === 0 ? 0 : Number((totalMatchedFields / totalTruthFields).toFixed(4));
  const designerVisualAccuracy = totalTruthFields === 0 ? 0 : Number((1 - (categoryTotals.semantic_label_mismatch + categoryTotals.suppression_error + categoryTotals.table_detection_error + categoryTotals.grouping_error) / totalTruthFields).toFixed(4));
  const tableAccuracy = totalTruthFields === 0 ? 0 : Number((1 - (categoryTotals.table_detection_error / totalTruthFields)).toFixed(4));
  const checkboxAccuracy = totalTruthFields === 0 ? 0 : Number((1 - (categoryTotals.checkbox_yes_no_pairing_error / totalTruthFields)).toFixed(4));
  const suppressionAccuracy = totalTruthFields === 0 ? 0 : Number((1 - (categoryTotals.suppression_error / totalTruthFields)).toFixed(4));
  const groupingAccuracy = totalTruthFields === 0 ? 0 : Number((1 - (categoryTotals.grouping_error / totalTruthFields)).toFixed(4));
  const labelValueAccuracy = totalTruthFields === 0 ? 0 : Number((1 - (categoryTotals.label_value_pairing_error / totalTruthFields)).toFixed(4));
  const unmappedFillableAccuracy = totalTruthFields === 0 ? 0 : Number((1 - (categoryTotals.unmapped_fillable_field / totalTruthFields)).toFixed(4));

  const overallReadiness = backendSemanticAccuracy >= 0.78 && designerVisualAccuracy >= 0.83 && groupingAccuracy >= 0.85 ? 'phase8-rule-pass' : 'not-ready-for-full-production';

  const validationReport = {
    schemaVersion: 'corpus-validation-v8.v1',
    generatedAt: new Date().toISOString(),
    repositoryRoot: repoRoot,
    source: {
      engine: 'semantic-engine-v2',
      patchSet: 'phase8-continued-table-suppression-grouping-v8',
      groundTruthManifest: 'training-data/acord-labeled_XFDL/ground-truth/manifest.json',
      discrepancyIndex: 'semantic-patches/semantic-errors/index.json',
    },
    overview: {
      pairedForms: comparisonRows.length,
      totalTruthFields,
      totalPredictedFillableFields: totalPredictedFields,
      totalMatchedFields,
      totalErrors,
      averageErrorsPerForm: totalErrors / Math.max(1, comparisonRows.length),
      matchedRate: Number((totalMatchedFields / totalTruthFields).toFixed(4)),
      readiness: overallReadiness,
    },
    accuracy: {
      backendSemanticAccuracy,
      designerVisualAccuracy,
      tableAccuracy,
      checkboxYesNoAccuracy: checkboxAccuracy,
      suppressionAccuracy,
      groupingAccuracy,
      labelValuePairingAccuracy: labelValueAccuracy,
      unmappedFillableAccuracy,
    },
    categoryTotals,
    formResults: comparisonRows,
    residualClassificationBreakdown: {
      'backend residual': comparisonRows.filter((row) => row.classification === 'backend residual').length,
      'designer residual': comparisonRows.filter((row) => row.classification === 'designer residual').length,
      'layout-driven edge case': comparisonRows.filter((row) => row.classification === 'layout-driven edge case').length,
      'corpus anomaly': comparisonRows.filter((row) => row.classification === 'corpus anomaly').length,
    },
  };

  const outputRoot = path.join(repoRoot, 'corpus-validation-v8');
  const visualRoot = path.join(outputRoot, 'visual-diffs');
  const semanticRoot = path.join(outputRoot, 'semantic-diffs');
  fs.mkdirSync(visualRoot, { recursive: true });
  fs.mkdirSync(semanticRoot, { recursive: true });

  comparisonRows.forEach((row) => {
    const data = row.categoryCounts || {};
    writeSnapshotSvg(visualRoot, path.basename(row.visualDiffSnapshot), `${row.form} visual diff`, {
      semantic: Number(data.semantic_label_mismatch || 0),
      suppression: Number(data.suppression_error || 0),
      table: Number(data.table_detection_error || 0),
      grouping: Number(data.grouping_error || 0),
    });

    writeSnapshotSvg(semanticRoot, path.basename(row.semanticDiffSnapshot), `${row.form} semantic diff`, {
      ranking: Number(data.candidate_ranking_error || 0),
      type: Number(data.field_type_misclassification || 0),
      checkbox: Number(data.checkbox_yes_no_pairing_error || 0),
      labelValue: Number(data.label_value_pairing_error || 0),
      unmatched: Number(data.unmapped_fillable_field || 0),
    });
  });

  const snapshotManifest = {
    schemaVersion: 'corpus-validation-v8-snapshots.v1',
    generatedAt: new Date().toISOString(),
    forms: comparisonRows.map((row) => ({
      form: row.form,
      pairStatus: row.pairStatus,
      pdfFile: row.pdfFile,
      visualDiffSnapshot: row.visualDiffSnapshot,
      semanticDiffSnapshot: row.semanticDiffSnapshot,
      classification: row.classification,
    })),
  };

  fs.writeFileSync(path.join(outputRoot, 'summary-report.json'), JSON.stringify(validationReport, null, 2), 'utf8');
  fs.writeFileSync(path.join(outputRoot, 'snapshot-manifest.json'), JSON.stringify(snapshotManifest, null, 2), 'utf8');
  fs.writeFileSync(path.join(outputRoot, 'README.md'), [
    '# Corpus Validation v8',
    '',
    'Generated from the continued Phase 8 semantic rule synthesis pass covering table boundary detection, grouping logic, suppression refinement, and unmapped fillable-field resolution.',
    '',
    `- Paired forms: ${comparisonRows.length}`,
    `- Total truth fields: ${totalTruthFields}`,
    `- Matched fields: ${totalMatchedFields}`,
    `- Predicted fillable fields: ${totalPredictedFields}`,
    `- Total discrepancies: ${totalErrors}`,
    `- Readiness: ${overallReadiness}`,
    '',
    'This validation reflects the next deterministic refinement pass against the merged XFDL/PDF corpus.',
    '',
  ].join('\n'), 'utf8');
}

main();
