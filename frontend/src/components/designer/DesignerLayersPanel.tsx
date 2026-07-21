import { useMemo, useState } from "react";
import { useDesignerStore, type Field } from "../../state/designerStore";
import { useSelectedField } from "../../state/fieldStore";
import { useMappingStore } from "../../state/mappingStore";

type OntologySemanticMetadata = {
  label?: string;
  family?: string;
  cluster?: string;
  aliases?: string[];
};

function resolveOntologySemanticMetadata(_acordCode: string): OntologySemanticMetadata | null {
  return null;
}

type ClusterBucket = {
  label: string;
  fields: FieldInsight[];
};

type MultiInstanceObject = {
  key: string;
  label: string;
  clusterLabel: string;
  pageIndex: number | null;
  fieldIds: string[];
  examples: string;
};

type FieldInsight = {
  field: Field;
  confidence: number;
  rawText: string;
  searchText: string;
  cluster: string;
  family: string;
  ontology: OntologySemanticMetadata | null;
  aliasText: string;
  label: string;
  pageIndex: number | null;
};

const CLUSTER_ORDER = [
  "Contact Information",
  "Business Details",
  "Locations",
  "Operations",
  "Coverage Questions",
  "Loss History",
  "Prior Insurance",
  "Additional Interests",
  "Miscellaneous",
];

const CLUSTER_KEYWORDS: Array<{ label: string; keywords: string[] }> = [
  {
    label: "Contact Information",
    keywords: ["contact", "name", "insured", "producer", "broker", "agent", "phone", "email", "address"],
  },
  {
    label: "Business Details",
    keywords: ["business", "company", "entity", "legal", "industry", "fein", "tax", "years in business", "corporation"],
  },
  {
    label: "Locations",
    keywords: ["location", "premises", "site", "address", "office", "branch", "facility", "building"],
  },
  {
    label: "Operations",
    keywords: ["operations", "operation", "services", "products", "work", "exposure", "hazard", "description"],
  },
  {
    label: "Coverage Questions",
    keywords: ["coverage", "limit", "deductible", "policy", "quote", "premium", "endorsement", "requested"],
  },
  {
    label: "Loss History",
    keywords: ["loss", "claim", "accident", "incident", "date of loss", "history", "settlement"],
  },
  {
    label: "Prior Insurance",
    keywords: ["prior insurance", "previous insurance", "carrier", "renewal", "expiration", "policy number"],
  },
  {
    label: "Additional Interests",
    keywords: ["additional interest", "mortgagee", "lender", "loss payee", "certificate", "holder"],
  },
];

function formatConfidence(score: number): string {
  return `${Math.round(Math.max(0, Math.min(1, score)) * 100)}%`;
}

function getConfidenceScore(field: Field) {
  const score = field.metadata?.confidenceScore;
  if (typeof score !== "number" || !Number.isFinite(score)) {
    return 0;
  }

  return Math.max(0, Math.min(1, score));
}

function getFieldRawText(field: Field): string {
  if (field.type === "text") return field.text || "";
  if (field.type === "checkbox" || field.type === "radio") return field.label || "";
  if (field.type === "dropdown") return field.selectedOption || field.placeholder || "";
  if (field.type === "date") return field.value || field.placeholder || "";
  if (field.type === "numeric") return field.value?.toString() || field.placeholder || "";
  if (field.type === "signature") return field.placeholder || "Sign here";
  return "";
}

function formatBoundingBox(field: Field): string {
  return `x:${field.x.toFixed(1)}, y:${field.y.toFixed(1)}, w:${field.width.toFixed(1)}, h:${field.height.toFixed(1)}`;
}

function inferClusterFromText(searchText: string): string {
  const haystack = searchText.toLowerCase();
  for (const bucket of CLUSTER_KEYWORDS) {
    if (bucket.keywords.some((keyword) => haystack.includes(keyword))) {
      return bucket.label;
    }
  }

  return "Miscellaneous";
}

function getFieldLabel(field: Field, ontology: OntologySemanticMetadata | null): string {
  const text = field.metadata?.semanticLabel?.trim() || field.metadata?.acordLabel?.trim() || field.metadata?.acordCode?.trim() || getFieldRawText(field).trim();
  if (text) return text;
  if (ontology?.label?.trim()) return ontology.label;
  return `Field ${field.id.slice(0, 6)}`;
}

