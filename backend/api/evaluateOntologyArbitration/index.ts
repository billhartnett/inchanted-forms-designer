import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import {
  arbitrateCandidateByOntology,
  selectOntologyBundlesForFamily,
} from "shared/acord";
import type { MappingPersistencePayload } from "shared/types";
import { validateMappingPersistencePayload } from "../src/services/mappingPayloadValidation";

type EvaluateOntologyArbitrationRequest = {
  payload?: MappingPersistencePayload;
  familyId?: string;
};

export async function evaluateOntologyArbitrationHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const body = (await request.json()) as EvaluateOntologyArbitrationRequest;
    const validated = validateMappingPersistencePayload(body.payload);
    if (!validated.valid) {
      const errorMessage = "error" in validated ? validated.error : "Invalid payload";
      return {
        status: 400,
        jsonBody: { error: errorMessage },
      };
    }

    const familyId = body.familyId || validated.payload.formFamily?.familyId;
    const bundles = selectOntologyBundlesForFamily(familyId);
    const decisions = validated.payload.mappings
      .map((record) => {
        const chosenCode = record.mapping.chosen?.acordCode;
        if (!chosenCode) return undefined;
        const candidate =
          record.mapping.suggestions.find((item) => item.acordCode === chosenCode) ||
          record.mapping.chosen;
        if (!candidate) return undefined;
        return {
          extractionBlockId: record.extractionBlockId,
          arbitration: arbitrateCandidateByOntology(candidate, bundles),
        };
      })
      .filter((item) => Boolean(item));

    return {
      status: 200,
      jsonBody: {
        generatedAt: new Date().toISOString(),
        familyId: familyId || "unknown-family",
        ontologyBundles: bundles.map((bundle) => bundle.metadata),
        decisions,
      },
    };
  } catch (error: any) {
    context.error("evaluateOntologyArbitration error", error);
    return {
      status: 500,
      jsonBody: {
        error: "Failed to evaluate ontology arbitration",
        details: error?.message,
      },
    };
  }
}

app.http("evaluateOntologyArbitration", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "ontology/arbitration",
  handler: evaluateOntologyArbitrationHandler,
});
