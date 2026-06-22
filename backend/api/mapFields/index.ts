import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";

import {
  mapBlocksWithAcord,
} from "../../mapping";
import { getDefaultOntologyMetadata } from "shared/acord";
import { coerceExtractedBlock } from "../../extraction";
import type {
  CalibrationProfile,
  ExtractedBlock,
  FieldMapping,
  MappingPersistencePayload,
  UnifiedDecisionGraph,
} from "../../types";

type MapFieldsRequest = {
  documentId?: string;
  blocks?: ExtractedBlock[];
  context?: string;
  deterministic?: boolean;
  calibrationProfile?: CalibrationProfile;
  familyId?: string;
  decisionGraph?: UnifiedDecisionGraph;
  semanticMemorySnapshot?: MappingPersistencePayload["semanticMemorySnapshot"];
  semanticMemoryDecisions?: MappingPersistencePayload["semanticMemoryDecisions"];
};

function createMappingDecisionGraph(
  mappings: FieldMapping[],
  existing?: UnifiedDecisionGraph,
): UnifiedDecisionGraph {
  const orderedMappings = [...mappings].sort(
    (left, right) =>
      left.blockId.localeCompare(right.blockId) ||
      left.page - right.page ||
      left.text.localeCompare(right.text),
  );

  return {
    labels: existing?.labels || {},
    fields: existing?.fields || {},
    mappings: Object.fromEntries(
      orderedMappings.map((mapping) => [
        mapping.blockId,
        {
          artifactId: mapping.blockId,
          decision: "pending" as const,
          linkedArtifactIds: [mapping.blockId].sort((left, right) => left.localeCompare(right)),
          chosenCandidateCode: mapping.chosen?.acordCode,
          candidateDecisions: Object.fromEntries(
            [...mapping.suggestions]
              .sort((left, right) => left.acordCode.localeCompare(right.acordCode))
              .map((candidate) => [candidate.acordCode, "pending" as const]),
          ),
          rationale: mapping.rationale,
        },
      ]),
    ),
    confidenceThresholds: existing?.confidenceThresholds || {
      accepted: 0.8,
      review: 0.6,
      rejected: 0.45,
    },
  };
}

function isValidBlockType(value: unknown): value is ExtractedBlock["type"] {
  return (
    value === "text" ||
    value === "checkbox" ||
    value === "radio" ||
    value === "signature" ||
    value === "table" ||
    value === "kvp"
  );
}

function sanitizeBlock(raw: any, index: number): ExtractedBlock {
  const block = coerceExtractedBlock(raw, index);
  return {
    ...block,
    type: isValidBlockType(raw?.type) ? raw.type : block.type,
  };
}

export async function mapFields(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const body = (await request.json()) as MapFieldsRequest;

    if (!Array.isArray(body?.blocks) || body.blocks.length === 0) {
      return {
        status: 400,
        jsonBody: {
          error: "blocks must be a non-empty array",
        },
      };
    }

    const blocks = body.blocks
      .map(sanitizeBlock)
      .filter((block) => block.text.trim().length > 0);

    if (blocks.length === 0) {
      return {
        status: 400,
        jsonBody: {
          error: "No valid text blocks found",
        },
      };
    }

    const mappings = await mapBlocksWithAcord(blocks, {
      context: body.context,
      deterministic: body.deterministic === true,
      calibrationProfile: body.calibrationProfile,
      familyId: body.familyId,
      semanticMemorySnapshot: body.semanticMemorySnapshot,
      semanticMemoryDecisions: body.semanticMemoryDecisions,
    });

    return {
      status: 200,
      jsonBody: {
        documentId: body.documentId,
        mappings,
        decisionGraph: createMappingDecisionGraph(mappings, body.decisionGraph),
        ontologyAlignment: getDefaultOntologyMetadata(),
      },
    };
  } catch (error: any) {
    context.error("mapFields error", error);
    return {
      status: 500,
      jsonBody: {
        error: "Failed to map fields",
        details: error?.message || "Unknown error",
      },
    };
  }
}

app.http("mapFields", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "mapFields",
  handler: mapFields,
});
