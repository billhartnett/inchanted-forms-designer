import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { loadJsonBlob } from "../services/blobStorage";
import type { CalibrationProfile } from "shared/types";
import { createDefaultCalibrationProfile } from "shared/quality";

export async function loadCalibrationProfile(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const profileId = request.query.get("profileId") || "default-calibration";
    const blobName = `${profileId}.calibration.json`;
    const raw = await loadJsonBlob("calibration-profiles", blobName);

    if (!raw) {
      return {
        status: 200,
        jsonBody: {
          profile: createDefaultCalibrationProfile(profileId),
          source: "default",
        },
      };
    }

    const parsed = JSON.parse(raw) as CalibrationProfile;
    return {
      status: 200,
      jsonBody: {
        profile: parsed,
        source: "stored",
      },
    };
  } catch (error: any) {
    context.error("loadCalibrationProfile error", error);
    return {
      status: 500,
      jsonBody: {
        error: "Failed to load calibration profile",
        details: error?.message || "Unknown error",
      },
    };
  }
}

export default loadCalibrationProfile;
