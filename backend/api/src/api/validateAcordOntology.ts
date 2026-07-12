import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { validateOntologySelection } from "shared/acord";
import type { MappingPersistencePayload } from "shared/types";
import { validateMappingPersistencePayload } from "../services/mappingPayloadValidation";

type ValidateOntologyRequest = {
  codes?: string[];
  payload?: MappingPersistencePayload;
};

export async function validateAcordOntologyHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const body = (await request.json()) as ValidateOntologyRequest;
    let codes = Array.isArray(body.codes) ? body.codes.filter((item) => typeof item === "string") : [];

    if (body.payload) {
      const validated = validateMappingPersistencePayload(body.payload);
      if (!validated.valid) {
        return {
          status: 400,
          jsonBody: { error: "error" in validated ? validated.error : "Invalid payload" },
        };
      }

      const payloadCodes = validated.payload.mappings
        .map((record) => {
          const chosenCode =
            validated.payload.decisionGraph.mappings[record.extractionBlockId]?.chosenCandidateCode ||
            record.mapping.chosen?.acordCode;
          return chosenCode;
        })
        .filter((item): item is string => Boolean(item));

      codes = Array.from(new Set([...codes, ...payloadCodes])).sort((a, b) => a.localeCompare(b));
    }

    return {
      status: 200,
      jsonBody: validateOntologySelection(codes),
    };
  } catch (error: any) {
    context.error("validateAcordOntology error", error);
    return {
      status: 500,
      jsonBody: { error: "Failed to validate ontology", details: error?.message },
    };
  }
}

export default validateAcordOntologyHandler;
