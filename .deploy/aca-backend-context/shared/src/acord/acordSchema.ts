import type { AcordDataType, AcordDictionaryEntry } from "./acordTypes";
import { ACORD_ONTOLOGY_REGISTRY } from "./acord-ontology";

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

export type AcordSchemaDefinition = {
  familyId?: string;
  familyLabel?: string;
  form?: string;
  version?: string;
  clusters?: Record<string, AcordSchemaCluster>;
  entries?: unknown[];
};

function toAcordDataType(value: string): AcordDataType {
  const normalized = String(value || "").trim().toLowerCase();
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

function normalizeText(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_\-.\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0))).sort((a, b) =>
    a.localeCompare(b),
  );
}

function titleCase(value: string): string {
  return String(value || "")
    .split(/[_\-.\s]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function toOntologyCode(className: string, propertyName: string): string {
  const propertyToken = `${propertyName.charAt(0).toUpperCase()}${propertyName.slice(1)}`;
  return `${className}_${propertyToken}`;
}

function evidenceToCode(
  className: string,
  propertyName: string,
  evidence: string,
): string | null {
  const token = String(evidence || "").trim();
  if (!token || token.includes("*")) {
    return null;
  }

  if (token.includes("_") || token.includes(".")) {
    return token;
  }

  if (/^[A-Za-z][A-Za-z0-9]*$/.test(token)) {
    return toOntologyCode(className, propertyName);
  }

  return null;
}

function deriveClusterFromCode(acordCode: string): string {
  if (acordCode.includes("_")) {
    return acordCode.split("_")[0] || "General";
  }
  if (acordCode.includes(".")) {
    return acordCode.split(".")[0] || "General";
  }
  return "General";
}

let cachedSchema: AcordSchemaDefinition | null = null;
let cachedEntries: AcordDictionaryEntry[] | null = null;

function buildEntriesFromOntology(): AcordDictionaryEntry[] {
  const byCode = new Map<string, AcordDictionaryEntry>();

  for (const [className, classEntry] of Object.entries(ACORD_ONTOLOGY_REGISTRY.classes)) {
    for (const property of classEntry.properties) {
      const propertyCodes = unique([
        toOntologyCode(className, property.name),
        ...property.evidence
          .map((evidence) => evidenceToCode(className, property.name, evidence))
          .filter((code): code is string => Boolean(code)),
      ]);

      for (const acordCode of propertyCodes) {
        const normalized = normalizeText(acordCode);
        if (!normalized) {
          continue;
        }

        const keywords = unique([
          className,
          property.name,
          ...property.evidence,
          ...property.description.split(/\s+/g),
        ]);

        byCode.set(normalized, {
          acordCode,
          label: titleCase(property.name),
          description: property.description,
          dataType: toAcordDataType(property.type),
          lob: "all",
          version: "ontology",
          keywords,
        });
      }
    }
  }

  return Array.from(byCode.values()).sort((left, right) =>
    left.acordCode.localeCompare(right.acordCode),
  );
}

function buildSchemaFromEntries(entries: AcordDictionaryEntry[]): AcordSchemaDefinition {
  const clusters = new Map<string, AcordSchemaField[]>();

  for (const entry of entries) {
    const cluster = deriveClusterFromCode(entry.acordCode);
    const current = clusters.get(cluster) || [];
    current.push({
      id: entry.acordCode,
      elabel: entry.acordCode,
      label: entry.label,
      description: entry.description,
      type: String(entry.dataType || "string"),
      required: false,
    });
    clusters.set(cluster, current);
  }

  return {
    familyId: "acord-ontology",
    familyLabel: "ACORD Ontology",
    form: "ACORD_125",
    version: "1.0.0-ontology",
    clusters: Object.fromEntries(
      Array.from(clusters.entries())
        .sort((left, right) => left[0].localeCompare(right[0]))
        .map(([clusterName, fields]) => [
          clusterName,
          {
            description: `${clusterName} ontology cluster`,
            fields: fields.sort((left, right) =>
              String(left.elabel || left.id || "").localeCompare(
                String(right.elabel || right.id || ""),
              ),
            ),
          },
        ]),
    ),
  };
}

export function getAcordSchemaEntries(): AcordDictionaryEntry[] {
  if (!cachedEntries) {
    cachedEntries = buildEntriesFromOntology();
  }

  return cachedEntries.map((entry) => ({
    ...entry,
    keywords: [...entry.keywords],
  }));
}

export function getAcordSchemaDefinition(): AcordSchemaDefinition | null {
  if (!cachedSchema) {
    cachedSchema = buildSchemaFromEntries(getAcordSchemaEntries());
  }

  return {
    ...cachedSchema,
    clusters: Object.fromEntries(
      Object.entries(cachedSchema.clusters || {}).map(([clusterName, cluster]) => [
        clusterName,
        {
          ...cluster,
          fields: (cluster.fields || []).map((field) => ({ ...field })),
        },
      ]),
    ),
  };
}
