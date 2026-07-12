import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getDocumentIntelligenceConfig, getEmbeddingConfig, getStorageConnectionString } from "../services/config";
import { getCircuitSnapshot } from "../services/circuitBreaker";
import { enforceTenantPolicy } from "../services/tenantContext";

export async function getHealthHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const policy = enforceTenantPolicy(request, {
      scope: "admin",
      action: "health",
      allowedRoles: ["admin", "viewer"],
    });
    if (policy.allowed === false) {
      return {
        status: policy.status,
        jsonBody: { error: policy.error },
      };
    }

    const di = getDocumentIntelligenceConfig();
    const embedding = getEmbeddingConfig();
    const storage = getStorageConnectionString();

    return {
      status: 200,
      jsonBody: {
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
    context.error("getHealth error", error);
    return {
      status: 500,
      jsonBody: {
        ok: false,
        error: "Failed to gather health checks",
        details: error?.message || String(error),
      },
    };
  }
}

export default getHealthHandler;
