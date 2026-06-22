import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import {
  evaluateMappingQuality,
  createDefaultCalibrationProfile,
  type FixtureExpectations,
  type MappingQualityReport,
} from "shared/quality";
import type { CalibrationProfile, MappingPersistencePayload } from "shared/types";
import { validateMappingPersistencePayload } from "../src/services/mappingPayloadValidation";

type EvaluateMappingQualityRequest = {
  payload?: MappingPersistencePayload;
  expectations?: FixtureExpectations;
  baseline?: MappingQualityReport;
  fixtureId?: string;
  topN?: number;
  calibrationProfile?: CalibrationProfile;
} & Partial<MappingPersistencePayload>;

export async function evaluateMappingQualityHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const body = (await request.json()) as EvaluateMappingQualityRequest;
    const candidatePayload = (body.payload || body) as unknown;
    const validated = validateMappingPersistencePayload(candidatePayload);

    if (!validated.valid) {
      const error = "error" in validated ? validated.error : "Invalid mapping payload";
      return {
        status: 400,
        jsonBody: { error },
      };
    }

    const report = evaluateMappingQuality({
      payload: validated.payload,
      fixtureId: body.fixtureId,
      expectations: body.expectations,
      baseline: body.baseline,
      topN: body.topN,
      calibrationProfile:
        body.calibrationProfile ||
        validated.payload.calibrationProfile ||
        createDefaultCalibrationProfile(),
    });

    return {
      status: 200,
      jsonBody: report,
    };
  } catch (err: any) {
    context.error("evaluateMappingQuality error:", err);
    return {
      status: 500,
      jsonBody: { error: "Failed to evaluate mapping quality", details: err.message },
    };
  }
}

app.http("evaluateMappingQuality", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: evaluateMappingQualityHandler,
});
