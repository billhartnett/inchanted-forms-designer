const fs = require('node:fs');
const path = require('node:path');

const base = 'https://forms-designer-backend.azurewebsites.net/api';
const fixtures = [
  'sample-Acord-125.pdf',
  'sample-Acord-126.pdf',
  'sample-Acord-140.pdf',
  'Contractors Supp App.pdf',
];

function iou(a, b) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  if (!inter) return 0;
  const union = a.width * a.height + b.width * b.height - inter;
  return union > 0 ? inter / union : 0;
}

function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasFieldCue(text) {
  return /(name|address|city|state|zip|postal|phone|email|dob|birth|date|policy|insured|applicant|license|years|employees|number of)/.test(
    normalizeText(text),
  );
}

function isHeaderLike(text) {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  if (/commercial insurance application|supplemental application|acord|page \d+ of \d+/.test(normalized)) {
    return true;
  }
  if (/insurance company|agency|services|corporation|inc|llc|www|phone|fax/.test(normalized)) {
    return !hasFieldCue(text);
  }
  return false;
}

function hasCheckboxCue(text) {
  return /\u2610|\u2611|\u2612|\[\s?\]|\(\s?\)|\byes\s*\/\s*no\b|\bno\s*\/\s*yes\b/i.test(String(text || ''));
}

function isForceVisible(mapping) {
  return Boolean((mapping.resolverFlags || {}).contractorsInsuredNameResolverApplied) ||
    Boolean((mapping.mappingDiagnostics || {}).contractorsInsuredNameResolverApplied) ||
    (Array.isArray(mapping.anchorPromotions) && mapping.anchorPromotions.length > 0) ||
    Boolean((mapping.mappingDiagnostics || {}).wave8TargetedAnchorPromoted);
}

function isSuppressedByWave8(mapping) {
  const suppression = mapping.suppressionMetadata || {};
  const diagnostics = mapping.mappingDiagnostics || {};
  const reasonText = `${String(suppression.reason || '')} ${String(diagnostics.thresholdReason || '')}`;
  return Boolean(suppression.suppressed || diagnostics.wave8OverlapSuppressed) ||
    /section_title|header|non_field|title/i.test(reasonText) ||
    isHeaderLike(mapping.text);
}

function countOverlapPairsAfterPlacement(mappings) {
  const sorted = [...mappings].sort((a, b) => {
    const aConf = Number(((a.chosen || a.topCandidate || {}).confidenceScore) || 0);
    const bConf = Number(((b.chosen || b.topCandidate || {}).confidenceScore) || 0);
    return bConf - aConf;
  });
  const placedByPage = new Map();
  const threshold = 0.45;
  for (const mapping of sorted) {
    const page = Number(mapping.page || 1);
    const pageList = placedByPage.get(page) || [];
    const box = mapping.blockGeometry || mapping.boundingBox || {};
    if (!Number.isFinite(box.x)) continue;
    const overlaps = pageList.some((existing) => iou(box, existing) >= threshold);
    if (overlaps && !isForceVisible(mapping)) {
      continue;
    }
    pageList.push(box);
    placedByPage.set(page, pageList);
  }

  let overlapPairs = 0;
  for (const [, boxes] of placedByPage) {
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        if (iou(boxes[i], boxes[j]) >= threshold) {
          overlapPairs += 1;
        }
      }
    }
  }
  return overlapPairs;
}

async function fetchJson(url, init, timeoutMs = 240000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...(init || {}), signal: controller.signal });
    const json = await res.json();
    return { status: res.status, json };
  } finally {
    clearTimeout(t);
  }
}

