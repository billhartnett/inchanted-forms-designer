import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { saveJsonBlob } from "../../services/blobStorage";
import type { MappingPersistencePayload } from "shared/types";
import { validateMappingPersistencePayload } from "../src/services/mappingPayloadValidation";
import { enforceTenantPolicy } from "../src/services/tenantContext";
import { appendImmutableAuditEvent, appendAuditIndex } from "../src/services/auditLog";

interface SaveMappingRequest extends MappingPersistencePayload {
  fileName?: string;
}

export async function saveMapping(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const policy = enforceTenantPolicy(request, {
      scope: "mapping",
      action: "save",
      allowedRoles: ["admin", "reviewer", "underwriter"],
    });
    if (policy.allowed === false) {
      return {
        status: policy.status,
        jsonBody: { error: policy.error }
      };
    }

    const body = (await request.json()) as SaveMappingRequest;
    const validated = validateMappingPersistencePayload(body);
    if (!validated.valid) {
      const error = "error" in validated ? validated.error : "Invalid mapping payload";
      return {
        status: 400,
        jsonBody: { error }
      };
    }

    const localName = `${body.fileName || body.documentId || "form"}.mapping.json`;
    const blobName = `${policy.context.tenantId}/${localName}`;
    const payload: MappingPersistencePayload = {
      ...validated.payload,
      documentId: body.documentId,
      tenantId: policy.context.tenantId,
      tenantEnvironment: policy.context.environment,
    };
    const saved = await saveJsonBlob("mappings", blobName, payload);

    const audit = await appendImmutableAuditEvent({
      tenantId: policy.context.tenantId,
      actorId: policy.context.actorId,
      actorRole: policy.context.actorRole,
      domain: "mapping",
      action: "save",
      objectId: blobName,
      payloadHashSeed: JSON.stringify(payload),
      lineage: [],
    });
    await appendAuditIndex(policy.context.tenantId, audit.eventId);

    return {
      status: 200,
      jsonBody: {
        success: true,
        blobName: saved.blobName,
        url: saved.url
      }
    };
  } catch (err: any) {
    context.error("saveMapping error:", err);

    return {
      status: 500,
      jsonBody: {
        error: "Failed to save mapping",
        details: err.message
      }
    };
  }
}

app.http("saveMapping", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: saveMapping
});
