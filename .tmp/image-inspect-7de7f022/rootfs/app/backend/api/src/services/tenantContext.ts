import type { HttpRequest } from "@azure/functions";

export type TenantContext = {
  tenantId: string;
  actorId: string;
  actorRole: string;
  environment: "dev" | "staging" | "prod";
};

export type TenantPolicyCheck =
  | { allowed: true; context: TenantContext }
  | { allowed: false; status: number; error: string };

const DEFAULT_TENANT = "default-tenant";

function getHeader(request: HttpRequest, name: string): string | null {
  const headers = (request as { headers?: { get?: (headerName: string) => string | null } }).headers;
  if (!headers || typeof headers.get !== "function") return null;
  return headers.get(name);
}

function normalizeEnvironment(value: string | null): "dev" | "staging" | "prod" {
  if (value === "prod" || value === "staging") return value;
  return "dev";
}

export function getTenantContext(request: HttpRequest): TenantContext {
  const tenantId = (getHeader(request, "x-tenant-id") || DEFAULT_TENANT).trim() || DEFAULT_TENANT;
  const actorId = (getHeader(request, "x-actor-id") || "system").trim() || "system";
  const actorRole = (getHeader(request, "x-actor-role") || "reviewer").trim() || "reviewer";
  const environment = normalizeEnvironment(getHeader(request, "x-tenant-environment"));
  return { tenantId, actorId, actorRole, environment };
}

export function enforceTenantPolicy(
  request: HttpRequest,
  options: {
    scope: "mapping" | "semantic" | "rules" | "submission" | "admin";
    action: string;
    allowedRoles: string[];
  },
): TenantPolicyCheck {
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

export function buildTenantScopedId(parts: string[]): string {
  return parts
    .map((part) => part.replace(/[^a-zA-Z0-9-_.]/g, "-"))
    .join(":");
}
