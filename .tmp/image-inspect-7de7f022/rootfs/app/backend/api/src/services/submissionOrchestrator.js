"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.orchestrateCarrierSubmission = orchestrateCarrierSubmission;
const quality_1 = require("shared/quality");
const quality_2 = require("shared/quality");
const acordXml_1 = require("../../../mapping/acordXml");
const carrierApiClient_1 = require("./carrierApiClient");
const submissionStatusStore_1 = require("./submissionStatusStore");
const idempotencyStore_1 = require("./idempotencyStore");
const auditLog_1 = require("./auditLog");
const observability_1 = require("./observability");
const retryQueue_1 = require("./retryQueue");
function resolveCarrierId(payload, overrides) {
    const forced = [...overrides]
        .reverse()
        .find((item) => item.action === "force-carrier" && item.carrierId)?.carrierId;
    if (forced)
        return forced;
    return payload.carrierAdapterSnapshot?.carrierIds?.[0] || "markel";
}
function hashString(value) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
        hash ^= value.charCodeAt(i);
        hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
}
function stableSerialize(value) {
    if (Array.isArray(value))
        return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
    if (value && typeof value === "object") {
        const entries = Object.entries(value).sort((a, b) => a[0].localeCompare(b[0]));
        return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableSerialize(v)}`).join(",")}}`;
    }
    return JSON.stringify(value);
}
async function orchestrateCarrierSubmission(input) {
    const startedAt = Date.now();
    const payload = input.payload;
    const overrides = input.overrides || payload.submissionOverrides || [];
    const forceSubmit = overrides.some((item) => item.action === "force-submit");
    const riskSignals = (0, quality_1.extractRiskFactors)(payload, { overrides: payload.riskFactorOverrides || [] });
    const riskScoring = (0, quality_1.evaluateRiskScoring)(payload, { signals: riskSignals });
    const decision = (0, quality_1.evaluateUnderwritingDecision)(payload, {
        riskSignals,
        riskScoring,
        overrides: payload.underwritingDecisionOverrides || [],
    });
    if (decision.outcome === "decline" && !forceSubmit) {
        throw new Error("Submission blocked: underwriting decision is decline. Add force-submit override to proceed.");
    }
    const acordResult = (0, acordXml_1.buildAcordXmlFromPayload)(payload, {
        suppressedOcrBlockIds: payload.suppressedOcrBlockIds,
    });
    const xmlValidation = (0, quality_2.validateAcordXmlSemantic)(payload, acordResult.xml, payload.documentId);
    if (!xmlValidation.isValid && !forceSubmit) {
        throw new Error("Submission blocked: ACORD XML semantic validation failed.");
    }
    const submissionPackage = (0, quality_1.buildSubmissionPackage)(payload, {
        acordXml: acordResult.xml,
        includeSemanticLineage: input.includeSemanticLineage,
        overrides,
    });
    const carrierId = resolveCarrierId(payload, overrides);
    const carrierPayload = submissionPackage.carrierPayloads.find((item) => item.carrierId === carrierId && item.format === "json") ||
        submissionPackage.carrierPayloads[0];
    const submissionId = `${input.tenantId}:${submissionPackage.packageId}:${carrierId}`;
    const requestHash = hashString(stableSerialize({
        tenantId: input.tenantId,
        submissionId,
        packageId: submissionPackage.packageId,
        carrierId,
        payloadHash: carrierPayload.payloadHash,
        overrides,
    }));
    if (input.idempotencyKey) {
        const idempotent = await (0, idempotencyStore_1.loadIdempotentResponse)(input.tenantId, input.idempotencyKey, requestHash);
        if (idempotent) {
            (0, observability_1.incrementMetric)("submission.idempotent_hit");
            return idempotent;
        }
    }
    const carrierResult = (0, carrierApiClient_1.submitCarrierPayload)({
        tenantId: input.tenantId,
        submissionId,
        carrierId,
        payload: carrierPayload,
        signingSecret: input.signingSecret,
        nonce: `${submissionId}:${requestHash}`,
        timestampIso: new Date().toISOString(),
    });
    const status = await (0, submissionStatusStore_1.updateSubmissionStatus)({
        tenantId: input.tenantId,
        packageId: submissionPackage.packageId,
        carrierId,
        response: carrierResult.response,
    });
    const drift = (0, quality_1.evaluateSubmissionDrift)({
        submissionPackage: payload.submissionPackage,
        submissionStatus: payload.submissionStatus,
        carrierSubmissionResponse: payload.carrierSubmissionResponse,
        underwritingDecisionHash: payload.underwritingDecisionSnapshot?.decisionHash,
    }, {
        submissionPackage,
        submissionStatus: status.status,
        carrierSubmissionResponse: carrierResult.response,
        underwritingDecisionHash: payload.underwritingDecisionSnapshot?.decisionHash,
    });
    if (carrierResult.response.status !== "accepted") {
        await (0, retryQueue_1.enqueueSubmissionRetry)({
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
        (0, observability_1.incrementMetric)("submission.retry_queued");
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
        await (0, idempotencyStore_1.saveIdempotentResponse)(input.tenantId, input.idempotencyKey, requestHash, result);
    }
    const audit = await (0, auditLog_1.appendImmutableAuditEvent)({
        tenantId: input.tenantId,
        actorId: input.actorId,
        actorRole: input.actorRole,
        domain: "submission-package",
        action: "submit-to-carrier",
        objectId: submissionId,
        payloadHashSeed: requestHash,
        lineage: result.orchestrationLineage,
    });
    await (0, auditLog_1.appendAuditIndex)(input.tenantId, audit.eventId);
    (0, observability_1.observeLatency)("submission.orchestration.ms", Date.now() - startedAt);
    (0, observability_1.incrementMetric)("submission.executed");
    return result;
}
