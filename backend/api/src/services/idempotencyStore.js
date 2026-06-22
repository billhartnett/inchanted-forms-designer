"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadIdempotentResponse = loadIdempotentResponse;
exports.saveIdempotentResponse = saveIdempotentResponse;
const blobStorage_1 = require("../../../services/blobStorage");
const storageKeys_1 = require("./storageKeys");
async function loadIdempotentResponse(tenantId, idempotencyKey, requestHash) {
    const body = await (0, blobStorage_1.loadJsonBlob)("idempotency", (0, storageKeys_1.buildTenantBlobName)(tenantId, idempotencyKey));
    if (!body)
        return undefined;
    const record = JSON.parse(body);
    if (record.requestHash !== requestHash)
        return undefined;
    return record.response;
}
async function saveIdempotentResponse(tenantId, idempotencyKey, requestHash, response) {
    const record = {
        key: idempotencyKey,
        tenantId,
        requestHash,
        response,
        createdAt: new Date().toISOString(),
    };
    await (0, blobStorage_1.saveJsonBlob)("idempotency", (0, storageKeys_1.buildTenantBlobName)(tenantId, idempotencyKey), record);
}
