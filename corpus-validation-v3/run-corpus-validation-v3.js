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

  const overallReadiness = backendSemanticAccuracy >= 0.75 && designerVisualAccuracy >= 0.8 ? 'limited-production-ready-with-qa' : 'not-ready-for-full-production';

  const validationReport = {
    schemaVersion: 'corpus-validation-v3.v1',
    generatedAt: new Date().toISOString(),
    repositoryRoot: repoRoot,
    source: {
      engine: 'semantic-engine-v2',
      patchSet: 'designer-patches-v2',
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

  const outputRoot = path.join(repoRoot, 'corpus-validation-v3');
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
    schemaVersion: 'corpus-validation-v3-snapshots.v1',
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

  const backendPatch = {
    schemaVersion: 'final-refinements-v3-backend.v1',
    generatedAt: new Date().toISOString(),
    summary: 'Targeted residual fixes for ranking, typed blank inference, and label/value binding alignment.',
    microPatches: [
      { id: 'backend-01', target: 'backend/api/src/api/mapFields.ts', category: 'candidate_ranking_error', change: 'Promote explicit widget names ahead of weak OCR labels while retaining deterministic ranking gates.' },
      { id: 'backend-02', target: 'backend/api/src/extraction/hybridFieldExtraction.ts', category: 'field_type_misclassification', change: 'Tighten phone/fax/zip/year and date/currency/percentage typed-blank classification for XFDL and PDF widget formats.' },
      { id: 'backend-03', target: 'backend/api/src/extraction/hybridFieldExtraction.ts', category: 'label_value_pairing_error', change: 'Keep same-row label association and explicit widget semantic-value linkage even when text and widget boxes overlap.' },
      { id: 'backend-04', target: 'backend/api/src/extraction/hybridFieldExtraction.ts', category: 'unmapped_fillable_field', change: 'Persist explicit PDF widget IDs and merged semantic groups to avoid dropping fillable controls.' },
    ],
  };

  const designerPatch = {
    schemaVersion: 'final-refinements-v3-designer.v1',
    generatedAt: new Date().toISOString(),
    summary: 'Designer-side guardrails for suppression, label painting, and layout-safe table/group rendering.',
    microPatches: [
      { id: 'designer-01', target: 'frontend/src/components/designer/FieldRenderer.tsx', category: 'suppression_error', change: 'Do not render imported suppressed fields; hide DI text, questions, and decorative labels without affecting underlying semantic metadata.' },
      { id: 'designer-02', target: 'frontend/src/designer/ai/PdfImportModal.tsx', category: 'semantic_label_mismatch', change: 'Prefer explicit widget names and stable SIDs over OCR text labels when reconciling semantic labels on import.' },
      { id: 'designer-03', target: 'frontend/src/designer/ai/PdfImportModal.tsx', category: 'grouping_error', change: 'Preserve independent semanticGroupIds, row groups, choice sets, and address blocks while merging PDF widgets into the designer catalog.' },
      { id: 'designer-04', target: 'frontend/src/designer/ai/PdfImportModal.tsx', category: 'table_detection_error', change: 'Carry table metadata through widget replacement and retain row/column alignment for table-derived layouts.' },
    ],
  };

  const layoutPatch = {
    schemaVersion: 'final-refinements-v3-layout.v1',
    generatedAt: new Date().toISOString(),
    summary: 'Edge-case corrections for complex row/column boundaries and grouped address/table layouts.',
    corrections: [
      { id: 'layout-01', category: 'table_detection_error', target: 'table layout', pattern: 'Address or row-group tables with merged cells have a low margin around left label columns; enforce row and column context before grouping.' },
      { id: 'layout-02', category: 'grouping_error', target: 'address blocks', pattern: 'Keep address blocks independent from label/value pair identity and preserve row group membership in semanticGroups.' },
      { id: 'layout-03', category: 'suppression_error', target: 'question text', pattern: 'Suppress question text and DI presentation text even when they overlap with fillable widgets at the page edge.' },
      { id: 'layout-04', category: 'semantic_label_mismatch', target: 'widget name reconciliation', pattern: 'Use the same-row and same-column semantic label resolution for PDF widgets where adjacent label text is ambiguous.' },
    ],
  };

  const regressionTests = {
    schemaVersion: 'final-refinements-v3-tests.v1',
    generatedAt: new Date().toISOString(),
    summary: 'Regression checks for backend ranking, table alignment, grouping, suppression, and label-value reconciliation.',
    tests: [
      'node --test tests\\hybridFieldExtraction.test.cjs',
      'npm run build --prefix frontend',
      'node corpus-validation-v3/run-corpus-validation-v3.js',
      'Validate that all form results remain under the same form/field counts and no duplicate PDF assignments are introduced.',
      'Confirm table row/column group membership matches XFDL truth for edge-case layouts.',
    ],
  };

  const validationSteps = {
    schemaVersion: 'final-refinements-v3-validation.v1',
    generatedAt: new Date().toISOString(),
    steps: [
      'Run backend regression tests for hybrid extraction and typed-blank classification.',
      'Run frontend build to compile the renderer and PDF import path.',
      'Execute the corpus validation script across the merged XFDL/PDF truth set.',
      'Review visual diff snapshots and semantic diff snapshots for each form.',
      'Verify no imported suppressed text or question text is painted on the canvas.',
      'Confirm table row/column boundaries, grouping, and widget label reconciliation remain aligned with XFDL truth.',
    ],
  };

  const refinementRoot = path.join(repoRoot, 'final-refinements-v3');
  fs.mkdirSync(refinementRoot, { recursive: true });

  fs.writeFileSync(path.join(refinementRoot, 'backend-micro-patches.json'), JSON.stringify(backendPatch, null, 2));
  fs.writeFileSync(path.join(refinementRoot, 'designer-micro-patches.json'), JSON.stringify(designerPatch, null, 2));
  fs.writeFileSync(path.join(refinementRoot, 'layout-aware-corrections.json'), JSON.stringify(layoutPatch, null, 2));
  fs.writeFileSync(path.join(refinementRoot, 'updated-regression-tests.json'), JSON.stringify(regressionTests, null, 2));
  fs.writeFileSync(path.join(refinementRoot, 'updated-validation-steps.json'), JSON.stringify(validationSteps, null, 2));

  fs.writeFileSync(path.join(outputRoot, 'summary-report.json'), JSON.stringify(validationReport, null, 2));
  fs.writeFileSync(path.join(outputRoot, 'snapshot-manifest.json'), JSON.stringify(snapshotManifest, null, 2));

  const summaryMd = `# Corpus Validation v3

## Overview
- Paired forms evaluated: ${comparisonRows.length}
- Total truth fields: ${totalTruthFields}
- Total matched fields: ${totalMatchedFields}
- Total predicted fillable fields: ${totalPredictedFields}
- Total discrepancies: ${totalErrors}
- Backend semantic accuracy: ${(backendSemanticAccuracy * 100).toFixed(2)}%
- Designer visual accuracy: ${(designerVisualAccuracy * 100).toFixed(2)}%
- Table accuracy: ${(tableAccuracy * 100).toFixed(2)}%
- Checkbox/Yes-No accuracy: ${(checkboxAccuracy * 100).toFixed(2)}%
- Suppression accuracy: ${(suppressionAccuracy * 100).toFixed(2)}%
- Grouping accuracy: ${(groupingAccuracy * 100).toFixed(2)}%
- Label/value pairing accuracy: ${(labelValueAccuracy * 100).toFixed(2)}%

## Readiness
The system is evaluated as: ${overallReadiness}.

This is a useful validation checkpoint for supervised rollout, but it is not yet a blanket full-production signoff because residuals remain primarily in table layout, grouping, suppression, and semantic label reconciliation under complex edge-case forms.

## Remaining residuals
- backend residual: ${validationReport.residualClassificationBreakdown['backend residual']}
- designer residual: ${validationReport.residualClassificationBreakdown['designer residual']}
- layout-driven edge case: ${validationReport.residualClassificationBreakdown['layout-driven edge case']}
- corpus anomaly: ${validationReport.residualClassificationBreakdown['corpus anomaly']}

## Files generated
- summary-report.json
- snapshot-manifest.json
- visual-diffs/
- semantic-diffs/
- final-refinements-v3/
`;

  fs.writeFileSync(path.join(outputRoot, 'README.md'), summaryMd, 'utf8');

  const refinementReadme = `# Final Refinements v3

This package is intentionally small and targeted. It focuses on the residual issues that remain after the semantic-engine-v2 pass and the designer alignment pass.

## Included artifacts
- backend-micro-patches.json
- designer-micro-patches.json
- layout-aware-corrections.json
- updated-regression-tests.json
- updated-validation-steps.json

## Goal
Reduce the remaining edge-case error surface without broadening the mapper or reintroducing suppressed text, noisy overlays, or unstable group identities.
`;
  fs.writeFileSync(path.join(refinementRoot, 'README.md'), refinementReadme, 'utf8');

  console.log(JSON.stringify({
    outputRoot,
    pairedForms: comparisonRows.length,
    backendSemanticAccuracy,
    designerVisualAccuracy,
    overallReadiness,
    residuals: validationReport.residualClassificationBreakdown,
  }, null, 2));
}

main();
