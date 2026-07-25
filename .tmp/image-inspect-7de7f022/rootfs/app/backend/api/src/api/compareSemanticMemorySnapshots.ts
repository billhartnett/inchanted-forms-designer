import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { evaluateLongitudinalMemoryDrift } from "shared/quality";
import type { MappingPersistencePayload } from "shared/types";

type CompareSemanticMemorySnapshotsRequest = {
  baseline?: MappingPersistencePayload["semanticMemorySnapshot"];
  current?: MappingPersistencePayload["semanticMemorySnapshot"];
};

export async function compareSemanticMemorySnapshotsHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const body = (await request.json()) as CompareSemanticMemorySnapshotsRequest;

    if (!body.baseline || !body.current) {
      return {
        status: 400,
        jsonBody: {
          error: "Both baseline and current semantic memory snapshots are required.",
        },
      };
    }

    return {
      status: 200,
      jsonBody: evaluateLongitudinalMemoryDrift(body.baseline, body.current),
    };
  } catch (error: any) {
    context.error("compareSemanticMemorySnapshots error", error);
    return {
      status: 500,
      jsonBody: {
        error: "Failed to compare semantic memory snapshots",
        details: error?.message || String(error),
      },
    };
  }
}

export default compareSemanticMemorySnapshotsHandler;
