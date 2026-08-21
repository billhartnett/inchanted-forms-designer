import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import type { AcordLabelCandidate } from "shared/acord";
import type { BoundingBox, ExtractedBlock, FieldMapping, QuestionAnswerBinding, QuestionMappingBinding } from "shared/types";
import type { ExtractDocumentFieldCatalogEntry, ExtractDocumentGroupedStructures } from "../types/extractDocumentContract";
import { getActiveRp9Runtime } from "./rp9OntologyRuntime";

export type XfdlAnswerType = "text" | "boolean" | "select" | "date" | "number" | "currency" | "percent" | "signature";

export type XfdlSemanticField = {
  sid: string;
  semanticPath: string;
  controlType: string;
  answerType: XfdlAnswerType;
  page: number;
  label: string;
  helpText: string;
  section: string | null;
  group: string;
  geometry: BoundingBox | null;
  canonicalNodeIds: string[];
  questionFamilyId?: string;
  bindingRole?: "question" | "boolean-answer";
};

export type XfdlSemanticIndex = {
  formId: string;
  sourcePath: string;
  pageCount: number;
  controlCount: number;
  fields: XfdlSemanticField[];
};

type LayoutLmEvaluation = {
  topPredictions?: Array<{ eLabelName: string; probability: number; category?: string }>;
};

type PipelineInput = {
  blocks: ExtractedBlock[];
  fieldCatalog: ExtractDocumentFieldCatalogEntry[];
  layoutLmByBlock: Record<string, LayoutLmEvaluation>;
  pageDimensions?: Array<{ page: number; width: number; height: number }>;
  formId?: string;
  sourceDocumentName?: string;
  groupedStructures?: ExtractDocumentGroupedStructures;
};

type ScoredCandidate = {
  canonicalNodeId: string;
  field: XfdlSemanticField | null;
  xfdlLabelMatch: number;
  layoutLmValidation: number;
  sectionAlignment: number;
  geometryAlignment: number;
  tableAlignment: number;
  score: number;
  origin: "xfdl" | "layoutlm" | "type-rule";
};

const WEIGHTS = Object.freeze({ xfdlLabelMatch: 0.5, layoutLmValidation: 0.2, sectionAlignment: 0.1, geometryAlignment: 0.1, tableAlignment: 0.1 });
const DIRECT_RP9_PATHS = new Map<string, string>([
  ["NamedInsured_FullName", "GeneralInfo.NamedInsured"],
  ["NamedInsured_MailingAddress_LineOne", "GeneralInfo.MailingAddress.Line1"],
  ["NamedInsured_MailingAddress_CityName", "GeneralInfo.MailingAddress.City"],
  ["NamedInsured_MailingAddress_StateOrProvinceCode", "GeneralInfo.MailingAddress.State"],
  ["NamedInsured_MailingAddress_PostalCode", "GeneralInfo.MailingAddress.PostalCode"],
]);
const GENERAL_INFORMATION_QUESTION_PATTERNS = Object.freeze([
  "is the applicant a subsidiary of another entity",
  "does the applicant have any subsidiaries",
  "is a formal safety program in operation",
  "any exposure to flammables explosives chemicals",
  "any other insurance with this company",
  "any policy or coverage declined cancelled or non renewed during the mandated number of years",
  "any past losses or claims relating to sexual abuse or molestation allegations discrimination or negligent hiring",
]);
const indexCache = new Map<string, XfdlSemanticIndex>();

