import fs from "node:fs";
import path from "node:path";
import type { AcordDataType, AcordDictionaryEntry } from "./acordTypes";

type AcordSchemaField = {
  id?: string;
  label?: string;
  elabel?: string;
  type?: string;
  required?: boolean;
  description?: string;
};

type AcordSchemaCluster = {
  description?: string;
  fields?: AcordSchemaField[];
};

type AcordSchemaDefinition = {
  familyId?: string;
  familyLabel?: string;
  form?: string;
  version?: string;
  clusters?: Record<string, AcordSchemaCluster>;
  entries?: unknown[];
};

const SCHEMA_PATH = path.resolve(__dirname, "../../../acord.json");

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitTokens(value: string): string[] {
  return normalizeText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}

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

function loadRawSchema(): AcordSchemaDefinition | AcordDictionaryEntry[] | null {
  if (!fs.existsSync(SCHEMA_PATH)) {
    return null;
  }

  const raw = JSON.parse(fs.readFileSync(SCHEMA_PATH, "utf8")) as unknown;
  if (Array.isArray(raw)) {
    return raw as AcordDictionaryEntry[];
  }

  if (raw && typeof raw === "object") {
    return raw as AcordSchemaDefinition;
  }

  return null;
}

function schemaFieldToEntry(
  clusterName: string,
  cluster: AcordSchemaCluster,
  field: AcordSchemaField,
  version: string,
): AcordDictionaryEntry | null {
  const acordCode = field.elabel?.trim() || field.id?.trim() || "";
  if (!acordCode) {
    return null;
  }

  const label = field.label?.trim() || acordCode;
  const description = field.description?.trim() || cluster.description?.trim() || label;
  const keywords = uniqueSorted(
    [clusterName, cluster.description || "", label, acordCode, description]
      .flatMap((value) => splitTokens(value))
      .filter((token) => token.length > 2),
  );

  return {
    acordCode,
    label,
    description,
    dataType: toAcordDataType(field.type),
    lob: "all",
    version,
    keywords,
  };
}

export function getAcordSchemaDefinition(): AcordSchemaDefinition | null {
  const schema = loadRawSchema();
  if (!schema || Array.isArray(schema)) {
    return null;
  }

  return schema;
}

export function getAcordSchemaEntries(): AcordDictionaryEntry[] {
  const schema = loadRawSchema();
  if (!schema) {
    return [];
  }

  if (Array.isArray(schema)) {
    return schema
      .filter((entry) => Boolean(entry && typeof entry === "object" && "acordCode" in entry))
      .map((entry) => {
        const typedEntry = entry as Partial<AcordDictionaryEntry> & { acordCode: string };
        return {
          acordCode: typedEntry.acordCode,
          label: typedEntry.label || typedEntry.acordCode,
          description: typedEntry.description || typedEntry.label || typedEntry.acordCode,
          dataType: toAcordDataType(typedEntry.dataType),
          lob: typedEntry.lob || "all",
          version: typedEntry.version || "current",
          keywords: Array.isArray(typedEntry.keywords)
            ? typedEntry.keywords.filter((keyword): keyword is string => typeof keyword === "string")
            : [],
        };
      })
      .sort((left, right) => left.acordCode.localeCompare(right.acordCode));
  }

  const version = schema.version || "1.0.0";
  const entries = Object.entries(schema.clusters || {}).flatMap(([clusterName, cluster]) => {
    const fields = Array.isArray(cluster.fields) ? cluster.fields : [];
    return fields
      .map((field) => schemaFieldToEntry(clusterName, cluster, field, version))
      .filter((entry): entry is AcordDictionaryEntry => Boolean(entry));
  });

  return entries.sort((left, right) => left.acordCode.localeCompare(right.acordCode));
}