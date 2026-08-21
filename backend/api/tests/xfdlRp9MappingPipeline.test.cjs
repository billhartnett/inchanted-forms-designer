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
  assert.equal(index.controlCount, 552);
  assert.equal(index.fields.length > index.controlCount, true);
  assert.equal(index.fields.filter((field) => field.controlType === "check").length, 164);
  assert.equal(index.fields.filter((field) => field.answerType === "boolean").length > 164, true);
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
  assert.deepEqual(withLayout.diagnostics.weights, { xfdlLabelMatch: 0.5, layoutLmValidation: 0.2, sectionAlignment: 0.1, geometryAlignment: 0.1, tableAlignment: 0.1 });
}));

test("expands required XFDL label aliases symmetrically", () => {
  for (const [left, right] of [
    ["PRODUCER", "AGENCY"],
    ["APPLICANT", "NAMED INSURED"],
    ["ADDRESS", "MAILING ADDRESS"],
    ["CITY", "TOWN"],
    ["STATE", "PROVINCE"],
    ["ZIP CODE", "POSTAL CODE"],
  ]) assert.equal(pipeline.xfdlLabelSimilarity(left, right), 1, `${left} should alias ${right}`);
});

test("applies global checkbox, currency, and percentage RP-9 type rules", () => withXfdlStaging(() => {
  const blocks = [
    block("boolean", "YES", 20, 60, "checkbox"),
    block("currency", "ANNUAL SALES", 20, 90),
    block("percent", "PERCENT OCCUPIED", 20, 120),
  ];
  const fieldCatalog = [
    catalog("boolean", "YES", 20, 60, "checkbox", "checkbox", "general-information"),
    catalog("currency", "ANNUAL SALES", 20, 90, "input", "currency", "general-information"),
    catalog("percent", "PERCENT OCCUPIED", 20, 120, "input", "percentage", "premises-information"),
  ];
  const result = pipeline.mapBlocksWithXfdlRp9({ blocks, fieldCatalog, layoutLmByBlock: {}, sourceDocumentName: "sample-Acord-125.pdf", formId: "acord-125" });
  assert.deepEqual(result.mappings.map((mapping) => mapping.suggestions[0].acordCode), ["Question.BooleanAnswer", "CurrencyAmount", "Percentage"]);
  assert.equal(result.mappings.every((mapping) => mapping.suggestions[0].rationale.startsWith("Global")), true);
}));

test("recognizes all seven ACORD 125 General Information question patterns", () => withXfdlStaging(() => {
  const index = pipeline.getAcord125XfdlIndex();
  const paths = ["AAICode", "AAJCode", "KAACode", "ABCCode", "AAHCode", "AACCode", "AADCode"];
  const questions = index.fields.filter((field) => field.bindingRole === "boolean-answer" && paths.some((code) => field.semanticPath.includes(`Question_${code}`)));
  assert.equal(questions.length, 7);
  assert.equal(questions.every((field) => field.canonicalNodeIds.includes("Question.BooleanAnswer")), true);
}));

