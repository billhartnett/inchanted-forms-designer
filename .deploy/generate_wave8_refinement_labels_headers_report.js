const fs = require('node:fs');
const path = require('node:path');

const repoRoot = 'c:/Users/First/source/repos/inchanted-forms-designer';
const beforePath = path.join(repoRoot, '.deploy/wave8_labels_headers_before.json');
const afterPath = path.join(repoRoot, '.deploy/wave8_labels_headers_after_local.json');
const outPath = path.join(repoRoot, 'wave8_refinement_labels_headers.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function ratio(numerator, denominator) {
  if (!denominator) return 0;
  return Number((numerator / denominator).toFixed(4));
}

function pct(value) {
  return Number((value * 100).toFixed(2));
}

function diff(after, before) {
  return Number((after - before).toFixed(4));
}

function byFixture(items) {
  const map = new Map();
  for (const item of items || []) {
    map.set(item.fixture, item);
  }
  return map;
}

const before = readJson(beforePath);
const after = readJson(afterPath);

const b = before.summary || {};
const a = after.summary || {};

const beforeTargetedAccuracy = ratio(b.totalTargetedAligned || 0, b.totalTargetedFields || 0);
const afterTargetedAccuracy = ratio(a.totalTargetedAligned || 0, a.totalTargetedFields || 0);
const beforeHeaderSuppressionRate = ratio(b.totalHeaderSuppressed || 0, Math.max(1, (b.totalHeaderSuppressed || 0) + (b.totalHeaderMapped || 0)));
const afterHeaderSuppressionRate = ratio(a.totalHeaderSuppressed || 0, Math.max(1, (a.totalHeaderSuppressed || 0) + (a.totalHeaderMapped || 0)));
const beforeHeaderFalsePositiveRate = ratio(b.totalHeaderMapped || 0, Math.max(1, b.totalMappings || 0));
const afterHeaderFalsePositiveRate = ratio(a.totalHeaderMapped || 0, Math.max(1, a.totalMappings || 0));
const beforeGateRejectionRate = ratio(b.totalGateRejected || 0, Math.max(1, b.totalMappings || 0));
const afterGateRejectionRate = ratio(a.totalGateRejected || 0, Math.max(1, a.totalMappings || 0));
const beforeSupervisionCoverage = ratio(b.totalSupervisionPresent || 0, Math.max(1, b.totalMappings || 0));
const afterSupervisionCoverage = ratio(a.totalSupervisionPresent || 0, Math.max(1, a.totalMappings || 0));

const beforeFx = byFixture(before.results || []);
const afterFx = byFixture(after.results || []);
const fixtures = Array.from(new Set([...(beforeFx.keys()), ...(afterFx.keys())]));

const perFixture = fixtures.map((fixture) => {
  const fb = beforeFx.get(fixture) || {};
  const fa = afterFx.get(fixture) || {};
  const fbTargetedAcc = ratio(fb.targetedAlignedCount || 0, fb.targetedFieldCount || 0);
  const faTargetedAcc = ratio(fa.targetedAlignedCount || 0, fa.targetedFieldCount || 0);
  return {
    fixture,
    mappingCount: {
      before: fb.mappingCount || 0,
      after: fa.mappingCount || 0,
      delta: (fa.mappingCount || 0) - (fb.mappingCount || 0),
    },
    headerSuppressed: {
      before: fb.headerSuppressedCount || 0,
      after: fa.headerSuppressedCount || 0,
      delta: (fa.headerSuppressedCount || 0) - (fb.headerSuppressedCount || 0),
    },
    headerMapped: {
      before: fb.headerMappedCount || 0,
      after: fa.headerMappedCount || 0,
      delta: (fa.headerMappedCount || 0) - (fb.headerMappedCount || 0),
    },
    targetedAccuracy: {
      before: pct(fbTargetedAcc),
      after: pct(faTargetedAcc),
      deltaPctPoints: Number(((faTargetedAcc - fbTargetedAcc) * 100).toFixed(2)),
    },
    supervisionPresent: {
      before: fb.supervisionPresentCount || 0,
      after: fa.supervisionPresentCount || 0,
      delta: (fa.supervisionPresentCount || 0) - (fb.supervisionPresentCount || 0),
    },
    gatingRejected: {
      before: fb.gateRejectedCount || 0,
      after: fa.gateRejectedCount || 0,
      delta: (fa.gateRejectedCount || 0) - (fb.gateRejectedCount || 0),
    },
  };
});

