import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { evaluateSemanticFusion } from "shared/quality";
import type { MappingPersistencePayload } from "shared/types";
import { validateMappingPersistencePayload } from "../src/services/mappingPayloadValidation";

type EvaluateSemanticFusionRequest = {
  documents?: Array<{
    fixtureId?: string;
    payload?: MappingPersistencePayload;
  }>;
};

export async function evaluateSemanticFusionHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const body = (await request.json()) as EvaluateSemanticFusionRequest;
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

    const fusionOverrides = Array.from(
      new Map(
        documents
          .flatMap((item) => item.payload.fusionOverrides || [])
          .map((override) => [override.groupId, override]),
      ).values(),
    );

    return {
      status: 200,
      jsonBody: evaluateSemanticFusion(documents, {
        fusionOverrides,
      }),
    };
  } catch (error: any) {
    context.error("evaluateSemanticFusion error", error);
    return {
      status: 500,
      jsonBody: {
        error: "Failed to evaluate semantic fusion",
        details: error?.message,
      },
    };
  }
}

app.http("evaluateSemanticFusion", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "fusion/evaluate",
  handler: evaluateSemanticFusionHandler,
});
