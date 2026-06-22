import type { Field, MappingPersistencePayload } from "@shared/types";
import { getAcordOntologyNode } from "../../../shared/src/acord/ontology";
import { resolveUnificationForCode } from "../../../shared/src/quality";
import {
  buildAcordMappings,
  collectAcceptedBindings,
  type SchemaGenerationInput,
} from "./acceptedBindings";

type JsonSchemaType = "string" | "number" | "boolean";

type JsonSchemaProperty = {
  type: JsonSchemaType;
  title: string;
  description?: string;
  default?: string | number | boolean;
  enum?: string[];
  minimum?: number;
  maximum?: number;
  "x-fieldId": string;
  "x-extractionBlockId": string;
  "x-acord": {
    code: string;
    label: string;
    source: string;
    confidenceScore: number;
    ontology?: {
      sections: string[];
      groups: string[];
      parentCodes: string[];
      requiredSiblingCodes: string[];
      mutuallyExclusiveCodes: string[];
    };
    unification?: {
      groupId: string;
      canonicalCode: string;
      equivalentCodes: string[];
    };
  };
  "x-geometry": {
    pageIndex: number | null;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
  };
  "x-decisions": {
    field: string;
    label: string;
    mapping: string;
    candidate: string;
  };
};

export type GeneratedJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema";
  $id: string;
  title: string;
  type: "object";
  additionalProperties: false;
  required: string[];
  properties: Record<string, JsonSchemaProperty>;
  "x-traceability": {
    documentId?: string;
    generatedAt: string;
    totalMappings: number;
    acceptedMappings: number;
    suppressedBlocks: string[];
    thresholds: MappingPersistencePayload["decisionGraph"]["confidenceThresholds"];
  };
  "x-acordMappings": ReturnType<typeof buildAcordMappings>;
};

const CANONICAL_GENERATED_AT = "1970-01-01T00:00:00.000Z";

function resolveJsonType(field: Field): JsonSchemaType {
  if (field.type === "checkbox" || field.type === "radio") {
    return "boolean";
  }

  if (field.type === "numeric") {
    return "number";
  }

  return "string";
}

function resolveDefaultValue(field: Field): string | number | boolean | undefined {
  switch (field.type) {
    case "checkbox":
    case "radio":
      return field.checked;
    case "dropdown":
      return field.selectedOption || undefined;
    case "date":
      return field.value || undefined;
    case "numeric":
      return field.value ?? undefined;
    case "signature":
      return field.signed ? "signed" : "";
    case "text":
      return field.text || undefined;
    default:
      return undefined;
  }
}

function toPropertyKey(base: string, used: Set<string>): string {
  const normalized = base
    .trim()
    .replace(/[^A-Za-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "") || "field";

  if (!used.has(normalized)) {
    used.add(normalized);
    return normalized;
  }

  let suffix = 2;
  while (used.has(`${normalized}_${suffix}`)) {
    suffix += 1;
  }

  const unique = `${normalized}_${suffix}`;
  used.add(unique);
  return unique;
}

export function generateJsonSchema(
  input: SchemaGenerationInput,
): GeneratedJsonSchema {
  const bindings = collectAcceptedBindings(input);
  const usedKeys = new Set<string>();
  const required: string[] = [];
  const properties: Record<string, JsonSchemaProperty> = {};

  for (const binding of bindings) {
    const key = toPropertyKey(binding.chosenCandidate.acordCode, usedKeys);
    const property: JsonSchemaProperty = {
      type: resolveJsonType(binding.field),
      title: binding.chosenCandidate.label,
      description:
        binding.chosenCandidate.description || binding.field.metadata?.acordDescription,
      default: resolveDefaultValue(binding.field),
      "x-fieldId": binding.field.id,
      "x-extractionBlockId": binding.extractionBlockId,
      "x-acord": {
        code: binding.chosenCandidate.acordCode,
        label: binding.chosenCandidate.label,
        source: binding.chosenCandidate.source,
        confidenceScore: binding.chosenCandidate.confidenceScore,
        ontology: (() => {
          const ontology = getAcordOntologyNode(binding.chosenCandidate.acordCode);
          if (!ontology) return undefined;
          return {
            sections: ontology.sections,
            groups: ontology.groups,
            parentCodes: ontology.parentCodes,
            requiredSiblingCodes: ontology.requiredSiblingCodes,
            mutuallyExclusiveCodes: ontology.mutuallyExclusiveCodes,
          };
        })(),
        unification: (() => {
          const unification = resolveUnificationForCode(binding.chosenCandidate.acordCode);
          return {
            groupId: unification.groupId,
            canonicalCode: unification.canonicalCode,
            equivalentCodes: unification.equivalentCodes,
          };
        })(),
      },
      "x-geometry": {
        pageIndex:
          typeof binding.field.pageIndex === "number" ? binding.field.pageIndex : null,
        x: binding.field.x,
        y: binding.field.y,
        width: binding.field.width,
        height: binding.field.height,
        rotation: binding.field.rotation,
      },
      "x-decisions": {
        field: binding.fieldDecision,
        label: binding.labelDecision,
        mapping: binding.mappingDecision,
        candidate: binding.chosenDecision,
      },
    };

    if (binding.field.type === "dropdown" && binding.field.options.length > 0) {
      property.enum = binding.field.options;
    }

    if (binding.field.type === "numeric") {
      property.minimum = binding.field.min;
      property.maximum = binding.field.max;
    }

    if (binding.field.metadata?.required) {
      required.push(key);
    }

    properties[key] = property;
  }

  required.sort((left, right) => left.localeCompare(right));

  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: `urn:inchanted:document:${input.documentId || "unknown"}:json-schema`,
    title: `${input.documentId || "Document"} Accepted ACORD Field Schema`,
    type: "object",
    additionalProperties: false,
    required,
    properties,
    "x-traceability": {
      documentId: input.documentId,
      generatedAt: CANONICAL_GENERATED_AT,
      totalMappings: input.mappings.length,
      acceptedMappings: bindings.length,
      suppressedBlocks: [...(input.suppressedOcrBlockIds || [])].sort((left, right) =>
        left.localeCompare(right),
      ),
      thresholds: input.decisionGraph.confidenceThresholds,
    },
    "x-acordMappings": buildAcordMappings(bindings),
  };
}
