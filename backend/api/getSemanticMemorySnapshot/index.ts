import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { buildSemanticMemorySnapshot } from "shared/quality";
import type { MappingPersistencePayload } from "shared/types";
import { validateMappingPersistencePayload } from "../src/services/mappingPayloadValidation";

type GetSemanticMemorySnapshotRequest = {
  documents?: Array<{
    fixtureId?: string;
    payload?: MappingPersistencePayload;
  }>;
  previousSnapshot?: MappingPersistencePayload["semanticMemorySnapshot"];
  decisions?: MappingPersistencePayload["semanticMemoryDecisions"];
};

export async function getSemanticMemorySnapshotHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const body = (await request.json()) as GetSemanticMemorySnapshotRequest;
    const documents = (body.documents || []).flatMap((document) => {
      const validated = validateMappingPersistencePayload(document.payload);
      if (!validated.valid) return [];

      return [
        {
          fixtureId: document.fixtureId || validated.payload.documentId || "unknown-document",
          payload: validated.payload,
        },
      ];
    });

    if (!documents.length) {
      return {
        status: 400,
        jsonBody: { error: "At least one valid document payload is required." },
      };
    }

    const snapshot = buildSemanticMemorySnapshot(documents, {
      previousSnapshot: body.previousSnapshot,
      decisions: body.decisions,
    });

    return {
      status: 200,
      jsonBody: snapshot,
    };
  } catch (error: any) {
    context.error("getSemanticMemorySnapshot error", error);
    return {
      status: 500,
      jsonBody: {
        error: "Failed to build semantic memory snapshot",
        details: error?.message || String(error),
      },
    };
  }
}

app.http("getSemanticMemorySnapshot", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "memory/snapshot",
  handler: getSemanticMemorySnapshotHandler,
});
