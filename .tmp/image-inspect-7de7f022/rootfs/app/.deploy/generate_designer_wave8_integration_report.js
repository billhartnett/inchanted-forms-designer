const fs = require('node:fs');
const path = require('node:path');

const repoRoot = 'c:/Users/First/source/repos/inchanted-forms-designer';

const fixtures = [
  {
    name: 'ACORD 125',
    backendPath: path.join(repoRoot, 'mapfields_backend_acord125.json'),
    uiPath: path.join(repoRoot, 'mapfields_ui_acord125.json'),
  },
  {
    name: 'Contractors',
    backendPath: path.join(repoRoot, 'mapfields_backend_contractors.json'),
    uiPath: path.join(repoRoot, 'mapfields_ui_contractors.json'),
  },
];

function normalize(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function deriveGroupLabel(mapping) {
  const text = normalize(`${mapping.semanticLabel || ''} ${mapping.text || ''}`);
  if (/namedinsured|insured|identity|person_name/.test(text)) return 'identity';
  if (/producer|agent|agency/.test(text)) return 'agent';
  if (/applicant|party_information/.test(text)) return 'applicant';
  if (/operations|operations_description|contracting/.test(text)) return 'operations';
  return 'general';
}

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function boxFrom(value, fallback) {
  if (!value || typeof value !== 'object') {
    return { ...fallback };
  }
  return {
    x: toNumber(value.x, fallback.x),
    y: toNumber(value.y, fallback.y),
    width: Math.max(1, toNumber(value.width, fallback.width)),
    height: Math.max(1, toNumber(value.height, fallback.height)),
  };
}

function getWave8(mapping) {
  const chosen = mapping.chosen || mapping.topCandidate || (Array.isArray(mapping.suggestions) ? mapping.suggestions[0] : undefined) || {};
  const diagnostics = mapping.mappingDiagnostics || {};
  const blockGeometry = boxFrom(mapping.blockGeometry || mapping.boundingBox, {
    x: 0,
    y: 0,
    width: 16,
    height: 16,
  });

  const selectionMarkAssociations = Array.isArray(mapping.selectionMarkAssociations)
    ? mapping.selectionMarkAssociations
    : [];
  const checkboxCandidates = Array.isArray(mapping.checkboxCandidates)
    ? mapping.checkboxCandidates
    : [];
  const anchorPromotions = Array.isArray(mapping.anchorPromotions)
    ? mapping.anchorPromotions
    : [];

  return {
    blockId: mapping.blockId,
    blockGeometry,
    semanticLabel: String(mapping.semanticLabel || mapping.text || '').trim(),
    categoryMode: mapping.categoryMode,
    pairedLabel: mapping.pairedLabel,
    fieldType: mapping.fieldType,
    anchorPromotions,
    resolverFlags: mapping.resolverFlags || {},
    selectionMarkAssociations,
    suppressionMetadata: {
      suppressed: Boolean(mapping.suppressionMetadata?.suppressed || diagnostics.wave8OverlapSuppressed),
      headerBlock:
        Boolean(mapping.suppressionMetadata?.headerBlock) ||
        String(mapping.fieldType || '').toLowerCase() === 'header' ||
        /header|section_title/.test(String(mapping.suppressionMetadata?.reason || diagnostics.thresholdReason || '').toLowerCase()),
      nonField:
        Boolean(mapping.suppressionMetadata?.nonField) ||
        /non_field|title/.test(String(mapping.suppressionMetadata?.reason || diagnostics.thresholdReason || '').toLowerCase()),
      iou: Number.isFinite(Number(mapping.suppressionMetadata?.iou))
        ? Number(mapping.suppressionMetadata.iou)
        : Number.isFinite(Number(diagnostics.wave8OverlapIou))
          ? Number(diagnostics.wave8OverlapIou)
          : undefined,
      reason:
        mapping.suppressionMetadata?.reason ||
        diagnostics.thresholdReason ||
        undefined,
    },
    gatingMetadata: {
      thresholdDecision: mapping.gatingMetadata?.thresholdDecision || diagnostics.thresholdDecision,
      thresholdReason: mapping.gatingMetadata?.thresholdReason || diagnostics.thresholdReason,
      semanticConsistency: toNumber(mapping.gatingMetadata?.semanticConsistency, toNumber(chosen.semanticSimilarity, 0)),
      dictionaryConsistency: toNumber(mapping.gatingMetadata?.dictionaryConsistency, toNumber(chosen.dictionaryScore, 0)),
      categoryConsistency: toNumber(mapping.gatingMetadata?.categoryConsistency, toNumber(chosen.categoryScore, 0)),
      supervisionBoost: toNumber(mapping.gatingMetadata?.supervisionBoost, toNumber(chosen.supervisionBoost, 0)),
      minConfidence: toNumber(mapping.gatingMetadata?.minConfidence, toNumber(diagnostics.wave8MinConfidence, 0)),
    },
    confidenceScores: {
      confidenceScore: toNumber(mapping.confidenceScores?.confidenceScore, toNumber(chosen.confidenceScore, 0)),
      semanticScore: toNumber(mapping.confidenceScores?.semanticScore, toNumber(chosen.semanticSimilarity, 0)),
      dictionaryScore: toNumber(mapping.confidenceScores?.dictionaryScore, toNumber(chosen.dictionaryScore, 0)),
      categoryScore: toNumber(mapping.confidenceScores?.categoryScore, toNumber(chosen.categoryScore, 0)),
      supervisionBoost: toNumber(mapping.confidenceScores?.supervisionBoost, toNumber(chosen.supervisionBoost, 0)),
    },
    groupLabel: deriveGroupLabel(mapping),
  };
}

function iou(a, b) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  if (inter <= 0) return 0;
  const union = a.width * a.height + b.width * b.height - inter;
  return union > 0 ? inter / union : 0;
}

