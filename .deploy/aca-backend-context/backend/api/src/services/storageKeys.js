"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeStorageSegment = sanitizeStorageSegment;
exports.buildTenantBlobName = buildTenantBlobName;
function sanitizeStorageSegment(value) {
    return value.replace(/[<>:"/\\|?*\x00-\x1F]/g, "-").replace(/\s+/g, "-");
}
function buildTenantBlobName(tenantId, key, suffix = ".json") {
    return `${sanitizeStorageSegment(tenantId)}/${sanitizeStorageSegment(key)}${suffix}`;
}
