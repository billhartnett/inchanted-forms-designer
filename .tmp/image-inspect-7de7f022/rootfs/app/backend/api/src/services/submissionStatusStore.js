"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateSubmissionStatus = updateSubmissionStatus;
exports.getSubmissionStatus = getSubmissionStatus;
const quality_1 = require("shared/quality");
const blobStorage_1 = require("../../../services/blobStorage");
const storageKeys_1 = require("./storageKeys");
function statusBlobName(tenantId, submissionId) {
    return (0, storageKeys_1.buildTenantBlobName)(tenantId, submissionId);
}
async function loadSubmissionRecord(tenantId, submissionId) {
    const body = await (0, blobStorage_1.loadJsonBlob)("submission-status", statusBlobName(tenantId, submissionId));
    if (!body)
        return undefined;
    return JSON.parse(body);
}
async function saveSubmissionRecord(tenantId, submissionId, record) {
    await (0, blobStorage_1.saveJsonBlob)("submission-status", statusBlobName(tenantId, submissionId), record);
}
async function updateSubmissionStatus(input) {
    const key = input.response?.submissionId || `${input.packageId}:${input.carrierId}`;
    const previous = await loadSubmissionRecord(input.tenantId, key);
    const status = (0, quality_1.buildSubmissionStatusSnapshot)({
        packageId: input.packageId,
        carrierId: input.carrierId,
        response: input.response,
        previous: previous?.status,
    });
    const history = [...(previous?.history || []), status].slice(-200);
    const next = {
        status,
        response: input.response || previous?.response,
        history,
    };
    await saveSubmissionRecord(input.tenantId, key, next);
    return next;
}
async function getSubmissionStatus(tenantId, submissionId) {
    return loadSubmissionRecord(tenantId, submissionId);
}
