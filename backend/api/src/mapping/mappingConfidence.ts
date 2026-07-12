export type MappingConfidenceBand = "high" | "medium" | "low" | "abstain";

export function getMappingConfidenceBand(score: number): MappingConfidenceBand {
  if (score >= 0.8) return "high";
  if (score >= 0.6) return "medium";
  if (score >= 0.45) return "low";
  return "abstain";
}

export function isAutoMappable(score: number): boolean {
  return getMappingConfidenceBand(score) !== "abstain";
}