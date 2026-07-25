import type { AcordDictionaryEntry } from "./acordTypes.ts";
import { normalizeAcordEntry } from "./acordMappings.ts";
import { getAcordSchemaEntries } from "./acordSchema.ts";

const seedEntries = getAcordSchemaEntries();

export const acordDictionary: AcordDictionaryEntry[] = seedEntries
  .map((entry) => normalizeAcordEntry(entry));

export function getAcordDictionaryEntries(): AcordDictionaryEntry[] {
  return acordDictionary;
}