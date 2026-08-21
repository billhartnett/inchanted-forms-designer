const path = require("node:path");

const apiRoot = path.resolve(__dirname, "..");
const apiBaseUrl = String(process.env.XFDL_VALIDATION_API_BASE_URL || "").replace(/\/$/, "");
const mapFields = apiBaseUrl ? null : require(path.join(apiRoot, "dist", "api", "mapFields.js")).mapFields;

process.env.PRODUCTION_BASELINE = "RP-8";
process.env.SEMANTIC_BASELINE = "RP-9";
process.env.DEPLOYMENT_ENVIRONMENT = "staging";
process.env.XFDL_PRIMARY_MAPPING = "1";

const acord125Questions = [
  "Is the applicant a subsidiary of another entity?",
  "Does the applicant have any subsidiaries?",
  "Is a formal safety program in operation?",
  "Any exposure to flammables, explosives, chemicals?",
  "Any other insurance with this company?",
  "Any policy or coverage declined, cancelled or non-renewed during the mandated number of years?",
  "Any past losses or claims relating to sexual abuse or molestation allegations, discrimination or negligent hiring?",
];

const cases = [
  { family: "ACORD 125", source: "sample-Acord-125.pdf", familyId: "acord-125", questions: acord125Questions },
  { family: "ACORD 126", source: "ACORD_126_-_Commercial_General_Liability_Section.pdf", familyId: "acord-126", questions: ["Does the applicant subcontract work?"] },
  { family: "ACORD 130", source: "sample-Acord-130.pdf", familyId: "acord-130", questions: ["Any employees under 16 or over 60 years of age?"] },
  { family: "Markel supplemental", source: "Markel MAIL 021 09_15.pdf", familyId: "supplemental", questions: ["Do you have a formal safety program?"], answerControlCount: 2 },
];

function block(id, text, x, y, type = "text") {
  return { id, page: 1, type, text, confidence: 0.99, boundingBox: { x, y, width: type === "checkbox" ? 20 : 560, height: 20 } };
}

function catalog(id, text, x, y, role, valueType) {
  return { id, page: 1, role, valueType, text, semanticLabel: text, semanticSection: "general-information", boundingBox: { x, y, width: valueType === "checkbox" ? 20 : 560, height: 20 }, source: valueType === "checkbox" ? "selection_mark" : "di_line", confidence: 0.99 };
}

async function validate(current) {
  const answerControlCount = current.answerControlCount || 1;
  const blocks = current.questions.flatMap((question, index) => [
    block(`q-${index}`, question, 40, 100 + index * 40),
    ...Array.from({ length: answerControlCount }, (_, answerIndex) => block(`a-${index}-${answerIndex}`, answerIndex === 0 ? "YES" : "NO", 700 + answerIndex * 30, 100 + index * 40, "checkbox")),
  ]);
  const fieldCatalog = current.questions.flatMap((question, index) => [
    catalog(`q-${index}`, question, 40, 100 + index * 40, "question", "label"),
    ...Array.from({ length: answerControlCount }, (_, answerIndex) => catalog(`a-${index}-${answerIndex}`, answerIndex === 0 ? "YES" : "NO", 700 + answerIndex * 30, 100 + index * 40, "checkbox", "checkbox")),
  ]);
  const questionAnswerPairs = current.questions.map((_, index) => ({ id: `qa-${index}`, page: 1, questionFieldId: `q-${index}`, answerFieldId: `a-${index}-0` }));
  const checkboxGroups = answerControlCount > 1
    ? current.questions.map((_, index) => ({ id: `yes-no-${index}`, page: 1, checkboxFieldIds: Array.from({ length: answerControlCount }, (__, answerIndex) => `a-${index}-${answerIndex}`), labels: ["YES", "NO"] }))
    : [];
  const body = {
    documentId: `xfdl-binding-validation-${current.familyId}`,
    sourceDocumentName: current.source,
    familyId: current.familyId,
    deterministic: true,
    blocks,
    fieldCatalog,
    groupedStructures: { labelInputPairs: [], tables: [], questionAnswerPairs, checkboxGroups, semanticGroups: [] },
  };
  const response = apiBaseUrl
    ? await fetch(`${apiBaseUrl}/api/mapFields`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(async (result) => ({ status: result.status, jsonBody: await result.json() }))
    : await mapFields({ json: async () => body }, { warn() {}, error() {} });
  const payload = response.jsonBody;
  const bindings = payload.questionBindings || [];
  const placementsValid = bindings.every((binding) => binding.question.boundingBox.width > 0 && binding.question.boundingBox.height > 0 && binding.booleanAnswer.boundingBox.width > 0 && binding.booleanAnswer.boundingBox.height > 0);
  const semanticsValid = bindings.every((binding) => binding.canonicalNodeId === "Question.Text" && binding.question.fillable === false && binding.booleanAnswer.canonicalNodeId === "Question.BooleanAnswer" && binding.booleanAnswer.fillable === true);
  const questionsExcluded = payload.mappedFields.every((mapping) => mapping.questionBinding?.role !== "question");
  const answersIncluded = bindings.every((binding) => binding.booleanAnswer.controls.length === answerControlCount && binding.booleanAnswer.controls.every((control) => payload.mappedFields.some((mapping) => mapping.blockId === control.blockId)));
  return {
    family: current.family,
    source: current.source,
    valid: response.status === 200 && payload.contractVersion === "xfdl.rp9.mapping.v1" && payload.xfdlDiagnostics?.legacyFallbackUsed === false && bindings.length === current.questions.length && placementsValid && semanticsValid && questionsExcluded && answersIncluded,
    xfdlSourcePath: payload.xfdlDiagnostics?.xfdlSourcePath,
    controlCount: payload.xfdlDiagnostics?.xfdlControlCount,
    semanticFieldCount: payload.xfdlDiagnostics?.xfdlFieldCount,
    requestedBindingCount: current.questions.length,
    emittedBindingCount: bindings.length,
    answerControlsPerBinding: answerControlCount,
    placementsValid,
    questionsExcludedFromMappedFields: questionsExcluded,
    answersIncludedInMappedFields: answersIncluded,
    legacyFallbackUsed: payload.xfdlDiagnostics?.legacyFallbackUsed,
  };
}

Promise.all(cases.map(validate)).then((results) => {
  const report = { schemaVersion: "xfdl-rp9-question-binding-validation.v1", validationTarget: apiBaseUrl || "local", valid: results.every((result) => result.valid), results };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.valid) process.exitCode = 1;
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
