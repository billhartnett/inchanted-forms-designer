import type { FieldMapping } from "shared/types";

type Wave8GatingOptions = {
  enabled?: boolean;
  minConfidence?: number;
  retainTopSuggestions?: number;
};

function toNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function applyWave8Gating(
  mappings: FieldMapping[],
  options?: Wave8GatingOptions,
): FieldMapping[] {
  const enabled = options?.enabled ?? process.env.WAVE8_GATING_ENABLED !== "0";
  if (!enabled) {
    return mappings;
  }

  const minConfidence = Math.max(
    0,
    Math.min(1, options?.minConfidence ?? toNumber(process.env.WAVE8_GATING_MIN_CONFIDENCE, 0.2)),
  );
  const retainTopSuggestions = Math.max(
    1,
    Math.min(10, Math.floor(options?.retainTopSuggestions ?? toNumber(process.env.WAVE8_GATING_TOP_K, 5))),
  );

  return mappings.map((mapping) => {
    const gatedSuggestions = mapping.suggestions
      .filter((candidate) => candidate.confidenceScore >= minConfidence)
      .slice(0, retainTopSuggestions);

    const nextChosen = gatedSuggestions.find((s) => s.acordCode === mapping.chosen?.acordCode) || gatedSuggestions[0];

    return {
      ...mapping,
      suggestions: gatedSuggestions,
      chosen: nextChosen,
      topCandidate: nextChosen,
    };
  });
}