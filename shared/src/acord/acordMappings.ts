import type {
  AcordDataType,
  AcordDictionaryEntry,
  AcordLabelCandidate,
} from "./acordTypes";

export type AcordMappings = Record<string, AcordLabelCandidate>;

function toAcordDataType(value: unknown): AcordDataType {
  if (typeof value !== "string") {
    return "unknown";
  }

  const normalized = value.trim().toLowerCase();
  if (
    normalized === "string" ||
    normalized === "number" ||
    normalized === "boolean" ||
    normalized === "date" ||
    normalized === "datetime" ||
    normalized === "currency"
  ) {
    return normalized;
  }

  return "unknown";
}

export function normalizeAcordEntry(
  entry: Partial<AcordDictionaryEntry> & Pick<AcordDictionaryEntry, "acordCode">,
): AcordDictionaryEntry {
  return {
    acordCode: entry.acordCode,
    label: entry.label ?? entry.acordCode,
    description: entry.description ?? entry.label ?? entry.acordCode,
    dataType: toAcordDataType(entry.dataType),
    lob: entry.lob ?? "all",
    version: entry.version ?? "current",
    keywords: Array.isArray(entry.keywords)
      ? entry.keywords.filter((keyword): keyword is string => typeof keyword === "string")
      : [],
  };
}