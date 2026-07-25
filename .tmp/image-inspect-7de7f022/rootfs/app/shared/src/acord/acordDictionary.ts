import fs from "node:fs";
import path from "node:path";
import type { AcordDictionaryEntry } from "./acordTypes";
import { normalizeAcordEntry } from "./acordMappings";

function loadAcordSeed(): unknown[] {
  const jsonPath = path.resolve(__dirname, "../../../acord.json");
  if (!fs.existsSync(jsonPath)) {
    return [];
  }

  const raw = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as unknown;
  if (Array.isArray(raw)) {
    return raw;
  }

  if (
    raw &&
    typeof raw === "object" &&
    Array.isArray((raw as { entries?: unknown[] }).entries)
  ) {
    return (raw as { entries: unknown[] }).entries;
  }

  return [];
}

const seedEntries = loadAcordSeed();

export const acordDictionary: AcordDictionaryEntry[] = seedEntries
  .filter((entry): entry is Partial<AcordDictionaryEntry> & { acordCode: string } => {
    return Boolean(entry && typeof entry === "object" && "acordCode" in entry);
  })
  .map((entry) => normalizeAcordEntry(entry));

export function getAcordDictionaryEntries(): AcordDictionaryEntry[] {
  return acordDictionary;
}