function normalize(value: unknown): string {
  return String(value || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/\b(?:agent|agency|broker)\b/g, "producer")
    .replace(/\b(?:named\s+insured|applicant)\b/g, "insuredparty")
    .replace(/\bmailing\s+address\b|\baddress\b/g, "address")
    .replace(/\b(?:city|town)\b/g, "city")
    .replace(/\b(?:state|province)\b/g, "state")
    .replace(/\b(?:zip\s+code|postal\s+code|zip|postal)\b/g, "postalcode")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizedKey(value: unknown): string {
  return normalize(value).replace(/\s+/g, "");
}

function tokens(value: unknown): Set<string> {
  return new Set(normalize(value).split(/\s+/).filter((token) => token.length > 1));
}

function tokenSimilarity(left: unknown, right: unknown): number {
  const leftTokens = tokens(left);
  const rightTokens = tokens(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  let overlap = 0;
  for (const token of leftTokens) if (rightTokens.has(token)) overlap += 1;
  return (2 * overlap) / (leftTokens.size + rightTokens.size);
}

export function xfdlLabelSimilarity(left: unknown, right: unknown): number {
  return tokenSimilarity(left, right);
}

function quotedQuestion(helpText: string): string {
  const matches = [...String(helpText || "").matchAll(/["“]([^"”]*\?)["”]/g)];
  return matches.map((match) => match[1]).sort((left, right) => right.length - left.length)[0] || "";
}

function questionTextFrom(helpText: string, label: string): string {
  const quoted = quotedQuestion(helpText);
  if (quoted) return quoted;
  const helpQuestion = String(helpText || "").match(/^([\s\S]*?\?)/)?.[1]?.trim();
  if (helpQuestion) return helpQuestion;
  return /\?/.test(label) ? label.match(/^([\s\S]*?\?)/)?.[1]?.trim() || "" : "";
}

function decodeXml(value: string): string {
  return value
    .replace(/&#xA;|&#10;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function parseGeometry(body: string): BoundingBox | null {
  const absolute = body.match(/<ae>\s*<ae>absolute<\/ae>\s*<ae>(-?\d+(?:\.\d+)?)<\/ae>\s*<ae>(-?\d+(?:\.\d+)?)<\/ae>\s*<\/ae>/i);
  const extent = body.match(/<ae>\s*<ae>extent<\/ae>\s*<ae>(-?\d+(?:\.\d+)?)<\/ae>\s*<ae>(-?\d+(?:\.\d+)?)<\/ae>\s*<\/ae>/i);
  if (!absolute || !extent) return null;
  return { x: Number(absolute[1]), y: Number(absolute[2]), width: Number(extent[1]), height: Number(extent[2]) };
}

function semanticPathFromSid(sid: string): string {
  return sid.replace(/_[A-Z]$/, "");
}

function answerType(controlType: string, helpText: string, body: string): XfdlAnswerType {
  if (controlType === "check") return "boolean";
  if (/\benter\s+y\b[\s\S]*\byes\b[\s\S]*\b(?:input|enter)\s+n\b[\s\S]*\bno\b/i.test(helpText)) return "boolean";
  if (/signature/i.test(helpText)) return "signature";
  if (/enter\s+date/i.test(helpText)) return "date";
  if (/enter\s+(?:amount|currency)/i.test(helpText)) return "currency";
  if (/percent|percentage|%/i.test(`${helpText} ${body}`)) return "percent";
  if (/enter\s+(?:number|numeric)/i.test(helpText)) return "number";
  if (controlType === "combobox" || /<type>\s*(?:select|choice)/i.test(body)) return "select";
  return "text";
}

function groupFromPath(semanticPath: string): string {
  return semanticPath.split("_")[0] || "General";
}

function inferSection(label: string, semanticPath: string): string | null {
  const value = normalize(`${label} ${semanticPath}`);
  if (/producer|agency|agent/.test(value)) return "producer-information";
  if (/premises|location|building|commercial structure/.test(value)) return "premises-information";
  if (/question|hazard|exposure|operations|business information/.test(value)) return "general-information";
  if (/named insured|applicant/.test(value)) return "applicant-information";
  return null;
}

type XfdlLabel = { sid: string; value: string; geometry: BoundingBox | null };

function nearestLabel(fieldGeometry: BoundingBox | null, labels: XfdlLabel[], semanticContext: string): XfdlLabel | null {
  if (!fieldGeometry) return null;
  const centerX = fieldGeometry.x + fieldGeometry.width / 2;
  const centerY = fieldGeometry.y + fieldGeometry.height / 2;
  return labels
    .filter((label) => label.geometry)
    .map((label) => {
      const geometry = label.geometry!;
      const labelX = geometry.x + geometry.width / 2;
      const labelY = geometry.y + geometry.height / 2;
      const directionalPenalty = labelX > centerX + fieldGeometry.width && labelY > centerY + fieldGeometry.height ? 250 : 0;
      const distance = Math.hypot(centerX - labelX, centerY - labelY) + directionalPenalty;
      const semanticRelevance = tokenSimilarity(label.value, semanticContext);
      return { label, score: semanticRelevance * 400 - distance };
    })
    .sort((left, right) => right.score - left.score)[0]?.label || null;
}

function questionLabel(labels: XfdlLabel[], questionText: string): XfdlLabel | null {
  if (!questionText) return null;
  const match = labels
    .filter((label) => label.geometry && label.geometry.width > 0 && label.geometry.height > 0)
    .map((label) => ({ label, similarity: tokenSimilarity(label.value, questionText) }))
    .sort((left, right) => right.similarity - left.similarity)[0];
  return match && match.similarity >= 0.35 ? match.label : null;
}

function canonicalNodesFor(semanticPath: string, label: string, helpText: string, answer: XfdlAnswerType): string[] {
  const runtime = getActiveRp9Runtime();
  const bridged = DIRECT_RP9_PATHS.get(semanticPath);
  if (bridged && runtime.nodes.has(bridged)) return [bridged];
  const direct = runtime.aliases.get(normalizedKey(semanticPath));
  if (direct) return [direct];
  const matches = new Set<string>();
  const context = `${semanticPath} ${label} ${helpText}`;
  for (const [id, node] of runtime.nodes) {
    const aliases = [id, ...(node.aliases || []), ...(node.synonyms || [])];
    const similarity = Math.max(...aliases.map((alias) => tokenSimilarity(context, alias)));
    if (similarity >= 0.72) matches.add(id);
  }
  const normalized = normalize(context);
  const isGeneralInformationQuestion = GENERAL_INFORMATION_QUESTION_PATTERNS.some((pattern) => normalized.includes(normalize(pattern)));
  if (answer === "boolean" || isGeneralInformationQuestion) matches.add("Question.BooleanAnswer");
  if (answer === "currency") matches.add("CurrencyAmount");
  if (answer === "percent") matches.add("Percentage");
  else if (/\?|question/.test(normalized)) matches.add("Question.Text");
  return [...matches];
}

export function parseXfdlSemanticIndex(xml: string, sourcePath = "inline", formId = "acord-125"): XfdlSemanticIndex {
  if (/content-encoding\s*=\s*["']?base64-gzip/i.test(xml.slice(0, 200))) {
    const encoded = xml.replace(/^[^\r\n]*(?:\r?\n)/, "").replace(/\s+/g, "");
    xml = zlib.gunzipSync(Buffer.from(encoded, "base64")).toString("utf8");
  }
  const pages: Array<{ page: number; body: string }> = [];
  const pageRegex = /<page\s+sid="([^"]+)"[^>]*>([\s\S]*?)<\/page>/gi;
  let pageMatch: RegExpExecArray | null;
  while ((pageMatch = pageRegex.exec(xml)) !== null) {
    const page = Number(pageMatch[1].match(/\d+/)?.[0] || pages.length + 1);
    pages.push({ page, body: pageMatch[2] });
  }
  const fields: XfdlSemanticField[] = [];
  let controlCount = 0;
  for (const page of pages) {
    const labels: XfdlLabel[] = [];
    const labelRegex = /<label\s+sid="([^"]+)"[^>]*>([\s\S]*?)<\/label>/gi;
    let labelMatch: RegExpExecArray | null;
    while ((labelMatch = labelRegex.exec(page.body)) !== null) {
      const value = decodeXml(labelMatch[2].match(/<value>([\s\S]*?)<\/value>/i)?.[1] || "");
      if (value) labels.push({ sid: labelMatch[1], value, geometry: parseGeometry(labelMatch[2]) });
    }
    const helpMap = new Map<string, string>();
    const helpRegex = /<help\s+sid="([^"]+)"[^>]*>\s*<value>([\s\S]*?)<\/value>\s*<\/help>/gi;
    let helpMatch: RegExpExecArray | null;
    while ((helpMatch = helpRegex.exec(page.body)) !== null) helpMap.set(helpMatch[1], decodeXml(helpMatch[2]));
    const controlRegex = /<(field|check|combobox|popup|signature)\s+sid="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/gi;
    let controlMatch: RegExpExecArray | null;
    while ((controlMatch = controlRegex.exec(page.body)) !== null) {
      controlCount += 1;
      const controlType = controlMatch[1].toLowerCase();
      const sid = controlMatch[2];
      const body = controlMatch[3];
      const semanticPath = semanticPathFromSid(sid);
      const helpSid = body.match(/<help>([^<]+)<\/help>/i)?.[1]?.trim() || "";
      const helpText = helpMap.get(helpSid) || "";
      const geometry = parseGeometry(body);
      const nearest = nearestLabel(geometry, labels, `${semanticPath} ${helpText}`);
      const label = nearest?.value || "";
      const answer = answerType(controlType, helpText, body);
      const questionText = answer === "boolean" ? questionTextFrom(helpText, label) : "";
      const familyId = questionText ? `xfdl-question-${page.page}-${normalizedKey(questionText)}` : undefined;
      fields.push({
        sid,
        semanticPath,
        controlType,
        answerType: answer,
        page: page.page,
        label,
        helpText,
        section: inferSection(label, semanticPath),
        group: groupFromPath(semanticPath),
        geometry,
        canonicalNodeIds: canonicalNodesFor(semanticPath, label, helpText, answer),
        questionFamilyId: familyId,
        bindingRole: familyId ? "boolean-answer" : undefined,
      });
      const visualQuestion = questionLabel(labels, questionText);
      if (familyId && visualQuestion?.geometry && !fields.some((field) => field.questionFamilyId === familyId && field.bindingRole === "question")) {
        fields.push({
          sid: visualQuestion.sid,
          semanticPath: `${semanticPath}_QuestionText`,
          controlType: "label",
          answerType: "text",
          page: page.page,
          label: questionText,
          helpText,
          section: inferSection(questionText, semanticPath),
          group: groupFromPath(semanticPath),
          geometry: visualQuestion.geometry,
          canonicalNodeIds: ["Question.Text"],
          questionFamilyId: familyId,
          bindingRole: "question",
        });
      }
    }
  }
  return { formId, sourcePath, pageCount: pages.length, controlCount, fields };
}