test("binds structural question text to its boolean control without moving either placement", async () => withXfdlStaging(async () => {
  const question = block("question", "Is the applicant a subsidiary of another entity?", 40, 200);
  const answer = block("answer", "YES", 700, 200, "checkbox");
  const noAnswer = block("answer-no", "NO", 730, 200, "checkbox");
  const response = await mapFields({ json: async () => ({
    documentId: "question-binding",
    sourceDocumentName: "sample-Acord-125.pdf",
    familyId: "acord-125",
    blocks: [question, answer, noAnswer],
    fieldCatalog: [
      catalog("question", question.text, 40, 200, "question", "label", "general-information"),
      catalog("answer", "YES", 700, 200, "checkbox", "checkbox", "general-information"),
      catalog("answer-no", "NO", 730, 200, "checkbox", "checkbox", "general-information"),
    ],
    groupedStructures: { labelInputPairs: [], tables: [], questionAnswerPairs: [{ id: "qa-1", page: 1, questionFieldId: "question", answerFieldId: "answer" }], checkboxGroups: [{ id: "yes-no-1", page: 1, checkboxFieldIds: ["answer", "answer-no"], labels: ["YES", "NO"] }], semanticGroups: [] },
  }) }, { warn() {}, error() {} });
  const binding = response.jsonBody.questionBindings[0];
  const questionMapping = response.jsonBody.mappings.find((mapping) => mapping.blockId === "question");
  const answerMapping = response.jsonBody.mappings.find((mapping) => mapping.blockId === "answer");
  assert.equal(binding.canonicalNodeId, "Question.Text");
  assert.equal(binding.question.fillable, false);
  assert.equal(binding.booleanAnswer.canonicalNodeId, "Question.BooleanAnswer");
  assert.deepEqual(binding.question.boundingBox, question.boundingBox);
  assert.deepEqual(binding.booleanAnswer.boundingBox, answer.boundingBox);
  assert.deepEqual(binding.booleanAnswer.controls.map((control) => control.blockId), ["answer", "answer-no"]);
  assert.equal(questionMapping.chosen.acordCode, "Question.Text");
  assert.equal(answerMapping.chosen.acordCode, "Question.BooleanAnswer");
  assert.equal(response.jsonBody.mappedFields.some((mapping) => mapping.blockId === "question"), false);
  assert.equal(response.jsonBody.mappedFields.some((mapping) => mapping.blockId === "answer"), true);
  assert.equal(response.jsonBody.mappedFields.some((mapping) => mapping.blockId === "answer-no"), true);
}));

test("binds all seven ACORD 125 General Information questions", async () => withXfdlStaging(async () => {
  const questions = [
    "Is the applicant a subsidiary of another entity?",
    "Does the applicant have any subsidiaries?",
    "Is a formal safety program in operation?",
    "Any exposure to flammables, explosives, chemicals?",
    "Any other insurance with this company?",
    "Any policy or coverage declined, cancelled or non-renewed during the mandated number of years?",
    "Any past losses or claims relating to sexual abuse or molestation allegations, discrimination or negligent hiring?",
  ];
  const blocks = questions.flatMap((text, index) => [block(`q-${index}`, text, 40, 100 + index * 40), block(`a-${index}`, "YES", 700, 100 + index * 40, "checkbox")]);
  const fieldCatalog = questions.flatMap((text, index) => [catalog(`q-${index}`, text, 40, 100 + index * 40, "question", "label", "general-information"), catalog(`a-${index}`, "YES", 700, 100 + index * 40, "checkbox", "checkbox", "general-information")]);
  const questionAnswerPairs = questions.map((_, index) => ({ id: `qa-${index}`, page: 1, questionFieldId: `q-${index}`, answerFieldId: `a-${index}` }));
  const response = await mapFields({ json: async () => ({ documentId: "acord-125-seven-bindings", sourceDocumentName: "sample-Acord-125.pdf", familyId: "acord-125", blocks, fieldCatalog, groupedStructures: { labelInputPairs: [], tables: [], questionAnswerPairs, checkboxGroups: [], semanticGroups: [] } }) }, { warn() {}, error() {} });
  assert.equal(response.jsonBody.questionBindings.length, 7);
  assert.equal(response.jsonBody.questionBindings.every((binding) => binding.source === "extractor-pair" && binding.question.fillable === false && binding.booleanAnswer.fillable === true), true);
  assert.equal(response.jsonBody.mappedFields.some((mapping) => mapping.questionBinding?.role === "question"), false);
}));

