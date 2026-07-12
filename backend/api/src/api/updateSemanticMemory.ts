import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { evaluateSemanticFusion, updateSemanticMemoryFromFusion } from "shared/quality";
import type { MappingPersistencePayload } from "shared/types";
import { validateMappingPersistencePayload } from "../services/mappingPayloadValidation";

type UpdateSemanticMemoryRequest = {
  documents?: Array<{
    fixtureId?: string;
    payload?: MappingPersistencePayload;
  }>;
  previousSnapshot?: MappingPersistencePayload["semanticMemorySnapshot"];
  decisions?: MappingPersistencePayload["semanticMemoryDecisions"];
};

export async function updateSemanticMemoryHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const body = (await request.json()) as UpdateSemanticMemoryRequest;
    const documents = (body.documents || []).flatMap((document) => {
      const validated = validateMappingPersistencePayload(document.payload);
      if (!validated.valid) return [];

      return [
        {
          fixtureId: document.fixtureId || validated.payload.documentId || "unknown-document",
          payload: validated.payload,
        },
      ];
    });

    if (!documents.length) {
      return {
        status: 400,
        jsonBody: { error: "At least one valid document payload is required." },
      };
    }

    const fusion = evaluateSemanticFusion(documents, {
      fusionOverrides: documents.flatMap((document) => document.payload.fusionOverrides || []),
    });
    const snapshot = updateSemanticMemoryFromFusion(fusion, {
      previousSnapshot: body.previousSnapshot,
      decisions: body.decisions,
    });

    return {
      status: 200,
      jsonBody: {
        snapshot,
        profileHash: fusion.profileHash,
        unificationHash: fusion.unificationHash,
        conflictHash: fusion.conflictHash,
      },
    };
  } catch (error: any) {
    context.error("updateSemanticMemory error", error);
    return {
      status: 500,
      jsonBody: {
        error: "Failed to update semantic memory",
        details: error?.message || String(error),
      },
    };
  }
}

export default updateSemanticMemoryHandler;