function xfdlRoot(): string {
  return path.resolve(process.env.XFDL_SEMANTIC_ROOT || path.join(__dirname, "..", "..", "..", "..", "training-data"));
}

export function getAcord125XfdlIndex(): XfdlSemanticIndex {
  const sourcePath = path.join(xfdlRoot(), "ACORD 0125 2016-03r1.xfdl");
  if (!fs.existsSync(sourcePath)) throw new Error(`Missing authoritative ACORD 125 XFDL: ${sourcePath}`);
  if (!indexCache.has(sourcePath)) indexCache.set(sourcePath, parseXfdlSemanticIndex(fs.readFileSync(sourcePath, "utf8"), sourcePath, "acord-125"));
  return indexCache.get(sourcePath)!;
}

function resolveXfdlPath(sourceDocumentName?: string, formId?: string): string | null {
  const root = xfdlRoot();
  if (!fs.existsSync(root)) return null;
  const requested = normalize(`${formId || ""} ${path.parse(sourceDocumentName || "").name}`);
  const acordNumber = requested.match(/\bacord\s+0*(125|126|130)\b/)?.[1];
  const files = fs.readdirSync(root).filter((name) => /\.xfdl$/i.test(name));
  if (acordNumber) return path.join(root, files.find((name) => new RegExp(`^ACORD\\s+0*${acordNumber}\\b`, "i").test(name)) || "");
  const ranked = files.map((name) => ({ name, similarity: tokenSimilarity(requested, path.parse(name).name) })).sort((left, right) => right.similarity - left.similarity);
  return ranked[0]?.similarity >= 0.55 ? path.join(root, ranked[0].name) : null;
}

