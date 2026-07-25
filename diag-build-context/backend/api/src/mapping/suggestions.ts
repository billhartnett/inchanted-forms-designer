import {
  getAllAcordEntries,
  getAcordDictionaryState,
  lookupAcordByCode,
  searchAcordDictionary,
} from "./acordDictionary";

export function searchAcordLabels(query: string, limit = 20) {
  return searchAcordDictionary(query, limit);
}

export function lookupAcordLabel(acordCode: string) {
  return lookupAcordByCode(acordCode);
}

export function listAcordLabels() {
  return getAllAcordEntries();
}

export function getAcordDictionarySummary() {
  return getAcordDictionaryState();
}

export function suggestAcordLabel(text: string, context?: string) {
  const combined = `${text} ${context ?? ""}`.trim();
  const [best] = searchAcordDictionary(combined, 1);

  if (!best) {
    return {
      acordCode: "ACORD.UNKNOWN",
      label: "Unknown Field",
      confidenceScore: 0.5,
      source: "ai" as const,
    };
  }

  const confidenceScore = Math.min(0.99, 0.5 + best.score / 300);
  return {
    acordCode: best.entry.acordCode,
    label: best.entry.label,
    description: best.entry.description,
    confidenceScore: Number(confidenceScore.toFixed(2)),
    source: "ai" as const,
  };
}