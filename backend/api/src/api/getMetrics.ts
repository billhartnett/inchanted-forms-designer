import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getMetricsSnapshot } from "../services/observability";
import { enforceTenantPolicy } from "../services/tenantContext";

export async function getMetricsHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const policy = enforceTenantPolicy(request, {
      scope: "admin",
      action: "metrics",
      allowedRoles: ["admin"],
    });
    if (policy.allowed === false) {
      return {
        status: policy.status,
        jsonBody: { error: policy.error },
      };
    }

    return {
      status: 200,
      jsonBody: {
        tenantId: policy.context.tenantId,
        metrics: getMetricsSnapshot(),
      },
    };
  } catch (error: any) {
    context.error("getMetrics error", error);
    return {
      status: 500,
      jsonBody: {
        error: "Failed to load metrics",
        details: error?.message || String(error),
      },
    };
  }
}

export default getMetricsHandler;
