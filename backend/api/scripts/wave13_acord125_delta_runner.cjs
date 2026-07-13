const fs = require("fs");
const crypto = require("crypto");

function read(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

const backend = read("mapfields_backend_acord125.json");
const ui = read("mapfields_ui_acord125.json");
const quality = read("backend/api/tests/baselines/quality/sample-Acord-125.pdf.quality.json");
const calibration = read("backend/api/tests/baselines/calibration/sample-Acord-125.pdf.calibration.json");
const dynamicExpectationsPath =
  process.env.WAVE13_ACORD125_DYNAMIC_EXPECTATIONS_PATH ||
  "backend/api/tests/generated/acord125-xfdl-expectations.json";
const fallbackFixtureExpectationsPath = "backend/api/tests/fixture-expectations.json";
const goldStandardPath =
  process.env.WAVE13_ACORD125_GOLD_STANDARD_PATH ||
  "backend/api/tests/gold-standard/acord-125/ACORD 0125 2016-03r1.xfdl";
const mappings = backend.mappings || [];
const fields = ui.fields || [];

function loadExpectations() {
  if (fs.existsSync(dynamicExpectationsPath)) {
    const dynamic = read(dynamicExpectationsPath);
    return {
      source: "xfdl-dynamic",
      path: dynamicExpectationsPath,
      generatedAt: dynamic.generatedAt || null,
      expectations: Array.isArray(dynamic.expectations) ? dynamic.expectations : [],
    };
  }

  const fixtureExpectations = read(fallbackFixtureExpectationsPath)["sample-Acord-125.pdf"] || [];
  return {
    source: "fixture-fallback",
    path: fallbackFixtureExpectationsPath,
    generatedAt: null,
    expectations: fixtureExpectations,
  };
}

const expectationBundle = loadExpectations();
const expectations = expectationBundle.expectations;

function getGoldStandardInfo(filePath) {
  if (!fs.existsSync(filePath)) {
    return {
      available: false,
      path: filePath,
      bytes: 0,
      sha256: null,
      anchorPresence: {},
    };
  }

  const bytes = fs.readFileSync(filePath);
  const text = bytes.toString("utf8");
  return {
    available: true,
    path: filePath,
    bytes: bytes.length,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    anchorPresence: {
      namedInsured: /named\s+insured/i.test(text),
      mailingAddress: /mailing\s+address/i.test(text),
      policyNumber: /policy\s*(number|no)/i.test(text),
      businessStartDate: /business\s+start|date\s+business\s+started/i.test(text),
    },
  };
}

function tokenSet(s) {
  return new Set(
    String(s || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2),
  );
}

function overlap(a, b) {
  const A = tokenSet(a);
  const B = tokenSet(b);
  if (!A.size || !B.size) return 0;
  let i = 0;
  for (const t of A) {
    if (B.has(t)) i += 1;
  }
  return i / Math.min(A.size, B.size);
}

const expectationResults = expectations.map((exp) => {
  let rx;
  try {
    rx = new RegExp(exp.textPattern, "i");
  } catch {
    rx = new RegExp(String(exp.textPattern).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  }

  const hit = mappings.find((m) => rx.test(String(m.text || "")));
  const top = (hit?.suggestions || []).slice(0, exp.expectedTopN || 5).map((c) => c.acordCode);
  return {
    id: exp.id,
    textPattern: exp.textPattern,
    expectedAcordCode: exp.expectedAcordCode,
    matchedBlockId: hit?.blockId || null,
    matchedText: hit?.text || null,
    chosenAcordCode: hit?.chosen?.acordCode || null,
    chosenConfidence: Number(hit?.chosen?.confidenceScore || 0),
    inTopN: top.includes(exp.expectedAcordCode),
    mislabel: Boolean(hit && hit?.chosen?.acordCode !== exp.expectedAcordCode),
  };
});

const lowConfidence = mappings.filter((m) => Number(m?.chosen?.confidenceScore || 0) < 0.6);
const rejected = mappings.filter((m) => String(m?.mappingDiagnostics?.thresholdDecision || "") === "rejected");
const reviewBand = mappings.filter((m) => {
  const c = Number(m?.chosen?.confidenceScore || 0);
  return c >= 0.6 && c < 0.8;
});

const rationaleDisagreements = mappings.filter((m) => {
  const c = m?.chosen || {};
  const sem = Number(c.semanticSimilarity || 0);
  const lex = Number(c.lexicalScore || 0);
  const ambiguity = (m?.rationale?.ambiguityNotes || []).length > 0;
  return ambiguity || (lex >= 0.8 && sem <= 0.05);
});

const calibrationMismatches = mappings.filter((m) => {
  const c = Number(m?.chosen?.confidenceScore || 0);
  const th = m?.mappingDiagnostics?.topCandidate?.thresholds || {
    accepted: 0.8,
    review: 0.6,
    rejected: 0.45,
  };
  const actual = String(m?.mappingDiagnostics?.thresholdDecision || "");
  let expected = "rejected";
  if (c >= Number(th.accepted)) expected = "accepted";
  else if (c >= Number(th.review)) expected = "review";
  return actual && actual !== expected;
});

const semanticMisalignment = mappings
  .map((m) => ({ m, score: overlap(m?.semanticLabel, m?.chosen?.label) }))
  .filter((x) => Number(x.m?.chosen?.confidenceScore || 0) >= 0.6 && x.score < 0.2)
  .slice(0, 25)
  .map((x) => ({
    blockId: x.m.blockId,
    text: x.m.text,
    semanticLabel: x.m.semanticLabel,
    chosenLabel: x.m?.chosen?.label,
    chosenCode: x.m?.chosen?.acordCode,
    confidence: Number(x.m?.chosen?.confidenceScore || 0),
    alignmentScore: Number(x.score.toFixed(3)),
  }));

const invalidGeometry = fields.filter((f) => !(Number(f.width) > 0 && Number(f.height) > 0));
const tinyGeometry = fields.filter((f) => Number(f.width) <= 8 || Number(f.height) <= 8);
const largeGeometry = fields.filter((f) => Number(f.width) >= 500 || Number(f.height) >= 80);
const geometrySamples = [...tinyGeometry.slice(0, 5), ...largeGeometry.slice(0, 5)].map((f) => ({
  blockId: f.blockId,
  type: f.type,
  x: f.x,
  y: f.y,
  width: f.width,
  height: f.height,
  label: f.label,
  confidence: f.confidenceScore,
}));

const summary = {
  fixture: backend.fixture,
  generatedAt: new Date().toISOString(),
  expectations: {
    source: expectationBundle.source,
    path: expectationBundle.path,
    generatedAt: expectationBundle.generatedAt,
    count: expectations.length,
  },
  goldStandard: getGoldStandardInfo(goldStandardPath),
  counts: {
    backendMappings: mappings.length,
    uiRenderedFields: ui.uiRenderedFieldCount || fields.length,
    suppressedOrUnrenderedDelta: mappings.length - (ui.uiRenderedFieldCount || fields.length),
    expectationChecks: expectationResults.length,
    expectationMislabels: expectationResults.filter((x) => x.mislabel).length,
    expectationTopNMisses: expectationResults.filter((x) => x.matchedBlockId && !x.inTopN).length,
    lowConfidenceAssignments: lowConfidence.length,
    rejectedByThreshold: rejected.length,
    reviewBandAssignments: reviewBand.length,
    rationaleDisagreements: rationaleDisagreements.length,
    calibrationMismatches: calibrationMismatches.length,
    semanticMisalignmentHighConfidence: semanticMisalignment.length,
    invalidGeometry: invalidGeometry.length,
    tinyGeometry: tinyGeometry.length,
    largeGeometry: largeGeometry.length,
  },
  baselineQuality: {
    exactAccuracy: quality?.totals?.exactAccuracy,
    topNAccuracy: quality?.totals?.topNAccuracy,
    lowConfidenceRate: quality?.coverage?.lowConfidenceRate,
    chosenWithinTopNRate: quality?.totals?.chosenWithinTopNRate,
    fieldsMapped: quality?.coverage?.fieldsMapped,
    fieldsTotal: quality?.coverage?.fieldsTotal,
  },
  calibrationBaseline: {
    calibratedAccuracy: calibration?.calibratedAccuracy,
    thresholdAdjustedRankingQuality: calibration?.thresholdAdjustedRankingQuality,
    lowConfidenceFields: (calibration?.lowConfidenceFields || []).length,
    unstableSignals: (calibration?.unstableSignals || []).length,
    crossFamilyConfidenceDelta: calibration?.coverage?.crossFamilyConfidenceDelta,
  },
  expectationResults,
  sampleMislabeled: expectationResults.filter((x) => x.mislabel).slice(0, 10),
  sampleLowConfidence: lowConfidence.slice(0, 12).map((m) => ({
    blockId: m.blockId,
    text: m.text,
    chosenCode: m?.chosen?.acordCode,
    chosenLabel: m?.chosen?.label,
    confidence: Number(m?.chosen?.confidenceScore || 0),
    thresholdDecision: m?.mappingDiagnostics?.thresholdDecision,
    thresholdReason: m?.mappingDiagnostics?.thresholdReason,
  })),
  sampleRationaleDisagreements: rationaleDisagreements.slice(0, 12).map((m) => ({
    blockId: m.blockId,
    text: m.text,
    chosenCode: m?.chosen?.acordCode,
    chosenLabel: m?.chosen?.label,
    confidence: Number(m?.chosen?.confidenceScore || 0),
    semanticSimilarity: Number(m?.chosen?.semanticSimilarity || 0),
    lexicalScore: Number(m?.chosen?.lexicalScore || 0),
    arbitrationEvidenceCount: (m?.rationale?.arbitrationEvidence || []).length,
  })),
  sampleCalibrationMismatches: calibrationMismatches.slice(0, 12).map((m) => ({
    blockId: m.blockId,
    text: m.text,
    confidence: Number(m?.chosen?.confidenceScore || 0),
    decision: m?.mappingDiagnostics?.thresholdDecision,
    thresholds: m?.mappingDiagnostics?.topCandidate?.thresholds || null,
  })),
  sampleSemanticMisalignment: semanticMisalignment,
  geometrySamples,
};

fs.writeFileSync("wave13_acord125_accuracy_delta.json", `${JSON.stringify(summary, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      out: "wave13_acord125_accuracy_delta.json",
      counts: summary.counts,
      expectationMislabels: summary.sampleMislabeled.slice(0, 4),
    },
    null,
    2,
  ),
);
