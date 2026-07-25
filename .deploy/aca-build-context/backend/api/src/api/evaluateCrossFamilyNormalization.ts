import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { evaluateCrossFamilyNormalization } from "shared/quality";
import type { MappingPersistencePayload } from "shared/types";
import { validateMappingPersistencePayload } from "../services/mappingPayloadValidation";

type EvaluateNormalizationRequest = {
  documents?: Array<{
    fixtureId?: string;
    payload?: MappingPersistencePayload;
  }>;
};

export async function evaluateCrossFamilyNormalizationHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const body = (await request.json()) as EvaluateNormalizationRequest;
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

    return {
      status: 200,
      jsonBody: evaluateCrossFamilyNormalization(documents),
    };
  } catch (error: any) {
    context.error("evaluateCrossFamilyNormalization error", error);
    return {
      status: 500,
      jsonBody: {
        error: "Failed to evaluate cross-family normalization",
        details: error?.message,
      },
    };
  }
}

export default evaluateCrossFamilyNormalizationHandler;