function renderConfidenceBadge(score: number) {
  const normalized = Math.max(0, Math.min(1, score));
  const label = normalized >= 0.8 ? "High" : normalized >= 0.55 ? "Medium" : "Low";
  const color = normalized >= 0.8 ? "#166534" : normalized >= 0.55 ? "#92400e" : "#991b1b";
  const background = normalized >= 0.8 ? "#dcfce7" : normalized >= 0.55 ? "#fef3c7" : "#fee2e2";

  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        color,
        background,
        borderRadius: 999,
        padding: "0.15rem 0.4rem",
        border: `1px solid ${color}22`,
      }}
    >
      {label} {Math.round(normalized * 100)}%
    </span>
  );
}

function buildActionFilter(kind: "cluster" | "grouping" | "instance", label: string, fieldIds: string[]): string {
  const safeLabel = label.replace(/\s+/g, " ").trim();
  const ids = fieldIds.join(",");
  return `${kind}:${safeLabel} @ids:${ids}`;
}

function sortByConfidence(left: FieldInsight, right: FieldInsight) {
  return right.confidence - left.confidence || left.label.localeCompare(right.label);
}

export function DesignerLayersPanel() {
  const [dragTarget, setDragTarget] = useState<string | null>(null);
  const searchQuery = useDesignerStore((s) => s.fieldSearchQuery);
  const setFieldSearchQuery = useDesignerStore((s) => s.setFieldSearchQuery);
  const pdfPages = useDesignerStore((s) => s.pdfPages);
  const setCurrentPdfPage = useDesignerStore((s) => s.setCurrentPdfPage);
  const fields = useDesignerStore((s) => s.fields);
  const ontologyDocument = useMappingStore((state) => state.ontologyDocument);
  const ontologyFieldIds = useMemo(() => {
    const ontologyFields = Array.isArray(ontologyDocument?.fields)
      ? ontologyDocument.fields
      : [];

    return new Set(
      ontologyFields
        .map((field: any) => String(field?.blockId || field?.id || "").trim())
        .filter((value) => value.length > 0),
    );
  }, [ontologyDocument]);
  const selectedIds = useDesignerStore((s) => s.selectedIds);
  const selectField = useDesignerStore((s) => s.selectField);
  const selectFields = useDesignerStore((s) => s.selectFields);
  const updateField = useDesignerStore((s) => s.updateField);
  const selectedField = useSelectedField();

  const fieldInsights = useMemo(() => {
    return fields
      .filter((field) => {
        if (ontologyFieldIds.size > 0 && !ontologyFieldIds.has(field.id)) {
          return false;
        }
        return true;
      })
      .map((field) => {
        const ontologyCode = field.metadata?.acordCode?.trim() || "";
        const ontology = ontologyCode ? resolveOntologySemanticMetadata(ontologyCode) : null;
        const rawText = getFieldRawText(field).trim();
        const semanticLabel = field.metadata?.semanticLabel?.trim() || "";
        const acordLabel = field.metadata?.acordLabel?.trim() || "";
        const aliasText = ontology?.aliases?.join(" ") || "";
        const family = ontology?.family || "unassigned";
        const searchText = [
          rawText,
          semanticLabel,
          acordLabel,
          field.metadata?.categoryMode || "",
          ontology?.label || "",
          ontology?.cluster || "",
          family,
          aliasText,
          ontologyCode,
          field.type,
        ]
          .join(" ")
          .toLowerCase();

        const cluster = inferClusterFromText(
          [rawText, semanticLabel, acordLabel, ontology?.cluster || "", ontology?.label || "", aliasText].join(" "),
        );

        return {
          field,
          confidence: getConfidenceScore(field),
          rawText,
          searchText,
          cluster,
          family,
          ontology,
          aliasText,
          label: getFieldLabel(field, ontology),
          pageIndex: typeof field.pageIndex === "number" && Number.isFinite(field.pageIndex) ? field.pageIndex : null,
        } satisfies FieldInsight;
      });
  }, [fields, ontologyFieldIds]);

  const selectedInsight = useMemo(() => {
    if (!selectedField) return null;
    return fieldInsights.find((item) => item.field.id === selectedField.id) || null;
  }, [fieldInsights, selectedField]);

  const filteredInsights = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return fieldInsights;
    return fieldInsights.filter((item) => item.searchText.includes(query));
  }, [fieldInsights, searchQuery]);

  const clusterBuckets = useMemo(() => {
    const buckets = new Map<string, FieldInsight[]>();
    for (const insight of fieldInsights) {
      const bucket = buckets.get(insight.cluster) || [];
      bucket.push(insight);
      buckets.set(insight.cluster, bucket);
    }

    const ordered = Array.from(buckets.entries()).map(([label, items]) => ({
      label,
      fields: [...items].sort(sortByConfidence),
    }));

    ordered.sort((left, right) => {
      const leftIndex = CLUSTER_ORDER.indexOf(left.label);
      const rightIndex = CLUSTER_ORDER.indexOf(right.label);
      if (leftIndex !== rightIndex) {
        return (leftIndex === -1 ? CLUSTER_ORDER.length : leftIndex) - (rightIndex === -1 ? CLUSTER_ORDER.length : rightIndex);
      }
      return right.fields.length - left.fields.length || left.label.localeCompare(right.label);
    });

    return ordered;
  }, [fieldInsights]);

  const suggestedGroupings = useMemo(() => {
    return clusterBuckets
      .filter((bucket) => bucket.fields.length > 0)
      .slice(0, 6);
  }, [clusterBuckets]);

  const multiInstanceObjects = useMemo(() => {
    const objects: MultiInstanceObject[] = [];

    for (const bucket of clusterBuckets) {
      const byPage = new Map<number | null, FieldInsight[]>();
      for (const insight of bucket.fields) {
        const pageKey = insight.pageIndex ?? null;
        const list = byPage.get(pageKey) || [];
        list.push(insight);
        byPage.set(pageKey, list);
      }

      if (byPage.size <= 1) {
        continue;
      }

      for (const [pageIndex, list] of byPage.entries()) {
        const pageLabel = pageIndex !== null ? `Page ${pageIndex + 1}` : "Global";
        objects.push({
          key: `${bucket.label}:${pageIndex ?? "global"}`,
          label: `${bucket.label} - ${pageLabel}`,
          clusterLabel: bucket.label,
          pageIndex,
          fieldIds: list.map((item) => item.field.id),
          examples: list.slice(0, 3).map((item) => item.label).join(" • "),
        });
      }
    }

    return objects
      .sort((left, right) => right.fieldIds.length - left.fieldIds.length || left.label.localeCompare(right.label))
      .slice(0, 10);
  }, [clusterBuckets]);

  const focusField = (fieldId: string) => {
    const field = fields.find((item) => item.id === fieldId);
    if (!field) return;

    if (typeof field.pageIndex === "number" && Number.isFinite(field.pageIndex) && field.pageIndex >= 0 && pdfPages.length > 0) {
      setCurrentPdfPage(Math.floor(field.pageIndex));
    }

    selectField(fieldId, false);
  };

  const filterToCluster = (clusterLabel: string, fieldId: string, fieldIds?: string[]) => {
    const ids = fieldIds && fieldIds.length > 0 ? fieldIds : [fieldId];
    setFieldSearchQuery(buildActionFilter("cluster", clusterLabel, ids));
    if (fieldIds && fieldIds.length > 0) {
      selectFields(fieldIds);
    }
    focusField(fieldId);
  };

  const focusGrouping = (bucket: ClusterBucket) => {
    const ids = bucket.fields.map((item) => item.field.id);
    if (ids.length === 0) return;
    setFieldSearchQuery(buildActionFilter("grouping", bucket.label, ids));
    selectFields(ids);
    focusField(ids[0]);
  };

  const focusInstance = (instance: MultiInstanceObject) => {
    setFieldSearchQuery(buildActionFilter("instance", instance.label, instance.fieldIds));
    selectFields(instance.fieldIds);
    if (instance.pageIndex !== null && instance.pageIndex >= 0 && pdfPages.length > 0) {
      setCurrentPdfPage(instance.pageIndex);
    }
    if (instance.fieldIds.length > 0) {
      focusField(instance.fieldIds[0]);
    }
  };

  const readDraggedIds = (event: React.DragEvent<HTMLElement>): string[] => {
    const payload = event.dataTransfer.getData("application/x-designer-field-ids");
    if (payload) {
      try {
        const parsed = JSON.parse(payload);
        if (Array.isArray(parsed)) {
          const ids = parsed.filter((item): item is string => typeof item === "string");
          if (ids.length > 0) {
            return ids;
          }
        }
      } catch {
        // ignore malformed payload and fall back to selected ids
      }
    }

    if (selectedIds.length > 0) {
      return selectedIds;
    }

    const plain = event.dataTransfer.getData("text/plain").trim();
    if (plain) {
      return [plain];
    }

    return [];
  };

  const onFieldDragStart = (event: React.DragEvent<HTMLElement>, fieldId: string) => {
    const ids = selectedIds.includes(fieldId) ? selectedIds : [fieldId];
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-designer-field-ids", JSON.stringify(ids));
    event.dataTransfer.setData("text/plain", fieldId);
  };

  const onDropToCluster = (event: React.DragEvent<HTMLElement>, bucket: ClusterBucket) => {
    event.preventDefault();
    const ids = readDraggedIds(event);
    setDragTarget(null);
    if (ids.length === 0) return;

    for (let index = 0; index < ids.length; index += 1) {
      const id = ids[index];
      const field = fields.find((candidate) => candidate.id === id);
      if (!field?.metadata) continue;
      updateField(
        id,
        {
          metadata: {
            ...field.metadata,
            categoryMode: `cluster:${bucket.label}`,
          },
        },
        { recordHistory: index === 0 },
      );
    }

    filterToCluster(bucket.label, ids[0], ids);
  };

  const onDropToInstance = (event: React.DragEvent<HTMLElement>, instance: MultiInstanceObject) => {
    event.preventDefault();
    const ids = readDraggedIds(event);
    setDragTarget(null);
    if (ids.length === 0) return;

    for (let index = 0; index < ids.length; index += 1) {
      const id = ids[index];
      const field = fields.find((candidate) => candidate.id === id);
      if (!field) continue;

      const patch: Partial<Field> = {
        pageIndex: instance.pageIndex,
      };

      if (field.metadata) {
        patch.metadata = {
          ...field.metadata,
          categoryMode: `instance:${instance.key}`,
        };
      }

      updateField(id, patch, { recordHistory: index === 0 });
    }

    focusInstance(instance);
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <section
        style={{
          border: "1px solid #d9e2ec",
          borderRadius: 12,
          background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
          padding: 12,
          display: "grid",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
          <div>
            <h4 style={{ margin: 0, color: "#0f172a" }}>Field Search</h4>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
              Search raw text, semantic label, ACORD label, cluster, family, or aliases.
            </div>
          </div>
          <div style={{ fontSize: 12, color: "#334155", fontWeight: 600 }}>
            {filteredInsights.length} / {fieldInsights.length}
          </div>
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(event) => setFieldSearchQuery(event.target.value)}
          placeholder="Search fields, clusters, families, aliases, or ACORD labels"
          style={{
            width: "100%",
            borderRadius: 10,
            border: "1px solid #cbd5e1",
            padding: "0.65rem 0.75rem",
            fontSize: 13,
          }}
        />
        {selectedInsight ? (
          <div
            style={{
              border: "1px solid #bfdbfe",
              borderRadius: 10,
              padding: 10,
              background: "#eff6ff",
              display: "grid",
              gap: 5,
              fontSize: 12,
              color: "#1e3a8a",
            }}
          >
            <div style={{ fontWeight: 700, color: "#0f172a" }}>Selected Field</div>
            <div>{selectedInsight.label}</div>
            <div>
              Cluster {selectedInsight.cluster} • Family {selectedInsight.family} • Confidence {formatConfidence(selectedInsight.confidence)}
            </div>
            <div>ACORD label: {selectedInsight.ontology?.label || selectedField?.metadata?.acordLabel || "-"}</div>
          </div>
        ) : null}
      </section>

      <section
        style={{
          border: "1px solid #d9e2ec",
          borderRadius: 12,
          background: "#f8fafc",
          padding: 12,
          display: "grid",
          gap: 10,
        }}
      >
        <div>
          <h4 style={{ margin: 0, color: "#0f172a" }}>Semantic Clusters</h4>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
            Replace ACORD blocks with semantic workspace clusters.
          </div>
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          {clusterBuckets.map((bucket) => (
            <button
              key={bucket.label}
              type="button"
              onClick={() => filterToCluster(bucket.label, bucket.fields[0].field.id, bucket.fields.map((item) => item.field.id))}
              onDragOver={(event) => {
                event.preventDefault();
                setDragTarget(`cluster:${bucket.label}`);
              }}
              onDragLeave={() => setDragTarget(null)}
              onDrop={(event) => onDropToCluster(event, bucket)}
              style={{
                textAlign: "left",
                borderRadius: 10,
                border: dragTarget === `cluster:${bucket.label}` ? "1px solid #0284c7" : "1px solid #dbe4ee",
                background: dragTarget === `cluster:${bucket.label}` ? "#e0f2fe" : "#ffffff",
                padding: "0.7rem 0.75rem",
                display: "grid",
                gap: 4,
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontWeight: 700, color: "#0f172a" }}>{bucket.label}</span>
                <span style={{ fontSize: 12, color: "#334155", fontWeight: 700 }}>{bucket.fields.length}</span>
              </div>
              <div style={{ fontSize: 12, color: "#64748b" }}>
                {bucket.fields.slice(0, 3).map((item) => item.label).join(" • ") || "No fields"}
              </div>
            </button>
          ))}
        </div>
      </section>

      <section
        style={{
          border: "1px solid #d9e2ec",
          borderRadius: 12,
          background: "#f8fafc",
          padding: 12,
          display: "grid",
          gap: 10,
        }}
      >
        <div>
          <h4 style={{ margin: 0, color: "#0f172a" }}>Suggested Groupings</h4>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
            Ontology-inferred buckets that can be grouped together across pages.
          </div>
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          {suggestedGroupings.map((bucket) => (
            <div
              key={`suggested-${bucket.label}`}
              onClick={() => focusGrouping(bucket)}
              style={{
                border: "1px solid #d9e2ec",
                borderRadius: 10,
                background: "#ffffff",
                padding: 10,
                display: "grid",
                gap: 6,
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontWeight: 700, color: "#0f172a" }}>{bucket.label}</span>
                <span style={{ fontSize: 12, color: "#64748b" }}>{bucket.fields.length} fields</span>
              </div>
              <button
                type="button"
                onClick={() => focusGrouping(bucket)}
                style={{
                  justifySelf: "start",
                  border: "1px solid #cbd5e1",
                  borderRadius: 999,
                  background: "#ffffff",
                  color: "#334155",
                  padding: "0.2rem 0.55rem",
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Select all in grouping
              </button>
              <div style={{ fontSize: 12, color: "#334155" }}>
                Pages: {Array.from(new Set(bucket.fields.map((item) => item.pageIndex ?? 0))).filter((page) => page >= 0).length || 0}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {bucket.fields.slice(0, 4).map((item) => (
                  <button
                    key={`suggested-${bucket.label}-${item.field.id}`}
                    type="button"
                    onClick={() => filterToCluster(bucket.label, item.field.id)}
                    draggable
                    onDragStart={(event) => onFieldDragStart(event, item.field.id)}
                    style={{
                      border: "1px solid #cbd5e1",
                      borderRadius: 999,
                      background: item.field.id === selectedField?.id ? "#dbeafe" : "#f8fafc",
                      color: item.field.id === selectedField?.id ? "#1e3a8a" : "#334155",
                      padding: "0.25rem 0.6rem",
                      fontSize: 11,
                      cursor: "pointer",
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {multiInstanceObjects.length > 0 ? (
        <section
          style={{
            border: "1px solid #d9e2ec",
            borderRadius: 12,
            background: "#f8fafc",
            padding: 12,
            display: "grid",
            gap: 10,
          }}
        >
          <div>
            <h4 style={{ margin: 0, color: "#0f172a" }}>Multi-Instance Objects</h4>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
              Auto-detected repeating structures from the semantic clusters.
            </div>
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {multiInstanceObjects.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => focusInstance(item)}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragTarget(`instance:${item.key}`);
                }}
                onDragLeave={() => setDragTarget(null)}
                onDrop={(event) => onDropToInstance(event, item)}
                style={{
                  border:
                    dragTarget === `instance:${item.key}`
                      ? "1px solid #0f766e"
                      : "1px solid #dbe4ee",
                  borderRadius: 10,
                  background:
                    dragTarget === `instance:${item.key}` ? "#ccfbf1" : "#ffffff",
                  padding: 10,
                  display: "grid",
                  gap: 4,
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontWeight: 700, color: "#0f172a" }}>{item.label}</span>
                  <span style={{ fontSize: 12, color: "#334155", fontWeight: 700 }}>{item.fieldIds.length}</span>
                </div>
                <div style={{ fontSize: 12, color: "#64748b" }}>{item.examples}</div>
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

export default DesignerLayersPanel;
