import fs from "node:fs";
import path from "node:path";
import type { AcordLabelCandidate } from "shared/acord";
import type { BoundingBox, ExtractedBlock, FieldMapping } from "shared/types";
import type { ExtractDocumentFieldCatalogEntry } from "../types/extractDocumentContract";
import { getActiveRp9Runtime } from "./rp9OntologyRuntime";

export type XfdlAnswerType = "text" | "boolean" | "select" | "date" | "number" | "currency" | "signature";

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
};

export type XfdlSemanticIndex = {
  formId: string;
  sourcePath: string;
  pageCount: number;
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
};

type ScoredCandidate = {
  canonicalNodeId: string;
  field: XfdlSemanticField | null;
  xfdlLabelMatch: number;
  layoutLmValidation: number;
  sectionAlignment: number;
  geometryAlignment: number;
  score: number;
};

const WEIGHTS = Object.freeze({ xfdlLabelMatch: 0.55, layoutLmValidation: 0.2, sectionAlignment: 0.15, geometryAlignment: 0.1 });
const DIRECT_RP9_PATHS = new Map<string, string>([
  ["NamedInsured_FullName", "GeneralInfo.NamedInsured"],
  ["NamedInsured_MailingAddress_LineOne", "GeneralInfo.MailingAddress.Line1"],
  ["NamedInsured_MailingAddress_CityName", "GeneralInfo.MailingAddress.City"],
  ["NamedInsured_MailingAddress_StateOrProvinceCode", "GeneralInfo.MailingAddress.State"],
  ["NamedInsured_MailingAddress_PostalCode", "GeneralInfo.MailingAddress.PostalCode"],
]);
let cachedIndex: XfdlSemanticIndex | null = null;

function normalize(value: unknown): string {
  return String(value || "").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizedKey(value: unknown): string {
  return normalize(value).replace(/\s+/g, "");
}

function tokens(value: unknown): Set<string> {
  return new Set(normalize(value).split(/\s+/).filter((token) => token.length > 1).map((token) =>
    ["agent", "agency", "broker", "producer"].includes(token) ? "producer" : token,
  ));
}

function tokenSimilarity(left: unknown, right: unknown): number {
  const leftTokens = tokens(left);
  const rightTokens = tokens(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  let overlap = 0;
  for (const token of leftTokens) if (rightTokens.has(token)) overlap += 1;
  return (2 * overlap) / (leftTokens.size + rightTokens.size);
}

function quotedQuestion(helpText: string): string {
  const matches = [...String(helpText || "").matchAll(/["“]([^"”]*\?)["”]/g)];
  return matches.map((match) => match[1]).sort((left, right) => right.length - left.length)[0] || "";
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
  if (/signature/i.test(helpText)) return "signature";
  if (/enter\s+date/i.test(helpText)) return "date";
  if (/enter\s+(?:amount|currency)/i.test(helpText)) return "currency";
  if (/enter\s+(?:number|numeric|percent)/i.test(helpText)) return "number";
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

function nearestLabel(fieldGeometry: BoundingBox | null, labels: Array<{ value: string; geometry: BoundingBox | null }>, semanticContext: string): string {
  if (!fieldGeometry) return "";
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
      return { value: label.value, score: semanticRelevance * 400 - distance };
    })
    .sort((left, right) => right.score - left.score)[0]?.value || "";
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
  if (answer === "boolean" && /question|indicator|yes|no|check the box/.test(normalized)) matches.add("Question.BooleanAnswer");
  else if (/\?|question/.test(normalized)) matches.add("Question.Text");
  return [...matches];
}

export function parseXfdlSemanticIndex(xml: string, sourcePath = "inline", formId = "acord-125"): XfdlSemanticIndex {
  const pages: Array<{ page: number; body: string }> = [];
  const pageRegex = /<page\s+sid="([^"]+)"[^>]*>([\s\S]*?)<\/page>/gi;
  let pageMatch: RegExpExecArray | null;
  while ((pageMatch = pageRegex.exec(xml)) !== null) {
    const page = Number(pageMatch[1].match(/\d+/)?.[0] || pages.length + 1);
    pages.push({ page, body: pageMatch[2] });
  }
  const fields: XfdlSemanticField[] = [];
  for (const page of pages) {
    const labels: Array<{ value: string; geometry: BoundingBox | null }> = [];
    const labelRegex = /<label\s+sid="[^"]+"[^>]*>([\s\S]*?)<\/label>/gi;
    let labelMatch: RegExpExecArray | null;
    while ((labelMatch = labelRegex.exec(page.body)) !== null) {
      const value = decodeXml(labelMatch[1].match(/<value>([\s\S]*?)<\/value>/i)?.[1] || "");
      if (value) labels.push({ value, geometry: parseGeometry(labelMatch[1]) });
    }
    const helpMap = new Map<string, string>();
    const helpRegex = /<help\s+sid="([^"]+)"[^>]*>\s*<value>([\s\S]*?)<\/value>\s*<\/help>/gi;
    let helpMatch: RegExpExecArray | null;
    while ((helpMatch = helpRegex.exec(page.body)) !== null) helpMap.set(helpMatch[1], decodeXml(helpMatch[2]));
    const controlRegex = /<(field|check|combobox|popup|signature)\s+sid="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/gi;
    let controlMatch: RegExpExecArray | null;
    while ((controlMatch = controlRegex.exec(page.body)) !== null) {
      const controlType = controlMatch[1].toLowerCase();
      const sid = controlMatch[2];
      const body = controlMatch[3];
      const semanticPath = semanticPathFromSid(sid);
      const helpSid = body.match(/<help>([^<]+)<\/help>/i)?.[1]?.trim() || "";
      const helpText = helpMap.get(helpSid) || "";
      const geometry = parseGeometry(body);
      const label = nearestLabel(geometry, labels, `${semanticPath} ${helpText}`);
      const answer = answerType(controlType, helpText, body);
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
      });
    }
  }
  return { formId, sourcePath, pageCount: pages.length, fields };
}

