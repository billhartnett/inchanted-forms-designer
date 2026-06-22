import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { detectCrossDocumentFusionDrift } from "shared/quality";

type DriftSnapshot = {
  profileHash: string;
  unificationHash: string;
  conflictHash: string;
  fusedRankingQuality?: number;
};

type DetectCrossDocumentDriftRequest = {
  baseline?: DriftSnapshot;
  current?: DriftSnapshot;
};

export async function detectCrossDocumentDriftHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const body = (await request.json()) as DetectCrossDocumentDriftRequest;
    if (!body.baseline || !body.current) {
      return {
        status: 400,
        jsonBody: { error: "baseline and current snapshots are required" },
      };
    }

    return {
      status: 200,
      jsonBody: detectCrossDocumentFusionDrift(body.baseline, body.current),
    };
  } catch (error: any) {
    context.error("detectCrossDocumentDrift error", error);
    return {
      status: 500,
      jsonBody: {
        error: "Failed to detect cross-document drift",
        details: error?.message,
      },
    };
  }
}

app.http("detectCrossDocumentDrift", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "fusion/drift",
  handler: detectCrossDocumentDriftHandler,
});
