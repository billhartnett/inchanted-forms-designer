import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import {
  buildUnderwritingRuleSnapshot,
  evaluateUnderwritingRuleDrift,
  evaluateUnderwritingRules,
} from "shared/quality";
import type { MappingPersistencePayload } from "shared/types";
import { validateMappingPersistencePayload } from "../services/mappingPayloadValidation";

type EvaluateUnderwritingRulesRequest = {
  payload?: MappingPersistencePayload;
  baselineSnapshot?: MappingPersistencePayload["underwritingRuleSnapshot"];
};

export async function evaluateUnderwritingRulesHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const body = (await request.json()) as EvaluateUnderwritingRulesRequest;
    const validated = validateMappingPersistencePayload(body.payload);
    if (!validated.valid) {
      const errorMessage = "error" in validated ? validated.error : "Invalid payload";
      return {
        status: 400,
        jsonBody: { error: errorMessage },
      };
    }

    const report = evaluateUnderwritingRules(validated.payload, {
      familyId: validated.payload.formFamily?.familyId,
      overrides: validated.payload.underwritingRuleOverrides || [],
    });
    const snapshot = buildUnderwritingRuleSnapshot(validated.payload, {
      previousSnapshot: validated.payload.underwritingRuleSnapshot,
      overrides: validated.payload.underwritingRuleOverrides || [],
      decisions: validated.payload.underwritingRuleDecisions || [],
    });
    const drift = evaluateUnderwritingRuleDrift(body.baselineSnapshot, snapshot);

    return {
      status: 200,
      jsonBody: {
        report,
        snapshot,
        drift,
      },
    };
  } catch (error: any) {
    context.error("evaluateUnderwritingRules error", error);
    return {
      status: 500,
      jsonBody: {
        error: "Failed to evaluate underwriting rules",
        details: error?.message || String(error),
      },
    };
  }
}

export default evaluateUnderwritingRulesHandler;
