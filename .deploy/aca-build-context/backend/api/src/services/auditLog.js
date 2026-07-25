"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.appendImmutableAuditEvent = appendImmutableAuditEvent;
exports.loadTenantAuditEvents = loadTenantAuditEvents;
exports.appendAuditIndex = appendAuditIndex;
const blobStorage_1 = require("../../../services/blobStorage");
const storageKeys_1 = require("./storageKeys");
function stableSerialize(value) {
    if (Array.isArray(value))
        return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
    if (value && typeof value === "object") {
        const entries = Object.entries(value).sort((a, b) => a[0].localeCompare(b[0]));
        return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableSerialize(v)}`).join(",")}}`;
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
async function appendImmutableAuditEvent(input) {
    const occurredAt = new Date().toISOString();
    const hash = hashString(stableSerialize({
        tenantId: input.tenantId,
        actorId: input.actorId,
        actorRole: input.actorRole,
        domain: input.domain,
        action: input.action,
        objectId: input.objectId,
        payloadHashSeed: input.payloadHashSeed,
        occurredAt,
    }));
    const eventId = `${input.tenantId}:${input.domain}:${occurredAt}:${hash}`;
    const event = {
        eventId,
        tenantId: input.tenantId,
        actorId: input.actorId,
        actorRole: input.actorRole,
        domain: input.domain,
        action: input.action,
        objectId: input.objectId,
        hash,
        occurredAt,
        lineage: [...input.lineage, `audit.eventId=${eventId}`],
    };
    await (0, blobStorage_1.saveJsonBlob)("audit-logs", (0, storageKeys_1.buildTenantBlobName)(input.tenantId, eventId), event);
    return event;
}
async function loadTenantAuditEvents(tenantId) {
    // Local blob fallback does not support list. Keep deterministic lightweight path via index blob.
    const indexBlobName = `${tenantId}/index.json`;
    const existing = await (0, blobStorage_1.loadJsonBlob)("audit-logs", indexBlobName);
    const index = existing ? JSON.parse(existing) : [];
    const events = [];
    for (const entry of index) {
        const body = await (0, blobStorage_1.loadJsonBlob)("audit-logs", (0, storageKeys_1.buildTenantBlobName)(tenantId, entry));
        if (!body)
            continue;
        events.push(JSON.parse(body));
    }
    return events.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
}
async function appendAuditIndex(tenantId, eventId) {
    const indexBlobName = `${(0, storageKeys_1.sanitizeStorageSegment)(tenantId)}/index.json`;
    const existing = await (0, blobStorage_1.loadJsonBlob)("audit-logs", indexBlobName);
    const index = existing ? JSON.parse(existing) : [];
    const next = Array.from(new Set([...index, eventId])).sort((a, b) => a.localeCompare(b));
    await (0, blobStorage_1.saveJsonBlob)("audit-logs", indexBlobName, next);
}