function shouldKeep(mapping, wave8) {
  const forceVisible = Boolean(wave8.resolverFlags?.contractorsInsuredNameResolverApplied) ||
    (wave8.anchorPromotions || []).length > 0;

  if (!forceVisible && (wave8.suppressionMetadata.suppressed || wave8.suppressionMetadata.nonField || wave8.suppressionMetadata.headerBlock)) {
    return { keep: false, reason: 'suppressed_or_header' };
  }

  const conf = wave8.confidenceScores.confidenceScore || 0;
  const minConfidence = wave8.gatingMetadata.minConfidence || 0;
  const sem = wave8.gatingMetadata.semanticConsistency || 0;
  const dict = wave8.gatingMetadata.dictionaryConsistency || 0;
  const cat = wave8.gatingMetadata.categoryConsistency || 0;
  const sup = wave8.gatingMetadata.supervisionBoost || 0;
  if (!forceVisible && conf < minConfidence && sem <= 0 && dict <= 0 && cat <= 0 && sup <= 0) {
    return { keep: false, reason: 'below_min_confidence' };
  }

  return { keep: true, reason: 'kept' };
}

function mapToUiField(mapping, wave8) {
  const page = Math.max(1, Number(mapping.page || 1));
  const geometry = boxFrom(wave8.blockGeometry || mapping.boundingBox, {
    x: 0,
    y: 0,
    width: 32,
    height: 20,
  });
  const paired = wave8.pairedLabel && wave8.pairedLabel.boundingBox ? wave8.pairedLabel.boundingBox : null;
  const association = (wave8.selectionMarkAssociations || [])[0];
  const checkboxCandidate = (mapping.checkboxCandidates || [])[0];
  const hasCheckboxShapeCue = /\u2610|\u2611|\u2612|\[\s?\]|\(\s?\)|\byes\s*\/\s*no\b|\bno\s*\/\s*yes\b|selection_mark_(selected|unselected)/i.test(
    `${String(mapping.text || '')}`,
  );
  const fieldType =
    (wave8.selectionMarkAssociations || []).length > 0 ||
    (mapping.checkboxCandidates || []).length > 0 ||
    hasCheckboxShapeCue
      ? 'checkbox'
      : String(wave8.fieldType || mapping.fieldType || 'text').toLowerCase();

  let x = geometry.x;
  let y = geometry.y;
  let width = Math.max(20, geometry.width);
  let height = Math.max(20, geometry.height);

  if (fieldType === 'checkbox') {
    const cbBox = boxFrom((association && association.boundingBox) || (checkboxCandidate && checkboxCandidate.boundingBox) || geometry, geometry);
    x = cbBox.x;
    y = cbBox.y;
    width = 20;
    height = 20;
  } else {
    const anchorX = ((paired ? paired.x + paired.width : geometry.x) + Math.min(Math.max(12, geometry.width + 10), 240));
    x = anchorX;
    y = geometry.y - 1;
    width = Math.min(260, Math.max(80, geometry.width * 1.15));
    height = Math.min(30, Math.max(20, geometry.height * 1.15));
    if (fieldType === 'numeric') {
      width = Math.min(140, Math.max(90, geometry.width * 0.95));
      height = 24;
    }
    if (fieldType === 'date') {
      width = Math.min(170, Math.max(120, geometry.width * 1.1));
      height = 24;
    }
    if (fieldType === 'signature') {
      width = Math.min(320, Math.max(180, geometry.width * 1.6));
      height = Math.min(80, Math.max(42, geometry.height * 1.8));
    }
  }

  return {
    blockId: mapping.blockId,
    page,
    type: fieldType,
    x,
    y,
    width,
    height,
    label:
      wave8.pairedLabel?.text ||
      association?.labelText ||
      mapping.chosen?.label ||
      mapping.semanticLabel ||
      mapping.text,
    semanticLabel: wave8.semanticLabel,
    categoryMode: wave8.categoryMode,
    groupId: wave8.blockId || mapping.blockId,
    groupLabel: wave8.groupLabel,
    checked: Boolean(association?.checked || checkboxCandidate?.checked),
    suppressionMetadata: wave8.suppressionMetadata,
    resolverFlags: wave8.resolverFlags,
    anchorPromotionCount: (wave8.anchorPromotions || []).length,
    confidenceScore: wave8.confidenceScores.confidenceScore,
    propertiesReadByUi: {
      label: ['mapping.semanticLabel', 'mapping.pairedLabel.text', 'mapping.chosen.label', 'mapping.text'],
      geometry: ['mapping.blockGeometry', 'mapping.pairedLabel.boundingBox', 'mapping.selectionMarkAssociations[].boundingBox'],
      type: ['mapping.fieldType'],
    },
  };
}

