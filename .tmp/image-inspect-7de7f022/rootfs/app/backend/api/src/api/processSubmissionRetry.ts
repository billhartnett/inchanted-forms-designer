import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { loadQueuedSubmission, moveSubmissionToDeadLetter } from "../services/retryQueue";
import { submitCarrierPayload } from "../services/carrierApiClient";
import { updateSubmissionStatus } from "../services/submissionStatusStore";
import { enforceTenantPolicy } from "../services/tenantContext";

export async function processSubmissionRetryHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const policy = enforceTenantPolicy(request, {
      scope: "submission",
      action: "retry",
      allowedRoles: ["admin", "underwriter"],
    });
    if (policy.allowed === false) {
      return {
        status: policy.status,
        jsonBody: { error: policy.error },
      };
    }

    const queueId = request.query.get("queueId") || "";
    if (!queueId) {
      return {
        status: 400,
        jsonBody: { error: "queueId query parameter is required" },
      };
    }

    const record = await loadQueuedSubmission(policy.context.tenantId, queueId);
    if (!record) {
      return {
        status: 404,
        jsonBody: { error: "Retry queue record not found" },
      };
    }

    if (record.attemptCount >= record.maxAttempts) {
      await moveSubmissionToDeadLetter(policy.context.tenantId, queueId, "max-attempts-reached");
      return {
        status: 409,
        jsonBody: {
          movedToDeadLetter: true,
          queueId,
          reason: "max-attempts-reached",
        },
      };
    }

    const carrierResult = submitCarrierPayload({
      tenantId: record.tenantId,
      submissionId: record.submissionId,
      carrierId: record.carrierId,
      payload: record.payload as any,
      nonce: `${record.queueId}:${record.attemptCount + 1}`,
      timestampIso: new Date().toISOString(),
    });

    const status = await updateSubmissionStatus({
      tenantId: record.tenantId,
      packageId: record.packageId,
      carrierId: record.carrierId,
      response: carrierResult.response,
    });

    if (carrierResult.response.status !== "accepted" && record.attemptCount + 1 >= record.maxAttempts) {
      await moveSubmissionToDeadLetter(policy.context.tenantId, queueId, carrierResult.response.message || "retry-failed");
    }

    return {
      status: 200,
      jsonBody: {
        queueId,
        submissionId: record.submissionId,
        carrierStatus: carrierResult.response.status,
        status,
      },
    };
  } catch (error: any) {
    context.error("processSubmissionRetry error", error);
    return {
      status: 500,
      jsonBody: {
        error: "Failed to process submission retry",
        details: error?.message || String(error),
      },
    };
  }
}

export default processSubmissionRetryHandler;
