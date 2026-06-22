import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { buildSubmissionPackage, evaluateSubmissionDrift } from "shared/quality";
import type { MappingPersistencePayload } from "shared/types";
import { buildAcordXmlFromPayload } from "../../mapping/acordXml";
import { validateMappingPersistencePayload } from "../src/services/mappingPayloadValidation";

type GenerateSubmissionPackageRequest = {
  payload?: MappingPersistencePayload;
  includeSemanticLineage?: boolean;
  baseline?: {
    submissionPackage?: MappingPersistencePayload["submissionPackage"];
    submissionStatus?: MappingPersistencePayload["submissionStatus"];
    carrierSubmissionResponse?: MappingPersistencePayload["carrierSubmissionResponse"];
    underwritingDecisionHash?: string;
  };
};

export async function generateSubmissionPackageHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const body = (await request.json()) as GenerateSubmissionPackageRequest;
    const validated = validateMappingPersistencePayload(body.payload);
    if (!validated.valid) {
      const errorMessage = "error" in validated ? validated.error : "Invalid payload";
      return {
        status: 400,
        jsonBody: { error: errorMessage },
      };
    }

    const acord = buildAcordXmlFromPayload(validated.payload, {
      suppressedOcrBlockIds: validated.payload.suppressedOcrBlockIds,
    });
    const submissionPackage = buildSubmissionPackage(validated.payload, {
      acordXml: acord.xml,
      includeSemanticLineage: body.includeSemanticLineage,
      overrides: validated.payload.submissionOverrides || [],
    });
    const drift = evaluateSubmissionDrift(
      body.baseline || {
        submissionPackage: validated.payload.submissionPackage,
        submissionStatus: validated.payload.submissionStatus,
        carrierSubmissionResponse: validated.payload.carrierSubmissionResponse,
        underwritingDecisionHash: validated.payload.underwritingDecisionSnapshot?.decisionHash,
      },
      {
        submissionPackage,
        submissionStatus: validated.payload.submissionStatus,
        carrierSubmissionResponse: validated.payload.carrierSubmissionResponse,
        underwritingDecisionHash: validated.payload.underwritingDecisionSnapshot?.decisionHash,
      },
    );

    return {
      status: 200,
      jsonBody: {
        submissionPackage,
        drift,
      },
    };
  } catch (error: any) {
    context.error("generateSubmissionPackage error", error);
    return {
      status: 500,
      jsonBody: {
        error: "Failed to generate submission package",
        details: error?.message || String(error),
      },
    };
  }
}

app.http("generateSubmissionPackage", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "submission/package/generate",
  handler: generateSubmissionPackageHandler,
});
