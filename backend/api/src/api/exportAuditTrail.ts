import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { loadTenantAuditEvents } from "../services/auditLog";
import { enforceTenantPolicy } from "../services/tenantContext";

export async function exportAuditTrailHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const policy = enforceTenantPolicy(request, {
      scope: "admin",
      action: "audit-export",
      allowedRoles: ["admin", "underwriter"],
    });
    if (policy.allowed === false) {
      return {
        status: policy.status,
        jsonBody: { error: policy.error },
      };
    }

    const from = request.query.get("from");
    const to = request.query.get("to");

    const events = await loadTenantAuditEvents(policy.context.tenantId);
    const filtered = events.filter((event) => {
      if (from && event.occurredAt < from) return false;
      if (to && event.occurredAt > to) return false;
      return true;
    });

    return {
      status: 200,
      jsonBody: {
        tenantId: policy.context.tenantId,
        count: filtered.length,
        events: filtered,
      },
    };
  } catch (error: any) {
    context.error("exportAuditTrail error", error);
    return {
      status: 500,
      jsonBody: {
        error: "Failed to export audit trail",
        details: error?.message || String(error),
      },
    };
  }
}

export default exportAuditTrailHandler;
