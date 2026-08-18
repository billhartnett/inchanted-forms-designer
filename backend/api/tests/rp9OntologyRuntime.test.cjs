const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const apiRoot = path.resolve(__dirname, "..");
const facade = require(path.join(apiRoot, "dist", "services", "semanticOntologyRuntime.js"));
const rp9 = require(path.join(apiRoot, "dist", "services", "rp9OntologyRuntime.js"));

function mapping(blockId, text, suggestions = [], extra = {}) {
  return {
    blockId,
    page: 2,
    text,
    semanticLabel: text,
    boundingBox: { x: 0, y: 0, width: 100, height: 20 },
    suggestions,
    ...extra,
  };
}
function candidate(acordCode) {
  return { acordCode, label: acordCode, confidenceScore: 0.8, source: "dictionary" };
}

function withStagingRp9(callback) {
  const previous = {
    SEMANTIC_BASELINE: process.env.SEMANTIC_BASELINE,
    DEPLOYMENT_ENVIRONMENT: process.env.DEPLOYMENT_ENVIRONMENT,
  };
  process.env.SEMANTIC_BASELINE = "RP-9";
  process.env.DEPLOYMENT_ENVIRONMENT = "staging";
  try { return callback(); }
  finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

test("RP-9 requires the explicit staging environment gate", () => {
  process.env.SEMANTIC_BASELINE = "RP-9";
  process.env.DEPLOYMENT_ENVIRONMENT = "production";
  assert.throws(() => facade.configuredSemanticBaseline(), /requires DEPLOYMENT_ENVIRONMENT=staging/);
  delete process.env.SEMANTIC_BASELINE;
  delete process.env.DEPLOYMENT_ENVIRONMENT;
  assert.equal(facade.configuredSemanticBaseline(), "RP-8");
});

test("loads staging-active RP-9 truth, lineage, bundles, and families", () => withStagingRp9(() => {
  const runtime = rp9.validateActiveRp9Runtime();
  assert.equal(runtime.metadata.restorePoint, "RP-9");
  assert.equal(runtime.metadata.activationState, "staging-active");
  assert.equal(runtime.metadata.nodeCount, 37);
  assert.equal(runtime.nodes.has("Producer.Identity.FullName"), true);
  assert.equal(runtime.nodes.has("Section.GeneralInformation"), true);
  assert.equal(runtime.categoryBundles.groups.length, 10);
}));

test("projects Producer, date, premises, signature, and section aliases canonically", () => withStagingRp9(() => {
  const projected = rp9.projectMappingsToRp9([
    mapping("agent", "AGENT NAME:", [candidate("Producer_FullName")]),
    mapping("date", "DATE (MM/DD/YYYY)", [candidate("CommercialPropertyCoverage_PeakSeasonAdditional_FormDate")]),
    mapping("premises", "PREMISES INFORMATION", []),
    mapping("general", "GENERAL INFORMATION", []),
    mapping("signature", "PRODUCER'S SIGNATURE", [candidate("Producer_AuthorizedRepresentative_Signature")]),
  ]);
  rp9.assertRp9Selections(projected);
  assert.deepEqual(projected.map((item) => item.chosen?.acordCode), [
    "Producer.Identity.FullName",
    "Form.Date.Completed",
    "Section.PremisesInformation",
    "Section.GeneralInformation",
    "Signature.Producer",
  ]);
  assert.equal(projected[0].chosen.rp9.semanticRole, "Producer");
  assert.equal(projected[2].chosen.rp9.semanticKind, "section");
  assert.equal(projected[2].chosen.rp9.instanceFamily.familyId, "section.premises-information");
}));

test("preserves multi-instance premises and building keys", () => withStagingRp9(() => {
  const projected = rp9.projectMappingsToRp9([
    mapping("location", "Location_PhysicalAddress_LineOne", [candidate("Location_PhysicalAddress_LineOne")], { locationIndex: 3 }),
    mapping("building", "building number", [candidate("CommercialStructure_Building_ProducerIdentifier")], { locationIndex: 3, buildingIndex: 2 }),
  ]);
  assert.deepEqual(projected[0].chosen.rp9.instanceKey, { locationIndex: 3 });
  assert.deepEqual(projected[1].chosen.rp9.instanceKey, { locationIndex: 3, buildingIndex: 2 });
}));

test("retains Producer fillable choices while emitting section anchors from RP-9 cues", () => withStagingRp9(() => {
  const projected = rp9.projectMappingsToRp9([
    mapping("agent", "AGENT NAME", [candidate("Producer_FullName")], {
      semanticRole: "Producer",
      semanticCluster: "ProducerInformation",
      semanticGroupIds: ["rp9-producer-information-p1-2"],
      producerIndex: 2,
    }),
  ]);
  assert.equal(projected[0].chosen.acordCode, "Producer.Identity.FullName");
  assert.deepEqual(projected[0].chosen.rp9.instanceKey, { producerIndex: 2 });
  const section = projected[0].suggestions.find((candidate) => candidate.acordCode === "Section.ProducerInformation");
  assert.equal(section.rp9.semanticKind, "section");
  assert.deepEqual(section.rp9.instanceKey, { pageIndex: 1, sectionOccurrence: "section-0" });
  assert.equal(rp9.collectRp9Sections(projected)[0].canonicalNodeId, "Section.ProducerInformation");
}));

test("deduplicates Producer section anchors and removes dictionary-only leakage inside RP-9 Producer clusters", () => withStagingRp9(() => {
  const projected = rp9.projectMappingsToRp9([
    mapping("address-1", "ADDRESS", [candidate("Producer_MailingAddress_LineOne"), candidate("AccountantsLiability_BranchOffice_AddressLineOne")], {
      page: 1, semanticRole: "Producer", semanticCluster: "ProducerAddress", producerIndex: 0,
    }),
    mapping("address-2", "CITY", [candidate("Producer_MailingAddress_CityName")], {
      page: 1, semanticRole: "Producer", semanticCluster: "ProducerAddress", producerIndex: 0,
    }),
  ]);
  assert.equal(projected[0].suggestions.some((item) => item.rp9.ontologyScope === "dictionary-only"), false);
  assert.equal(rp9.collectRp9Sections(projected).length, 1);
}));

test("facade returns RP-9 sections and category bundles only in staging mode", () => withStagingRp9(() => {
  const mappings = facade.projectMappingsToActiveSemanticBaseline([
    mapping("section", "GENERAL INFORMATION", []),
  ]);
  facade.assertActiveSemanticSelections(mappings);
  assert.equal(facade.collectActiveSemanticSections(mappings)[0].canonicalNodeId, "Section.GeneralInformation");
  assert.equal(facade.getActiveCategoryBundles().restorePoint, "RP-9");
  assert.equal(facade.getActiveSemanticRuntime().metadata.mappingContractVersion, "rp9.mapping.v1");
}));
