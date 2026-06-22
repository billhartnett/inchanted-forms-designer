import type { MappingPersistencePayload } from "shared/types";
import type { SubmissionOverride } from "shared/acord";
import {
  buildSubmissionPackage,
  evaluateSubmissionDrift,
  evaluateUnderwritingDecision,
  evaluateRiskScoring,
  extractRiskFactors,
} from "shared/quality";
import { validateAcordXmlSemantic } from "shared/quality";
import { buildAcordXmlFromPayload } from "../../../mapping/acordXml";
import { submitCarrierPayload } from "./carrierApiClient";
import { updateSubmissionStatus } from "./submissionStatusStore";
import { loadIdempotentResponse, saveIdempotentResponse } from "./idempotencyStore";
import { appendImmutableAuditEvent, appendAuditIndex } from "./auditLog";
import { incrementMetric, observeLatency } from "./observability";
import { enqueueSubmissionRetry } from "./retryQueue";

function resolveCarrierId(payload: MappingPersistencePayload, overrides: SubmissionOverride[]): string {
  const forced = [...overrides]
    .reverse()
    .find((item) => item.action === "force-carrier" && item.carrierId)?.carrierId;
  if (forced) return forced;
  return payload.carrierAdapterSnapshot?.carrierIds?.[0] || "markel";
}

function hashString(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort((a, b) => a[0].localeCompare(b[0]));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableSerialize(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export async function orchestrateCarrierSubmission(input: {
  tenantId: string;
  actorId: string;
  actorRole: string;
  idempotencyKey?: string;
  payload: MappingPersistencePayload;
  includeSemanticLineage?: boolean;
  overrides?: SubmissionOverride[];
  signingSecret?: string;
}) {
  const startedAt = Date.now();
  const payload = input.payload;
  const overrides = input.overrides || payload.submissionOverrides || [];
  const forceSubmit = overrides.some((item) => item.action === "force-submit");

  const riskSignals = extractRiskFactors(payload, { overrides: payload.riskFactorOverrides || [] });
  const riskScoring = evaluateRiskScoring(payload, { signals: riskSignals });
  const decision = evaluateUnderwritingDecision(payload, {
    riskSignals,
    riskScoring,
    overrides: payload.underwritingDecisionOverrides || [],
  });

  if (decision.outcome === "decline" && !forceSubmit) {
    throw new Error("Submission blocked: underwriting decision is decline. Add force-submit override to proceed.");
  }

  const acordResult = buildAcordXmlFromPayload(payload, {
    suppressedOcrBlockIds: payload.suppressedOcrBlockIds,
  });
  const xmlValidation = validateAcordXmlSemantic(payload, acordResult.xml, payload.documentId);
  if (!xmlValidation.isValid && !forceSubmit) {
    throw new Error("Submission blocked: ACORD XML semantic validation failed.");
  }

  const submissionPackage = buildSubmissionPackage(payload, {
    acordXml: acordResult.xml,
    includeSemanticLineage: input.includeSemanticLineage,
    overrides,
  });

  const carrierId = resolveCarrierId(payload, overrides);
  const carrierPayload =
    submissionPackage.carrierPayloads.find((item) => item.carrierId === carrierId && item.format === "json") ||
    submissionPackage.carrierPayloads[0];

  const submissionId = `${input.tenantId}:${submissionPackage.packageId}:${carrierId}`;

  const requestHash = hashString(
    stableSerialize({
      tenantId: input.tenantId,
      submissionId,
      packageId: submissionPackage.packageId,
      carrierId,
      payloadHash: carrierPayload.payloadHash,
      overrides,
    }),
  );

  if (input.idempotencyKey) {
    const idempotent = await loadIdempotentResponse(input.tenantId, input.idempotencyKey, requestHash);
    if (idempotent) {
      incrementMetric("submission.idempotent_hit");
      return idempotent as any;
    }
  }

  const carrierResult = submitCarrierPayload({
    tenantId: input.tenantId,
    submissionId,
    carrierId,
    payload: carrierPayload,
    signingSecret: input.signingSecret,
    nonce: `${submissionId}:${requestHash}`,
    timestampIso: new Date().toISOString(),
  });

  const status = await updateSubmissionStatus({
    tenantId: input.tenantId,
    packageId: submissionPackage.packageId,
    carrierId,
    response: carrierResult.response,
  });

  const drift = evaluateSubmissionDrift(
    {
      submissionPackage: payload.submissionPackage,
      submissionStatus: payload.submissionStatus,
      carrierSubmissionResponse: payload.carrierSubmissionResponse,
      underwritingDecisionHash: payload.underwritingDecisionSnapshot?.decisionHash,
    },
    {
      submissionPackage,
      submissionStatus: status.status,
      carrierSubmissionResponse: carrierResult.response,
      underwritingDecisionHash: payload.underwritingDecisionSnapshot?.decisionHash,
    },
  );

  if (carrierResult.response.status !== "accepted") {
    await enqueueSubmissionRetry({
      tenantId: input.tenantId,
      queueId: `${submissionId}:retry-${status.history.length}`,
      submissionId,
      packageId: submissionPackage.packageId,
      carrierId,
      payload: carrierPayload,
      attemptCount: 0,
      maxAttempts: 3,
      nextAttemptAt: new Date(Date.now() + 30_000).toISOString(),
      lastError: carrierResult.response.message,
    });
    incrementMetric("submission.retry_queued");
  }

  const result = {
    package: submissionPackage,
    status: status.status,
    response: carrierResult.response,
    drift,
    validation: {
      xmlValid: xmlValidation.isValid,
      xmlIssues: xmlValidation.issues,
      underwritingOutcome: decision.outcome,
      forceSubmit,
    },
    orchestrationLineage: [
      `orchestration.packageId=${submissionPackage.packageId}`,
      `orchestration.tenant=${input.tenantId}`,
      `orchestration.carrier=${carrierId}`,
      `orchestration.response=${carrierResult.response.status}`,
      `orchestration.xmlValid=${xmlValidation.isValid}`,
    ],
  };

  if (input.idempotencyKey) {
    await saveIdempotentResponse(input.tenantId, input.idempotencyKey, requestHash, result);
  }

  const audit = await appendImmutableAuditEvent({
    tenantId: input.tenantId,
    actorId: input.actorId,
    actorRole: input.actorRole,
    domain: "submission-package",
    action: "submit-to-carrier",
    objectId: submissionId,
    payloadHashSeed: requestHash,
    lineage: result.orchestrationLineage,
  });
  await appendAuditIndex(input.tenantId, audit.eventId);

  observeLatency("submission.orchestration.ms", Date.now() - startedAt);
  incrementMetric("submission.executed");

  return result;
}
