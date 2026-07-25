import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { evaluateSubmissionDrift } from "shared/quality";
import type { MappingPersistencePayload } from "shared/types";

type EvaluateSubmissionDriftRequest = {
  baseline?: {
    submissionPackage?: MappingPersistencePayload["submissionPackage"];
    submissionStatus?: MappingPersistencePayload["submissionStatus"];
    carrierSubmissionResponse?: MappingPersistencePayload["carrierSubmissionResponse"];
    underwritingDecisionHash?: string;
  };
  current?: {
    submissionPackage?: MappingPersistencePayload["submissionPackage"];
    submissionStatus?: MappingPersistencePayload["submissionStatus"];
    carrierSubmissionResponse?: MappingPersistencePayload["carrierSubmissionResponse"];
    underwritingDecisionHash?: string;
  };
};

export async function evaluateSubmissionDriftHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const body = (await request.json()) as EvaluateSubmissionDriftRequest;
    if (!body.current) {
      return {
        status: 400,
        jsonBody: { error: "current submission state is required." },
      };
    }

    const drift = evaluateSubmissionDrift(body.baseline || {}, body.current);
    return {
      status: 200,
      jsonBody: drift,
    };
  } catch (error: any) {
    context.error("evaluateSubmissionDrift error", error);
    return {
      status: 500,
      jsonBody: {
        error: "Failed to evaluate submission drift",
        details: error?.message || String(error),
      },
    };
  }
}

export default evaluateSubmissionDriftHandler;
