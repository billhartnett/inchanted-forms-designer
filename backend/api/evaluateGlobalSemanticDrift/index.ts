import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { evaluateGlobalSemanticDrift } from "shared/quality";
import type { MappingPersistencePayload } from "shared/types";

type EvaluateGlobalSemanticDriftRequest = {
  baseline?: MappingPersistencePayload["globalSemanticGraphSnapshot"];
  current?: MappingPersistencePayload["globalSemanticGraphSnapshot"];
};

export async function evaluateGlobalSemanticDriftHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const body = (await request.json()) as EvaluateGlobalSemanticDriftRequest;
    if (!body.current) {
      return {
        status: 400,
        jsonBody: { error: "current global semantic graph snapshot is required." },
      };
    }

    return {
      status: 200,
      jsonBody: evaluateGlobalSemanticDrift(body.baseline, body.current),
    };
  } catch (error: any) {
    context.error("evaluateGlobalSemanticDrift error", error);
    return {
      status: 500,
      jsonBody: {
        error: "Failed to evaluate global semantic drift",
        details: error?.message || String(error),
      },
    };
  }
}

app.http("evaluateGlobalSemanticDrift", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "graph/drift",
  handler: evaluateGlobalSemanticDriftHandler,
});