test("does not create a question binding over empty space", () => withXfdlStaging(() => {
  const question = { ...block("question", "Question?", 40, 200), boundingBox: { x: 40, y: 200, width: 0, height: 0 } };
  const answer = block("answer", "YES", 700, 200, "checkbox");
  const result = pipeline.mapBlocksWithXfdlRp9({
    blocks: [question, answer],
    fieldCatalog: [catalog("question", "Question?", 40, 200, "question", "label"), catalog("answer", "YES", 700, 200, "checkbox", "checkbox")],
    layoutLmByBlock: {},
    sourceDocumentName: "sample-Acord-125.pdf",
    groupedStructures: { labelInputPairs: [], tables: [], questionAnswerPairs: [{ id: "qa-empty", page: 1, questionFieldId: "question", answerFieldId: "answer" }], checkboxGroups: [], semanticGroups: [] },
  });
  assert.equal(result.questionBindings.length, 0);
}));

test("infers an XFDL family binding without self-binding", () => withXfdlStaging(() => {
  const index = pipeline.getAcord125XfdlIndex();
  const answerField = index.fields.find((field) => field.bindingRole === "boolean-answer" && field.questionFamilyId);
  const questionField = index.fields.find((field) => field.questionFamilyId === answerField.questionFamilyId && field.bindingRole === "question");
  const pageFields = index.fields.filter((field) => field.page === answerField.page && field.geometry);
  const width = Math.max(...pageFields.map((field) => field.geometry.x + field.geometry.width));
  const height = Math.max(...pageFields.map((field) => field.geometry.y + field.geometry.height));
  const blocks = [
    { id: "question", page: questionField.page, type: "text", text: questionField.label, confidence: 0.99, boundingBox: questionField.geometry },
    { id: "answer", page: answerField.page, type: "checkbox", text: "YES", confidence: 0.99, boundingBox: answerField.geometry },
  ];
  const fieldCatalog = [
    { ...catalog("question", questionField.label, questionField.geometry.x, questionField.geometry.y, "question", "label"), page: questionField.page, boundingBox: questionField.geometry },
    { ...catalog("answer", "YES", answerField.geometry.x, answerField.geometry.y, "checkbox", "checkbox"), page: answerField.page, boundingBox: answerField.geometry },
  ];
  const result = pipeline.mapBlocksWithXfdlRp9({ blocks, fieldCatalog, layoutLmByBlock: {}, sourceDocumentName: "sample-Acord-125.pdf", pageDimensions: [{ page: questionField.page, width, height }] });
  assert.equal(result.questionBindings.length, 1);
  assert.equal(result.questionBindings[0].source, "xfdl-family");
  assert.equal(result.questionBindings[0].question.blockId, "question");
  assert.equal(result.questionBindings[0].booleanAnswer.blockId, "answer");
  assert.notEqual(result.questionBindings[0].question.blockId, result.questionBindings[0].booleanAnswer.blockId);
}));

test("adds table alignment evidence for supplemental application cells", () => withXfdlStaging(() => {
  const inputBlock = block("cell", "AGENCY NAME", 20, 60);
  const plainCatalog = catalog("cell", "NAME", 20, 60, "table-cell", "text", "producer-information");
  const tableCatalog = { ...plainCatalog, tableId: "producer-table", rowIndex: 1, columnIndex: 1 };
  const header = { ...catalog("header", "AGENCY", 20, 30, "column_header", "label", "producer-information"), tableId: "producer-table", rowIndex: 0, columnIndex: 1 };
  const plain = pipeline.mapBlocksWithXfdlRp9({ blocks: [inputBlock], fieldCatalog: [plainCatalog], layoutLmByBlock: {}, sourceDocumentName: "sample-Acord-125.pdf" });
  const table = pipeline.mapBlocksWithXfdlRp9({
    blocks: [inputBlock],
    fieldCatalog: [tableCatalog, header],
    layoutLmByBlock: {},
    sourceDocumentName: "sample-Acord-125.pdf",
    groupedStructures: { labelInputPairs: [], tables: [{ id: "producer-table", page: 1, rowCount: 2, columnCount: 2, rowGroupIds: ["producer-table-row-2"] }], questionAnswerPairs: [], checkboxGroups: [], semanticGroups: [] },
  });
  assert.equal(table.diagnostics.tableAwareBlockCount, 2);
  assert.equal(table.mappings[0].suggestions[0].xfdl.scores.tableAlignment > 0, true);
  assert.equal(table.mappings[0].suggestions[0].confidenceScore > plain.mappings[0].suggestions[0].confidenceScore, true);
}));

