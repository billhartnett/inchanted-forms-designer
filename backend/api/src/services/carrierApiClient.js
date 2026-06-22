"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.submitCarrierPayload = submitCarrierPayload;
const quality_1 = require("shared/quality");
const circuitBreaker_1 = require("./circuitBreaker");
const observability_1 = require("./observability");
const securityControls_1 = require("./securityControls");
function stableSerialize(value) {
    if (Array.isArray(value)) {
        return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
    }
    if (value && typeof value === "object") {
        const entries = Object.entries(value).sort((left, right) => left[0].localeCompare(right[0]));
        return `{${entries
            .map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`)
            .join(",")}}`;
    }
    return JSON.stringify(value);
}
function hashString(value) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
        hash ^= value.charCodeAt(i);
        hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
}
function buildSignature(input) {
    return hashString(stableSerialize({
        submissionId: input.submissionId,
        carrierId: input.carrierId,
        payloadHash: input.payloadHash,
        signingSecret: input.signingSecret,
    }));
}
function validateCarrierPayload(payload) {
    const errors = [];
    if (!payload.carrierId)
        errors.push("carrierId is required");
    if (payload.format !== "json" && payload.format !== "xml")
        errors.push("format must be json or xml");
    if (!payload.payload)
        errors.push("payload body is required");
    if (!payload.payloadHash)
        errors.push("payloadHash is required");
    if (!payload.schemaVersion)
        errors.push("schemaVersion is required");
    return { valid: errors.length === 0, errors };
}
function deterministicCarrierTransport(input) {
    const score = Number.parseInt(hashString(`${input.carrierId}:${input.signature}:${input.payloadHash}:${input.attempt}`).slice(0, 4), 16);
    const accepted = score % 11 !== 0;
    const pending = score % 7 === 0;
    if (!accepted) {
        return {
            httpStatus: 422,
            body: {
                ack: false,
                message: "carrier-validation-failed",
                referenceId: `${input.carrierId}-rej-${input.payloadHash.slice(0, 6)}`,
            },
        };
    }
    return {
        httpStatus: pending ? 202 : 200,
        body: {
            ack: true,
            message: pending ? "submission-pending-review" : "submission-accepted",
            referenceId: `${input.carrierId}-ref-${input.payloadHash.slice(0, 8)}`,
        },
    };
}
function submitCarrierPayload(request) {
    const startedAt = Date.now();
    if (!(0, circuitBreaker_1.canCallCarrier)(request.carrierId)) {
        (0, observability_1.incrementMetric)("carrier.circuit_open");
        const response = (0, quality_1.normalizeCarrierResponse)({
            submissionId: request.submissionId,
            carrierId: request.carrierId,
            httpStatus: 503,
            body: {
                ack: false,
                message: "carrier-circuit-open",
            },
            outcome: "decline",
        });
        return {
            response,
            attempts: 0,
            backoffScheduleMs: [],
            signature: "",
        };
    }
    const replay = (0, securityControls_1.validateReplayProtection)({
        nonce: request.nonce || `${request.tenantId}:${request.submissionId}`,
        timestampIso: request.timestampIso || new Date().toISOString(),
    });
    if (!replay.valid) {
        (0, observability_1.incrementMetric)("carrier.replay_blocked");
        const response = (0, quality_1.normalizeCarrierResponse)({
            submissionId: request.submissionId,
            carrierId: request.carrierId,
            httpStatus: 401,
            body: {
                ack: false,
                message: `replay-protection-failed:${replay.error}`,
            },
            outcome: "decline",
        });
        return {
            response,
            attempts: 0,
            backoffScheduleMs: [],
            signature: "",
        };
    }
    const maxRetries = Math.max(1, request.maxRetries || 3);
    const activeKey = (0, securityControls_1.resolveActiveSigningKey)(request.carrierId);
    const signingSecret = request.signingSecret || activeKey.secret;
    const validation = validateCarrierPayload(request.payload);
    if (!validation.valid) {
        (0, circuitBreaker_1.registerCarrierFailure)(request.carrierId);
        (0, observability_1.incrementMetric)("carrier.schema_validation_failed");
        const response = (0, quality_1.normalizeCarrierResponse)({
            submissionId: request.submissionId,
            carrierId: request.carrierId,
            httpStatus: 400,
            body: {
                ack: false,
                message: `schema-validation-failed:${validation.errors.join("|")}`,
            },
            outcome: "decline",
        });
        (0, observability_1.observeLatency)("carrier.submit.ms", Date.now() - startedAt);
        return {
            response,
            attempts: 1,
            backoffScheduleMs: [],
            signature: buildSignature({
                submissionId: request.submissionId,
                carrierId: request.carrierId,
                payloadHash: request.payload.payloadHash,
                signingSecret,
            }),
        };
    }
    const signature = buildSignature({
        submissionId: request.submissionId,
        carrierId: request.carrierId,
        payloadHash: request.payload.payloadHash,
        signingSecret,
    });
    const backoffScheduleMs = [];
    let lastHttpStatus = 500;
    let lastBody = { ack: false, message: "uninitialized" };
    let attempts = 0;
    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
        attempts = attempt;
        const backoffMs = attempt === 1 ? 0 : 50 * 2 ** (attempt - 2);
        if (backoffMs > 0) {
            backoffScheduleMs.push(backoffMs);
        }
        const simulated = deterministicCarrierTransport({
            carrierId: request.carrierId,
            signature,
            payloadHash: request.payload.payloadHash,
            attempt,
        });
        lastHttpStatus = simulated.httpStatus;
        lastBody = simulated.body;
        if (simulated.httpStatus < 500) {
            break;
        }
    }
    if (lastHttpStatus >= 500) {
        (0, circuitBreaker_1.registerCarrierFailure)(request.carrierId);
        (0, observability_1.incrementMetric)("carrier.submit.failed");
    }
    else {
        (0, circuitBreaker_1.registerCarrierSuccess)(request.carrierId);
        (0, observability_1.incrementMetric)("carrier.submit.success");
    }
    const response = (0, quality_1.normalizeCarrierResponse)({
        submissionId: request.submissionId,
        carrierId: request.carrierId,
        httpStatus: lastHttpStatus,
        body: {
            ...lastBody,
            signature,
            keyVersion: activeKey.version,
            attempts,
            backoffScheduleMs,
        },
        outcome: lastHttpStatus >= 400 ? "decline" : "accept",
    });
    (0, observability_1.observeLatency)("carrier.submit.ms", Date.now() - startedAt);
    (0, observability_1.logStructuredEvent)("info", "carrier_submission", {
        tenantId: request.tenantId,
        carrierId: request.carrierId,
        submissionId: request.submissionId,
        status: response.status,
        attempts,
        keyVersion: activeKey.version,
    });
    return {
        response,
        attempts,
        backoffScheduleMs,
        signature,
    };
}
