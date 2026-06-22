import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getSubmissionStatus } from "../src/services/submissionStatusStore";
import { enforceTenantPolicy } from "../src/services/tenantContext";

export async function getSubmissionStatusHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const policy = enforceTenantPolicy(request, {
      scope: "submission",
      action: "status",
      allowedRoles: ["admin", "reviewer", "underwriter", "viewer"],
    });
    if (policy.allowed === false) {
      return {
        status: policy.status,
        jsonBody: { error: policy.error },
      };
    }

    const submissionId = request.query.get("submissionId") || "";
    if (!submissionId) {
      return {
        status: 400,
        jsonBody: { error: "submissionId query parameter is required." },
      };
    }

    const status = await getSubmissionStatus(policy.context.tenantId, submissionId);
    if (!status) {
      return {
        status: 404,
        jsonBody: { error: "submission status not found" },
      };
    }

    return {
      status: 200,
      jsonBody: status,
    };
  } catch (error: any) {
    context.error("getSubmissionStatus error", error);
    return {
      status: 500,
      jsonBody: {
        error: "Failed to get submission status",
        details: error?.message || String(error),
      },
    };
  }
}

app.http("getSubmissionStatus", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "submission/status",
  handler: getSubmissionStatusHandler,
});
