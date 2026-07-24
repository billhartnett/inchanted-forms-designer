import type { MappingPersistencePayload } from "../types";

export type RawSignalSet = {
  embedding: number;
  lexical: number;
  dictionary: number;
  heuristic: number;
};

export type NormalizedSignalSet = {
  embedding: number;
  lexical: number;
  dictionary: number;
  heuristic: number;
};

export type SignalNormalizationResult = {
  familyId: string;
  familyFactor: number;
  raw: RawSignalSet;
  normalized: NormalizedSignalSet;
};

export type FamilyNormalizationSummary = {
  familyId: string;
  samples: number;
  rawAverage: RawSignalSet;
  normalizedAverage: NormalizedSignalSet;
  normalizedConfidenceAverage: number;
};

export type CrossFamilyNormalizationReport = {
  familySummaries: FamilyNormalizationSummary[];
  transferabilityScore: number;
  driftByFamily: Array<{
    familyId: string;
    normalizedConfidenceDelta: number;
    rationaleSignalDelta: number;
    candidateStabilityDelta: number;
  }>;
};

const FAMILY_FACTORS: Record<string, number> = {
  "acord-125": 1,
  "acord-126": 0.98,
  "acord-127": 0.99,
  "acord-140": 1.02,
  "contractors-supplement": 0.95,
  "general-supplement": 0.96,
};

function quantize(value: number): number {
  return Number(value.toFixed(6));
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return quantize(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function normalizeSignal(value: number, familyFactor: number): number {
  const centered = clamp01(value);
  const shifted = 0.5 + (centered - 0.5) * familyFactor;
  return quantize(clamp01(shifted));
}

export function getFamilyNormalizationFactor(familyId: string | undefined): number {
  if (!familyId) return 1;
  return FAMILY_FACTORS[familyId] ?? 1;
}

export function normalizeSignalsForFamily(
  raw: RawSignalSet,
  familyId: string | undefined,
): SignalNormalizationResult {
  const resolvedFamilyId = familyId || "unknown-family";
  const familyFactor = getFamilyNormalizationFactor(familyId);
  return {
    familyId: resolvedFamilyId,
    familyFactor,
    raw: {
      embedding: quantize(clamp01(raw.embedding)),
      lexical: quantize(clamp01(raw.lexical)),
      dictionary: quantize(clamp01(raw.dictionary)),
      heuristic: quantize(clamp01(raw.heuristic)),
    },
    normalized: {
      embedding: normalizeSignal(raw.embedding, familyFactor),
      lexical: normalizeSignal(raw.lexical, familyFactor),
      dictionary: normalizeSignal(raw.dictionary, familyFactor),
      heuristic: normalizeSignal(raw.heuristic, familyFactor),
    },
  };
}

export function blendNormalizedSignals(
  normalized: NormalizedSignalSet,
  weights: RawSignalSet,
): number {
  const total = Math.max(
    0.000001,
    weights.embedding + weights.lexical + weights.dictionary + weights.heuristic,
  );
  const score =
    normalized.embedding * (weights.embedding / total) +
    normalized.lexical * (weights.lexical / total) +
    normalized.dictionary * (weights.dictionary / total) +
    normalized.heuristic * (weights.heuristic / total);
  return quantize(clamp01(score));
}

export function evaluateCrossFamilyNormalization(
  documents: Array<{ fixtureId: string; payload: MappingPersistencePayload }>,
): CrossFamilyNormalizationReport {
  const byFamily = new Map<string, Array<{ confidence: number; raw: RawSignalSet; normalized: NormalizedSignalSet }>>();

  for (const document of documents) {
    const familyId = document.payload.formFamily?.familyId || "unknown-family";
    const existing = byFamily.get(familyId) || [];

    for (const record of document.payload.mappings) {
      const chosenCode =
        document.payload.decisionGraph.mappings[record.extractionBlockId]?.chosenCandidateCode ||
        record.mapping.chosen?.acordCode;
      if (!chosenCode) continue;

      const candidate =
        record.mapping.suggestions.find((item) => item.acordCode === chosenCode) ||
        record.mapping.chosen;
      if (!candidate) continue;

      const raw: RawSignalSet = {
        embedding: candidate.semanticSimilarity || 0,
        lexical: candidate.lexicalScore || 0,
        dictionary: candidate.dictionaryScore || 0,
        heuristic: candidate.heuristicScore || 0,
      };
      const normalized = normalizeSignalsForFamily(raw, familyId);
      existing.push({
        confidence: candidate.normalizedConfidenceScore ?? candidate.confidenceScore,
        raw: normalized.raw,
        normalized: normalized.normalized,
      });
    }

    byFamily.set(familyId, existing);
  }

  const familySummaries: FamilyNormalizationSummary[] = Array.from(byFamily.entries())
    .map(([familyId, entries]) => ({
      familyId,
      samples: entries.length,
      rawAverage: {
        embedding: average(entries.map((item) => item.raw.embedding)),
        lexical: average(entries.map((item) => item.raw.lexical)),
        dictionary: average(entries.map((item) => item.raw.dictionary)),
        heuristic: average(entries.map((item) => item.raw.heuristic)),
      },
      normalizedAverage: {
        embedding: average(entries.map((item) => item.normalized.embedding)),
        lexical: average(entries.map((item) => item.normalized.lexical)),
        dictionary: average(entries.map((item) => item.normalized.dictionary)),
        heuristic: average(entries.map((item) => item.normalized.heuristic)),
      },
      normalizedConfidenceAverage: average(entries.map((item) => item.confidence)),
    }))
    .sort((left, right) => left.familyId.localeCompare(right.familyId));

  const globalConfidence = average(
    familySummaries.map((item) => item.normalizedConfidenceAverage),
  );

  const driftByFamily = familySummaries.map((summary) => ({
    familyId: summary.familyId,
    normalizedConfidenceDelta: quantize(summary.normalizedConfidenceAverage - globalConfidence),
    rationaleSignalDelta: quantize(
      average([
        summary.normalizedAverage.embedding - summary.rawAverage.embedding,
        summary.normalizedAverage.lexical - summary.rawAverage.lexical,
        summary.normalizedAverage.dictionary - summary.rawAverage.dictionary,
        summary.normalizedAverage.heuristic - summary.rawAverage.heuristic,
      ]),
    ),
    candidateStabilityDelta: quantize(
      Math.abs(summary.normalizedAverage.embedding - summary.normalizedAverage.lexical),
    ),
  }));

  const transferabilityScore = familySummaries.length
    ? quantize(
        1 -
          average(
            driftByFamily.map((item) => Math.abs(item.normalizedConfidenceDelta)),
          ),
      )
    : 0;

  return {
    familySummaries,
    transferabilityScore,
    driftByFamily,
  };
}

