import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import {
  buildCarrierAdapterSnapshot,
  evaluateCarrierAdapterDrift,
  evaluateCarrierAdapterMappings,
} from "shared/quality";
import type { MappingPersistencePayload } from "shared/types";
import { validateMappingPersistencePayload } from "../src/services/mappingPayloadValidation";

type EvaluateCarrierAdaptersRequest = {
  payload?: MappingPersistencePayload;
  baselineSnapshot?: MappingPersistencePayload["carrierAdapterSnapshot"];
};

export async function evaluateCarrierAdaptersHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const body = (await request.json()) as EvaluateCarrierAdaptersRequest;
    const validated = validateMappingPersistencePayload(body.payload);
    if (!validated.valid) {
      const errorMessage = "error" in validated ? validated.error : "Invalid payload";
      return {
        status: 400,
        jsonBody: { error: errorMessage },
      };
    }

    const mappings = evaluateCarrierAdapterMappings(validated.payload, {
      familyId: validated.payload.formFamily?.familyId,
      overrides: validated.payload.carrierAdapterOverrides || [],
    });
    const snapshot = buildCarrierAdapterSnapshot(
      [{ fixtureId: validated.payload.documentId || "unknown-document", payload: validated.payload }],
      {
        previousSnapshot: validated.payload.carrierAdapterSnapshot,
        overrides: validated.payload.carrierAdapterOverrides || [],
      },
    );
    const drift = evaluateCarrierAdapterDrift(body.baselineSnapshot, snapshot);

    return {
      status: 200,
      jsonBody: {
        mappings,
        snapshot,
        drift,
      },
    };
  } catch (error: any) {
    context.error("evaluateCarrierAdapters error", error);
    return {
      status: 500,
      jsonBody: {
        error: "Failed to evaluate carrier adapters",
        details: error?.message || String(error),
      },
    };
  }
}

app.http("evaluateCarrierAdapters", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "carrier/adapters/evaluate",
  handler: evaluateCarrierAdaptersHandler,
});