export function getXfdlSemanticIndex(sourceDocumentName?: string, formId?: string): XfdlSemanticIndex {
  const sourcePath = resolveXfdlPath(sourceDocumentName || "sample-Acord-125.pdf", formId || "acord-125");
  if (!sourcePath || !fs.existsSync(sourcePath)) throw new Error(`Missing authoritative XFDL for ${sourceDocumentName || formId || "unknown form"}`);
  if (!indexCache.has(sourcePath)) indexCache.set(sourcePath, parseXfdlSemanticIndex(fs.readFileSync(sourcePath, "utf8"), sourcePath, formId || path.parse(sourcePath).name));
  return indexCache.get(sourcePath)!;
}

function sectionForCatalog(entry: ExtractDocumentFieldCatalogEntry | undefined): string | null {
  return entry?.semanticSection || (entry?.semanticCluster?.startsWith("Producer") ? "producer-information" : entry?.semanticCluster?.startsWith("Premises") ? "premises-information" : entry?.semanticCluster?.startsWith("General") || entry?.semanticCluster?.includes("Question") ? "general-information" : null);
}

function answerCompatibility(block: ExtractedBlock, entry: ExtractDocumentFieldCatalogEntry | undefined, field: XfdlSemanticField): number {
  const type = String(entry?.valueType || block.type || "text").toLowerCase();
  if ((type === "checkbox" || type === "radio") && field.answerType === "boolean") return 1;
  if (type === field.answerType) return 1;
  if (type === "text" && ["text", "date", "number", "currency", "select"].includes(field.answerType)) return 0.65;
  return 0.15;
}

