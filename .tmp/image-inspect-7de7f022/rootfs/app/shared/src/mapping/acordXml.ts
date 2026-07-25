import type { AcordLabelCandidate } from "shared/acord";
import type { MappingPersistencePayload } from "shared/types";
import { getAcordOntologyNode, validateOntologySelection } from "shared/acord";
import { resolveUnificationForCode } from "shared/quality";

export type ExportAcordXmlResponse = {
  documentId?: string;
  generatedAt: string;
  xml: string;
  includedMappings: number;
  excludedMappings: number;
  ontologyIssues: string[];
};

type BuildAcordXmlOptions = {
  suppressedOcrBlockIds?: string[];
  generatedAt?: string;
};

const CANONICAL_GENERATED_AT = "1970-01-01T00:00:00.000Z";

type XmlNodeRecord = {
  extractionBlockId: string;
  field: MappingPersistencePayload["fields"][number];
  chosen: AcordLabelCandidate;
};

function compareXmlNodeRecord(left: XmlNodeRecord, right: XmlNodeRecord): number {
  const leftPage = typeof left.field.pageIndex === "number" ? left.field.pageIndex : Number.MAX_SAFE_INTEGER;
  const rightPage = typeof right.field.pageIndex === "number" ? right.field.pageIndex : Number.MAX_SAFE_INTEGER;

  return (
    leftPage - rightPage ||
    left.field.y - right.field.y ||
    left.field.x - right.field.x ||
    left.chosen.acordCode.localeCompare(right.chosen.acordCode) ||
    left.field.id.localeCompare(right.field.id) ||
    left.extractionBlockId.localeCompare(right.extractionBlockId)
  );
}

function formatNumber(value: number): string {
  return Number(value.toFixed(4)).toString();
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toXmlTag(value: string): string {
  const normalized = value.replace(/[^A-Za-z0-9_.-]/g, "_").replace(/^[^A-Za-z_]+/, "");

  return normalized || "Field";
}

function resolveFieldValue(field: MappingPersistencePayload["fields"][number]): string {
  switch (field.type) {
    case "checkbox":
    case "radio":
      return field.checked ? "true" : "false";
    case "dropdown":
      return field.selectedOption || "";
    case "date":
      return field.value || "";
    case "numeric":
      return field.value === null || typeof field.value === "undefined" ? "" : String(field.value);
    case "signature":
      return field.signed ? "signed" : "";
    case "text":
      return field.text || "";
    default:
      return "";
  }
}

function findField(
  payload: MappingPersistencePayload,
  extractionBlockId: string,
  fieldId?: string,
) {
  if (fieldId) {
    const byId = payload.fields.find((field) => field.id === fieldId);
    if (byId) {
      return byId;
    }
  }

  return payload.fields.find((field) => field.metadata?.extractionBlockId === extractionBlockId);
}

function resolveChosenCandidate(
  suggestions: AcordLabelCandidate[],
  chosen: AcordLabelCandidate | undefined,
  chosenCode: string | undefined,
) {
  if (chosenCode) {
    const byCode = suggestions.find((candidate) => candidate.acordCode === chosenCode);
    if (byCode) {
      return byCode;
    }
  }

  return chosen;
}

export function buildAcordXmlFromPayload(
  payload: MappingPersistencePayload,
  options: BuildAcordXmlOptions = {},
): ExportAcordXmlResponse {
  const suppressed = new Set(options.suppressedOcrBlockIds || []);
  const generatedAt = options.generatedAt || CANONICAL_GENERATED_AT;
  const lines: string[] = [];
  const nodeRecords: XmlNodeRecord[] = [];
  const ontologyIssues: string[] = [];
  let included = 0;

  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push("<ACORD>");
  lines.push(`  <Submission generatedAt="${escapeXml(generatedAt)}" documentId="${escapeXml(payload.documentId || "unknown")}">`);

  for (const record of payload.mappings) {
    const extractionBlockId = record.extractionBlockId;
    if (suppressed.has(extractionBlockId)) {
      continue;
    }

    const mappingNode = payload.decisionGraph.mappings[extractionBlockId];
    if (mappingNode?.decision !== "accepted") {
      continue;
    }

    const labelNode = payload.decisionGraph.labels[extractionBlockId];
    if (labelNode?.decision === "rejected") {
      continue;
    }

    const field = findField(payload, extractionBlockId, record.fieldId);
    if (!field) {
      continue;
    }

    const fieldNode = payload.decisionGraph.fields[field.id];
    if (fieldNode?.decision !== "accepted") {
      continue;
    }

    const chosenCode = mappingNode.chosenCandidateCode || record.mapping.chosen?.acordCode;
    const chosen = resolveChosenCandidate(record.mapping.suggestions, record.mapping.chosen, chosenCode);
    if (!chosen) {
      continue;
    }

    const chosenDecision = mappingNode.candidateDecisions?.[chosen.acordCode];
    if (chosenDecision === "rejected") {
      continue;
    }

    nodeRecords.push({ extractionBlockId, field, chosen });
  }

  nodeRecords.sort(compareXmlNodeRecord);
  const emittedCodes = new Set<string>();

  for (const record of nodeRecords) {
    const { extractionBlockId, field, chosen } = record;
    const ontologyNode = getAcordOntologyNode(chosen.acordCode);
    if (ontologyNode?.mutuallyExclusiveCodes.some((code) => emittedCodes.has(code))) {
      ontologyIssues.push(`Skipped ${chosen.acordCode} due to mutual exclusivity conflict.`);
      continue;
    }

    const tag = toXmlTag(chosen.acordCode);
    const value = escapeXml(resolveFieldValue(field));
    const label = escapeXml(chosen.label);
    const source = escapeXml(field.metadata?.source || chosen.source);
    const unification = resolveUnificationForCode(chosen.acordCode);

    lines.push(
      `    <${tag} label="${label}" fieldId="${escapeXml(field.id)}" extractionBlockId="${escapeXml(extractionBlockId)}" source="${source}" confidence="${chosen.confidenceScore.toFixed(3)}" fusedConfidence="${(chosen.normalizedConfidenceScore || chosen.confidenceScore).toFixed(3)}" unificationGroupId="${escapeXml(unification.groupId)}" canonicalCode="${escapeXml(unification.canonicalCode)}" equivalents="${escapeXml(unification.equivalentCodes.join("|"))}" pageIndex="${typeof field.pageIndex === "number" ? field.pageIndex : ""}" x="${formatNumber(field.x)}" y="${formatNumber(field.y)}" width="${formatNumber(field.width)}" height="${formatNumber(field.height)}" rotation="${formatNumber(field.rotation)}">${value}</${tag}>`,
    );
    emittedCodes.add(chosen.acordCode);
    included += 1;
  }

  const selectionValidation = validateOntologySelection(Array.from(emittedCodes));
  for (const issue of selectionValidation.issues) {
    ontologyIssues.push(issue.message);
  }

  lines.push("  </Submission>");
  lines.push("</ACORD>");

  return {
    documentId: payload.documentId,
    generatedAt,
    xml: lines.join("\n"),
    includedMappings: included,
    excludedMappings: Math.max(0, payload.mappings.length - included),
    ontologyIssues,
  };
}