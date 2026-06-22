import type { MappingPersistencePayload } from "@shared/types";
import {
  getAcordOntologyNode,
  validateOntologySelection,
} from "../../../shared/src/acord/ontology";
import { resolveUnificationForCode } from "../../../shared/src/quality";
import {
  buildAcordMappings,
  collectAcceptedBindings,
  type SchemaGenerationInput,
} from "./acceptedBindings";

export type GeneratedAcordXml = {
  documentId?: string;
  generatedAt: string;
  xml: string;
  includedMappings: number;
  excludedMappings: number;
  ontologyIssues: string[];
  acordMappings: ReturnType<typeof buildAcordMappings>;
};

const CANONICAL_GENERATED_AT = "1970-01-01T00:00:00.000Z";

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
  const normalized = value
    .replace(/[^A-Za-z0-9_.-]/g, "_")
    .replace(/^[^A-Za-z_]+/, "");

  return normalized || "Field";
}

function readFieldValue(field: MappingPersistencePayload["fields"][number]): string {
  switch (field.type) {
    case "checkbox":
    case "radio":
      return field.checked ? "true" : "false";
    case "dropdown":
      return field.selectedOption || "";
    case "date":
      return field.value || "";
    case "numeric":
      return field.value === null || typeof field.value === "undefined"
        ? ""
        : String(field.value);
    case "signature":
      return field.signed ? "signed" : "";
    case "text":
      return field.text || "";
    default:
      return "";
  }
}

export function generateAcordXml(input: SchemaGenerationInput): GeneratedAcordXml {
  const bindings = collectAcceptedBindings(input);
  const lines: string[] = [];
  const ontologyIssues: string[] = [];

  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push("<ACORD>");
  lines.push(
    `  <Submission generatedAt="${escapeXml(CANONICAL_GENERATED_AT)}" documentId="${escapeXml(
      input.documentId || "unknown",
    )}">`,
  );

  const emittedCodes = new Set<string>();

  for (const binding of bindings) {
    const ontologyNode = getAcordOntologyNode(binding.chosenCandidate.acordCode);
    if (
      ontologyNode?.mutuallyExclusiveCodes.some((code) => emittedCodes.has(code))
    ) {
      ontologyIssues.push(
        `Skipped ${binding.chosenCandidate.acordCode} due to mutual exclusivity conflict.`,
      );
      continue;
    }
    const tag = toXmlTag(binding.chosenCandidate.acordCode);
    const value = escapeXml(readFieldValue(binding.field));
    const label = escapeXml(binding.chosenCandidate.label);
    const source = escapeXml(binding.field.metadata?.source || binding.chosenCandidate.source);
    const unification = resolveUnificationForCode(binding.chosenCandidate.acordCode);

    lines.push(
      `    <${tag} label="${label}" fieldId="${escapeXml(binding.field.id)}" extractionBlockId="${escapeXml(
        binding.extractionBlockId,
      )}" source="${source}" confidence="${binding.chosenCandidate.confidenceScore.toFixed(3)}" fusedConfidence="${(
        binding.chosenCandidate.normalizedConfidenceScore || binding.chosenCandidate.confidenceScore
      ).toFixed(3)}" unificationGroupId="${escapeXml(
        unification.groupId,
      )}" canonicalCode="${escapeXml(
        unification.canonicalCode,
      )}" equivalents="${escapeXml(unification.equivalentCodes.join("|"))}" pageIndex="${
        typeof binding.field.pageIndex === "number" ? binding.field.pageIndex : ""
      }" x="${formatNumber(binding.field.x)}" y="${formatNumber(binding.field.y)}" width="${formatNumber(binding.field.width)}" height="${
        formatNumber(binding.field.height)
      }" rotation="${formatNumber(binding.field.rotation)}">${value}</${tag}>`,
    );
    emittedCodes.add(binding.chosenCandidate.acordCode);
  }

  lines.push("  </Submission>");
  lines.push("</ACORD>");

  const selectionValidation = validateOntologySelection(Array.from(emittedCodes));
  for (const issue of selectionValidation.issues) {
    ontologyIssues.push(issue.message);
  }

  return {
    documentId: input.documentId,
    generatedAt: CANONICAL_GENERATED_AT,
    xml: lines.join("\n"),
    includedMappings: emittedCodes.size,
    excludedMappings: Math.max(0, input.mappings.length - emittedCodes.size),
    ontologyIssues,
    acordMappings: buildAcordMappings(bindings),
  };
}
