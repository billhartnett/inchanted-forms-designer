const fs = require("node:fs");
const path = require("node:path");
const { applyGatedFields, deriveOntologyClusterFromCode } = require("shared/acord");

const rootDir = path.resolve(__dirname, "../../..");
const semanticBaselineDir = path.join(rootDir, "backend", "api", "tests", "baselines", "xml-semantic");
const mappingEnginePath = path.join(rootDir, "backend", "api", "src", "services", "mappingEngine.ts");
const fixturePdfDir = path.join(rootDir, "test-fixtures", "pdf");

const TARGET_FIXTURES = [
  { fixtureId: "sample-Acord-125.pdf", familyId: "acord-125" },
  { fixtureId: "sample-Acord-126.pdf", familyId: "acord-126" },
  { fixtureId: "sample-Acord-127.pdf", familyId: "acord-127" },
  { fixtureId: "sample-Acord-130.pdf", familyId: "acord-130" },
  { fixtureId: "sample-Acord-140.pdf", familyId: "acord-140" },
  { fixtureId: "Contractors Supp App.pdf", familyId: "carrier" },
  { fixtureId: "Markel-Contractors-Supp.pdf", familyId: "carrier" },
  {
    fixtureId: "ANA_E-S_Contractors_Supplemental-Application_MKT0109_fillable.pdf",
    familyId: "carrier",
  },
];

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function toPrediction(code, index, familyId, fixtureId, pageOverride) {
  return {
    blockId: `${fixtureId}-block-${index + 1}`,
    page: Number(pageOverride || ((index % 3) + 1)),
    text: `value-${index + 1}-${code}`,
    eLabelName: code,
    probability: 0.97,
    logit: 4.2,
    category: "ontology-baseline",
    refinementPath: "phase4.validation",
    acordCode: code,
    modelConfidence: 0.97,
    gatingValid: true,
    cluster: deriveOntologyClusterFromCode(code),
    family: familyId,
    aliases: [code],
    formMembership: [familyId, "commercial-lines"],
    reasons: ["phase4_validation"],
  };
}

function runFixtureValidation(fixture) {
  const baselinePath = path.join(semanticBaselineDir, `${fixture.fixtureId}.semantic.json`);
  const baseline = readJsonIfExists(baselinePath);
  const fixturePdfPath = path.join(fixturePdfDir, fixture.fixtureId);
  const fixturePdfStaged = fs.existsSync(fixturePdfPath);
  if (!baseline) {
    return {
      fixtureId: fixture.fixtureId,
      familyId: fixture.familyId,
      available: false,
      reason: "baseline_missing",
      fixturePdfStaged,
      fixturePdfPath: fixturePdfStaged ? fixturePdfPath : null,
    };
  }

  const codes = Array.isArray(baseline.codes) ? baseline.codes.filter(Boolean) : [];
  const predictions = codes.map((code, index) =>
    toPrediction(String(code), index, fixture.familyId, fixture.fixtureId),
  );

  const applied = applyGatedFields(predictions);

  return {
    fixtureId: fixture.fixtureId,
    familyId: fixture.familyId,
    available: true,
    fixturePdfStaged,
    inputCodeCount: codes.length,
    appliedCount: applied.appliedCount,
    skippedCount: applied.skippedCount,
    routedClusters: applied.builderDiagnostics.routedClusters,
    entityCounts: {
      namedInsureds: applied.document.namedInsureds.length,
      producers: applied.document.producers.length,
      insurers: applied.document.insurers.length,
      locations: applied.document.locations.length,
      coverages: applied.document.coverages.length,
      businessOperations: applied.document.businessOperations.length,
      lossHistory: applied.document.lossHistory.length,
      priorCarriers: applied.document.priorCarriers.length,
      additionalInterests: applied.document.additionalInterests.length,
    },
    status:
      applied.appliedCount === predictions.length &&
      applied.skippedCount === 0
        ? "pass"
        : "warn",
  };
}

