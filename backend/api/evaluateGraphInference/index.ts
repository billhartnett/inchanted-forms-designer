import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { buildGlobalSemanticGraph, evaluateGraphInference } from "shared/quality";
import type { MappingPersistencePayload } from "shared/types";
import { validateMappingPersistencePayload } from "../src/services/mappingPayloadValidation";

type EvaluateGraphInferenceRequest = {
  payload?: MappingPersistencePayload;
  graphSnapshot?: MappingPersistencePayload["globalSemanticGraphSnapshot"];
};

export async function evaluateGraphInferenceHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const body = (await request.json()) as EvaluateGraphInferenceRequest;
    const validated = validateMappingPersistencePayload(body.payload);
    if (!validated.valid) {
      const errorMessage = "error" in validated ? validated.error : "Invalid payload";
      return {
        status: 400,
        jsonBody: { error: errorMessage },
      };
    }

    const graph =
      body.graphSnapshot ||
      buildGlobalSemanticGraph([{ fixtureId: validated.payload.documentId || "unknown-document", payload: validated.payload }], {
        previousSnapshot: validated.payload.globalSemanticGraphSnapshot,
        memorySnapshot: validated.payload.semanticMemorySnapshot,
        edgeOverrides: validated.payload.globalSemanticGraphEdgeOverrides || [],
        mergeDecisions: validated.payload.globalSemanticGraphMergeDecisions || [],
      }).snapshot;

    return {
      status: 200,
      jsonBody: {
        inference: evaluateGraphInference(validated.payload, graph),
        graphHash: graph.graphHash,
        graphVersion: graph.versionId,
      },
    };
  } catch (error: any) {
    context.error("evaluateGraphInference error", error);
    return {
      status: 500,
      jsonBody: {
        error: "Failed to evaluate graph inference",
        details: error?.message || String(error),
      },
    };
  }
}

app.http("evaluateGraphInference", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "graph/inference",
  handler: evaluateGraphInferenceHandler,
});
