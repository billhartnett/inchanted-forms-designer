import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import {
  evaluateSemanticFusion,
  generateSemanticMemoryRecommendations,
  prioritizeConflictRecurrence,
} from "shared/quality";
import type { MappingPersistencePayload } from "shared/types";
import { validateMappingPersistencePayload } from "../src/services/mappingPayloadValidation";

type EvaluateMemoryRecommendationsRequest = {
  documents?: Array<{
    fixtureId?: string;
    payload?: MappingPersistencePayload;
  }>;
  snapshot?: MappingPersistencePayload["semanticMemorySnapshot"];
};

export async function evaluateMemoryRecommendationsHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const body = (await request.json()) as EvaluateMemoryRecommendationsRequest;
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

    const fusion = evaluateSemanticFusion(documents, {
      fusionOverrides: documents.flatMap((document) => document.payload.fusionOverrides || []),
    });

    return {
      status: 200,
      jsonBody: {
        recommendations: generateSemanticMemoryRecommendations(fusion, body.snapshot),
        prioritizedConflicts: prioritizeConflictRecurrence(fusion, body.snapshot),
      },
    };
  } catch (error: any) {
    context.error("evaluateMemoryRecommendations error", error);
    return {
      status: 500,
      jsonBody: {
        error: "Failed to evaluate semantic memory recommendations",
        details: error?.message || String(error),
      },
    };
  }
}

app.http("evaluateMemoryRecommendations", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "memory/recommendations",
  handler: evaluateMemoryRecommendationsHandler,
});