function geometryAlignment(block: ExtractedBlock, field: XfdlSemanticField, pageDimensions: PipelineInput["pageDimensions"], index: XfdlSemanticIndex): number {
  if (!field.geometry || block.page !== field.page) return 0;
  const inputPage = pageDimensions?.find((item) => item.page === block.page);
  const inputWidth = inputPage?.width || 816;
  const inputHeight = inputPage?.height || 1056;
  const xfdlPageFields = index.fields.filter((item) => item.page === field.page && item.geometry);
  const xfdlWidth = Math.max(960, ...xfdlPageFields.map((item) => item.geometry!.x + item.geometry!.width));
  const xfdlHeight = Math.max(1056, ...xfdlPageFields.map((item) => item.geometry!.y + item.geometry!.height));
  const left = { x: (block.boundingBox.x + block.boundingBox.width / 2) / inputWidth, y: (block.boundingBox.y + block.boundingBox.height / 2) / inputHeight };
  const right = { x: (field.geometry.x + field.geometry.width / 2) / xfdlWidth, y: (field.geometry.y + field.geometry.height / 2) / xfdlHeight };
  return Math.max(0, 1 - Math.hypot(left.x - right.x, left.y - right.y) / Math.SQRT2);
}

function layoutLmValidation(canonicalNodeId: string, evaluation: LayoutLmEvaluation | undefined): number {
  if (!evaluation?.topPredictions?.length) return 0;
  const runtime = getActiveRp9Runtime();
  let best = 0;
  for (const prediction of evaluation.topPredictions) {
    const resolved = runtime.aliases.get(normalizedKey(prediction.eLabelName));
    if (resolved === canonicalNodeId) best = Math.max(best, Number(prediction.probability) || 0);
  }
  return best;
}

function tableContext(catalog: ExtractDocumentFieldCatalogEntry | undefined, fieldCatalog: ExtractDocumentFieldCatalogEntry[]): string {
  if (!catalog?.tableId) return "";
  return fieldCatalog
    .filter((entry) => entry.tableId === catalog.tableId && (entry.rowIndex === catalog.rowIndex || entry.columnIndex === catalog.columnIndex))
    .map((entry) => `${entry.semanticLabel || ""} ${entry.text || ""}`)
    .join(" ");
}

function scoreCandidate(block: ExtractedBlock, catalog: ExtractDocumentFieldCatalogEntry | undefined, field: XfdlSemanticField, canonicalNodeId: string, layoutLm: LayoutLmEvaluation | undefined, pageDimensions: PipelineInput["pageDimensions"], index: XfdlSemanticIndex, fieldCatalog: ExtractDocumentFieldCatalogEntry[], groupedStructures: ExtractDocumentGroupedStructures | undefined): ScoredCandidate {
  const table = tableContext(catalog, fieldCatalog);
  const context = `${catalog?.semanticLabel || ""} ${catalog?.text || ""} ${block.text} ${table}`;
  const lexical = Math.max(
    normalizedKey(context) === normalizedKey(field.label) ? 1 : 0,
    tokenSimilarity(context, field.label),
    tokenSimilarity(context, field.semanticPath),
    tokenSimilarity(context, field.helpText),
    tokenSimilarity(context, quotedQuestion(field.helpText)),
  );
  const xfdlLabelMatch = Math.min(1, 0.85 * lexical + 0.15 * answerCompatibility(block, catalog, field));
  const layout = layoutLmValidation(canonicalNodeId, layoutLm);
  const node = getActiveRp9Runtime().nodes.get(canonicalNodeId);
  const section = sectionForCatalog(catalog);
  const sectionAlignment = section && node?.sections?.includes(section) ? 1 : section ? 0 : 0.5;
  const geometry = geometryAlignment(block, field, pageDimensions, index);
  const declaredTable = Boolean(catalog?.tableId && groupedStructures?.tables.some((item) => item.id === catalog.tableId && item.page === block.page));
  const tableAlignment = declaredTable ? Math.max(tokenSimilarity(table, field.label), tokenSimilarity(table, field.semanticPath), tokenSimilarity(table, field.helpText)) : 0;
  const score = WEIGHTS.xfdlLabelMatch * xfdlLabelMatch + WEIGHTS.layoutLmValidation * layout + WEIGHTS.sectionAlignment * sectionAlignment + WEIGHTS.geometryAlignment * geometry + WEIGHTS.tableAlignment * tableAlignment;
  return { canonicalNodeId, field, xfdlLabelMatch, layoutLmValidation: layout, sectionAlignment, geometryAlignment: geometry, tableAlignment, score, origin: "xfdl" };
}

