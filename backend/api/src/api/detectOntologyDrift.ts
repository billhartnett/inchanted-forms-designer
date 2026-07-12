import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

type OntologyDriftInput = {
  ontologyHash: string;
  issueCount: number;
  transferabilityScore?: number;
};

type DetectOntologyDriftRequest = {
  baseline?: OntologyDriftInput;
  current?: OntologyDriftInput;
};

export async function detectOntologyDriftHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const body = (await request.json()) as DetectOntologyDriftRequest;
    if (!body.baseline || !body.current) {
      return {
        status: 400,
        jsonBody: { error: "baseline and current ontology snapshots are required" },
      };
    }

    const differences: Array<{
      key: string;
      baselineValue: string | number;
      currentValue: string | number;
    }> = [];

    if (body.baseline.ontologyHash !== body.current.ontologyHash) {
      differences.push({
        key: "ontologyHash",
        baselineValue: body.baseline.ontologyHash,
        currentValue: body.current.ontologyHash,
      });
    }
    if (body.baseline.issueCount !== body.current.issueCount) {
      differences.push({
        key: "issueCount",
        baselineValue: body.baseline.issueCount,
        currentValue: body.current.issueCount,
      });
    }
    if (
      typeof body.baseline.transferabilityScore === "number" &&
      typeof body.current.transferabilityScore === "number" &&
      body.baseline.transferabilityScore !== body.current.transferabilityScore
    ) {
      differences.push({
        key: "transferabilityScore",
        baselineValue: body.baseline.transferabilityScore,
        currentValue: body.current.transferabilityScore,
      });
    }

    return {
      status: 200,
      jsonBody: {
        hasDrift: differences.length > 0,
        differences,
      },
    };
  } catch (error: any) {
    context.error("detectOntologyDrift error", error);
    return {
      status: 500,
      jsonBody: { error: "Failed to detect ontology drift", details: error?.message },
    };
  }
}

export default detectOntologyDriftHandler;