const payload = {
  generatedAt: new Date().toISOString(),
  scope: {
    objective: 'Wave-8 refinement pass for label accuracy and header/non-field suppression',
    constraintsRespected: [
      'No grouping logic changes',
      'No checkbox logic changes',
      'No contractors resolver changes',
      'Refinements applied in semantic/dictionary/supervision and header gating paths only',
    ],
    baselineSource: beforePath,
    afterSource: afterPath,
    mapperSource: a.mapperSource || 'unknown',
  },
  summary: {
    totalMappings: {
      before: b.totalMappings || 0,
      after: a.totalMappings || 0,
      delta: (a.totalMappings || 0) - (b.totalMappings || 0),
    },
    targetedLabelAccuracy: {
      before: pct(beforeTargetedAccuracy),
      after: pct(afterTargetedAccuracy),
      deltaPctPoints: Number(((afterTargetedAccuracy - beforeTargetedAccuracy) * 100).toFixed(2)),
    },
    headerSuppressionCount: {
      before: b.totalHeaderSuppressed || 0,
      after: a.totalHeaderSuppressed || 0,
      delta: (a.totalHeaderSuppressed || 0) - (b.totalHeaderSuppressed || 0),
    },
    headerSuppressionRate: {
      before: pct(beforeHeaderSuppressionRate),
      after: pct(afterHeaderSuppressionRate),
      deltaPctPoints: Number(((afterHeaderSuppressionRate - beforeHeaderSuppressionRate) * 100).toFixed(2)),
    },
    headerFalsePositiveCount: {
      before: b.totalHeaderMapped || 0,
      after: a.totalHeaderMapped || 0,
      delta: (a.totalHeaderMapped || 0) - (b.totalHeaderMapped || 0),
    },
    headerFalsePositiveRate: {
      before: pct(beforeHeaderFalsePositiveRate),
      after: pct(afterHeaderFalsePositiveRate),
      deltaPctPoints: Number(((afterHeaderFalsePositiveRate - beforeHeaderFalsePositiveRate) * 100).toFixed(2)),
    },
    gateRejectedCount: {
      before: b.totalGateRejected || 0,
      after: a.totalGateRejected || 0,
      delta: (a.totalGateRejected || 0) - (b.totalGateRejected || 0),
    },
    gateRejectionRate: {
      before: pct(beforeGateRejectionRate),
      after: pct(afterGateRejectionRate),
      deltaPctPoints: Number(((afterGateRejectionRate - beforeGateRejectionRate) * 100).toFixed(2)),
    },
    supervisionCoverage: {
      before: pct(beforeSupervisionCoverage),
      after: pct(afterSupervisionCoverage),
      deltaPctPoints: Number(((afterSupervisionCoverage - beforeSupervisionCoverage) * 100).toFixed(2)),
    },
    semanticConsistencyProxy: {
      beforeAlignedCount: b.totalSemanticAligned || 0,
      afterAlignedCount: a.totalSemanticAligned || 0,
      delta: (a.totalSemanticAligned || 0) - (b.totalSemanticAligned || 0),
      note: 'Current diagnostics script semantic threshold remains strict and shows no threshold-crossing changes.',
    },
    dictionaryConsistencyProxy: {
      beforeAlignedCount: b.totalDictionaryAligned || 0,
      afterAlignedCount: a.totalDictionaryAligned || 0,
      delta: (a.totalDictionaryAligned || 0) - (b.totalDictionaryAligned || 0),
      note: 'Dictionary alignment count decreased because header-like blocks now get suppressed/penalized under strict gating.',
    },
  },
  perFixture,
  derivedChanges: {
    supervisionSignalGain: {
      absolute: (a.totalSupervisionPresent || 0) - (b.totalSupervisionPresent || 0),
      relativeMultiplier: Number((((a.totalSupervisionPresent || 0) + 1) / ((b.totalSupervisionPresent || 0) + 1)).toFixed(2)),
    },
    headerMappingReductionFactor: Number((((b.totalHeaderMapped || 0) + 1) / ((a.totalHeaderMapped || 0) + 1)).toFixed(2)),
    notes: [
      'After metrics are computed against local refined mapper output.',
      'Remote/live endpoint report was unchanged during this pass because deployment was not part of this step.',
    ],
  },
};

fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
console.log(`wrote ${outPath}`);
console.log(JSON.stringify(payload.summary, null, 2));
