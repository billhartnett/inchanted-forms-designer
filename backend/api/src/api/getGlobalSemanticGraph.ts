import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { buildGlobalSemanticGraph } from "shared/quality";
import type { MappingPersistencePayload } from "shared/types";
import { validateMappingPersistencePayload } from "../services/mappingPayloadValidation";

type GetGlobalSemanticGraphRequest = {
  documents?: Array<{ fixtureId?: string; payload?: MappingPersistencePayload }>;
};

export async function getGlobalSemanticGraphHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const body = (await request.json()) as GetGlobalSemanticGraphRequest;
    const documents = (body.documents || []).flatMap((document) => {
      const validated = validateMappingPersistencePayload(document.payload);
      if (!validated.valid) return [];
      return [{ fixtureId: document.fixtureId || validated.payload.documentId || "unknown-document", payload: validated.payload }];
    });

    if (!documents.length) {
      return { status: 400, jsonBody: { error: "At least one valid document payload is required." } };
    }

    const result = buildGlobalSemanticGraph(documents, {
      previousSnapshot: documents[0]?.payload.globalSemanticGraphSnapshot,
      memorySnapshot: documents[0]?.payload.semanticMemorySnapshot,
      edgeOverrides: documents.flatMap((document) => document.payload.globalSemanticGraphEdgeOverrides || []),
      mergeDecisions: documents.flatMap((document) => document.payload.globalSemanticGraphMergeDecisions || []),
    });

    return {
      status: 200,
      jsonBody: {
        snapshot: result.snapshot,
        harmonization: result.harmonization,
      },
    };
  } catch (error: any) {
    context.error("getGlobalSemanticGraph error", error);
    return {
      status: 500,
      jsonBody: {
        error: "Failed to retrieve global semantic graph",
        details: error?.message || String(error),
      },
    };
  }
}

export default getGlobalSemanticGraphHandler;
