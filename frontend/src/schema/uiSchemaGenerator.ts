import type { MappingPersistencePayload } from "@shared/types";
import { getAcordOntologyNode } from "../../../shared/src/acord/ontology";
import { resolveUnificationForCode } from "../../../shared/src/quality";
import {
  buildAcordMappings,
  collectAcceptedBindings,
  type SchemaGenerationInput,
} from "./acceptedBindings";

type UiSchemaField = {
  fieldId: string;
  extractionBlockId: string;
  type: string;
  pageIndex: number | null;
  geometry: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
  };
  display: {
    opacity: number;
    label: string;
    sourceText: string;
  };
  semantic: {
    acordCode: string;
    acordLabel: string;
    acordDescription?: string;
    confidenceScore: number;
    source: string;
    ontology?: {
      sections: string[];
      groups: string[];
      parentCodes: string[];
      childCodes: string[];
    };
    unification?: {
      groupId: string;
      canonicalCode: string;
      equivalentCodes: string[];
    };
  };
  decisions: {
    field: string;
    label: string;
    mapping: string;
    candidate: string;
  };
};

export type GeneratedUiSchema = {
  version: 1;
  generatedAt: string;
  documentId?: string;
  traceability: {
    totalMappings: number;
    acceptedMappings: number;
    suppressedBlocks: string[];
    thresholds: MappingPersistencePayload["decisionGraph"]["confidenceThresholds"];
  };
  acordMappings: ReturnType<typeof buildAcordMappings>;
  fields: UiSchemaField[];
};

const CANONICAL_GENERATED_AT = "1970-01-01T00:00:00.000Z";

export function generateUiSchema(
  input: SchemaGenerationInput,
): GeneratedUiSchema {
  const bindings = collectAcceptedBindings(input);

  return {
    version: 1,
    generatedAt: CANONICAL_GENERATED_AT,
    documentId: input.documentId,
    traceability: {
      totalMappings: input.mappings.length,
      acceptedMappings: bindings.length,
      suppressedBlocks: [...(input.suppressedOcrBlockIds || [])].sort((left, right) =>
        left.localeCompare(right),
      ),
      thresholds: input.decisionGraph.confidenceThresholds,
    },
    acordMappings: buildAcordMappings(bindings),
    fields: bindings.map((binding) => ({
      fieldId: binding.field.id,
      extractionBlockId: binding.extractionBlockId,
      type: binding.field.type,
      pageIndex:
        typeof binding.field.pageIndex === "number" ? binding.field.pageIndex : null,
      geometry: {
        x: binding.field.x,
        y: binding.field.y,
        width: binding.field.width,
        height: binding.field.height,
        rotation: binding.field.rotation,
      },
      display: {
        opacity: binding.field.opacity,
        label: binding.chosenCandidate.label,
        sourceText: binding.mapping.text,
      },
      semantic: {
        acordCode: binding.chosenCandidate.acordCode,
        acordLabel: binding.chosenCandidate.label,
        acordDescription:
          binding.chosenCandidate.description || binding.field.metadata?.acordDescription,
        confidenceScore:
          binding.chosenCandidate.confidenceScore ||
          binding.field.metadata?.confidenceScore ||
          0,
        source: binding.field.metadata?.source || "ai",
        ontology: (() => {
          const ontology = getAcordOntologyNode(binding.chosenCandidate.acordCode);
          if (!ontology) return undefined;
          return {
            sections: ontology.sections,
            groups: ontology.groups,
            parentCodes: ontology.parentCodes,
            childCodes: ontology.childCodes,
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
      decisions: {
        field: binding.fieldDecision,
        label: binding.labelDecision,
        mapping: binding.mappingDecision,
        candidate: binding.chosenDecision,
      },
    })),
  };
}
