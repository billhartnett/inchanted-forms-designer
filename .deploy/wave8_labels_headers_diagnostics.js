const fs = require('node:fs');
const path = require('node:path');

const repoRoot = 'c:/Users/First/source/repos/inchanted-forms-designer';
const fixtureRoot = path.join(repoRoot, 'test-fixtures/pdf');
const baseUrl = process.env.WAVE8_DIAG_BASE_URL || 'https://forms-designer-backend.azurewebsites.net';
const mode = process.argv[2] || 'before';
const useLocalMapping = process.env.WAVE8_USE_LOCAL_MAPPING === '1';

let localMapper = null;
if (useLocalMapping) {
  const mapperModulePath = path.join(repoRoot, 'backend/api/src/services/mappingEngine.js');
  // eslint-disable-next-line global-require, import/no-dynamic-require
  localMapper = require(mapperModulePath);
}

const fixtures = [
  { name: 'ACORD 125', file: 'sample-Acord-125.pdf', familyId: undefined },
  { name: 'ACORD 126', file: 'sample-Acord-126.pdf', familyId: undefined },
  { name: 'ACORD 140', file: 'sample-Acord-140.pdf', familyId: undefined },
  { name: 'Contractors', file: 'Contractors Supp App.pdf', familyId: 'contractors-supplement' },
];

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isHeaderLikeText(text) {
  const normalized = normalize(text);
  if (!normalized) return false;
  return /\bacord\b|\bform\b|\bedition\b|commercial insurance application|supplemental application|applicant information section|\bpage\s+\d+\s+of\s+\d+\b/.test(normalized);
}

function isTargetedField(text, code, label) {
  const source = normalize(`${text} ${code} ${label}`);
  return /named\s*insured|producer|agent|applicant|operations\s+description|effective\s+date|expiration\s+date|policy\s+number|limits?/.test(source);
}

function extractHeaderSuppressed(mapping) {
  const sm = mapping.suppressionMetadata || {};
  const diag = mapping.mappingDiagnostics || {};
  const reasonText = `${String(sm.reason || '')} ${String(diag.thresholdReason || '')}`.toLowerCase();
  return Boolean(sm.headerBlock || /header|section_title|title|non_field/.test(reasonText));
}

function extractGateRejected(mapping) {
  const diag = mapping.mappingDiagnostics || {};
  return String(diag.thresholdDecision || '').toLowerCase() === 'rejected';
}

