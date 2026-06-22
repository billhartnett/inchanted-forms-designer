import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { buildRiskFactorSnapshot, extractRiskFactors } from "shared/quality";
import type { MappingPersistencePayload } from "shared/types";
import { validateMappingPersistencePayload } from "../src/services/mappingPayloadValidation";

type EvaluateRiskFactorsRequest = {
  payload?: MappingPersistencePayload;
  baselineSnapshot?: MappingPersistencePayload["riskFactorSnapshot"];
};

export async function evaluateRiskFactorsHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const body = (await request.json()) as EvaluateRiskFactorsRequest;
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
    const snapshot = buildRiskFactorSnapshot(validated.payload, {
      previousSnapshot: validated.payload.riskFactorSnapshot,
      overrides: validated.payload.riskFactorOverrides || [],
    });

    const drift = {
      hasDrift: Boolean(body.baselineSnapshot && body.baselineSnapshot.riskFactorHash !== snapshot.riskFactorHash),
      baselineRiskFactorHash: body.baselineSnapshot?.riskFactorHash || null,
      currentRiskFactorHash: snapshot.riskFactorHash,
      baselineSignalCount: body.baselineSnapshot?.signalCount || 0,
      currentSignalCount: snapshot.signalCount,
      differences: [
        {
          key: "riskFactorHash",
          baselineValue: body.baselineSnapshot?.riskFactorHash || null,
          currentValue: snapshot.riskFactorHash,
        },
        {
          key: "signalCount",
          baselineValue: body.baselineSnapshot?.signalCount || 0,
          currentValue: snapshot.signalCount,
        },
      ].filter((item) => item.baselineValue !== item.currentValue),
    };

    return {
      status: 200,
      jsonBody: {
        signals,
        snapshot,
        drift,
      },
    };
  } catch (error: any) {
    context.error("evaluateRiskFactors error", error);
    return {
      status: 500,
      jsonBody: {
        error: "Failed to evaluate risk factors",
        details: error?.message || String(error),
      },
    };
  }
}

app.http("evaluateRiskFactors", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "risk/factors/evaluate",
  handler: evaluateRiskFactorsHandler,
});