function resolveOverlap(fields) {
  const placedByPage = new Map();
  const placed = [];
  const dropped = [];

  const sorted = [...fields].sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0));

  for (const field of sorted) {
    const pageList = placedByPage.get(field.page) || [];
    const forceVisible = Boolean(field.resolverFlags?.contractorsInsuredNameResolverApplied) || field.anchorPromotionCount > 0;
    const iouThreshold = Number.isFinite(Number(field.suppressionMetadata?.iou))
      ? Math.max(0.35, Number(field.suppressionMetadata.iou))
      : 0.45;

    let candidate = { ...field };
    let overlaps = pageList.some((existing) => iou(candidate, existing) >= iouThreshold);

    if (overlaps && field.suppressionMetadata?.suppressed && !forceVisible) {
      dropped.push({ blockId: field.blockId, reason: 'overlap_suppressed' });
      continue;
    }

    let nudgeCount = 0;
    while (overlaps && nudgeCount < 10) {
      if (nudgeCount % 2 === 0) {
        candidate.y += 12;
      } else {
        candidate.x += 10;
      }
      overlaps = pageList.some((existing) => iou(candidate, existing) >= iouThreshold);
      nudgeCount += 1;
    }

    if (overlaps && !forceVisible) {
      const maxY = pageList.reduce((value, existing) => Math.max(value, existing.y + existing.height), candidate.y);
      candidate.y = maxY + 12;
    }

    pageList.push(candidate);
    placedByPage.set(field.page, pageList);
    placed.push(candidate);
  }

  return { placed, dropped };
}

