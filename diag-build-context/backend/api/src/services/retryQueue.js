"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enqueueSubmissionRetry = enqueueSubmissionRetry;
exports.loadQueuedSubmission = loadQueuedSubmission;
exports.moveSubmissionToDeadLetter = moveSubmissionToDeadLetter;
const blobStorage_1 = require("../../../services/blobStorage");
const storageKeys_1 = require("./storageKeys");
function queueBlobName(tenantId, queueId) {
    return (0, storageKeys_1.buildTenantBlobName)(tenantId, queueId);
}
async function enqueueSubmissionRetry(record) {
    await (0, blobStorage_1.saveJsonBlob)("submission-queue", queueBlobName(record.tenantId, record.queueId), {
        ...record,
        createdAt: new Date().toISOString(),
    });
}
async function loadQueuedSubmission(tenantId, queueId) {
    const body = await (0, blobStorage_1.loadJsonBlob)("submission-queue", queueBlobName(tenantId, queueId));
    if (!body)
        return undefined;
    return JSON.parse(body);
}
async function moveSubmissionToDeadLetter(tenantId, queueId, reason) {
    const record = await loadQueuedSubmission(tenantId, queueId);
    if (!record)
        return;
    await (0, blobStorage_1.saveJsonBlob)("submission-dead-letter", queueBlobName(tenantId, queueId), {
        ...record,
        deadLetteredAt: new Date().toISOString(),
        reason,
    });
}
