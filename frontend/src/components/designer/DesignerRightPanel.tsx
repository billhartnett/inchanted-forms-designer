import { useEffect, useMemo, useState } from "react";
import { runAcordSearch } from "../../api/wave9Integration";
import { resolveOntologySemanticMetadata, type OntologySemanticMetadata } from "../../../../shared/src/acord/acord-gating";
import { MappingConfidence } from "../../mapping/MappingConfidence";
import { PropertiesPanel } from "../../designer/properties/PropertiesPanel";
import { useDesignerStore, type Field } from "../../state/designerStore";
import { useMappingStore, useSelectedFieldMapping } from "../../state/mappingStore";
import { useSelectedField } from "../../state/fieldStore";

type AcordSearchResult = {
  acordCode: string;
  label: string;
  description?: string;
  dataType?: string;
  lob?: string;
  version?: string;
  keywords?: string[];
  relevanceScore?: number;
};

type FieldMatch = {
  field: Field;
  label: string;
  cluster: string;
  family: string;
  confidence: number;
  rawText: string;
  ontology: OntologySemanticMetadata | null;
  searchText: string;
};

function getFieldRawText(field: Field): string {
  if (field.type === "text") return field.text || "";
  if (field.type === "checkbox" || field.type === "radio") return field.label || "";
  if (field.type === "dropdown") return field.selectedOption || field.placeholder || "";
  if (field.type === "date") return field.value || field.placeholder || "";
  if (field.type === "numeric") return field.value?.toString() || field.placeholder || "";
  if (field.type === "signature") return field.placeholder || "Sign here";
  return "";
}

function getFieldLabel(field: Field, ontology: OntologySemanticMetadata | null): string {
  const text =
    field.metadata?.semanticLabel?.trim() ||
    field.metadata?.acordLabel?.trim() ||
    field.metadata?.acordCode?.trim() ||
    getFieldRawText(field).trim();

  if (text) return text;
  if (ontology?.label?.trim()) return ontology.label;
  return `Field ${field.id.slice(0, 6)}`;
}

function getConfidenceScore(field: Field): number {
  const score = field.metadata?.confidenceScore;
  if (typeof score !== "number" || !Number.isFinite(score)) {
    return 0;
  }

  return Math.max(0, Math.min(1, score));
}

function inferCluster(searchText: string): string {
  const haystack = searchText.toLowerCase();
  const clusterKeywords: Array<{ label: string; keywords: string[] }> = [
    { label: "Contact Information", keywords: ["contact", "name", "insured", "producer", "broker", "agent", "phone", "email", "address"] },
    { label: "Business Details", keywords: ["business", "company", "entity", "legal", "industry", "fein", "tax", "years in business", "corporation"] },
    { label: "Locations", keywords: ["location", "premises", "site", "address", "office", "branch", "facility", "building"] },
    { label: "Operations", keywords: ["operations", "operation", "services", "products", "work", "exposure", "hazard", "description"] },
    { label: "Coverage Questions", keywords: ["coverage", "limit", "deductible", "policy", "quote", "premium", "endorsement", "requested"] },
    { label: "Loss History", keywords: ["loss", "claim", "accident", "incident", "date of loss", "history", "settlement"] },
    { label: "Prior Insurance", keywords: ["prior insurance", "previous insurance", "carrier", "renewal", "expiration", "policy number"] },
    { label: "Additional Interests", keywords: ["additional interest", "mortgagee", "lender", "loss payee", "certificate", "holder"] },
  ];

  for (const bucket of clusterKeywords) {
    if (bucket.keywords.some((keyword) => haystack.includes(keyword))) {
      return bucket.label;
    }
  }

  return "Miscellaneous";
}

function formatPercent(score: number): string {
  return `${Math.round(Math.max(0, Math.min(1, score)) * 100)}%`;
}

