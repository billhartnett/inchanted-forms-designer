import type {
  AcordLabel,
  AcordLabelCandidate,
  AcordMappings,
} from "@shared/acord/acordTypes";
import type {
  Field,
  FieldMapping,
  MappingPersistencePayload,
  MappingReviewRecord,
  ReviewDecision,
} from "@shared/types";

export type SchemaGenerationInput = MappingPersistencePayload & {
  suppressedOcrBlockIds?: string[];
  acordLabelsByCode?: Record<string, AcordLabel>;
};

export type AcceptedBinding = {
  field: Field;
  mapping: FieldMapping;
  record: MappingReviewRecord;
  extractionBlockId: string;
  chosenCandidate: AcordLabelCandidate;
  chosenDecision: ReviewDecision;
  labelDecision: ReviewDecision;
  fieldDecision: ReviewDecision;
  mappingDecision: ReviewDecision;
  acordLabel?: AcordLabel;
};

function compareBinding(left: AcceptedBinding, right: AcceptedBinding): number {
  const leftPage = typeof left.field.pageIndex === "number" ? left.field.pageIndex : Number.MAX_SAFE_INTEGER;
  const rightPage = typeof right.field.pageIndex === "number" ? right.field.pageIndex : Number.MAX_SAFE_INTEGER;

  return (
    leftPage - rightPage ||
    left.field.y - right.field.y ||
    left.field.x - right.field.x ||
    left.chosenCandidate.acordCode.localeCompare(right.chosenCandidate.acordCode) ||
    left.field.id.localeCompare(right.field.id) ||
    left.extractionBlockId.localeCompare(right.extractionBlockId)
  );
}

function findField(
  fields: Field[],
  record: MappingReviewRecord,
): Field | undefined {
  if (record.fieldId) {
    const byId = fields.find((field) => field.id === record.fieldId);
    if (byId) {
      return byId;
    }
  }

  return fields.find(
    (field) => field.metadata?.extractionBlockId === record.extractionBlockId,
  );
}

function resolveChosenCandidate(
  mapping: FieldMapping,
  chosenCode: string | undefined,
): AcordLabelCandidate | undefined {
  if (chosenCode) {
    const match = mapping.suggestions.find(
      (candidate) => candidate.acordCode === chosenCode,
    );
    if (match) {
      return match;
    }
  }

  return mapping.chosen;
}

export function collectAcceptedBindings(
  input: SchemaGenerationInput,
): AcceptedBinding[] {
  const suppressed = new Set(input.suppressedOcrBlockIds || []);

  return input.mappings
    .map((record) => {
      const extractionBlockId = record.extractionBlockId;
      if (suppressed.has(extractionBlockId)) {
        return null;
      }

      const mappingNode = input.decisionGraph.mappings[extractionBlockId];
      const labelNode = input.decisionGraph.labels[extractionBlockId];
      const mappingDecision = mappingNode?.decision || "pending";
      const labelDecision = labelNode?.decision || "pending";

      if (mappingDecision !== "accepted") {
        return null;
      }

      if (labelDecision === "rejected") {
        return null;
      }

      const field = findField(input.fields, record);
      if (!field) {
        return null;
      }

      const fieldDecision = input.decisionGraph.fields[field.id]?.decision || "pending";
      if (fieldDecision !== "accepted") {
        return null;
      }

      const chosenCode =
        mappingNode?.chosenCandidateCode || record.mapping.chosen?.acordCode;
      const chosenCandidate = resolveChosenCandidate(record.mapping, chosenCode);
      if (!chosenCandidate) {
        return null;
      }

      const chosenDecision =
        mappingNode?.candidateDecisions?.[chosenCandidate.acordCode] || "pending";
      if (chosenDecision === "rejected") {
        return null;
      }

      return {
        field,
        mapping: record.mapping,
        record,
        extractionBlockId,
        chosenCandidate,
        chosenDecision,
        labelDecision,
        fieldDecision,
        mappingDecision,
        acordLabel: input.acordLabelsByCode?.[chosenCandidate.acordCode],
      } satisfies AcceptedBinding;
    })
    .filter((binding): binding is AcceptedBinding => Boolean(binding))
    .sort(compareBinding);
}

export function buildAcordMappings(
  bindings: AcceptedBinding[],
): AcordMappings {
  const ordered = [...bindings].sort(compareBinding);
  return Object.fromEntries(
    ordered.map((binding) => [binding.extractionBlockId, binding.chosenCandidate]),
  );
}
