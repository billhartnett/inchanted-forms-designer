import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import {
  createDefaultCalibrationProfile,
  evaluateMappingQuality,
  evaluateMultiDocumentConsistency,
  type FixtureExpectations,
} from "shared/quality";
import type { CalibrationProfile, MappingPersistencePayload } from "shared/types";
import { validateMappingPersistencePayload } from "../src/services/mappingPayloadValidation";

type CalibrationDocumentInput = {
  fixtureId: string;
  payload: MappingPersistencePayload;
};

type EvaluateCalibrationRequest = {
  profile?: CalibrationProfile;
  payload?: MappingPersistencePayload;
  documents?: CalibrationDocumentInput[];
  expectations?: FixtureExpectations;
  topN?: number;
};

function validateDocuments(value: unknown): CalibrationDocumentInput[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const documents: CalibrationDocumentInput[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const candidate = item as Partial<CalibrationDocumentInput>;
    if (!candidate.fixtureId || typeof candidate.fixtureId !== "string") {
      continue;
    }

    const validated = validateMappingPersistencePayload(candidate.payload);
    if (!validated.valid) {
      continue;
    }

    documents.push({
      fixtureId: candidate.fixtureId,
      payload: validated.payload,
    });
  }

  return documents;
}

export async function evaluateCalibration(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const body = (await request.json()) as EvaluateCalibrationRequest;
    const profile = body.profile || createDefaultCalibrationProfile();
    let validatedPayload: MappingPersistencePayload | undefined;

    let quality;
    if (body.payload) {
      const validated = validateMappingPersistencePayload(body.payload);
      if (!validated.valid) {
        const error = "error" in validated ? validated.error : "Invalid mapping payload";
        return {
          status: 400,
          jsonBody: { error },
        };
      }

      validatedPayload = validated.payload;

      quality = evaluateMappingQuality({
        payload: validated.payload,
        fixtureId: validated.payload.documentId,
        expectations: body.expectations,
        topN: body.topN,
        calibrationProfile: profile,
      });
    }

    const documents = validateDocuments(body.documents);
    if (
      quality &&
      validatedPayload &&
      documents.every((item) => item.fixtureId !== quality.fixtureId)
    ) {
      documents.push({
        fixtureId: quality.fixtureId,
        payload: validatedPayload,
      });
    }

    const consistency = documents.length
      ? evaluateMultiDocumentConsistency({ documents, calibrationProfile: profile })
      : null;

    const perDocumentQuality = documents.map((document) =>
      evaluateMappingQuality({
        payload: document.payload,
        fixtureId: document.fixtureId,
        topN: body.topN,
        calibrationProfile: profile,
      }),
    );

    const avgCalibratedAccuracy = perDocumentQuality.length
      ? Number(
          (
            perDocumentQuality.reduce(
              (sum, report) => sum + report.calibration.calibratedAccuracy,
              0,
            ) / perDocumentQuality.length
          ).toFixed(6),
        )
      : 0;

    const avgThresholdAdjustedRankingQuality = perDocumentQuality.length
      ? Number(
          (
            perDocumentQuality.reduce(
              (sum, report) =>
                sum + report.calibration.thresholdAdjustedRankingQuality,
              0,
            ) / perDocumentQuality.length
          ).toFixed(6),
        )
      : 0;

    return {
      status: 200,
      jsonBody: {
        profile,
        quality,
        consistency,
        perDocumentQuality,
        summary: {
          documentsEvaluated: perDocumentQuality.length,
          avgCalibratedAccuracy,
          avgThresholdAdjustedRankingQuality,
        },
      },
    };
  } catch (error: any) {
    context.error("evaluateCalibration error", error);
    return {
      status: 500,
      jsonBody: {
        error: "Failed to evaluate calibration",
        details: error?.message || "Unknown error",
      },
    };
  }
}

app.http("evaluateCalibration", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "evaluateCalibration",
  handler: evaluateCalibration,
});
