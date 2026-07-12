import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { loadJsonBlob } from "../services/blobStorage";
import type { MappingPersistencePayload } from "shared/types";
import { validateMappingPersistencePayload } from "../services/mappingPayloadValidation";
import { enforceTenantPolicy } from "../services/tenantContext";

export async function loadMapping(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const policy = enforceTenantPolicy(request, {
      scope: "mapping",
      action: "load",
      allowedRoles: ["admin", "reviewer", "underwriter", "viewer"],
    });
    if (policy.allowed === false) {
      return {
        status: policy.status,
        jsonBody: { error: policy.error }
      };
    }

    const fileName = request.query.get("fileName");
    if (!fileName) {
      return {
        status: 400,
        jsonBody: { error: "Missing fileName query parameter" }
      };
    }

    const blobName = `${policy.context.tenantId}/${fileName}.mapping.json`;
    const json = await loadJsonBlob("mappings", blobName);
    if (!json) {
      return {
        status: 404,
        jsonBody: { error: "Mapping not found", blobName }
      };
    }

    const parsed = JSON.parse(json) as MappingPersistencePayload;
    const validated = validateMappingPersistencePayload(parsed);
    if (!validated.valid) {
      const error = "error" in validated ? validated.error : "Invalid stored payload";
      return {
        status: 500,
        jsonBody: { error: `Stored mapping payload is invalid: ${error}` }
      };
    }

    return {
      status: 200,
      jsonBody: validated.payload
    };
  } catch (err: any) {
    context.error("loadMapping error:", err);
    return {
      status: 500,
      jsonBody: { error: "Failed to load mapping", details: err.message }
    };
  }
}

export default loadMapping;
