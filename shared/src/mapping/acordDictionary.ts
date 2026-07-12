import { acordDictionary, getAcordDictionaryEntries } from "../acord";
import type { AcordDictionaryEntry } from "shared/acord";

type SearchResult = {
  score: number;
  entry: AcordDictionaryEntry;
};

type DictionaryState = {
  loaded: boolean;
  rowCount: number;
  loadedAt: string | null;
};

const state: DictionaryState = {
  loaded: true,
  rowCount: acordDictionary.length,
  loadedAt: new Date().toISOString(),
};

function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreEntry(entry: AcordDictionaryEntry, query: string): number {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return 0;

  const normalizedCode = normalizeText(entry.acordCode);
  const normalizedLabel = normalizeText(entry.label);
  const normalizedDescription = normalizeText(entry.description);
  const normalizedKeywords = entry.keywords.map((keyword) => normalizeText(keyword));

  let score = 0;
  if (normalizedCode === normalizedQuery) score += 120;
  if (normalizedLabel === normalizedQuery) score += 100;
  if (normalizedCode.includes(normalizedQuery)) score += 70;
  if (normalizedLabel.includes(normalizedQuery)) score += 60;
  if (normalizedDescription.includes(normalizedQuery)) score += 40;

  for (const keyword of normalizedKeywords) {
    if (keyword && normalizedQuery.includes(keyword)) {
      score += 15;
    }
    if (keyword && keyword.includes(normalizedQuery)) {
      score += 20;
    }
  }

  for (const token of normalizedQuery.split(" ")) {
    if (!token) continue;
    if (normalizedCode.includes(token)) score += 18;
    if (normalizedLabel.includes(token)) score += 14;
    if (normalizedDescription.includes(token)) score += 10;
  }

  return score;
}

export function searchAcordDictionary(query: string, limit = 20): SearchResult[] {
  return getAcordDictionaryEntries()
    .map((entry) => ({ entry, score: scoreEntry(entry, query) }))
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || left.entry.acordCode.localeCompare(right.entry.acordCode))
    .slice(0, Math.max(1, Math.floor(limit)));
}

export function lookupAcordByCode(acordCode: string): AcordDictionaryEntry | undefined {
  return getAcordDictionaryEntries().find((entry) => entry.acordCode === acordCode);
}

export function getAllAcordEntries(): AcordDictionaryEntry[] {
  return getAcordDictionaryEntries();
}

export function getAcordDictionaryState(): DictionaryState {
  return { ...state };
}

export function getEmbeddingCache(): Map<string, number[]> {
  return new Map();
}

export async function ensureEmbeddings(): Promise<void> {
  return;
}

export function areEmbeddingsReady(): boolean {
  return false;
}