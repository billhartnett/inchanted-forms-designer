import { useMemo } from "react";
import { resolveOntologySemanticMetadata, type OntologySemanticMetadata } from "../../../../shared/src/acord/acord-gating";
import { useDesignerStore, type Field } from "../../state/designerStore";
import { useSelectedField } from "../../state/fieldStore";

type ClusterBucket = {
  label: string;
  fields: FieldInsight[];
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

function sortByConfidence(left: FieldInsight, right: FieldInsight) {
  return right.confidence - left.confidence || left.label.localeCompare(right.label);
}

export function DesignerLayersPanel() {
  const searchQuery = useDesignerStore((s) => s.fieldSearchQuery);
  const setFieldSearchQuery = useDesignerStore((s) => s.setFieldSearchQuery);
  const pdfPages = useDesignerStore((s) => s.pdfPages);
  const currentPdfPage = useDesignerStore((s) => s.currentPdfPage);
  const setCurrentPdfPage = useDesignerStore((s) => s.setCurrentPdfPage);
  const fields = useDesignerStore((s) => s.fields);
  const selectedIds = useDesignerStore((s) => s.selectedIds);
  const selectField = useDesignerStore((s) => s.selectField);
  const selectedField = useSelectedField();

  const fieldInsights = useMemo(() => {
    return fields.map((field) => {
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
  }, [fields]);

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
    const lookups = [
      { key: "Locations", label: "locations" },
      { key: "Contact Information", label: "individuals" },
      { key: "Prior Insurance", label: "prior carriers" },
      { key: "Loss History", label: "losses" },
      { key: "Coverage Questions", label: "coverage items" },
    ];

    return lookups
      .map(({ key, label }) => {
        const bucket = clusterBuckets.find((item) => item.label === key);
        if (!bucket || bucket.fields.length === 0) return null;
        const examples = bucket.fields.slice(0, 3).map((item) => item.label).join(" • ");
        return {
          label,
          count: bucket.fields.length,
          examples,
        };
      })
      .filter((item): item is { label: string; count: number; examples: string } => Boolean(item));
  }, [clusterBuckets]);

  const focusField = (fieldId: string) => {
    const field = fields.find((item) => item.id === fieldId);
    if (!field) return;

    if (typeof field.pageIndex === "number" && Number.isFinite(field.pageIndex) && field.pageIndex >= 0 && pdfPages.length > 0) {
      setCurrentPdfPage(Math.floor(field.pageIndex));
    }

    selectField(fieldId, false);
  };

  const filterToCluster = (clusterLabel: string, fieldId: string) => {
    setFieldSearchQuery(clusterLabel);
    focusField(fieldId);
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
          onChange={(event) => setSearchQuery(event.target.value)}
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
              onClick={() => filterToCluster(bucket.label, bucket.fields[0].field.id)}
              style={{
                textAlign: "left",
                borderRadius: 10,
                border: "1px solid #dbe4ee",
                background: "#ffffff",
                padding: "0.7rem 0.75rem",
                display: "grid",
                gap: 4,
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
              style={{
                border: "1px solid #d9e2ec",
                borderRadius: 10,
                background: "#ffffff",
                padding: 10,
                display: "grid",
                gap: 6,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontWeight: 700, color: "#0f172a" }}>{bucket.label}</span>
                <span style={{ fontSize: 12, color: "#64748b" }}>{bucket.fields.length} fields</span>
              </div>
              <div style={{ fontSize: 12, color: "#334155" }}>
                Pages: {Array.from(new Set(bucket.fields.map((item) => item.pageIndex ?? 0))).filter((page) => page >= 0).length || 0}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {bucket.fields.slice(0, 4).map((item) => (
                  <button
                    key={`suggested-${bucket.label}-${item.field.id}`}
                    type="button"
                    onClick={() => filterToCluster(bucket.label, item.field.id)}
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
              <div
                key={item.label}
                style={{
                  border: "1px solid #dbe4ee",
                  borderRadius: 10,
                  background: "#ffffff",
                  padding: 10,
                  display: "grid",
                  gap: 4,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontWeight: 700, color: "#0f172a" }}>{item.label}</span>
                  <span style={{ fontSize: 12, color: "#334155", fontWeight: 700 }}>{item.count}</span>
                </div>
                <div style={{ fontSize: 12, color: "#64748b" }}>{item.examples}</div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section
        style={{
          border: "1px solid #d9e2ec",
          borderRadius: 12,
          background: "#f8fafc",
          padding: 12,
          display: "grid",
          gap: 8,
        }}
      >
        <h4 style={{ margin: 0, color: "#0f172a" }}>Pages</h4>
        {pdfPages.length === 0 ? (
          <div style={{ fontSize: 12, color: "#64748b" }}>No PDF pages loaded.</div>
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            {pdfPages.map((_, index) => {
              const isActive = currentPdfPage === index;
              return (
                <button
                  key={`page-${index}`}
                  type="button"
                  onClick={() => setCurrentPdfPage(index)}
                  style={{
                    textAlign: "left",
                    padding: "0.35rem 0.5rem",
                    borderRadius: 8,
                    border: `1px solid ${isActive ? "#93c5fd" : "#cbd5e1"}`,
                    background: isActive ? "#eff6ff" : "#ffffff",
                    color: "#0f172a",
                    fontSize: 12,
                  }}
                >
                  Page {index + 1}
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

export default DesignerLayersPanel;
