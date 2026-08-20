const path = require("node:path");

const apiRoot = path.resolve(__dirname, "..");
const { mapFields } = require(path.join(apiRoot, "dist", "api", "mapFields.js"));

process.env.PRODUCTION_BASELINE = "RP-8";
process.env.SEMANTIC_BASELINE = "RP-9";
process.env.DEPLOYMENT_ENVIRONMENT = "staging";
process.env.XFDL_PRIMARY_MAPPING = "1";

const cases = [
  { family: "ACORD 125", source: "sample-Acord-125.pdf", familyId: "acord-125", valueType: "checkbox", expected: "Question.BooleanAnswer", type: "checkbox" },
  { family: "ACORD 126", source: "ACORD_126_-_Commercial_General_Liability_Section.pdf", familyId: "acord-126", valueType: "currency", expected: "CurrencyAmount", type: "text" },
  { family: "ACORD 130", source: "sample-Acord-130.pdf", familyId: "acord-130", valueType: "percentage", expected: "Percentage", type: "text" },
  { family: "Supplemental", source: "Quaker_Special_Risk 04-18_QSR.pdf", familyId: "supplemental", valueType: "checkbox", expected: "Question.BooleanAnswer", type: "checkbox", table: true },
];

async function validate(current) {
  const tableId = current.table ? "questions" : undefined;
  const body = {
    documentId: `xfdl-validation-${current.familyId}`,
    sourceDocumentName: current.source,
    familyId: current.familyId,
    deterministic: true,
    blocks: [{ id: "field", page: 1, type: current.type, text: current.valueType === "currency" ? "PREMIUM" : current.valueType === "percentage" ? "OWNERSHIP %" : "YES", confidence: 0.99, boundingBox: { x: 20, y: 60, width: current.type === "checkbox" ? 20 : 180, height: 20 } }],
    fieldCatalog: [{ id: "field", page: 1, role: current.table ? "table-cell" : "input", valueType: current.valueType, text: "VALUE", semanticLabel: "VALUE", boundingBox: { x: 20, y: 60, width: current.type === "checkbox" ? 20 : 180, height: 20 }, source: current.type === "checkbox" ? "selection_mark" : "blank_detector", confidence: 0.99, tableId, rowIndex: current.table ? 1 : undefined, columnIndex: current.table ? 1 : undefined }],
    groupedStructures: { labelInputPairs: [], tables: current.table ? [{ id: tableId, page: 1, rowCount: 2, columnCount: 2, rowGroupIds: [`${tableId}-row-2`] }] : [], questionAnswerPairs: [], checkboxGroups: [], semanticGroups: [] },
  };
  const response = await mapFields({ json: async () => body }, { warn() {}, error() {} });
  const payload = response.jsonBody;
  const chosen = payload.mappings?.[0]?.chosen;
  return {
    family: current.family,
    source: current.source,
    valid: response.status === 200 && payload.contractVersion === "xfdl.rp9.mapping.v1" && payload.xfdlDiagnostics?.legacyFallbackUsed === false && chosen?.acordCode === current.expected,
    xfdlSourcePath: payload.xfdlDiagnostics?.xfdlSourcePath,
    pageCount: payload.xfdlDiagnostics?.xfdlPageCount,
    fieldCount: payload.xfdlDiagnostics?.xfdlFieldCount,
    canonicalFieldCount: payload.xfdlDiagnostics?.xfdlCanonicalFieldCount,
    chosen: chosen?.acordCode || null,
    confidence: chosen?.confidenceScore || null,
    tableAwareBlockCount: payload.xfdlDiagnostics?.tableAwareBlockCount || 0,
    legacyFallbackUsed: payload.xfdlDiagnostics?.legacyFallbackUsed,
  };
}

Promise.all(cases.map(validate)).then((results) => {
  const report = { schemaVersion: "xfdl-rp9-multi-form-validation.v1", valid: results.every((result) => result.valid), results };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.valid) process.exitCode = 1;
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});