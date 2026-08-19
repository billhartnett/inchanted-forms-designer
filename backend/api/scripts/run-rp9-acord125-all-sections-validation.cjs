const fs = require("node:fs");
const path = require("node:path");

process.env.SEMANTIC_BASELINE = "RP-9";
process.env.DEPLOYMENT_ENVIRONMENT = "staging";
process.env.PRODUCTION_BASELINE = "RP-8";

const snapshotPath = process.argv[2];
if (!snapshotPath) throw new Error("Usage: node scripts/run-rp9-acord125-all-sections-validation.cjs <extractDocument.json>");
const snapshot = JSON.parse(fs.readFileSync(path.resolve(snapshotPath), "utf8"));
const {
  buildHybridFieldExtraction,
  buildRp9GeneralInformationGroups,
  buildRp9PremisesGroups,
  buildRp9QuestionGroups,
} = require("../dist/extraction/hybridFieldExtraction.js");
const { mapFields } = require("../dist/api/mapFields.js");

const expectedSections = {
  1: ["Section.GeneralInformation", "Section.ProducerInformation"],
  2: [],
  3: ["Section.ProducerInformation"],
  4: ["Section.GeneralInformation"],
  5: ["Section.PremisesInformation", "Section.ProducerInformation"],
  6: ["Section.PremisesInformation"],
};
const legacyPattern = /AccountantsLiability|BusinessOwners|CommercialProperty|GeneralLiability/i;

async function main() {
  const extraction = await buildHybridFieldExtraction({ pages: snapshot.pages });
  const response = await mapFields({
    json: async () => ({
      documentId: "rp9-acord125-all-sections-validation",
      sourceDocumentName: "sample-Acord-125.pdf",
      blocks: extraction.blocks,
      fieldCatalog: extraction.fieldCatalog,
      groupedStructures: extraction.groupedStructures,
      deterministic: true,
      familyId: "acord-125",
    }),
  }, { warn() {}, error(...args) { console.error(...args); } });
  if (response.status !== 200) throw new Error(JSON.stringify(response.jsonBody));
  const payload = response.jsonBody;
  const pages = Object.keys(expectedSections).map(Number).map((page) => {
    const mappings = payload.mappings.filter((mapping) => mapping.page === page && mapping.semanticCluster);
    const questionCatalogCount = extraction.fieldCatalog.filter((entry) => entry.page === page && (entry.semanticCluster === "Question" || entry.semanticCluster === "YesNoQuestion")).length;
    const sections = payload.semanticSections.filter((section) => section.page === page).map((section) => section.canonicalNodeId).sort();
    const suggestions = mappings.flatMap((mapping) => mapping.suggestions);
    return {
      page,
      sections,
      expectedSections: expectedSections[page],
      sectionMatch: JSON.stringify(sections) === JSON.stringify(expectedSections[page]),
      clusters: [...new Set(extraction.groupedStructures.semanticGroups.filter((group) => group.page === page).map((group) => group.label).filter(Boolean))].sort(),
      canonicalNodes: [...new Set(mappings.map((mapping) => mapping.chosen?.acordCode).filter(Boolean))].sort(),
      questionCount: mappings.filter((mapping) => mapping.chosen?.acordCode === "Question.Text").length,
      questionCatalogCount,
      allQuestionsMapped: mappings.filter((mapping) => mapping.chosen?.acordCode === "Question.Text").length === questionCatalogCount,
      booleanCount: mappings.filter((mapping) => mapping.chosen?.acordCode === "Question.BooleanAnswer").length,
      premisesIndices: [...new Set(mappings.map((mapping) => mapping.premisesIndex).filter(Number.isInteger))],
      locationIndices: [...new Set(mappings.map((mapping) => mapping.locationIndex).filter(Number.isInteger))],
      questionIndexCount: new Set(mappings.map((mapping) => mapping.questionIndex).filter(Number.isInteger)).size,
      yesNoIndices: [...new Set(mappings.map((mapping) => mapping.yesNoIndex).filter(Number.isInteger))],
      dictionaryOnlyCount: suggestions.filter((candidate) => candidate.rp9?.ontologyScope === "dictionary-only").length,
      legacySuggestionCount: suggestions.filter((candidate) => legacyPattern.test(candidate.acordCode || "")).length,
    };
  });
  let checkboxValidation = { valid: false, reason: "Snapshot does not contain fieldCatalog and checkboxGroups" };
  if (Array.isArray(snapshot.fieldCatalog) && Array.isArray(snapshot.groupedStructures?.checkboxGroups)) {
    const catalog = JSON.parse(JSON.stringify(snapshot.fieldCatalog));
    const semanticGroups = [
      ...buildRp9PremisesGroups(catalog),
      ...buildRp9QuestionGroups(catalog, snapshot.groupedStructures.checkboxGroups),
      ...buildRp9GeneralInformationGroups(catalog),
    ];
    const checkboxResponse = await mapFields({
      json: async () => ({
        documentId: "rp9-acord125-checkbox-validation",
        sourceDocumentName: "sample-Acord-125.pdf",
        blocks: snapshot.blocks,
        fieldCatalog: catalog,
        groupedStructures: { ...snapshot.groupedStructures, semanticGroups },
        deterministic: true,
        familyId: "acord-125",
      }),
    }, { warn() {}, error(...args) { console.error(...args); } });
    if (checkboxResponse.status !== 200) throw new Error(JSON.stringify(checkboxResponse.jsonBody));
    const booleanPages = [1, 4, 5, 6].map((page) => {
      const mappings = checkboxResponse.jsonBody.mappings.filter((mapping) => mapping.page === page && mapping.semanticCluster);
      const booleans = mappings.filter((mapping) => mapping.chosen?.acordCode === "Question.BooleanAnswer");
      const suggestions = mappings.flatMap((mapping) => mapping.suggestions);
      return {
        page,
        yesNoGroupCount: semanticGroups.filter((group) => group.page === page && group.label === "YesNo").length,
        booleanMappingCount: booleans.length,
        yesNoIndices: [...new Set(booleans.map((mapping) => mapping.yesNoIndex).filter(Number.isInteger))].sort((left, right) => left - right),
        dictionaryOnlyCount: suggestions.filter((candidate) => candidate.rp9?.ontologyScope === "dictionary-only").length,
        legacySuggestionCount: suggestions.filter((candidate) => legacyPattern.test(candidate.acordCode || "")).length,
      };
    });
    checkboxValidation = {
      valid: booleanPages.every((page) => page.yesNoGroupCount > 0 && page.booleanMappingCount > 0 && page.yesNoIndices.length > 0 && page.dictionaryOnlyCount === 0 && page.legacySuggestionCount === 0),
      totalYesNoGroups: booleanPages.reduce((sum, page) => sum + page.yesNoGroupCount, 0),
      totalBooleanMappings: booleanPages.reduce((sum, page) => sum + page.booleanMappingCount, 0),
      pages: booleanPages,
    };
  }
  const report = {
    schemaVersion: "rp9-acord125-all-sections-validation.v1",
    valid: pages.every((page) => page.sectionMatch && page.allQuestionsMapped && page.dictionaryOnlyCount === 0 && page.legacySuggestionCount === 0) && checkboxValidation.valid,
    blocks: extraction.blocks.length,
    fields: extraction.fieldCatalog.length,
    semanticGroupCount: extraction.groupedStructures.semanticGroups.length,
    pages,
    checkboxValidation,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.valid) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
