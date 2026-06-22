"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveActiveSigningKey = resolveActiveSigningKey;
exports.validateReplayProtection = validateReplayProtection;
const nonceCache = new Map();
function nowMs() {
    return Date.now();
}
function loadSigningKeysFromEnv(carrierId) {
    const envKey = process.env.CARRIER_SIGNING_KEYS_JSON || "";
    if (!envKey.trim()) {
        return [
            {
                version: `${carrierId}-v1`,
                secret: `${carrierId}-deterministic-secret-v1`,
                activatedAt: "1970-01-01T00:00:00.000Z",
            },
            {
                version: `${carrierId}-v2`,
                secret: `${carrierId}-deterministic-secret-v2`,
                activatedAt: "1970-01-02T00:00:00.000Z",
            },
        ];
    }
    try {
        const parsed = JSON.parse(envKey);
        const keys = parsed[carrierId] || [];
        return keys.length ? keys : [];
    }
    catch {
        return [];
    }
}
function resolveActiveSigningKey(carrierId) {
    const keys = loadSigningKeysFromEnv(carrierId);
    if (!keys.length) {
        return {
            version: `${carrierId}-fallback`,
            secret: `${carrierId}-fallback-secret`,
            activatedAt: "1970-01-01T00:00:00.000Z",
        };
    }
    return [...keys].sort((a, b) => a.activatedAt.localeCompare(b.activatedAt)).at(-1);
}
function validateReplayProtection(input) {
    const windowMs = input.windowMs || 5 * 60 * 1000;
    const timestamp = Date.parse(input.timestampIso);
    if (!Number.isFinite(timestamp)) {
        return { valid: false, error: "Invalid timestamp" };
    }
    const age = Math.abs(nowMs() - timestamp);
    if (age > windowMs) {
        return { valid: false, error: "Timestamp outside replay window" };
    }
    const existing = nonceCache.get(input.nonce);
    if (typeof existing === "number" && existing >= nowMs()) {
        return { valid: false, error: "Nonce already used" };
    }
    nonceCache.set(input.nonce, nowMs() + windowMs);
    return { valid: true };
}
