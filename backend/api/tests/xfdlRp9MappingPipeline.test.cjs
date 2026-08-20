const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const apiRoot = path.resolve(__dirname, "..");
const pipeline = require(path.join(apiRoot, "dist", "services", "xfdlRp9MappingPipeline.js"));
const { mapFields } = require(path.join(apiRoot, "dist", "api", "mapFields.js"));

async function withXfdlStaging(callback) {
  const previous = {
    SEMANTIC_BASELINE: process.env.SEMANTIC_BASELINE,
    DEPLOYMENT_ENVIRONMENT: process.env.DEPLOYMENT_ENVIRONMENT,
    XFDL_PRIMARY_MAPPING: process.env.XFDL_PRIMARY_MAPPING,
    PRODUCTION_BASELINE: process.env.PRODUCTION_BASELINE,
  };
  process.env.SEMANTIC_BASELINE = "RP-9";
  process.env.DEPLOYMENT_ENVIRONMENT = "staging";
  process.env.XFDL_PRIMARY_MAPPING = "1";
  process.env.PRODUCTION_BASELINE = "RP-8";
  try { return await callback(); }
  finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

function block(id, text, x, y, type = "text") {
  return { id, page: 1, type, text, confidence: 0.99, boundingBox: { x, y, width: type === "checkbox" ? 20 : 180, height: 20 } };
}

function catalog(id, label, x, y, role = "input", valueType = "text", semanticSection) {
  return { id, page: 1, role, valueType, text: label, semanticLabel: label, semanticSection, boundingBox: { x, y, width: valueType === "checkbox" ? 20 : 180, height: 20 }, source: valueType === "checkbox" ? "selection_mark" : "blank_detector", confidence: 0.99 };
}

test("parses authoritative ACORD 125 XFDL semantics", () => withXfdlStaging(() => {
  const index = pipeline.getAcord125XfdlIndex();
  assert.equal(index.pageCount, 4);
  assert.equal(index.fields.length, 552);
  assert.equal(index.fields.filter((field) => field.answerType === "boolean").length, 164);
  assert.equal(index.fields.filter((field) => field.canonicalNodeIds.length > 0).length >= 220, true);
  const producer = index.fields.find((field) => field.sid === "Producer_FullName_A");
  assert.equal(producer.label, "AGENCY");
  assert.equal(producer.section, "producer-information");
  assert.deepEqual(producer.canonicalNodeIds, ["Producer.Identity.FullName"]);
  const insured = index.fields.find((field) => field.sid === "NamedInsured_FullName_A");
  assert.deepEqual(insured.canonicalNodeIds, ["GeneralInfo.NamedInsured"]);
}));

test("scores XFDL first and uses LayoutLMv3 only as validation evidence", () => withXfdlStaging(() => {
  const inputBlock = block("agent", "AGENT NAME", 20, 60);
  const inputCatalog = catalog("agent", "AGENT NAME", 20, 60, "input", "text", "producer-information");
  const withoutLayout = pipeline.mapBlocksWithXfdlRp9({ blocks: [inputBlock], fieldCatalog: [inputCatalog], layoutLmByBlock: {}, pageDimensions: [{ page: 1, width: 816, height: 1056 }] });
  const withLayout = pipeline.mapBlocksWithXfdlRp9({
    blocks: [inputBlock],
    fieldCatalog: [inputCatalog],
    layoutLmByBlock: { agent: { topPredictions: [{ eLabelName: "Producer.Identity.FullName", probability: 0.9 }] } },
    pageDimensions: [{ page: 1, width: 816, height: 1056 }],
  });
  assert.equal(withoutLayout.mappings[0].suggestions[0].acordCode, "Producer.Identity.FullName");
  assert.equal(withLayout.mappings[0].suggestions[0].acordCode, "Producer.Identity.FullName");
  assert.equal(withLayout.mappings[0].suggestions[0].confidenceScore > withoutLayout.mappings[0].suggestions[0].confidenceScore, true);
  assert.equal(withLayout.diagnostics.legacyFallbackUsed, false);
  assert.deepEqual(withLayout.diagnostics.weights, { xfdlLabelMatch: 0.55, layoutLmValidation: 0.2, sectionAlignment: 0.15, geometryAlignment: 0.1 });
}));

test("mapFields exposes the staging XFDL pipeline contract without legacy fallback", async () => withXfdlStaging(async () => {
  const blocks = [block("agent", "AGENT NAME", 20, 60)];
  const fieldCatalog = [catalog("agent", "AGENT NAME", 20, 60, "input", "text", "producer-information")];
  const response = await mapFields({ json: async () => ({
    documentId: "xfdl-mapfields-contract",
    sourceDocumentName: "sample-Acord-125.pdf",
    familyId: "acord-125",
    blocks,
    fieldCatalog,
    groupedStructures: { labelInputPairs: [], tables: [], questionAnswerPairs: [], checkboxGroups: [], semanticGroups: [] },
    deterministic: true,
  }) }, { warn() {}, error() {} });
  assert.equal(response.status, 200);
  assert.equal(response.jsonBody.contractVersion, "xfdl.rp9.mapping.v1");
  assert.equal(response.jsonBody.mappingPipeline, "xfdl-rp9-layoutlm.v1");
  assert.equal(response.jsonBody.xfdlDiagnostics.legacyFallbackUsed, false);
  assert.equal(response.jsonBody.mappings[0].chosen.acordCode, "Producer.Identity.FullName");
  assert.equal(response.jsonBody.mappings[0].chosen.rp9.ontologyScope, "canonical");
}));

test("XFDL primary mapping gate is staging-only and ACORD-125-only", () => {
  const previous = { SEMANTIC_BASELINE: process.env.SEMANTIC_BASELINE, DEPLOYMENT_ENVIRONMENT: process.env.DEPLOYMENT_ENVIRONMENT, XFDL_PRIMARY_MAPPING: process.env.XFDL_PRIMARY_MAPPING };
  process.env.XFDL_PRIMARY_MAPPING = "1";
  process.env.SEMANTIC_BASELINE = "RP-9";
  process.env.DEPLOYMENT_ENVIRONMENT = "production";
  assert.equal(pipeline.isXfdlPrimaryMappingEnabled("sample-Acord-125.pdf", "acord-125"), false);
  process.env.DEPLOYMENT_ENVIRONMENT = "staging";
  assert.equal(pipeline.isXfdlPrimaryMappingEnabled("sample-Acord-125.pdf", "acord-125"), true);
  assert.equal(pipeline.isXfdlPrimaryMappingEnabled("sample-Acord-126.pdf", "acord-126"), false);
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});
