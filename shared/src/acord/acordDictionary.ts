import type { AcordDictionaryEntry } from "./acordTypes";
import { normalizeAcordEntry } from "./acordMappings";
import { getAcordSchemaEntries } from "./acordSchema";

const seedEntries = getAcordSchemaEntries();

export const acordDictionary: AcordDictionaryEntry[] = seedEntries
  .map((entry) => normalizeAcordEntry(entry));

export function getAcordDictionaryEntries(): AcordDictionaryEntry[] {
  return acordDictionary;
}