export function DesignerRightPanel() {
  const [acordQuery, setAcordQuery] = useState("");
  const [acordResults, setAcordResults] = useState<AcordSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const selectedField = useSelectedField();
  const selectedMapping = useSelectedFieldMapping();
  const fields = useDesignerStore((state) => state.fields);
  const fieldSearchQuery = useDesignerStore((state) => state.fieldSearchQuery);
  const updateField = useDesignerStore((state) => state.updateField);
  const addField = useDesignerStore((state) => state.addField);
  const moveFieldLayer = useDesignerStore((state) => state.moveFieldLayer);
  const setSnapToGrid = useDesignerStore((state) => state.setSnapToGrid);
  const snapToGrid = useDesignerStore((state) => state.snapToGrid);

  const chooseCandidate = useMappingStore((state) => state.chooseCandidate);
  const unlinkFieldAssociation = useMappingStore((state) => state.unlinkFieldAssociation);
  const ontologyGating = useMappingStore((state) => state.ontologyGating);
  const routedClusters = useMappingStore((state) => state.routedClusters);
  const ontologyDocumentApplyStats = useMappingStore((state) => state.ontologyDocumentApplyStats);
  const ontologyBuilderDiagnostics = useMappingStore((state) => state.ontologyBuilderDiagnostics);
  const documentSemanticProfile = useMappingStore((state) => state.documentSemanticProfile);

  const selectedFieldMetadata = selectedField?.metadata;
  const selectedCode = String(selectedMapping?.acordCode || selectedFieldMetadata?.acordCode || "").trim();
  const ontologyMetadata = selectedCode ? resolveOntologySemanticMetadata(selectedCode) : null;

  const rankedCandidates = useMemo(() => {
    return [...(selectedMapping?.candidates || [])]
      .sort((left, right) => right.confidenceScore - left.confidenceScore || left.acordCode.localeCompare(right.acordCode))
      .slice(0, 5);
  }, [selectedMapping?.candidates]);

  const candidateDistribution = useMemo(() => {
    return rankedCandidates.reduce(
      (totals, candidate) => {
        if (candidate.confidenceScore >= 0.8) {
          totals.high += 1;
        } else if (candidate.confidenceScore >= 0.55) {
          totals.medium += 1;
        } else {
          totals.low += 1;
        }

        return totals;
      },
      { high: 0, medium: 0, low: 0 },
    );
  }, [rankedCandidates]);

  const fieldInsights = useMemo(() => {
    return fields.map((field) => {
      const ontologyCode = field.metadata?.acordCode?.trim() || "";
      const ontology = ontologyCode ? resolveOntologySemanticMetadata(ontologyCode) : null;
      const rawText = getFieldRawText(field).trim();
      const semanticLabel = field.metadata?.semanticLabel?.trim() || "";
      const acordLabel = field.metadata?.acordLabel?.trim() || "";
      const family = ontology?.family || "unassigned";
      const aliasText = ontology?.aliases?.join(" ") || "";
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
      ].join(" ").toLowerCase();

      return {
        field,
        label: getFieldLabel(field, ontology),
        cluster: inferCluster([rawText, semanticLabel, acordLabel, ontology?.cluster || "", ontology?.label || "", aliasText].join(" ")),
        family,
        confidence: getConfidenceScore(field),
        rawText,
        ontology,
        searchText,
      } satisfies FieldMatch;
    });
  }, [fields]);

  const similarFields = useMemo(() => {
    const query = fieldSearchQuery.trim().toLowerCase();
    const selectedId = selectedField?.id;
    const sorted = [...fieldInsights]
      .filter((item) => item.field.id !== selectedId)
      .sort((left, right) => right.confidence - left.confidence || left.label.localeCompare(right.label));

    if (query) {
      return sorted.filter((item) => item.searchText.includes(query)).slice(0, 25);
    }

    if (selectedField) {
      const selectedInsight = fieldInsights.find((item) => item.field.id === selectedField.id);
      if (selectedInsight) {
        const scored = sorted.map((item) => {
          let score = item.confidence;
          if (item.cluster === selectedInsight.cluster) score += 0.35;
          if (item.family === selectedInsight.family) score += 0.2;
          if (item.field.type === selectedInsight.field.type) score += 0.15;
          return { item, score };
        });

        return scored
          .sort((left, right) => right.score - left.score || right.item.confidence - left.item.confidence)
          .map((entry) => entry.item)
          .slice(0, 25);
      }
    }

    return sorted.slice(0, 25);
  }, [fieldInsights, fieldSearchQuery, selectedField]);

  const semanticValidity = selectedMapping?.semantic?.confidence?.score ?? selectedFieldMetadata?.confidenceScore ?? 0;
  const rawText = selectedMapping?.record?.mapping?.text || selectedFieldMetadata?.semanticLabel || selectedFieldMetadata?.acordLabel || selectedFieldMetadata?.acordCode || "-";
  const boundingBox = selectedMapping?.record?.mapping?.boundingBox || (selectedField
    ? {
        x: selectedField.x,
        y: selectedField.y,
        width: selectedField.width,
        height: selectedField.height,
      }
    : null);

  const hasSemanticData = Boolean(selectedMapping?.semantic?.semanticCluster || selectedFieldMetadata?.semanticLabel || ontologyMetadata);
  const hasAcordData = Boolean(selectedMapping?.acordCode || selectedFieldMetadata?.acordCode || ontologyMetadata);
  const hasDiagnosticsData = Boolean(
    ontologyGating ||
      documentSemanticProfile ||
      ontologyDocumentApplyStats ||
      ontologyBuilderDiagnostics ||
      Object.keys(routedClusters || {}).length,
  );

  useEffect(() => {
    const query = acordQuery.trim();
    if (!query) {
      setAcordResults([]);
      setIsSearching(false);
      return;
    }

    let active = true;
    setIsSearching(true);

    runAcordSearch(query, 8)
      .then((payload) => {
        if (!active) return;
        const items = Array.isArray((payload as { items?: AcordSearchResult[] }).items)
          ? (payload as { items?: AcordSearchResult[] }).items || []
          : [];
        setAcordResults(items);
      })
      .catch(() => {
        if (!active) return;
        setAcordResults([]);
      })
      .finally(() => {
        if (!active) return;
        setIsSearching(false);
      });

    return () => {
      active = false;
    };
  }, [acordQuery]);

  const selectFieldById = (fieldId: string) => {
    const field = fields.find((item) => item.id === fieldId);
    if (!field) return;
    if (typeof field.pageIndex === "number" && Number.isFinite(field.pageIndex)) {
      useDesignerStore.getState().setCurrentPdfPage(Math.max(0, Math.floor(field.pageIndex)));
    }
    useDesignerStore.getState().selectField(fieldId, false);
  };

  const assignSearchResult = (item: AcordSearchResult) => {
    if (!selectedField) return;

    updateField(selectedField.id, {
      metadata: {
        ...(selectedField.metadata || {}),
        acordCode: item.acordCode,
        acordLabel: item.label,
        acordDescription: item.description || selectedField.metadata?.acordDescription || "",
        confidenceScore: Math.max(selectedField.metadata?.confidenceScore ?? 0, 0.9),
        source: "manual",
      },
    } as Partial<Field>);
  };

  const applyRankedCandidate = (candidate: { acordCode: string }) => {
    const extractionBlockId = selectedMapping?.extractionBlockId || selectedField?.metadata?.extractionBlockId;
    if (!extractionBlockId) return;
    chooseCandidate(extractionBlockId, candidate.acordCode);
  };

  const clearMapping = () => {
    if (!selectedField) return;

    if (selectedField.metadata?.extractionBlockId) {
      unlinkFieldAssociation(selectedField.id, "manual clear");
    }

    updateField(selectedField.id, {
      metadata: {
        ...selectedField.metadata,
        acordCode: "",
        acordLabel: "",
        acordDescription: "",
        confidenceScore: 0,
        extractionBlockId: undefined,
      },
    } as Partial<Field>);
  };

  const duplicateSelectedField = () => {
    if (!selectedField) return;
    const draft = {
      ...selectedField,
      x: selectedField.x + 12,
      y: selectedField.y + 12,
    } as Parameters<typeof addField>[0];

    addField(draft);
  };

  const toggleLocked = () => {
    if (!selectedField) return;
    updateField(selectedField.id, {
      metadata: {
        ...(selectedField.metadata || {}),
        locked: !selectedField.metadata?.locked,
      },
    } as Partial<Field>);
  };

  const toggleHidden = () => {
    if (!selectedField) return;
    updateField(selectedField.id, {
      metadata: {
        ...(selectedField.metadata || {}),
        hidden: !selectedField.metadata?.hidden,
      },
    } as Partial<Field>);
  };

  const toggleSnapToGrid = () => {
    setSnapToGrid(!snapToGrid);
  };

  const moveLayer = (direction: "forward" | "backward") => {
    if (!selectedField) return;
    moveFieldLayer(selectedField.id, direction);
  };

  const mappingHistory = (selectedMapping?.associationHistory || []).slice(0, 5);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", letterSpacing: "0.08em", textTransform: "uppercase" }}>Field Workspace</div>
        <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>ACORD-first mapping with semantic interpretation and diagnostics kept secondary.</div>
      </div>

      <div style={{ display: "grid", gap: 14 }}>
          <section style={{ border: "1px solid #d9e2ec", borderRadius: 12, background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)", padding: 12, display: "grid", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
              <div>
                <h4 style={{ margin: 0, color: "#0f172a" }}>Field Properties</h4>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>Always visible and centered on the current field.</div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" onClick={duplicateSelectedField} disabled={!selectedField}>Duplicate</button>
                <button type="button" onClick={toggleLocked} disabled={!selectedField}>{selectedField?.metadata?.locked ? "Unlock" : "Lock"}</button>
                <button type="button" onClick={toggleHidden} disabled={!selectedField}>{selectedField?.metadata?.hidden ? "Show" : "Hide"}</button>
                <button type="button" onClick={() => moveLayer("backward")} disabled={!selectedField}>Send backward</button>
                <button type="button" onClick={() => moveLayer("forward")} disabled={!selectedField}>Bring forward</button>
                <button type="button" onClick={toggleSnapToGrid}>{snapToGrid ? "Snap to grid: on" : "Snap to grid: off"}</button>
              </div>
            </div>
            <PropertiesPanel selectedField={selectedField} showAcordMappingSection={false} />
          </section>

          <section style={{ border: "1px solid #d9e2ec", borderRadius: 12, background: "#f8fafc", padding: 12, display: "grid", gap: 10 }}>
            <div>
              <h4 style={{ margin: 0, color: "#0f172a" }}>ACORD Mapping</h4>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>Search ACORD labels, assign ranked candidates, and review mapping history.</div>
            </div>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#334155" }}>ACORD label search</span>
              <input type="text" value={acordQuery} onChange={(event) => setAcordQuery(event.target.value)} placeholder="Code, label, keyword, synonym, alias" />
            </label>

            {isSearching ? <div style={{ fontSize: 12, color: "#64748b" }}>Searching ACORD ontology...</div> : null}

            {acordResults.length > 0 ? (
              <div style={{ display: "grid", gap: 8 }}>
                {acordResults.map((item) => (
                  <div key={item.acordCode} style={{ border: "1px solid #dbe4ee", borderRadius: 10, background: "#ffffff", padding: 10, display: "grid", gap: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}>{item.acordCode} • {item.label}</div>
                        <div style={{ fontSize: 11, color: "#64748b" }}>{item.description || item.keywords?.slice(0, 4).join(" • ") || "ACORD ontology match"}</div>
                      </div>
                      <button type="button" onClick={() => assignSearchResult(item)} disabled={!selectedField}>Assign label</button>
                    </div>
                    <div style={{ fontSize: 11, color: "#334155" }}>{item.lob || "all"} • {item.dataType || "string"} • {item.version || "ontology"}</div>
                  </div>
                ))}
              </div>
            ) : acordQuery.trim() ? (
              <div style={{ fontSize: 12, color: "#64748b" }}>No ACORD matches found.</div>
            ) : null}

            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}>Confidence-ranked ACORD suggestions</div>
              {rankedCandidates.length > 0 ? (
                <div style={{ display: "grid", gap: 6 }}>
                  {rankedCandidates.map((candidate) => {
                    const isCurrent = candidate.acordCode === (selectedMapping?.chosenCandidate?.acordCode || selectedFieldMetadata?.acordCode);
                    return (
                      <div key={candidate.acordCode} style={{ border: `1px solid ${isCurrent ? "#93c5fd" : "#dbe4ee"}`, borderRadius: 10, background: isCurrent ? "#eff6ff" : "#ffffff", padding: 10, display: "grid", gap: 6 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}>{candidate.acordCode} • {candidate.label}</div>
                            <div style={{ fontSize: 11, color: "#64748b" }}>{candidate.source}</div>
                          </div>
                          <MappingConfidence confidenceScore={candidate.confidenceScore} thresholds={selectedMapping?.thresholds} />
                        </div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button type="button" onClick={() => applyRankedCandidate(candidate)} disabled={!selectedField}>Assign label</button>
                          <button type="button" onClick={clearMapping} disabled={!selectedField}>Clear mapping</button>
                          {isCurrent ? <span style={{ fontSize: 11, color: "#1d4ed8", fontWeight: 700 }}>Current mapping</span> : null}
                        </div>
                        <div style={{ fontSize: 12, color: "#334155" }}>{candidate.rationale?.summary || candidate.description || "Ranked ACORD suggestion"}</div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: "#64748b" }}>No ACORD suggestions available for this field yet.</div>
              )}
            </div>

            {mappingHistory.length > 0 ? (
              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}>Mapping history</div>
                <div style={{ display: "grid", gap: 4 }}>
                  {mappingHistory.map((entry, index) => (
                    <div key={`${index}-${typeof entry === "string" ? entry : JSON.stringify(entry)}`} style={{ fontSize: 12, color: "#334155", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 8, padding: "0.5rem 0.6rem" }}>
                      {typeof entry === "string" ? entry : entry?.summary || entry?.reason || entry?.note || JSON.stringify(entry)}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </section>

          <section style={{ border: "1px solid #d9e2ec", borderRadius: 12, background: "#f8fafc", padding: 12, display: "grid", gap: 10 }}>
            <div>
              <h4 style={{ margin: 0, color: "#0f172a" }}>Similar Fields</h4>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>Fields related by cluster, family, and confidence for quick bulk mapping.</div>
            </div>
            {fieldSearchQuery.trim() ? (
              <div style={{ fontSize: 12, color: "#334155" }}>Search: {fieldSearchQuery}</div>
            ) : (
              <div style={{ fontSize: 12, color: "#64748b" }}>{selectedField ? "Showing fields similar to current selection." : "Select a field or use left-panel search to focus similar fields."}</div>
            )}
            {similarFields.length > 0 ? (
              <div style={{ display: "grid", gap: 6, maxHeight: 340, overflowY: "auto" }}>
                {similarFields.map((item) => {
                  const isSelected = selectedField?.id === item.field.id;
                  return (
                    <button key={item.field.id} type="button" onClick={() => selectFieldById(item.field.id)} style={{ textAlign: "left", padding: "0.6rem 0.7rem", borderRadius: 10, border: `1px solid ${isSelected ? "#93c5fd" : "#dbe4ee"}`, background: isSelected ? "#eff6ff" : "#ffffff", display: "grid", gap: 4, cursor: "pointer" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}>{item.label}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, color: item.confidence >= 0.8 ? "#166534" : item.confidence >= 0.55 ? "#92400e" : "#991b1b", background: item.confidence >= 0.8 ? "#dcfce7" : item.confidence >= 0.55 ? "#fef3c7" : "#fee2e2", borderRadius: 999, padding: "0.15rem 0.45rem" }}>{formatPercent(item.confidence)}</span>
                      </div>
                      <div style={{ fontSize: 11, color: "#475569" }}>{item.cluster} • {item.family} • {item.field.type}</div>
                      <div style={{ fontSize: 11, color: "#64748b" }}>{item.rawText || item.ontology?.xmlPath || "No raw text captured yet."}</div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "#64748b" }}>No similar fields found for the current context.</div>
            )}
          </section>

          <details style={{ border: "1px solid #d9e2ec", borderRadius: 12, background: "#f8fafc", padding: 12 }}>
            <summary style={{ cursor: "pointer", fontWeight: 700, color: "#0f172a" }}>Semantic Interpretation</summary>
            <div style={{ display: "grid", gap: 6, marginTop: 12, fontSize: 12, color: "#334155" }}>
              <div>Cluster: {selectedMapping?.semanticCluster || ontologyMetadata?.cluster || "-"}</div>
              <div>Family: {ontologyMetadata?.family || selectedMapping?.semantic?.semanticCluster || "inferred"}</div>
              <div>Aliases: {ontologyMetadata?.aliases?.slice(0, 8).join(" • ") || selectedFieldMetadata?.semanticLabel || "-"}</div>
              <div>Semantic score: {selectedMapping?.semantic?.confidence?.score != null ? selectedMapping.semantic.confidence.score.toFixed(3) : selectedFieldMetadata?.confidenceScore != null ? selectedFieldMetadata.confidenceScore.toFixed(3) : "-"}</div>
              <div>Gating validity: {selectedMapping?.wave9Decision?.suppression?.suppressed ? "rejected" : selectedMapping?.wave9Decision ? "valid" : "-"}</div>
            </div>
          </details>

          <details style={{ border: "1px solid #d9e2ec", borderRadius: 12, background: "#f8fafc", padding: 12 }}>
            <summary style={{ cursor: "pointer", fontWeight: 700, color: "#0f172a" }}>Ontology Metadata</summary>
            <div style={{ display: "grid", gap: 6, marginTop: 12, fontSize: 12, color: "#334155" }}>
              <div>ACORD code: {selectedMapping?.acordCode || selectedFieldMetadata?.acordCode || ontologyMetadata?.acordCode || "-"}</div>
              <div>ACORD label: {selectedMapping?.acordLabel || ontologyMetadata?.label || selectedFieldMetadata?.acordLabel || "-"}</div>
              <div>xmlPath: {ontologyMetadata?.xmlPath || selectedFieldMetadata?.acordCode || "-"}</div>
              <div>Form membership: {ontologyMetadata?.formMembership?.join(" • ") || "-"}</div>
            </div>
          </details>

          <details style={{ border: "1px solid #d9e2ec", borderRadius: 12, background: "#f8fafc", padding: 12 }}>
            <summary style={{ cursor: "pointer", fontWeight: 700, color: "#0f172a" }}>Document-Level Diagnostics</summary>
            <div style={{ display: "grid", gap: 6, marginTop: 12, fontSize: 12, color: "#334155" }}>
              <div>Semantic profile: {documentSemanticProfile?.familyId || "-"}</div>
              <div>Cluster density: {documentSemanticProfile ? `${Object.keys(documentSemanticProfile.clusters || {}).length}/${Math.max(1, documentSemanticProfile.predictionCount)}` : "-"}</div>
              <div>Scoring distribution: high={candidateDistribution.high}, medium={candidateDistribution.medium}, low={candidateDistribution.low}</div>
              <div>Routing decisions: {Object.entries(routedClusters || {}).sort((left, right) => right[1] - left[1]).slice(0, 8).map(([cluster, count]) => `${cluster}:${count}`).join(" • ") || "-"}</div>
              <div>Applied fields: {ontologyDocumentApplyStats?.appliedCount ?? 0} • Skipped fields: {ontologyDocumentApplyStats?.skippedCount ?? 0}</div>
              <div>Builder stats: routedClusters={(ontologyBuilderDiagnostics?.routedClusters || []).length}, appliedByCluster={Object.keys(ontologyBuilderDiagnostics?.appliedByCluster || {}).length}, skippedByCluster={Object.keys(ontologyBuilderDiagnostics?.skippedByCluster || {}).length}</div>
            </div>
          </details>
      </div>
    </div>
  );
}

export default DesignerRightPanel;