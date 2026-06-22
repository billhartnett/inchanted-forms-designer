"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTenantContext = getTenantContext;
exports.enforceTenantPolicy = enforceTenantPolicy;
exports.buildTenantScopedId = buildTenantScopedId;
const DEFAULT_TENANT = "default-tenant";
function getHeader(request, name) {
    const headers = request.headers;
    if (!headers || typeof headers.get !== "function")
        return null;
    return headers.get(name);
}
function normalizeEnvironment(value) {
    if (value === "prod" || value === "staging")
        return value;
    return "dev";
}
function getTenantContext(request) {
    const tenantId = (getHeader(request, "x-tenant-id") || DEFAULT_TENANT).trim() || DEFAULT_TENANT;
    const actorId = (getHeader(request, "x-actor-id") || "system").trim() || "system";
    const actorRole = (getHeader(request, "x-actor-role") || "reviewer").trim() || "reviewer";
    const environment = normalizeEnvironment(getHeader(request, "x-tenant-environment"));
    return { tenantId, actorId, actorRole, environment };
}
function enforceTenantPolicy(request, options) {
    const context = getTenantContext(request);
    if (!options.allowedRoles.includes(context.actorRole)) {
        return {
            allowed: false,
            status: 403,
            error: `Policy denied for ${options.scope}:${options.action} role=${context.actorRole}`,
        };
    }
    return { allowed: true, context };
}
function buildTenantScopedId(parts) {
    return parts
        .map((part) => part.replace(/[^a-zA-Z0-9-_.]/g, "-"))
        .join(":");
}
