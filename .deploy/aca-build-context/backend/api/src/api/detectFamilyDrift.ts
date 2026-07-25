import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import type { FormFamilyClusterReport } from "shared/quality";

type FamilyDriftRequest = {
  baseline?: FormFamilyClusterReport;
  current?: FormFamilyClusterReport;
};

export async function detectFamilyDriftHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const body = (await request.json()) as FamilyDriftRequest;
    if (!body.baseline || !body.current) {
      return { status: 400, jsonBody: { error: "baseline and current family reports are required" } };
    }
    const differences: Array<{ key: string; baselineValue: string | number; currentValue: string | number }> = [];
    if (body.baseline.clusterHash !== body.current.clusterHash) {
      differences.push({ key: "clusterHash", baselineValue: body.baseline.clusterHash, currentValue: body.current.clusterHash });
    }
    const baselineFamilies = new Map(body.baseline.families.map((family) => [family.familyId, family]));
    for (const family of body.current.families) {
      const baseline = baselineFamilies.get(family.familyId);
      if (!baseline) {
        differences.push({ key: `family.${family.familyId}.added`, baselineValue: 0, currentValue: family.documents });
        continue;
      }
      if (baseline.signatureHash !== family.signatureHash) {
        differences.push({ key: `family.${family.familyId}.signatureHash`, baselineValue: baseline.signatureHash, currentValue: family.signatureHash });
      }
    }
    return { status: 200, jsonBody: { hasDrift: differences.length > 0, differences } };
  } catch (error: any) {
    context.error("detectFamilyDrift error", error);
    return { status: 500, jsonBody: { error: "Failed to detect family drift", details: error?.message } };
  }
}

export default detectFamilyDriftHandler;