function layoutLmOnlyCandidates(evaluation: LayoutLmEvaluation | undefined): ScoredCandidate[] {
  if (!evaluation?.topPredictions?.length) return [];
  const runtime = getActiveRp9Runtime();
  return evaluation.topPredictions.flatMap((prediction) => {
    const canonicalNodeId = runtime.aliases.get(normalizedKey(prediction.eLabelName));
    if (!canonicalNodeId) return [];
    const probability = Number(prediction.probability) || 0;
    return [{ canonicalNodeId, field: null, xfdlLabelMatch: 0, layoutLmValidation: probability, sectionAlignment: 0, geometryAlignment: 0, tableAlignment: 0, score: WEIGHTS.layoutLmValidation * probability, origin: "layoutlm" }];
  });
}

function globalTypeCandidate(block: ExtractedBlock, catalog: ExtractDocumentFieldCatalogEntry | undefined): ScoredCandidate | null {
  const type = String(catalog?.valueType || block.type || "").toLowerCase();
  const canonicalNodeId = type === "checkbox" || type === "radio"
    ? "Question.BooleanAnswer"
    : type === "currency"
      ? "CurrencyAmount"
      : type === "percentage" || type === "percent"
        ? "Percentage"
        : null;
  if (!canonicalNodeId || !getActiveRp9Runtime().nodes.has(canonicalNodeId)) return null;
  return { canonicalNodeId, field: null, xfdlLabelMatch: 1, layoutLmValidation: 0, sectionAlignment: 1, geometryAlignment: 0, tableAlignment: catalog?.tableId ? 1 : 0, score: catalog?.tableId ? 1 : 0.9, origin: "type-rule" };
}

function hasPlacement(mapping: FieldMapping | undefined): mapping is FieldMapping {
  return Boolean(mapping && mapping.boundingBox.width > 0 && mapping.boundingBox.height > 0);
}

function bindingCandidate(canonicalNodeId: "Question.Text" | "Question.BooleanAnswer", rationale: string): AcordLabelCandidate {
  return {
    acordCode: canonicalNodeId,
    label: canonicalNodeId,
    confidenceScore: 1,
    normalizedConfidenceScore: 1,
    source: "heuristic",
    lexicalScore: 1,
    semanticSimilarity: 0,
    heuristicScore: 1,
    rationale,
  } as AcordLabelCandidate;
}

function bindQuestionMappings(mappings: FieldMapping[], input: PipelineInput): { mappings: FieldMapping[]; questionBindings: QuestionAnswerBinding[] } {
  const byId = new Map(mappings.map((mapping) => [mapping.blockId, mapping]));
  const bindings: QuestionAnswerBinding[] = [];
  const boundBlocks = new Set<string>();

  const attach = (id: string, questionBlockId: string, answerBlockIds: string[], source: QuestionAnswerBinding["source"]): void => {
    const uniqueAnswerIds = [...new Set(answerBlockIds)].filter((answerBlockId) => answerBlockId !== questionBlockId && !boundBlocks.has(answerBlockId));
    if (uniqueAnswerIds.length === 0) return;
    const question = byId.get(questionBlockId);
    const answers = uniqueAnswerIds.map((answerBlockId) => byId.get(answerBlockId)).filter(hasPlacement);
    if (!hasPlacement(question) || boundBlocks.has(questionBlockId) || answers.length !== uniqueAnswerIds.length || answers.some((answer) => answer.page !== question.page)) return;
    const primaryAnswer = answers[0];
    const questionCandidate = bindingCandidate("Question.Text", `${source} binds structural question text to ${uniqueAnswerIds.join(", ")}.`);
    const answerCandidate = bindingCandidate("Question.BooleanAnswer", `${source} attaches boolean answer to ${questionBlockId}.`);
    const baseBinding = { bindingId: id, questionBlockId, booleanAnswerBlockId: primaryAnswer.blockId, booleanAnswerBlockIds: uniqueAnswerIds };
    byId.set(questionBlockId, {
      ...question,
      suggestions: [questionCandidate],
      topCandidate: questionCandidate,
      questionBinding: { ...baseBinding, role: "question" } satisfies QuestionMappingBinding,
    });
    for (const answer of answers) {
      byId.set(answer.blockId, {
        ...answer,
        suggestions: [answerCandidate],
        topCandidate: answerCandidate,
        questionBinding: { ...baseBinding, role: "boolean-answer" } satisfies QuestionMappingBinding,
      });
    }
    bindings.push({
      id,
      page: question.page,
      canonicalNodeId: "Question.Text",
      source,
      question: { blockId: questionBlockId, text: question.text, boundingBox: question.boundingBox, canonicalNodeId: "Question.Text", fillable: false },
      booleanAnswer: {
        blockId: primaryAnswer.blockId,
        boundingBox: primaryAnswer.boundingBox,
        canonicalNodeId: "Question.BooleanAnswer",
        fillable: true,
        controls: answers.map((answer) => ({ blockId: answer.blockId, boundingBox: answer.boundingBox })),
      },
    });
    boundBlocks.add(questionBlockId);
    for (const answerBlockId of uniqueAnswerIds) boundBlocks.add(answerBlockId);
  };

  for (const pair of input.groupedStructures?.questionAnswerPairs || []) {
    const checkboxGroup = input.groupedStructures?.checkboxGroups.find((group) => group.checkboxFieldIds.includes(pair.answerFieldId));
    attach(pair.id, pair.questionFieldId, checkboxGroup?.checkboxFieldIds || [pair.answerFieldId], "extractor-pair");
  }

  const families = new Map<string, { question?: string; answers: string[] }>();
  for (const mapping of mappings) {
    const catalog = input.fieldCatalog.find((entry) => entry.id === mapping.blockId);
    const questionEligible = catalog?.role === "question" || catalog?.valueType === "label";
    const answerEligible = catalog?.role === "checkbox" || catalog?.valueType === "checkbox";
    for (const suggestion of mapping.suggestions as Array<AcordLabelCandidate & { xfdl?: { questionFamilyId?: string; bindingRole?: string } }>) {
      const familyId = suggestion.xfdl?.questionFamilyId;
      const role = suggestion.xfdl?.bindingRole;
      if (!familyId || (role !== "question" && role !== "boolean-answer")) continue;
      const family = families.get(familyId) || { answers: [] };
      if (role === "question" && questionEligible && !family.question) family.question = mapping.blockId;
      if (role === "boolean-answer" && answerEligible && !family.answers.includes(mapping.blockId)) family.answers.push(mapping.blockId);
      families.set(familyId, family);
    }
  }
  for (const [familyId, family] of families) {
    if (family.question && family.answers.length > 0) attach(familyId, family.question, family.answers, "xfdl-family");
  }

  return { mappings: mappings.map((mapping) => byId.get(mapping.blockId) || mapping), questionBindings: bindings };
}