function runMultiInstanceValidation() {
  const fixtureId = "synthetic-multi-instance";
  const familyId = "acord-125";
  const base = [
    toPrediction("NamedInsured_FullName", 0, familyId, fixtureId, 1),
    toPrediction("NamedInsured_FullName", 1, familyId, fixtureId, 2),
    toPrediction("Producer_FullName", 2, familyId, fixtureId, 1),
    toPrediction("Producer_FullName", 3, familyId, fixtureId, 2),
    toPrediction("Location_DirectionsDescription", 4, familyId, fixtureId, 1),
    toPrediction("Location_DirectionsDescription", 5, familyId, fixtureId, 2),
    toPrediction("PriorCarrier_FullName", 6, familyId, fixtureId, 1),
    toPrediction("PriorCarrier_FullName", 7, familyId, fixtureId, 2),
    toPrediction("LossHistory_ReservedAmount", 8, familyId, fixtureId, 1),
    toPrediction("LossHistory_ReservedAmount", 9, familyId, fixtureId, 2),
    toPrediction("AdditionalInterest_MailingAddress_CityName", 10, familyId, fixtureId, 1),
    toPrediction("AdditionalInterest_MailingAddress_CityName", 11, familyId, fixtureId, 2),
  ];

  const withDuplicates = base.concat([
    {
      ...base[0],
      blockId: `${fixtureId}-dup-1`,
    },
    {
      ...base[10],
      blockId: `${fixtureId}-dup-2`,
    },
  ]);

  const applied = applyGatedFields(withDuplicates);

  const pass =
    applied.document.namedInsureds.length >= 2 &&
    applied.document.producers.length >= 2 &&
    applied.document.locations.length >= 2 &&
    applied.document.priorCarriers.length >= 2 &&
    applied.document.lossHistory.length >= 2 &&
    applied.document.additionalInterests.length >= 2;

  return {
    fixtureId,
    pass,
    appliedCount: applied.appliedCount,
    skippedCount: applied.skippedCount,
    entityCounts: {
      namedInsureds: applied.document.namedInsureds.length,
      producers: applied.document.producers.length,
      locations: applied.document.locations.length,
      priorCarriers: applied.document.priorCarriers.length,
      lossHistory: applied.document.lossHistory.length,
      additionalInterests: applied.document.additionalInterests.length,
    },
  };
}

function runFamilyGeneralizationValidation() {
  const sourceBaseline = readJsonIfExists(
    path.join(semanticBaselineDir, "sample-Acord-125.pdf.semantic.json"),
  );
  const codes = (sourceBaseline?.codes || []).slice(0, 20);

  const unknownPredictions = codes.map((code, index) =>
    toPrediction(String(code), index, "unknown", "unknown-form"),
  );
  const carrierPredictions = codes.map((code, index) =>
    toPrediction(String(code), index, "carrier", "carrier-form"),
  );

  const unknownApplied = applyGatedFields(unknownPredictions);
  const carrierApplied = applyGatedFields(carrierPredictions);

  return {
    unknown: {
      appliedCount: unknownApplied.appliedCount,
      skippedCount: unknownApplied.skippedCount,
      routedClusters: unknownApplied.builderDiagnostics.routedClusters,
      pass: unknownApplied.appliedCount > 0,
    },
    carrier: {
      appliedCount: carrierApplied.appliedCount,
      skippedCount: carrierApplied.skippedCount,
      routedClusters: carrierApplied.builderDiagnostics.routedClusters,
      pass: carrierApplied.appliedCount > 0,
    },
  };
}

function runFallbackRemovalScan() {
  const source = fs.readFileSync(mappingEnginePath, "utf8");
  const forbiddenNeedles = [
    "buildWave49FallbackSuggestions(",
    "buildSyntheticConfidenceFallbackCandidate(",
    '"confidence_only_fallback"',
    '"synthetic_confidence_fallback"',
    '"low_category_fallback"',
  ];

  const found = forbiddenNeedles.filter((needle) => source.includes(needle));
  return {
    pass: found.length === 0,
    found,
    scanned: forbiddenNeedles,
  };
}

function main() {
  const fixtureResults = TARGET_FIXTURES.map(runFixtureValidation);
  const multiInstance = runMultiInstanceValidation();
  const familyGeneralization = runFamilyGeneralizationValidation();
  const fallbackScan = runFallbackRemovalScan();

  const summary = {
    generatedAt: new Date().toISOString(),
    fixtureResults,
    multiInstance,
    familyGeneralization,
    fallbackScan,
    status:
      fallbackScan.pass &&
      multiInstance.pass &&
      familyGeneralization.unknown.pass &&
      familyGeneralization.carrier.pass
        ? "pass"
        : "warn",
  };

  const outputPath = path.join(rootDir, "phase4_ontology_validation_report.json");
  fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2));

  console.log(`Wrote phase4 ontology validation report: ${outputPath}`);
  console.log(JSON.stringify(summary, null, 2));

  if (!fallbackScan.pass || !multiInstance.pass) {
    process.exitCode = 1;
  }
}

main();
