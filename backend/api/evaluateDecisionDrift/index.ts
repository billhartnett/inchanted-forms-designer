import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { evaluateUnderwritingDecisionDrift } from "shared/quality";
import type { MappingPersistencePayload } from "shared/types";

type EvaluateDecisionDriftRequest = {
  baseline?: {
    riskFactorSnapshot?: MappingPersistencePayload["riskFactorSnapshot"];
    riskScoringSnapshot?: MappingPersistencePayload["riskScoringSnapshot"];
    underwritingRuleSnapshot?: MappingPersistencePayload["underwritingRuleSnapshot"];
    underwritingDecisionSnapshot?: MappingPersistencePayload["underwritingDecisionSnapshot"];
    underwritingDecisionOverrides?: MappingPersistencePayload["underwritingDecisionOverrides"];
  };
  current?: {
    riskFactorSnapshot?: MappingPersistencePayload["riskFactorSnapshot"];
    riskScoringSnapshot?: MappingPersistencePayload["riskScoringSnapshot"];
    underwritingRuleSnapshot?: MappingPersistencePayload["underwritingRuleSnapshot"];
    underwritingDecisionSnapshot?: MappingPersistencePayload["underwritingDecisionSnapshot"];
    underwritingDecisionOverrides?: MappingPersistencePayload["underwritingDecisionOverrides"];
  };
};

export async function evaluateDecisionDriftHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const body = (await request.json()) as EvaluateDecisionDriftRequest;
    if (!body.current) {
      return {
        status: 400,
        jsonBody: { error: "current decision context is required." },
      };
    }

    return {
      status: 200,
      jsonBody: evaluateUnderwritingDecisionDrift(body.baseline || {}, body.current),
    };
  } catch (error: any) {
    context.error("evaluateDecisionDrift error", error);
    return {
      status: 500,
      jsonBody: {
        error: "Failed to evaluate underwriting decision drift",
        details: error?.message || String(error),
      },
    };
  }
}

app.http("evaluateDecisionDrift", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "underwriting/decision/drift",
  handler: evaluateDecisionDriftHandler,
});
