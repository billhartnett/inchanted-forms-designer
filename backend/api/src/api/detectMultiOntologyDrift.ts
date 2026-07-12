import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

type MultiOntologySnapshot = {
  bundleSignatures: string[];
  compatibilityHash: string;
  conflictHash?: string;
  transferabilityScore?: number;
};

type DetectMultiOntologyDriftRequest = {
  baseline?: MultiOntologySnapshot;
  current?: MultiOntologySnapshot;
};

export async function detectMultiOntologyDriftHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const body = (await request.json()) as DetectMultiOntologyDriftRequest;
    if (!body.baseline || !body.current) {
      return {
        status: 400,
        jsonBody: { error: "baseline and current snapshots are required" },
      };
    }

    const differences: Array<{
      key: string;
      baselineValue: string | number;
      currentValue: string | number;
    }> = [];

    const baselineSignatures = [...body.baseline.bundleSignatures].sort().join("|");
    const currentSignatures = [...body.current.bundleSignatures].sort().join("|");
    if (baselineSignatures !== currentSignatures) {
      differences.push({
        key: "bundleSignatures",
        baselineValue: baselineSignatures,
        currentValue: currentSignatures,
      });
    }

    if (body.baseline.compatibilityHash !== body.current.compatibilityHash) {
      differences.push({
        key: "compatibilityHash",
        baselineValue: body.baseline.compatibilityHash,
        currentValue: body.current.compatibilityHash,
      });
    }

    if ((body.baseline.conflictHash || "") !== (body.current.conflictHash || "")) {
      differences.push({
        key: "conflictHash",
        baselineValue: body.baseline.conflictHash || "",
        currentValue: body.current.conflictHash || "",
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
    context.error("detectMultiOntologyDrift error", error);
    return {
      status: 500,
      jsonBody: {
        error: "Failed to detect multi-ontology drift",
        details: error?.message,
      },
    };
  }
}

export default detectMultiOntologyDriftHandler;
