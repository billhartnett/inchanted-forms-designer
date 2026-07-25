import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import type { MappingPersistencePayload } from "shared/types";
import { validateMappingPersistencePayload } from "../services/mappingPayloadValidation";
import { orchestrateCarrierSubmission } from "../services/submissionOrchestrator";
import { enforceTenantPolicy } from "../services/tenantContext";

type SubmitToCarrierRequest = {
  payload?: MappingPersistencePayload;
  includeSemanticLineage?: boolean;
  signingSecret?: string;
};

export async function submitToCarrierHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const idempotencyKey =
      (request as { headers?: { get?: (name: string) => string | null } }).headers?.get?.(
        "x-idempotency-key",
      ) || undefined;

    const policy = enforceTenantPolicy(request, {
      scope: "submission",
      action: "submit",
      allowedRoles: ["admin", "reviewer", "underwriter"],
    });
    if (policy.allowed === false) {
      return {
        status: policy.status,
        jsonBody: { error: policy.error },
      };
    }

    const body = (await request.json()) as SubmitToCarrierRequest;
    const validated = validateMappingPersistencePayload(body.payload);
    if (!validated.valid) {
      const errorMessage = "error" in validated ? validated.error : "Invalid payload";
      return {
        status: 400,
        jsonBody: { error: errorMessage },
      };
    }

    const result = await orchestrateCarrierSubmission({
      tenantId: policy.context.tenantId,
      actorId: policy.context.actorId,
      actorRole: policy.context.actorRole,
      idempotencyKey,
      payload: validated.payload,
      includeSemanticLineage: body.includeSemanticLineage,
      overrides: validated.payload.submissionOverrides || [],
      signingSecret: body.signingSecret,
    });

    return {
      status: 200,
      jsonBody: result,
    };
  } catch (error: any) {
    context.error("submitToCarrier error", error);
    return {
      status: 500,
      jsonBody: {
        error: "Failed to submit package to carrier",
        details: error?.message || String(error),
      },
    };
  }
}

export default submitToCarrierHandler;
