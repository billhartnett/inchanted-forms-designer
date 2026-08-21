const path = require("node:path");

const apiRoot = path.resolve(__dirname, "..");
const apiBaseUrl = String(process.env.XFDL_VALIDATION_API_BASE_URL || "").replace(/\/$/, "");
const pipeline = apiBaseUrl ? null : require(path.join(apiRoot, "dist", "services", "xfdlRp9MappingPipeline.js"));
const mapFields = apiBaseUrl ? null : require(path.join(apiRoot, "dist", "api", "mapFields.js")).mapFields;

process.env.PRODUCTION_BASELINE = "RP-8";
process.env.SEMANTIC_BASELINE = "RP-9";
process.env.DEPLOYMENT_ENVIRONMENT = "staging";
process.env.XFDL_PRIMARY_MAPPING = "1";

const cases = [
  { family: "ACORD 125", source: "sample-Acord-125.pdf", familyId: "acord-125", label: "CLASSIFICATION CODE", valueType: "numeric", expected: "Classification.Code" },
  { family: "ACORD 126", source: "ACORD_126_-_Commercial_General_Liability_Section.pdf", familyId: "acord-126", label: "GROSS RECEIPTS AMOUNT", valueType: "currency", expected: "GrossReceipts.Amount" },
  { family: "ACORD 130", source: "sample-Acord-130.pdf", familyId: "acord-130", label: "ANNUAL PAYROLL $ AMOUNT", valueType: "currency", expected: "Payroll.Amount" },
  { family: "Markel supplemental", source: "Markel MAIL 021 09_15.pdf", familyId: "supplemental", label: "ANNUAL PAYROLL $ AMOUNT", valueType: "currency", expected: "Payroll.Amount" },
  { family: "Hartford supplemental", source: "Hartford SS_25_50_06_16.pdf", familyId: "supplemental", label: "TOTAL EXPOSURE $ AMOUNT", valueType: "currency", expected: "Exposure.Amount" },
  { family: "Philadelphia supplemental", source: "Philadelphia Salon_and_Day_Spa_App 2016-12.pdf", familyId: "supplemental", label: "NUMBER OF EMPLOYEES", valueType: "numeric", expected: "Integer" },
  { family: "Travelers supplemental", source: "Travelers CP-4650 2001-05.pdf", familyId: "supplemental", label: "NUMBER OF LOCATIONS", valueType: "numeric", expected: "Integer" },
  { family: "Chubb supplemental", source: "Chubb AV003.pdf", familyId: "supplemental", label: "GROSS RECEIPTS AMOUNT", valueType: "currency", expected: "GrossReceipts.Amount" },
];

function requestBody(current) {
  return {
    documentId: `xfdl-reconstruction-${current.familyId}-${current.family.replace(/\W+/g, "-").toLowerCase()}`,
    sourceDocumentName: current.source,
    familyId: current.familyId,
    deterministic: true,
    blocks: [{ id: "value", page: 1, type: "text", text: current.label, confidence: 0.99, boundingBox: { x: 300, y: 200, width: 120, height: 20 } }],
    fieldCatalog: [
      { id: "row", page: 1, role: "row_label", valueType: "label", text: current.label, semanticLabel: current.label, boundingBox: { x: 20, y: 200, width: 250, height: 20 }, source: "di_table_cell", confidence: 0.99, tableId: "table-1", rowIndex: 1, columnIndex: 0 },
      { id: "column", page: 1, role: "column_header", valueType: "label", text: current.valueType === "currency" ? "$ AMOUNT" : "COUNT", semanticLabel: current.valueType === "currency" ? "$ AMOUNT" : "COUNT", boundingBox: { x: 300, y: 160, width: 120, height: 20 }, source: "di_table_cell", confidence: 0.99, tableId: "table-1", rowIndex: 0, columnIndex: 1 },
      { id: "value", page: 1, role: "table-cell", valueType: current.valueType, text: current.label, semanticLabel: current.label, boundingBox: { x: 300, y: 200, width: 120, height: 20 }, source: "di_table_cell", confidence: 0.99, tableId: "table-1", rowIndex: 1, columnIndex: 1 },
    ],
    groupedStructures: { labelInputPairs: [], tables: [{ id: "table-1", page: 1, rowCount: 2, columnCount: 2, rowGroupIds: ["table-1-row-2"] }], questionAnswerPairs: [], checkboxGroups: [], semanticGroups: [] },
  };
}

async function validate(current) {
  if (!apiBaseUrl) {
    const index = pipeline.getXfdlSemanticIndex(current.source, current.familyId);
    const sourceControls = index.fields.filter((field) => field.controlType !== "label");
    const requestedHits = index.fields.filter((field) => field.canonicalNodeIds.includes(current.expected)).length;
    const reconstructed = sourceControls.filter((field) => field.reconstructedLabel).length;
    const tableContextCount = sourceControls.filter((field) => field.rowHeader || field.columnHeader).length;
    const sectionCount = new Set(sourceControls.map((field) => field.section).filter(Boolean)).size;
    const booleanAnswerCount = sourceControls.filter((field) => field.bindingRole === "boolean-answer").length;
    return {
      family: current.family,
      source: current.source,
      valid: sourceControls.length === index.controlCount && reconstructed === sourceControls.length && requestedHits > 0 && sectionCount > 0,
      controlCount: index.controlCount,
      reconstructedLabelCount: reconstructed,
      tableContextCount,
      reconstructedSectionCount: sectionCount,
      booleanAnswerCount,
      expectedCanonicalNode: current.expected,
      expectedCanonicalNodeCount: requestedHits,
      legacyFallbackUsed: false,
    };
  }

  const body = requestBody(current);
  const response = await fetch(`${apiBaseUrl}/api/mapFields`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json();
  const mapping = payload.mappings?.find((item) => item.blockId === "value");
  return {
    family: current.family,
    source: current.source,
    valid: response.status === 200 && payload.contractVersion === "xfdl.rp9.mapping.v1" && payload.xfdlDiagnostics?.legacyFallbackUsed === false && mapping?.chosen?.acordCode === current.expected && Boolean(mapping?.semanticLabel) && Boolean(mapping?.reconstructedNumericType) && Boolean(mapping?.reconstructedSection),
    chosen: mapping?.chosen?.acordCode || null,
    semanticLabel: mapping?.semanticLabel || null,
    numericType: mapping?.reconstructedNumericType || null,
    section: mapping?.reconstructedSection || null,
    tableContext: mapping?.tableContext || null,
    legacyFallbackUsed: payload.xfdlDiagnostics?.legacyFallbackUsed,
  };
}

Promise.all(cases.map(validate)).then((results) => {
  const report = { schemaVersion: "xfdl-rp9-reconstruction-validation.v1", validationTarget: apiBaseUrl || "local", valid: results.every((result) => result.valid), results };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.valid) process.exitCode = 1;
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
