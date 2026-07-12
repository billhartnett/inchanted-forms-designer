import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { evaluateLongitudinalMemoryDrift } from "shared/quality";
import type { MappingPersistencePayload } from "shared/types";

type EvaluateLongitudinalDriftRequest = {
  baseline?: MappingPersistencePayload["semanticMemorySnapshot"];
  current?: MappingPersistencePayload["semanticMemorySnapshot"];
};

export async function evaluateLongitudinalDriftHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const body = (await request.json()) as EvaluateLongitudinalDriftRequest;

    if (!body.current) {
      return {
        status: 400,
        jsonBody: { error: "current semantic memory snapshot is required." },
      };
    }

    return {
      status: 200,
      jsonBody: evaluateLongitudinalMemoryDrift(body.baseline, body.current),
    };
  } catch (error: any) {
    context.error("evaluateLongitudinalDrift error", error);
    return {
      status: 500,
      jsonBody: {
        error: "Failed to evaluate longitudinal memory drift",
        details: error?.message || String(error),
      },
    };
  }
}

export default evaluateLongitudinalDriftHandler;