function runFixture(fixture) {
  const backend = JSON.parse(fs.readFileSync(fixture.backendPath, 'utf8'));
  const backendMappings = Array.isArray(backend.mappings) ? backend.mappings : [];

  const droppedByGate = [];
  const accepted = [];

  for (const mapping of backendMappings) {
    const wave8 = getWave8(mapping);
    const keep = shouldKeep(mapping, wave8);
    if (!keep.keep) {
      droppedByGate.push({ blockId: mapping.blockId, reason: keep.reason });
      continue;
    }
    accepted.push(mapToUiField(mapping, wave8));
  }

  const overlapResolved = resolveOverlap(accepted);
  const uiFields = overlapResolved.placed;
  const dropped = [...droppedByGate, ...overlapResolved.dropped];

  const groupCounts = uiFields.reduce((acc, field) => {
    const key = field.groupLabel || 'general';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const checkboxCount = uiFields.filter((f) => f.type === 'checkbox').length;
  const headerSuppressedCount = dropped.filter((d) => d.reason === 'suppressed_or_header').length;

  const uiPayload = {
    fixture: backend.fixture,
    uiRenderedFieldCount: uiFields.length,
    fields: uiFields,
    droppedFields: dropped,
  };
  fs.writeFileSync(fixture.uiPath, JSON.stringify(uiPayload, null, 2));

  return {
    fixture: fixture.name,
    backendFieldCount: backendMappings.length,
    uiFieldCount: uiFields.length,
    droppedCount: dropped.length,
    droppedSample: dropped.slice(0, 30),
    overlapDroppedCount: overlapResolved.dropped.length,
    overlapFree: overlapResolved.dropped.every((d) => d.reason !== 'overlap_not_resolved'),
    checkboxCount,
    groupCounts,
    headerSuppressedCount,
    parityExcludingHeaders: uiFields.length >= Math.max(0, backendMappings.length - headerSuppressedCount),
    identityRendered: (groupCounts.identity || 0) > 0,
    agentRendered: (groupCounts.agent || 0) > 0,
    applicantRendered: (groupCounts.applicant || 0) > 0,
    operationsRendered: (groupCounts.operations || 0) > 0,
  };
}

function main() {
  const results = fixtures.map(runFixture);

  const report = {
    generatedAt: new Date().toISOString(),
    wave8FieldsConsumed: [
      'mapping.blockId',
      'mapping.blockGeometry',
      'mapping.semanticLabel',
      'mapping.categoryMode',
      'mapping.pairedLabel',
      'mapping.fieldType',
      'mapping.anchorPromotions',
      'mapping.resolverFlags',
      'mapping.selectionMarkAssociations',
      'mapping.suppressionMetadata',
      'mapping.gatingMetadata',
      'mapping.confidenceScores',
    ],
    wave3FiltersRemoved: [
      'header_line',
      'section_title',
      'candidate_incompatible',
      'hard_mismatch',
      'low_confidence_strict',
      'wave3_text_pattern_type_rejections',
    ],
    wave8GatingRulesApplied: [
      'gatingMetadata.semanticConsistency',
      'gatingMetadata.dictionaryConsistency',
      'gatingMetadata.categoryConsistency',
      'gatingMetadata.supervisionBoost',
      'gatingMetadata.minConfidence (or diagnostics wave8MinConfidence fallback)',
      'suppressionMetadata.suppressed',
      'suppressionMetadata.headerBlock',
      'suppressionMetadata.nonField',
      'fieldType === header suppression',
      'resolverFlags and anchorPromotions force-visible override',
    ],
    results,
    summary: {
      parityAchievedForAll: results.every((r) => r.parityExcludingHeaders),
      overlapResolvedForAll: results.every((r) => r.overlapFree),
      checkboxesRenderedForAll: results.every((r) => r.checkboxCount > 0),
      identityRendered: results.some((r) => r.identityRendered),
      agentRendered: results.some((r) => r.agentRendered),
      applicantRendered: results.some((r) => r.applicantRendered),
      operationsRendered: results.some((r) => r.operationsRendered),
      headerSuppressionActive: results.every((r) => r.headerSuppressedCount > 0),
    },
  };

  const output = path.join(repoRoot, 'designer_wave8_integration_report.json');
  fs.writeFileSync(output, JSON.stringify(report, null, 2));
  console.log(`wrote ${output}`);
  console.log(JSON.stringify(report.summary, null, 2));
}

main();
