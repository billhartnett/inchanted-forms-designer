import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { buildGlobalSemanticGraph } from "shared/quality";
import type { MappingPersistencePayload } from "shared/types";
import { validateMappingPersistencePayload } from "../src/services/mappingPayloadValidation";

type UpdateGlobalSemanticGraphRequest = {
  documents?: Array<{ fixtureId?: string; payload?: MappingPersistencePayload }>;
  previousSnapshot?: MappingPersistencePayload["globalSemanticGraphSnapshot"];
};

export async function updateGlobalSemanticGraphHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const body = (await request.json()) as UpdateGlobalSemanticGraphRequest;
    const documents = (body.documents || []).flatMap((document) => {
      const validated = validateMappingPersistencePayload(document.payload);
      if (!validated.valid) return [];
      return [{ fixtureId: document.fixtureId || validated.payload.documentId || "unknown-document", payload: validated.payload }];
    });

    if (!documents.length) {
      return { status: 400, jsonBody: { error: "At least one valid document payload is required." } };
    }

    const result = buildGlobalSemanticGraph(documents, {
      previousSnapshot: body.previousSnapshot || documents[0]?.payload.globalSemanticGraphSnapshot,
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
    context.error("updateGlobalSemanticGraph error", error);
    return {
      status: 500,
      jsonBody: {
        error: "Failed to update global semantic graph",
        details: error?.message || String(error),
      },
    };
  }
}

app.http("updateGlobalSemanticGraph", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "graph/update",
  handler: updateGlobalSemanticGraphHandler,
});