export function mapBlocksWithXfdlRp9(input: PipelineInput): { mappings: FieldMapping[]; questionBindings: QuestionAnswerBinding[]; diagnostics: Record<string, unknown> } {
  const index = getXfdlSemanticIndex(input.sourceDocumentName, input.formId);
  const catalogById = new Map(input.fieldCatalog.map((entry) => [entry.id, entry]));
  let xfdlMatched = 0;
  let layoutLmOnly = 0;
  const mappings = input.blocks.map((block): FieldMapping => {
    const catalog = catalogById.get(block.id);
    const context = `${catalog?.semanticLabel || ""} ${catalog?.text || ""} ${block.text}`;
    const candidates = index.fields
      .filter((field) => field.canonicalNodeIds.length > 0)
      .filter((field) => field.page === block.page || tokenSimilarity(context, `${field.label} ${field.semanticPath}`) >= 0.55)
      .flatMap((field) => field.canonicalNodeIds.map((canonicalNodeId) => scoreCandidate(block, catalog, field, canonicalNodeId, input.layoutLmByBlock[block.id], input.pageDimensions, index, input.fieldCatalog, input.groupedStructures)));
    const fallback = candidates.length === 0 ? layoutLmOnlyCandidates(input.layoutLmByBlock[block.id]) : [];
    const typeCandidate = globalTypeCandidate(block, catalog);
    if (typeCandidate?.canonicalNodeId === "Question.BooleanAnswer") {
      typeCandidate.field = candidates
        .filter((candidate) => candidate.canonicalNodeId === "Question.BooleanAnswer" && candidate.field?.questionFamilyId)
        .sort((left, right) => right.score - left.score)[0]?.field || null;
    }
    const ranked = [...(typeCandidate ? [typeCandidate] : []), ...candidates, ...fallback]
      .sort((left, right) => right.score - left.score)
      .filter((candidate) => candidate.origin === "type-rule" || (candidate.field
        ? candidate.score >= 0.4 && candidate.xfdlLabelMatch >= 0.35
        : candidate.layoutLmValidation >= 0.7))
      .filter((candidate, position, all) => all.findIndex((item) => item.canonicalNodeId === candidate.canonicalNodeId) === position)
      .slice(0, 5);
    if (ranked[0]?.field) xfdlMatched += 1;
    else if (ranked.length > 0) layoutLmOnly += 1;
    const suggestions = ranked.map((candidate): AcordLabelCandidate => ({
      acordCode: candidate.canonicalNodeId,
      label: getActiveRp9Runtime().nodes.get(candidate.canonicalNodeId)?.aliases?.[1] || candidate.canonicalNodeId,
      confidenceScore: Number(candidate.score.toFixed(6)),
      normalizedConfidenceScore: Number(candidate.score.toFixed(6)),
      source: candidate.origin === "layoutlm" ? "ai" : "heuristic",
      lexicalScore: Number(candidate.xfdlLabelMatch.toFixed(6)),
      semanticSimilarity: Number(candidate.layoutLmValidation.toFixed(6)),
      heuristicScore: Number((candidate.sectionAlignment * WEIGHTS.sectionAlignment + candidate.geometryAlignment * WEIGHTS.geometryAlignment).toFixed(6)),
      rationale: candidate.field
        ? `XFDL ${candidate.field.sid} → RP-9; label=${candidate.xfdlLabelMatch.toFixed(3)}, layoutlm=${candidate.layoutLmValidation.toFixed(3)}, section=${candidate.sectionAlignment.toFixed(3)}, geometry=${candidate.geometryAlignment.toFixed(3)}.`
        : candidate.origin === "type-rule"
          ? `Global ${String(catalog?.valueType || block.type)} type rule → RP-9 ${candidate.canonicalNodeId}.`
          : `LayoutLMv3 validated an unlabeled field directly against RP-9 (${candidate.layoutLmValidation.toFixed(3)}).`,
      xfdl: candidate.field ? {
        sid: candidate.field.sid,
        semanticPath: candidate.field.semanticPath,
        label: candidate.field.label,
        helpText: candidate.field.helpText,
        answerType: candidate.field.answerType,
        section: candidate.field.section,
        group: candidate.field.group,
        questionFamilyId: candidate.field.questionFamilyId,
        bindingRole: candidate.field.bindingRole,
        scores: {
          xfdlLabelMatch: candidate.xfdlLabelMatch,
          layoutLmValidation: candidate.layoutLmValidation,
          sectionAlignment: candidate.sectionAlignment,
          geometryAlignment: candidate.geometryAlignment,
          tableAlignment: candidate.tableAlignment,
          final: candidate.score,
        },
      } : undefined,
    } as AcordLabelCandidate));
    return { blockId: block.id, page: block.page, text: block.text, boundingBox: block.boundingBox, suggestions, topCandidate: suggestions[0] };
  });
  const bound = bindQuestionMappings(mappings, input);
  return {
    mappings: bound.mappings,
    questionBindings: bound.questionBindings,
    diagnostics: {
      pipeline: "xfdl-rp9-layoutlm.v1",
      formId: input.formId || index.formId,
      xfdlSourcePath: index.sourcePath,
      xfdlPageCount: index.pageCount,
      xfdlControlCount: index.controlCount,
      xfdlFieldCount: index.fields.length,
      xfdlCanonicalFieldCount: index.fields.filter((field) => field.canonicalNodeIds.length > 0).length,
      xfdlMatchedBlockCount: xfdlMatched,
      layoutLmOnlyBlockCount: layoutLmOnly,
      unresolvedBlockCount: bound.mappings.filter((mapping) => mapping.suggestions.length === 0).length,
      questionBindingCount: bound.questionBindings.length,
      extractorQuestionBindingCount: bound.questionBindings.filter((binding) => binding.source === "extractor-pair").length,
      xfdlQuestionBindingCount: bound.questionBindings.filter((binding) => binding.source === "xfdl-family").length,
      weights: WEIGHTS,
      generalInformationQuestionPatternCount: GENERAL_INFORMATION_QUESTION_PATTERNS.length,
      tableAwareBlockCount: input.fieldCatalog.filter((entry) => Boolean(entry.tableId && input.groupedStructures?.tables.some((table) => table.id === entry.tableId && table.page === entry.page))).length,
      legacyFallbackUsed: false,
    },
  };
}

export function isXfdlPrimaryMappingEnabled(sourceDocumentName?: string, familyId?: string): boolean {
  return process.env.XFDL_PRIMARY_MAPPING === "1" &&
    String(process.env.SEMANTIC_BASELINE || "").toUpperCase() === "RP-9" &&
    String(process.env.DEPLOYMENT_ENVIRONMENT || "").toLowerCase() === "staging" &&
    Boolean(resolveXfdlPath(sourceDocumentName, familyId));
}