test("emits deduplicated role-aware table context", () => withXfdlStaging(() => {
  const inputBlock = block("value", "ANNUAL PAYROLL", 300, 200);
  const fieldCatalog = [
    { ...catalog("row", "ANNUAL PAYROLL", 20, 200, "row_label", "label"), tableId: "table-1", rowIndex: 1, columnIndex: 0 },
    { ...catalog("column", "$ AMOUNT", 300, 160, "column_header", "label"), tableId: "table-1", rowIndex: 0, columnIndex: 1 },
    { ...catalog("value", "ANNUAL PAYROLL", 300, 200, "table-cell", "currency"), tableId: "table-1", rowIndex: 1, columnIndex: 1 },
  ];
  const result = pipeline.mapBlocksWithXfdlRp9({ blocks: [inputBlock], fieldCatalog, layoutLmByBlock: {}, sourceDocumentName: "sample-Acord-130.pdf", groupedStructures: { labelInputPairs: [], tables: [{ id: "table-1", page: 1, rowCount: 2, columnCount: 2, rowGroupIds: ["table-1-row-2"] }], questionAnswerPairs: [], checkboxGroups: [], semanticGroups: [] } });
  assert.equal(result.mappings[0].semanticLabel, "ANNUAL PAYROLL - $ AMOUNT");
  assert.deepEqual(result.mappings[0].tableContext, { rowHeader: "ANNUAL PAYROLL", columnHeader: "$ AMOUNT" });
  assert.equal(result.mappings[0].suggestions[0].acordCode, "Payroll.Amount");
}));

test("loads ACORD 126, ACORD 130, and supplemental XFDL indexes", () => withXfdlStaging(() => {
  const cases = [
    ["ACORD_126_-_Commercial_General_Liability_Section.pdf", "acord-126", "ACORD 0126"],
    ["sample-Acord-130.pdf", "acord-130", "ACORD 0130"],
    ["Quaker_Special_Risk 04-18_QSR.pdf", "supplemental", "Quaker_Special_Risk 04-18_QSR"],
  ];
  for (const [source, formId, expected] of cases) {
    const index = pipeline.getXfdlSemanticIndex(source, formId);
    assert.equal(index.fields.length > 0, true, source);
    assert.equal(index.sourcePath.includes(expected), true, index.sourcePath);
  }
}));

test("reconstructs split labels and table row/column context", () => withXfdlStaging(() => {
  const location = (x, y, width, height) => `<itemLocation><ae><ae>absolute</ae><ae>${x}</ae><ae>${y}</ae></ae><ae><ae>extent</ae><ae>${width}</ae><ae>${height}</ae></ae></itemLocation>`;
  const xml = `<page sid="PAGE1">
    <label sid="row-a">${location(20, 100, 65, 16)}<value>ANNUAL</value></label>
    <label sid="row-b">${location(88, 100, 70, 16)}<value>PAYROLL</value></label>
    <label sid="column">${location(200, 60, 100, 18)}<value>$ AMOUNT</value></label>
    <field sid="Payroll_Amount_A">${location(200, 100, 100, 18)}<value></value></field>
  </page>`;
  const index = pipeline.parseXfdlSemanticIndex(xml, "inline-payroll", "supplemental");
  const field = index.fields.find((item) => item.sid === "Payroll_Amount_A");
  assert.match(field.reconstructedLabel, /ANNUAL PAYROLL/i);
  assert.match(field.reconstructedLabel, /\$ AMOUNT/i);
  assert.equal(field.rowHeader, "ANNUAL PAYROLL");
  assert.equal(field.columnHeader, "$ AMOUNT");
  assert.equal(field.numericType, "currency");
  assert.equal(field.canonicalNodeIds[0], "Payroll.Amount");
  assert.equal(field.section, "payroll-exposure");
}));

