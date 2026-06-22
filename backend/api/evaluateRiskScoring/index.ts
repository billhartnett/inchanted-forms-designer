import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { buildRiskScoringSnapshot, evaluateRiskScoring, extractRiskFactors } from "shared/quality";
import type { MappingPersistencePayload } from "shared/types";
import { validateMappingPersistencePayload } from "../src/services/mappingPayloadValidation";

type EvaluateRiskScoringRequest = {
  payload?: MappingPersistencePayload;
  baselineSnapshot?: MappingPersistencePayload["riskScoringSnapshot"];
};

export async function evaluateRiskScoringHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const body = (await request.json()) as EvaluateRiskScoringRequest;
    const validated = validateMappingPersistencePayload(body.payload);
    if (!validated.valid) {
      const errorMessage = "error" in validated ? validated.error : "Invalid payload";
      return {
        status: 400,
        jsonBody: { error: errorMessage },
      };
    }

    const signals = extractRiskFactors(validated.payload, {
      overrides: validated.payload.riskFactorOverrides || [],
    });
    const scoring = evaluateRiskScoring(validated.payload, { signals });
    const snapshot = buildRiskScoringSnapshot(validated.payload, {
      previousSnapshot: validated.payload.riskScoringSnapshot,
      signals,
    });

    const drift = {
      hasDrift: Boolean(body.baselineSnapshot && body.baselineSnapshot.scoringHash !== snapshot.scoringHash),
      baselineScoringHash: body.baselineSnapshot?.scoringHash || null,
      currentScoringHash: snapshot.scoringHash,
      baselineClassification: body.baselineSnapshot?.classification || null,
      currentClassification: snapshot.classification,
      differences: [
        {
          key: "scoringHash",
          baselineValue: body.baselineSnapshot?.scoringHash || null,
          currentValue: snapshot.scoringHash,
        },
        {
          key: "classification",
          baselineValue: body.baselineSnapshot?.classification || null,
          currentValue: snapshot.classification,
        },
      ].filter((item) => item.baselineValue !== item.currentValue),
    };

    return {
      status: 200,
      jsonBody: {
        scoring,
        snapshot,
        drift,
      },
    };
  } catch (error: any) {
    context.error("evaluateRiskScoring error", error);
    return {
      status: 500,
      jsonBody: {
        error: "Failed to evaluate risk scoring",
        details: error?.message || String(error),
      },
    };
  }
}

app.http("evaluateRiskScoring", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "risk/scoring/evaluate",
  handler: evaluateRiskScoringHandler,
});
