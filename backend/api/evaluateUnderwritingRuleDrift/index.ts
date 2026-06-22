import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { evaluateUnderwritingRuleDrift } from "shared/quality";
import type { MappingPersistencePayload } from "shared/types";

type EvaluateUnderwritingRuleDriftRequest = {
  baseline?: MappingPersistencePayload["underwritingRuleSnapshot"];
  current?: MappingPersistencePayload["underwritingRuleSnapshot"];
};

export async function evaluateUnderwritingRuleDriftHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const body = (await request.json()) as EvaluateUnderwritingRuleDriftRequest;
    if (!body.current) {
      return {
        status: 400,
        jsonBody: { error: "current underwriting rule snapshot is required." },
      };
    }

    return {
      status: 200,
      jsonBody: evaluateUnderwritingRuleDrift(body.baseline, body.current),
    };
  } catch (error: any) {
    context.error("evaluateUnderwritingRuleDrift error", error);
    return {
      status: 500,
      jsonBody: {
        error: "Failed to evaluate underwriting rule drift",
        details: error?.message || String(error),
      },
    };
  }
}

app.http("evaluateUnderwritingRuleDrift", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "rules/drift",
  handler: evaluateUnderwritingRuleDriftHandler,
});
