import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import {
  buildRiskFactorSnapshot,
  buildRiskScoringSnapshot,
  buildUnderwritingDecisionSnapshot,
  evaluateRiskScoring,
  evaluateUnderwritingDecision,
  evaluateUnderwritingDecisionDrift,
  extractRiskFactors,
} from "shared/quality";
import type { MappingPersistencePayload } from "shared/types";
import { validateMappingPersistencePayload } from "../services/mappingPayloadValidation";

type EvaluateUnderwritingDecisionRequest = {
  payload?: MappingPersistencePayload;
  baseline?: {
    riskFactorSnapshot?: MappingPersistencePayload["riskFactorSnapshot"];
    riskScoringSnapshot?: MappingPersistencePayload["riskScoringSnapshot"];
    underwritingRuleSnapshot?: MappingPersistencePayload["underwritingRuleSnapshot"];
    underwritingDecisionSnapshot?: MappingPersistencePayload["underwritingDecisionSnapshot"];
    underwritingDecisionOverrides?: MappingPersistencePayload["underwritingDecisionOverrides"];
  };
};

export async function evaluateUnderwritingDecisionHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const body = (await request.json()) as EvaluateUnderwritingDecisionRequest;
    const validated = validateMappingPersistencePayload(body.payload);
    if (!validated.valid) {
      const errorMessage = "error" in validated ? validated.error : "Invalid payload";
      return {
        status: 400,
        jsonBody: { error: errorMessage },
      };
    }

    const riskSignals = extractRiskFactors(validated.payload, {
      overrides: validated.payload.riskFactorOverrides || [],
    });
    const riskScoring = evaluateRiskScoring(validated.payload, { signals: riskSignals });
    const report = evaluateUnderwritingDecision(validated.payload, {
      riskSignals,
      riskScoring,
      overrides: validated.payload.underwritingDecisionOverrides || [],
    });
    const riskFactorSnapshot = buildRiskFactorSnapshot(validated.payload, {
      previousSnapshot: validated.payload.riskFactorSnapshot,
      overrides: validated.payload.riskFactorOverrides || [],
    });
    const riskScoringSnapshot = buildRiskScoringSnapshot(validated.payload, {
      previousSnapshot: validated.payload.riskScoringSnapshot,
      signals: riskSignals,
    });
    const snapshot = buildUnderwritingDecisionSnapshot(validated.payload, {
      previousSnapshot: validated.payload.underwritingDecisionSnapshot,
      riskSignals,
      riskScoring,
      overrides: validated.payload.underwritingDecisionOverrides || [],
      decisions: validated.payload.underwritingDecisionDecisions || [],
    });
    const drift = evaluateUnderwritingDecisionDrift(
      body.baseline || {
        riskFactorSnapshot: validated.payload.riskFactorSnapshot,
        riskScoringSnapshot: validated.payload.riskScoringSnapshot,
        underwritingRuleSnapshot: validated.payload.underwritingRuleSnapshot,
        underwritingDecisionSnapshot: validated.payload.underwritingDecisionSnapshot,
        underwritingDecisionOverrides: validated.payload.underwritingDecisionOverrides,
      },
      {
        riskFactorSnapshot,
        riskScoringSnapshot,
        underwritingRuleSnapshot: validated.payload.underwritingRuleSnapshot,
        underwritingDecisionSnapshot: snapshot,
        underwritingDecisionOverrides: validated.payload.underwritingDecisionOverrides,
      },
    );

    return {
      status: 200,
      jsonBody: {
        report,
        snapshot,
        drift,
      },
    };
  } catch (error: any) {
    context.error("evaluateUnderwritingDecision error", error);
    return {
      status: 500,
      jsonBody: {
        error: "Failed to evaluate underwriting decision",
        details: error?.message || String(error),
      },
    };
  }
}

export default evaluateUnderwritingDecisionHandler;
