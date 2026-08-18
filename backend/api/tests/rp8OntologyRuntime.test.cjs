const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const apiRoot = path.resolve(__dirname, "..");
const artifactRoot = path.resolve(apiRoot, "..", "..", "acord-artifacts");
const runtimeModule = require(path.join(apiRoot, "dist", "services", "rp8OntologyRuntime.js"));

function candidate(acordCode) {
  return {
    acordCode,
    label: acordCode,
    confidenceScore: 0.9,
    source: "dictionary",
  };
}

test("loads the active RP-8 runtime and builds canonical indexes", () => {
  delete process.env.RP8_ARTIFACT_ROOT;
  const runtime = runtimeModule.validateActiveRp8Runtime();
  assert.equal(runtime.metadata.restorePoint, "RP-8");
  assert.equal(runtime.metadata.activeOntology, "phase33-strict-role-boundary-readiness");
  assert.equal(runtime.metadata.nodeCount, 8);
  assert.equal(runtime.nodes.has("GeneralInfo.NamedInsured"), true);
  assert.equal(runtime.aliases.get("namedinsuredfullname"), "GeneralInfo.NamedInsured");
  assert.equal(runtime.roles.has("Applicant"), true);
});

test("preserves Applicant role for the declared name representation equivalence", () => {
  delete process.env.RP8_ARTIFACT_ROOT;
  runtimeModule.validateActiveRp8Runtime();
  const projected = runtimeModule.projectCandidateToRp8(
    candidate("NamedInsured_FullName"),
    "APPLICANT NAME",
  );
  assert.equal(projected.acordCode, "NamedInsured_FullName");
  assert.equal(projected.rp8.ontologyScope, "role-safe-representation");
  assert.equal(projected.rp8.semanticRole, "Applicant");
  assert.equal(projected.rp8.semanticIdentity, "Applicant:identity.name");
  assert.equal(projected.rp8.boundaryDisposition, "role-safe-representation");
});

test("canonicalizes aliases and marks unrelated dictionary candidates noncanonical", () => {
  delete process.env.RP8_ARTIFACT_ROOT;
  runtimeModule.validateActiveRp8Runtime();
  const canonical = runtimeModule.projectCandidateToRp8(
    candidate("NamedInsured_MailingAddress_CityName"),
    "NAMED INSURED CITY",
  );
  const dictionaryOnly = runtimeModule.projectCandidateToRp8(
    candidate("Policy_BillingAccountIdentifier"),
    "BILLING ACCOUNT",
  );
  assert.equal(canonical.acordCode, "GeneralInfo.MailingAddress.City");
  assert.equal(canonical.rp8.ontologyScope, "canonical");
  assert.equal(dictionaryOnly.acordCode, "Policy_BillingAccountIdentifier");
  assert.equal(dictionaryOnly.rp8.ontologyScope, "dictionary-only");
  assert.equal(dictionaryOnly.rp8.canonical, false);
});

test("canonical candidates outrank dictionary-only candidates and drive chosen", () => {
  delete process.env.RP8_ARTIFACT_ROOT;
  runtimeModule.validateActiveRp8Runtime();
  const [mapping] = runtimeModule.projectMappingsToRp8([{
    blockId: "city",
    page: 1,
    text: "NAMED INSURED CITY",
    boundingBox: { x: 0, y: 0, width: 100, height: 20 },
    suggestions: [
      candidate("Policy_BillingAccountIdentifier"),
      candidate("NamedInsured_MailingAddress_CityName"),
    ],
    chosen: candidate("Policy_BillingAccountIdentifier"),
  }]);
  runtimeModule.assertRp8FinalSelections([mapping]);
  assert.equal(mapping.suggestions[0].acordCode, "GeneralInfo.MailingAddress.City");
  assert.equal(mapping.suggestions[0].rp8.ontologyScope, "canonical");
  assert.equal(mapping.suggestions[1].rp8.ontologyScope, "dictionary-only");
  assert.equal(mapping.chosen.acordCode, "GeneralInfo.MailingAddress.City");
});

test("dictionary-only candidates remain alternatives and are never selected", () => {
  delete process.env.RP8_ARTIFACT_ROOT;
  runtimeModule.validateActiveRp8Runtime();
  const [mapping] = runtimeModule.projectMappingsToRp8([{
    blockId: "agent-name",
    page: 1,
    text: "AGENT NAME",
    boundingBox: { x: 0, y: 0, width: 100, height: 20 },
    suggestions: [
      candidate("Producer_FullName"),
      candidate("Policy_BillingAccountIdentifier"),
    ],
    chosen: candidate("Producer_FullName"),
  }]);
  runtimeModule.assertRp8FinalSelections([mapping]);
  assert.equal(mapping.suggestions.every((item) => item.rp8.ontologyScope === "dictionary-only"), true);
  assert.equal(mapping.chosen, undefined);
});

test("rejects tampered artifacts and fails RP-8 server startup", () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rp8-runtime-test-"));
  for (const fileName of [
    "authoritative-semantic-truth-rp8.json",
    "rp8-ontology-lineage.json",
    "phase33-semantic-truth-rp8.json",
    "ontology-phase31.json",
  ]) {
    fs.copyFileSync(path.join(artifactRoot, fileName), path.join(temporaryRoot, fileName));
  }
  const truthPath = path.join(temporaryRoot, "authoritative-semantic-truth-rp8.json");
  const truth = JSON.parse(fs.readFileSync(truthPath, "utf8"));
  truth.status = "tampered";
  fs.writeFileSync(truthPath, JSON.stringify(truth, null, 2));

  process.env.RP8_ARTIFACT_ROOT = temporaryRoot;
  assert.throws(
    () => runtimeModule.validateActiveRp8Runtime(),
    /payload hash mismatch/,
  );

  const startup = spawnSync(process.execPath, [path.join(apiRoot, "dist", "server.js")], {
    cwd: apiRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      PORT: "0",
      PRODUCTION_BASELINE: "RP-8",
      RP8_ARTIFACT_ROOT: temporaryRoot,
    },
    timeout: 20_000,
  });
  assert.notEqual(startup.status, 0);
  assert.match(`${startup.stdout}\n${startup.stderr}`, /payload hash mismatch/);

  delete process.env.RP8_ARTIFACT_ROOT;
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
});