function defaultXfdlPath(): string {
  return path.resolve(process.env.XFDL_SEMANTIC_ROOT || path.join(__dirname, "..", "..", "..", "..", "training-data", "ACORD 0125 2016-03r1.xfdl"));
}

export function getAcord125XfdlIndex(): XfdlSemanticIndex {
  if (cachedIndex) return cachedIndex;
  const sourcePath = defaultXfdlPath();
  if (!fs.existsSync(sourcePath)) throw new Error(`Missing authoritative ACORD 125 XFDL: ${sourcePath}`);
  cachedIndex = parseXfdlSemanticIndex(fs.readFileSync(sourcePath, "utf8"), sourcePath, "acord-125");
  return cachedIndex;
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

function scoreCandidate(block: ExtractedBlock, catalog: ExtractDocumentFieldCatalogEntry | undefined, field: XfdlSemanticField, canonicalNodeId: string, layoutLm: LayoutLmEvaluation | undefined, pageDimensions: PipelineInput["pageDimensions"], index: XfdlSemanticIndex): ScoredCandidate {
  const context = `${catalog?.semanticLabel || ""} ${catalog?.text || ""} ${block.text}`;
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
  const score = WEIGHTS.xfdlLabelMatch * xfdlLabelMatch + WEIGHTS.layoutLmValidation * layout + WEIGHTS.sectionAlignment * sectionAlignment + WEIGHTS.geometryAlignment * geometry;
  return { canonicalNodeId, field, xfdlLabelMatch, layoutLmValidation: layout, sectionAlignment, geometryAlignment: geometry, score };
}

function layoutLmOnlyCandidates(evaluation: LayoutLmEvaluation | undefined): ScoredCandidate[] {
  if (!evaluation?.topPredictions?.length) return [];
  const runtime = getActiveRp9Runtime();
  return evaluation.topPredictions.flatMap((prediction) => {
    const canonicalNodeId = runtime.aliases.get(normalizedKey(prediction.eLabelName));
    if (!canonicalNodeId) return [];
    const probability = Number(prediction.probability) || 0;
    return [{ canonicalNodeId, field: null, xfdlLabelMatch: 0, layoutLmValidation: probability, sectionAlignment: 0, geometryAlignment: 0, score: WEIGHTS.layoutLmValidation * probability }];
  });
}

export function mapBlocksWithXfdlRp9(input: PipelineInput): { mappings: FieldMapping[]; diagnostics: Record<string, unknown> } {
  const index = getAcord125XfdlIndex();
  const catalogById = new Map(input.fieldCatalog.map((entry) => [entry.id, entry]));
  let xfdlMatched = 0;
  let layoutLmOnly = 0;
  const mappings = input.blocks.map((block): FieldMapping => {
    const catalog = catalogById.get(block.id);
    const context = `${catalog?.semanticLabel || ""} ${catalog?.text || ""} ${block.text}`;
    const candidates = index.fields
      .filter((field) => field.canonicalNodeIds.length > 0)
      .filter((field) => field.page === block.page || tokenSimilarity(context, `${field.label} ${field.semanticPath}`) >= 0.55)
      .flatMap((field) => field.canonicalNodeIds.map((canonicalNodeId) => scoreCandidate(block, catalog, field, canonicalNodeId, input.layoutLmByBlock[block.id], input.pageDimensions, index)));
    const fallback = candidates.length === 0 ? layoutLmOnlyCandidates(input.layoutLmByBlock[block.id]) : [];
    const ranked = [...candidates, ...fallback]
      .sort((left, right) => right.score - left.score)
      .filter((candidate) => candidate.field
        ? candidate.score >= 0.4 && candidate.xfdlLabelMatch >= 0.35
        : candidate.layoutLmValidation >= 0.7)
      .filter((candidate, position, all) => all.findIndex((item) => item.canonicalNodeId === candidate.canonicalNodeId) === position)
      .slice(0, 5);
    if (ranked[0]?.field) xfdlMatched += 1;
    else if (ranked.length > 0) layoutLmOnly += 1;
    const suggestions = ranked.map((candidate): AcordLabelCandidate => ({
      acordCode: candidate.canonicalNodeId,
      label: getActiveRp9Runtime().nodes.get(candidate.canonicalNodeId)?.aliases?.[1] || candidate.canonicalNodeId,
      confidenceScore: Number(candidate.score.toFixed(6)),
      normalizedConfidenceScore: Number(candidate.score.toFixed(6)),
      source: candidate.field ? "heuristic" : "ai",
      lexicalScore: Number(candidate.xfdlLabelMatch.toFixed(6)),
      semanticSimilarity: Number(candidate.layoutLmValidation.toFixed(6)),
      heuristicScore: Number((candidate.sectionAlignment * WEIGHTS.sectionAlignment + candidate.geometryAlignment * WEIGHTS.geometryAlignment).toFixed(6)),
      rationale: candidate.field
        ? `XFDL ${candidate.field.sid} → RP-9; label=${candidate.xfdlLabelMatch.toFixed(3)}, layoutlm=${candidate.layoutLmValidation.toFixed(3)}, section=${candidate.sectionAlignment.toFixed(3)}, geometry=${candidate.geometryAlignment.toFixed(3)}.`
        : `LayoutLMv3 validated an unlabeled field directly against RP-9 (${candidate.layoutLmValidation.toFixed(3)}).`,
      xfdl: candidate.field ? {
        sid: candidate.field.sid,
        semanticPath: candidate.field.semanticPath,
        label: candidate.field.label,
        helpText: candidate.field.helpText,
        answerType: candidate.field.answerType,
        section: candidate.field.section,
        group: candidate.field.group,
        scores: {
          xfdlLabelMatch: candidate.xfdlLabelMatch,
          layoutLmValidation: candidate.layoutLmValidation,
          sectionAlignment: candidate.sectionAlignment,
          geometryAlignment: candidate.geometryAlignment,
          final: candidate.score,
        },
      } : undefined,
    } as AcordLabelCandidate));
    return { blockId: block.id, page: block.page, text: block.text, boundingBox: block.boundingBox, suggestions, topCandidate: suggestions[0] };
  });
  return {
    mappings,
    diagnostics: {
      pipeline: "xfdl-rp9-layoutlm.v1",
      formId: input.formId || index.formId,
      xfdlSourcePath: index.sourcePath,
      xfdlPageCount: index.pageCount,
      xfdlFieldCount: index.fields.length,
      xfdlCanonicalFieldCount: index.fields.filter((field) => field.canonicalNodeIds.length > 0).length,
      xfdlMatchedBlockCount: xfdlMatched,
      layoutLmOnlyBlockCount: layoutLmOnly,
      unresolvedBlockCount: mappings.filter((mapping) => mapping.suggestions.length === 0).length,
      weights: WEIGHTS,
      legacyFallbackUsed: false,
    },
  };
}

export function isXfdlPrimaryMappingEnabled(sourceDocumentName?: string, familyId?: string): boolean {
  return process.env.XFDL_PRIMARY_MAPPING === "1" &&
    String(process.env.SEMANTIC_BASELINE || "").toUpperCase() === "RP-9" &&
    String(process.env.DEPLOYMENT_ENVIRONMENT || "").toLowerCase() === "staging" &&
    (/acord[-_ ]?125/i.test(String(sourceDocumentName || "")) || /acord[-_ ]?125/i.test(String(familyId || "")));
}