test("infers all supplemental numeric semantic types", () => withXfdlStaging(() => {
  const cases = [
    ["Annual payroll $ amount", "Payroll.Amount", "currency"],
    ["Payroll percentage %", "Payroll.Percentage", "percent"],
    ["Gross receipts amount", "GrossReceipts.Amount", "currency"],
    ["Total exposure $ amount", "Exposure.Amount", "currency"],
    ["Hazard percentage", "Hazard.Percentage", "percent"],
    ["Rate per $100", "Rate.Per100", "rate-per-100"],
    ["Rate per $1,000", "Rate.Per1000", "rate-per-1000"],
    ["Total premium", "Premium.Amount", "currency"],
    ["Classification code", "Classification.Code", "integer"],
    ["Classification description", "Classification.Description", "text"],
    ["Number of employees", "Integer", "integer"],
    ["Experience modifier decimal", "Decimal", "decimal"],
  ];
  for (const [text, nodeId, type] of cases) {
    const inferred = pipeline.inferSupplementalNumericSemantics(text);
    assert.equal(inferred.nodeId, nodeId, text);
    assert.equal(inferred.type, type, text);
  }
}));

test("reconstructs semantics across ACORD 130 and carrier supplemental XFDLs", () => withXfdlStaging(() => {
  const cases = [
    ["sample-Acord-130.pdf", "acord-130"],
    ["Markel MAIL 021 09_15.pdf", "supplemental"],
    ["Hartford SS_25_50_06_16.pdf", "supplemental"],
    ["Philadelphia Salon_and_Day_Spa_App 2016-12.pdf", "supplemental"],
    ["Travelers CP-4650 2001-05.pdf", "supplemental"],
  ];
  const requestedNodes = new Set(["Payroll.Amount", "GrossReceipts.Amount", "Exposure.Amount", "Premium.Amount", "Classification.Code", "Classification.Description", "Integer", "Decimal"]);
  for (const [source, formId] of cases) {
    const index = pipeline.getXfdlSemanticIndex(source, formId);
    assert.equal(index.fields.filter((field) => field.controlType !== "label").every((field) => Boolean(field.reconstructedLabel)), true, source);
    assert.equal(index.fields.some((field) => field.canonicalNodeIds.some((nodeId) => requestedNodes.has(nodeId))), true, source);
    assert.equal(index.fields.some((field) => field.section?.includes("supplemental") || ["payroll-exposure", "classification", "rating"].includes(field.section)), true, source);
  }
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

test("XFDL primary mapping gate is staging-only and XFDL-backed-form-only", () => {
  const previous = { SEMANTIC_BASELINE: process.env.SEMANTIC_BASELINE, DEPLOYMENT_ENVIRONMENT: process.env.DEPLOYMENT_ENVIRONMENT, XFDL_PRIMARY_MAPPING: process.env.XFDL_PRIMARY_MAPPING };
  process.env.XFDL_PRIMARY_MAPPING = "1";
  process.env.SEMANTIC_BASELINE = "RP-9";
  process.env.DEPLOYMENT_ENVIRONMENT = "production";
  assert.equal(pipeline.isXfdlPrimaryMappingEnabled("sample-Acord-125.pdf", "acord-125"), false);
  process.env.DEPLOYMENT_ENVIRONMENT = "staging";
  assert.equal(pipeline.isXfdlPrimaryMappingEnabled("sample-Acord-125.pdf", "acord-125"), true);
  assert.equal(pipeline.isXfdlPrimaryMappingEnabled("sample-Acord-126.pdf", "acord-126"), true);
  assert.equal(pipeline.isXfdlPrimaryMappingEnabled("sample-Acord-999.pdf", "acord-999"), false);
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});