async function fetchJson(url, init = {}, timeoutMs = 240000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const json = await response.json();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${JSON.stringify(json).slice(0, 300)}`);
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

async function runFixture(fixture) {
  const pdfPath = path.join(fixtureRoot, fixture.file);
  const buffer = fs.readFileSync(pdfPath);

  const extractForm = new FormData();
  extractForm.append('file', new Blob([buffer], { type: 'application/pdf' }), fixture.file);

  const extract = await fetchJson(`${baseUrl}/api/extractdocument`, {
    method: 'POST',
    headers: { 'X-File-Name': fixture.file },
    body: extractForm,
  });

  const blocks = Array.isArray(extract.blocks) ? extract.blocks : [];

  const mapPayload = {
    documentId: `${fixture.file}-${mode}-labels-headers`,
    familyId: fixture.familyId,
    blocks,
  };

  let map;
  if (useLocalMapping) {
    const mappings = await localMapper.mapBlocksToAcord(mapPayload.blocks, {
      familyId: mapPayload.familyId,
      context: fixture.name,
      deterministic: true,
    });
    map = { mappings };
  } else {
    map = await fetchJson(`${baseUrl}/api/mapfields`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mapPayload),
    });
  }

  const mappings = Array.isArray(map.mappings) ? map.mappings : [];
  const top20Mislabels = [];

  let headerSuppressedCount = 0;
  let headerMappedCount = 0;
  let gateRejectedCount = 0;
  let targetedFieldCount = 0;
  let targetedAlignedCount = 0;
  let semanticAlignedCount = 0;
  let dictionaryAlignedCount = 0;
  let categoryAlignedCount = 0;
  let supervisionPresentCount = 0;

  for (const mapping of mappings) {
    const chosen = mapping.chosen || mapping.topCandidate || (Array.isArray(mapping.suggestions) ? mapping.suggestions[0] : undefined) || {};
    const text = String(mapping.text || '');
    const code = String(chosen.acordCode || '');
    const label = String(chosen.label || '');

    const semantic = Number(chosen.semanticSimilarity || mapping.confidenceScores?.semanticScore || 0);
    const dictionary = Number(chosen.dictionaryScore || mapping.confidenceScores?.dictionaryScore || 0);
    const category = Number(chosen.categoryScore || mapping.confidenceScores?.categoryScore || 0);
    const supervision = Number(chosen.supervisionBoost || mapping.confidenceScores?.supervisionBoost || 0);

    if (semantic >= 0.4) semanticAlignedCount += 1;
    if (dictionary >= 0.4) dictionaryAlignedCount += 1;
    if (category >= 0.4) categoryAlignedCount += 1;
    if (supervision > 0) supervisionPresentCount += 1;

    const suppressedHeader = extractHeaderSuppressed(mapping);
    if (suppressedHeader) {
      headerSuppressedCount += 1;
    }

    if (extractGateRejected(mapping)) {
      gateRejectedCount += 1;
    }

    if (isHeaderLikeText(text) && !suppressedHeader) {
      headerMappedCount += 1;
      if (top20Mislabels.length < 20) {
        top20Mislabels.push({
          blockId: mapping.blockId,
          text,
          predictedAcordCode: code,
          predictedLabel: label,
          reason: 'header_region_false_positive',
        });
      }
    }

    if (isTargetedField(text, code, label)) {
      targetedFieldCount += 1;
      const aligned = semantic >= 0.4 || dictionary >= 0.4 || supervision > 0;
      if (aligned) {
        targetedAlignedCount += 1;
      }
    }
  }

  return {
    fixture: fixture.name,
    file: fixture.file,
    mappingCount: mappings.length,
    headerSuppressedCount,
    headerMappedCount,
    gateRejectedCount,
    targetedFieldCount,
    targetedAlignedCount,
    semanticAlignedCount,
    dictionaryAlignedCount,
    categoryAlignedCount,
    supervisionPresentCount,
    top20Mislabels,
    extractedBlockCount: blocks.length,
  };
}

(async () => {
  const startedAt = new Date().toISOString();
  const results = [];
  for (const fixture of fixtures) {
    console.log(`diagnostics ${mode}: ${fixture.file}`);
    results.push(await runFixture(fixture));
  }

  const summary = {
    mode,
    mapperSource: useLocalMapping ? 'local' : 'remote',
    generatedAt: new Date().toISOString(),
    startedAt,
    fixtureCount: results.length,
    totalMappings: results.reduce((sum, item) => sum + item.mappingCount, 0),
    totalHeaderSuppressed: results.reduce((sum, item) => sum + item.headerSuppressedCount, 0),
    totalHeaderMapped: results.reduce((sum, item) => sum + item.headerMappedCount, 0),
    totalGateRejected: results.reduce((sum, item) => sum + item.gateRejectedCount, 0),
    totalTargetedFields: results.reduce((sum, item) => sum + item.targetedFieldCount, 0),
    totalTargetedAligned: results.reduce((sum, item) => sum + item.targetedAlignedCount, 0),
    totalSemanticAligned: results.reduce((sum, item) => sum + item.semanticAlignedCount, 0),
    totalDictionaryAligned: results.reduce((sum, item) => sum + item.dictionaryAlignedCount, 0),
    totalCategoryAligned: results.reduce((sum, item) => sum + item.categoryAlignedCount, 0),
    totalSupervisionPresent: results.reduce((sum, item) => sum + item.supervisionPresentCount, 0),
  };

  const payload = { summary, results };
  const outPath = path.join(repoRoot, `.deploy/wave8_labels_headers_${mode}.json`);
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(`wrote ${outPath}`);
  console.log(JSON.stringify(summary, null, 2));
})().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
