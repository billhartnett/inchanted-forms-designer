import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { clusterFormFamilies } from "shared/quality";
import type { MappingPersistencePayload } from "shared/types";
import { validateMappingPersistencePayload } from "../src/services/mappingPayloadValidation";

type ClusterRequest = {
  documents?: Array<{ fixtureId?: string; payload?: MappingPersistencePayload }>;
};

export async function clusterFormFamiliesHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const body = (await request.json()) as ClusterRequest;
    const documents = (body.documents || []).flatMap((document) => {
      const validated = validateMappingPersistencePayload(document.payload);
      if (!validated.valid) return [];
      return [{
        fixtureId: document.fixtureId || validated.payload.documentId || "unknown-document",
        payload: validated.payload,
      }];
    });
    if (!documents.length) {
      return { status: 400, jsonBody: { error: "At least one valid document is required" } };
    }
    return { status: 200, jsonBody: clusterFormFamilies(documents) };
  } catch (error: any) {
    context.error("clusterFormFamilies error", error);
    return { status: 500, jsonBody: { error: "Failed to cluster form families", details: error?.message } };
  }
}

app.http("clusterFormFamilies", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "clusterFormFamilies",
  handler: clusterFormFamiliesHandler,
});
