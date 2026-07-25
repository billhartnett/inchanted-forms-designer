import type { Request } from "express";
import { getDocumentIntelligenceConfig, getEmbeddingConfig, getStorageConnectionString } from "../services/config";
import { getCircuitSnapshot } from "../services/circuitBreaker";
import { enforceTenantPolicy } from "../services/tenantContext";

export type HealthPayload = {
  ok: boolean;
  tenantId: string;
  checks: {
    documentIntelligence: boolean;
    embeddings: boolean;
    storage: boolean;
  };
  circuits: Record<string, unknown>;
  checkedAt: string;
};

function toTenantPolicyRequest(request: Request) {
  return {
    headers: {
      get(name: string): string | null {
        const value = request.header(name);
        return typeof value === "string" ? value : null;
      },
    },
  };
}

export function buildPingPayload() {
  return {
    ok: true,
    status: "ok",
    message: "pong",
    checkedAt: new Date().toISOString(),
  };
}

export function buildHealthPayload(request: Request):
  | { status: 200; body: HealthPayload }
  | { status: number; body: { error: string } }
  | { status: 500; body: { ok: false; error: string; details: string } } {
  try {
    const policy = enforceTenantPolicy(toTenantPolicyRequest(request) as any, {
      scope: "admin",
      action: "health",
      allowedRoles: ["admin", "viewer"],
    });

    if (policy.allowed === false) {
      return {
        status: policy.status,
        body: { error: policy.error },
      };
    }

    const di = getDocumentIntelligenceConfig();
    const embedding = getEmbeddingConfig();
    const storage = getStorageConnectionString();

    return {
      status: 200,
      body: {
        ok: true,
        tenantId: policy.context.tenantId,
        checks: {
          documentIntelligence: Boolean(di?.endpoint && di?.key),
          embeddings: Boolean(embedding.endpoint && embedding.apiKey && embedding.model),
          storage: Boolean(storage),
        },
        circuits: getCircuitSnapshot(),
        checkedAt: new Date().toISOString(),
      },
    };
  } catch (error: any) {
    return {
      status: 500,
      body: {
        ok: false,
        error: "Failed to gather health checks",
        details: error?.message || String(error),
      },
    };
  }
}
