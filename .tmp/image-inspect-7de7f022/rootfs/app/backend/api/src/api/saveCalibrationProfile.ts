import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { saveJsonBlob, loadJsonBlob } from "../services/blobStorage";
import type { CalibrationProfile } from "shared/types";
import {
  createDefaultCalibrationProfile,
  DEFAULT_CALIBRATION_SIGNAL_WEIGHTS,
  DEFAULT_CALIBRATION_THRESHOLDS,
} from "shared/quality";

type SaveCalibrationProfileRequest = {
  profile?: CalibrationProfile;
  changedBy?: string;
  reason?: string;
  summary?: string;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidThresholds(value: unknown): value is { accepted: number; review: number; rejected: number } {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as { accepted?: unknown; review?: unknown; rejected?: unknown };
  return (
    isFiniteNumber(candidate.accepted) &&
    isFiniteNumber(candidate.review) &&
    isFiniteNumber(candidate.rejected)
  );
}

function sanitizeProfile(profile: CalibrationProfile): CalibrationProfile {
  return {
    ...profile,
    globalThresholds: isValidThresholds(profile.globalThresholds)
      ? profile.globalThresholds
      : DEFAULT_CALIBRATION_THRESHOLDS,
    codeThresholdOverrides: Object.fromEntries(
      Object.entries(profile.codeThresholdOverrides || {})
        .filter(([, thresholds]) => isValidThresholds(thresholds))
        .sort((a, b) => a[0].localeCompare(b[0])),
    ),
    familyOverrides: Object.fromEntries(
      Object.entries(profile.familyOverrides || {}).sort((a, b) =>
        a[0].localeCompare(b[0]),
      ),
    ),
    signalWeights: {
      embedding: isFiniteNumber(profile.signalWeights?.embedding)
        ? profile.signalWeights.embedding
        : DEFAULT_CALIBRATION_SIGNAL_WEIGHTS.embedding,
      lexical: isFiniteNumber(profile.signalWeights?.lexical)
        ? profile.signalWeights.lexical
        : DEFAULT_CALIBRATION_SIGNAL_WEIGHTS.lexical,
      dictionary: isFiniteNumber(profile.signalWeights?.dictionary)
        ? profile.signalWeights.dictionary
        : DEFAULT_CALIBRATION_SIGNAL_WEIGHTS.dictionary,
      heuristic: isFiniteNumber(profile.signalWeights?.heuristic)
        ? profile.signalWeights.heuristic
        : DEFAULT_CALIBRATION_SIGNAL_WEIGHTS.heuristic,
    },
    auditTrail: [...(profile.auditTrail || [])].sort(
      (left, right) =>
        left.version - right.version || left.changedAt.localeCompare(right.changedAt),
    ),
    lineage: [...(profile.lineage || [])].sort(
      (left, right) =>
        left.scope.localeCompare(right.scope) ||
        left.sourceId.localeCompare(right.sourceId) ||
        left.property.localeCompare(right.property),
    ),
    suggestedOverrides: [...(profile.suggestedOverrides || [])].sort(
      (left, right) => left.suggestionId.localeCompare(right.suggestionId),
    ),
  };
}

function validateIncomingProfile(value: unknown): { valid: true; profile: CalibrationProfile } | { valid: false; error: string } {
  if (!value || typeof value !== "object") {
    return { valid: false, error: "profile is required" };
  }

  const profile = value as Partial<CalibrationProfile>;
  if (!profile.profileId || typeof profile.profileId !== "string") {
    return { valid: false, error: "profile.profileId is required" };
  }
  if (!profile.name || typeof profile.name !== "string") {
    return { valid: false, error: "profile.name is required" };
  }

  const defaultProfile = createDefaultCalibrationProfile(profile.profileId);
  const merged: CalibrationProfile = {
    ...defaultProfile,
    ...profile,
    profileId: profile.profileId,
    name: profile.name,
    codeThresholdOverrides: profile.codeThresholdOverrides || {},
    signalWeights: profile.signalWeights || defaultProfile.signalWeights,
    familyOverrides: profile.familyOverrides || {},
    lineage: profile.lineage || [],
    suggestedOverrides: profile.suggestedOverrides || [],
    auditTrail: profile.auditTrail || defaultProfile.auditTrail,
  };

  return {
    valid: true,
    profile: sanitizeProfile(merged),
  };
}

export async function saveCalibrationProfile(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const body = (await request.json()) as SaveCalibrationProfileRequest;
    const validated = validateIncomingProfile(body.profile);
    if (!validated.valid) {
      return {
        status: 400,
        jsonBody: { error: "error" in validated ? validated.error : "Invalid calibration profile" },
      };
    }

    const incoming = validated.profile;
    const blobName = `${incoming.profileId}.calibration.json`;
    const existingRaw = await loadJsonBlob("calibration-profiles", blobName);
    const existing = existingRaw ? (JSON.parse(existingRaw) as CalibrationProfile) : null;

    const now = new Date().toISOString();
    const nextVersion = existing ? existing.version + 1 : Math.max(1, incoming.version || 1);
    const merged: CalibrationProfile = sanitizeProfile({
      ...incoming,
      createdAt: existing?.createdAt || incoming.createdAt || now,
      updatedAt: now,
      createdBy: existing?.createdBy || incoming.createdBy,
      updatedBy: body.changedBy || incoming.updatedBy,
      version: nextVersion,
      auditTrail: [
        ...(existing?.auditTrail || incoming.auditTrail || []),
        {
          version: nextVersion,
          changedAt: now,
          changedBy: body.changedBy || incoming.updatedBy,
          reason: body.reason,
          summary: body.summary || "Calibration profile updated",
        },
      ],
    });

    const saved = await saveJsonBlob("calibration-profiles", blobName, merged);
    return {
      status: 200,
      jsonBody: {
        success: true,
        blobName: saved.blobName,
        url: saved.url,
        profile: merged,
      },
    };
  } catch (error: any) {
    context.error("saveCalibrationProfile error", error);
    return {
      status: 500,
      jsonBody: {
        error: "Failed to save calibration profile",
        details: error?.message || "Unknown error",
      },
    };
  }
}

export default saveCalibrationProfile;
