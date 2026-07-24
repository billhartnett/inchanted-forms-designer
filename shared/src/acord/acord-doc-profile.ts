import type { GatedFieldPrediction } from "./acord-gating";

export type DocumentSemanticProfile = {
  familyId?: string;
  formId?: string;
  predictionCount: number;
  acceptedCount: number;
  rejectedCount: number;
  clusters: Record<string, number>;
  families: Record<string, number>;
  formMembership: Record<string, number>;
  topAliases: string[];
  topCodes: string[];
};

function incrementCounter(counter: Record<string, number>, key: string): void {
  const normalized = String(key || "").trim();
  if (!normalized) {
    return;
  }
  counter[normalized] = (counter[normalized] || 0) + 1;
}

function topKeys(counter: Record<string, number>, limit: number): string[] {
  return Object.entries(counter)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([key]) => key);
}

export function buildDocumentSemanticProfile(
  predictions: GatedFieldPrediction[],
  options?: { familyId?: string; formId?: string },
): DocumentSemanticProfile {
  const clusters: Record<string, number> = {};
  const families: Record<string, number> = {};
  const formMembership: Record<string, number> = {};
  const aliasCounts: Record<string, number> = {};
  const codeCounts: Record<string, number> = {};

  let acceptedCount = 0;
  let rejectedCount = 0;

  for (const prediction of predictions) {
    if (prediction.gatingValid) {
      acceptedCount += 1;
    } else {
      rejectedCount += 1;
    }

    incrementCounter(clusters, prediction.cluster);
    incrementCounter(families, prediction.family);
    incrementCounter(codeCounts, prediction.acordCode);

    for (const member of prediction.formMembership || []) {
      incrementCounter(formMembership, member);
    }

    for (const alias of (prediction.aliases || []).slice(0, 5)) {
      incrementCounter(aliasCounts, alias);
    }
  }

  return {
    familyId: options?.familyId,
    formId: options?.formId,
    predictionCount: predictions.length,
    acceptedCount,
    rejectedCount,
    clusters,
    families,
    formMembership,
    topAliases: topKeys(aliasCounts, 12),
    topCodes: topKeys(codeCounts, 12),
  };
}
