import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import {
  classifyFormFamily,
  createDefaultCalibrationProfile,
  evaluateMappingQuality,
  resolveFamilyCalibration,
  suggestFamilyCalibrationOverrides,
} from "shared/quality";
import type { CalibrationProfile, MappingPersistencePayload } from "shared/types";
import { validateMappingPersistencePayload } from "../src/services/mappingPayloadValidation";

type FamilyCalibrationRequest = {
  payload?: MappingPersistencePayload;
  profile?: CalibrationProfile;
  familyId?: string;
};

export async function evaluateFamilyCalibrationHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const body = (await request.json()) as FamilyCalibrationRequest;
    const validated = validateMappingPersistencePayload(body.payload);
    if (!validated.valid) {
      return { status: 400, jsonBody: { error: "error" in validated ? validated.error : "Invalid payload" } };
    }
    const profile = body.profile || validated.payload.calibrationProfile || createDefaultCalibrationProfile();
    const inferred = classifyFormFamily(validated.payload, validated.payload.documentId);
    const family = body.familyId ? { ...inferred, familyId: body.familyId } : inferred;
    const resolvedCalibration = resolveFamilyCalibration(profile, family.familyId);
    const quality = evaluateMappingQuality({
      payload: validated.payload,
      fixtureId: validated.payload.documentId,
      calibrationProfile: profile,
      familyId: family.familyId,
    });
    return {
      status: 200,
      jsonBody: {
        family,
        resolvedCalibration,
        coverage: quality.coverage,
        calibration: quality.calibration,
        suggestedOverrides: suggestFamilyCalibrationOverrides(validated.payload, profile, family),
      },
    };
  } catch (error: any) {
    context.error("evaluateFamilyCalibration error", error);
    return { status: 500, jsonBody: { error: "Failed to evaluate family calibration", details: error?.message } };
  }
}

app.http("evaluateFamilyCalibration", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "evaluateFamilyCalibration",
  handler: evaluateFamilyCalibrationHandler,
});