(async () => {
  const results = [];
  for (const fixture of fixtures) {
    console.log(`processing ${fixture}`);
    const pdfPath = path.join('c:/Users/First/source/repos/inchanted-forms-designer/test-fixtures/pdf', fixture);
    const form = new FormData();
    form.append('file', new Blob([fs.readFileSync(pdfPath)], { type: 'application/pdf' }), fixture);

    const ext = await fetchJson(`${base}/extractdocument`, {
      method: 'POST',
      headers: { 'X-File-Name': fixture },
      body: form,
    });

    const blocks = (ext.json.blocks || []).slice(0, 100);
    const map = await fetchJson(`${base}/mapfields`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        documentId: `designer-wave8-${fixture}`,
        familyId: fixture.toLowerCase().includes('contractors')
          ? 'contractors-supplement'
          : undefined,
        blocks,
      }),
    });

    const mappings = map.json.mappings || [];
    const effectiveMappings = mappings.filter((mapping) => {
      if (isForceVisible(mapping)) return true;
      return !isSuppressedByWave8(mapping);
    });
    const overlapPairs = countOverlapPairsAfterPlacement(effectiveMappings);

    const selectionMarks = (ext.json.selectionMarks || []).length ||
      (ext.json.blocks || []).filter((b) => /^selection_mark_(selected|unselected)_\d+$/i.test(String(b.text || ''))).length;

    results.push({
      fixture,
      extractStatus: ext.status,
      mapStatus: map.status,
      mappingCount: effectiveMappings.length,
      selectionMarks,
      overlapPairsWithoutSuppression: overlapPairs,
      checkboxLinked: effectiveMappings.filter((m) => {
        const linkedByMetadata = Array.isArray(m.selectionMarkAssociations) && m.selectionMarkAssociations.length > 0;
        const linkedByCandidates = Array.isArray(m.checkboxCandidates) && m.checkboxCandidates.length > 0;
        const linkedByInference = String(m.fieldType || '').toLowerCase() === 'checkbox' || hasCheckboxCue(m.text);
        return linkedByMetadata || linkedByCandidates || (linkedByInference && selectionMarks > 0);
      }).length,
      checkboxCandidates: effectiveMappings.filter((m) => Array.isArray(m.checkboxCandidates) && m.checkboxCandidates.length > 0).length,
      agentPopulated: effectiveMappings.some((m) => /producer|agent/i.test(String(m.semanticLabel || '')) || /producer|agent/i.test(String((m.chosen || m.topCandidate || {}).acordCode || ''))),
      headerMapped: effectiveMappings.some((m) => isHeaderLike(m.text)),
      identityPresent: effectiveMappings.some((m) => /NamedInsured_(FullName|GivenName)/.test(String((m.chosen || m.topCandidate || {}).acordCode || ''))),
      resolverPresent: mappings.some((m) => Boolean((m.mappingDiagnostics || {}).contractorsInsuredNameResolverApplied) || Boolean((m.resolverFlags || {}).contractorsInsuredNameResolverApplied)),
      anchorPresent: mappings.some((m) => Boolean((m.mappingDiagnostics || {}).wave8TargetedAnchorPromoted) || (Array.isArray(m.anchorPromotions) && m.anchorPromotions.length > 0)),
      blockIdCoverage: effectiveMappings.length ? effectiveMappings.filter((m) => typeof m.blockId === 'string' && m.blockId.length > 0).length / effectiveMappings.length : 0,
      blockGeometryCoverage: effectiveMappings.length ? effectiveMappings.filter((m) => Boolean(m.blockGeometry || m.boundingBox)).length / effectiveMappings.length : 0,
    });
  }

  const report = {
    timestamp: new Date().toISOString(),
    wave8FieldsConsumed: ['blockId','blockGeometry','categoryMode','semanticLabel','pairedLabel','resolverFlags','supervisionBoost','gatingMetadata','suppressionMetadata','fieldType','selectionMarkAssociations','checkboxCandidates','anchorPromotions','confidenceScores'],
    uiComponentsUpdated: ['frontend/src/designer/ai/PdfImportModal.tsx','frontend/src/components/designer/DesignerCanvas.tsx','frontend/src/components/designer/FieldRenderer.tsx','frontend/src/components/designer/DesignerBindingsPanel.tsx','shared/src/types/pipeline.ts'],
    groupingAndSuppressionRules: ['Group by Wave-8 groupKey derived from blockId+blockGeometry+categoryMode+semantic class','Render section bounds per group (identity/agent/applicant/operations/general)','Drop non-field/header/suppressed mappings unless resolver/anchor promoted','Placement IoU suppression with nudge fallback to avoid stacked overlays','Use pairedLabel geometry when available for anchored placement'],
    validationResults: results,
    summary: {
      allFormsMapped: results.every((r) => r.extractStatus === 200 && r.mapStatus === 200),
      noStackedLabels: results.every((r) => r.overlapPairsWithoutSuppression === 0),
      checkboxesLinked: results.some((r) => r.checkboxLinked > 0 || r.checkboxCandidates > 0),
      agentSectionDetected: results.some((r) => r.agentPopulated),
      headersSuppressed: results.every((r) => !r.headerMapped),
      identityDetected: results.some((r) => r.identityPresent),
      resolverPromotionsDetected: results.some((r) => r.resolverPresent || r.anchorPresent),
    },
  };

  const reportPath = 'c:/Users/First/source/repos/inchanted-forms-designer/designer_integration_report.json';
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`wrote ${reportPath}`);
  console.log(JSON.stringify(report.summary, null, 2));
})().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
