import { useEffect, useMemo, useState } from "react";
import { runAcordSearch } from "../../api/wave9Integration";
import { MappingConfidence } from "../../mapping/MappingConfidence";
import { PropertiesPanel } from "../../designer/properties/PropertiesPanel";
import { useDesignerStore, type Field } from "../../state/designerStore";
import { useMappingStore, useSelectedFieldMapping } from "../../state/mappingStore";
import { useSelectedField } from "../../state/fieldStore";

type OntologySemanticMetadata = {
  acordCode?: string;
  label?: string;
  xmlPath?: string;
  family?: string;
  cluster?: string;
  aliases?: string[];
};

function resolveOntologySemanticMetadata(_acordCode: string): OntologySemanticMetadata | null {
  return null;
}

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
  acordTokens: string[];
  semanticTokens: string[];
};

function tokenizeText(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

function hasTokenOverlap(left: string[], right: string[]): boolean {
  if (left.length === 0 || right.length === 0) return false;
  const leftSet = new Set(left);
  return right.some((token) => leftSet.has(token));
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

function hasMeaningfulSemanticLabel(field: Field): boolean {
  const label = (field.metadata?.semanticLabel || "").trim().toLowerCase();
  if (label.length < 3) return false;
  return !/^(yes|no|n\/a|na|none)$/i.test(label);
}

function hasMeaningfulAcordCandidates(field: Field, selectedMappingCandidates?: Array<{ acordCode: string; label: string }>): boolean {
  const tokens = tokenizeText([
    field.metadata?.acordCode || "",
    field.metadata?.acordLabel || "",
    field.metadata?.acordDescription || "",
    ...((field.metadata?.acordCandidates || []).map((candidate) => `${candidate.acordCode} ${candidate.label}`)),
    ...((selectedMappingCandidates || []).map((candidate) => `${candidate.acordCode} ${candidate.label}`)),
  ].join(" "));

  return tokens.length > 0;
}

function isLikelyNonFieldArtifact(field: Field): boolean {
  if (field.type === "checkbox" || field.type === "radio" || field.type === "dropdown" || field.type === "date" || field.type === "numeric" || field.type === "signature") {
    return false;
  }

  const classification = field.metadata?.artifactClassification;
  if (classification === "non_field_artifact") {
    return true;
  }

  const combinedText = [
    field.metadata?.semanticLabel || "",
    field.metadata?.acordLabel || "",
    field.metadata?.acordDescription || "",
    field.metadata?.categoryMode || "",
    getFieldRawText(field),
  ]
    .join(" ")
    .toLowerCase();

  const rawText = getFieldRawText(field).trim().toLowerCase();
  if (field.metadata?.artifactClassification === "field label" && /^(yes|no)$/i.test(rawText)) {
    return true;
  }

  return /\b(logo|copyright|all rights reserved|confidential|proprietary|disclaimer|sample|specimen|header|footer|section title|section\s+\d+|table of contents|instructions?|for office use only)\b/i.test(
    combinedText,
  ) || /\b(markel|insurance company|subcontractors|application|general contractor\/artisan contractor|homes\/units\?|do you\b|are you\b|have you\b)\b/i.test(
    combinedText,
  );
}

export function DesignerRightPanel() {
  const [acordQuery, setAcordQuery] = useState("");
  const [acordResults, setAcordResults] = useState<AcordSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const selectedField = useSelectedField();
  const selectedMapping = useSelectedFieldMapping();
  const fields = useDesignerStore((state) => state.fields);
  const updateField = useDesignerStore((state) => state.updateField);
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

  const chooseCandidate = useMappingStore((state) => state.chooseCandidate);
  const unlinkFieldAssociation = useMappingStore((state) => state.unlinkFieldAssociation);

  const selectedFieldMetadata = selectedField?.metadata;
  const isMappingMode = Boolean(selectedField);

  const rankedCandidates = useMemo(() => {
    return [...(selectedMapping?.candidates || [])]
      .sort((left, right) => right.confidenceScore - left.confidenceScore || left.acordCode.localeCompare(right.acordCode))
      .slice(0, 5);
  }, [selectedMapping?.candidates]);

  const fieldInsights = useMemo(() => {
    return fields
      .filter(
        (field) =>
          (field.metadata?.artifactClassification === "field label" ||
            field.metadata?.artifactClassification === "field value") &&
          !isLikelyNonFieldArtifact(field) &&
          (ontologyFieldIds.size === 0 || ontologyFieldIds.has(field.id)),
      )
      .map((field) => {
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
        acordTokens: tokenizeText([
          ontologyCode,
          acordLabel,
          field.metadata?.acordDescription || "",
          ...((field.metadata?.acordCandidates || []).map((candidate) => `${candidate.acordCode} ${candidate.label}`)),
        ].join(" ")),
        semanticTokens: tokenizeText([semanticLabel, rawText, ontology?.label || ""].join(" ")),
      } satisfies FieldMatch;
      });
  }, [fields, ontologyFieldIds]);

  const similarFields = useMemo(() => {
    if (!selectedField) {
      return [] as FieldMatch[];
    }

    const selectedInsight = fieldInsights.find((item) => item.field.id === selectedField.id);
    if (!selectedInsight) {
      return [] as FieldMatch[];
    }

    const selectedAcordTokens = tokenizeText([
      selectedInsight.field.metadata?.acordCode || "",
      selectedInsight.field.metadata?.acordLabel || "",
      selectedInsight.field.metadata?.acordDescription || "",
      ...((selectedInsight.field.metadata?.acordCandidates || []).map((candidate) => `${candidate.acordCode} ${candidate.label}`)),
      ...((selectedMapping?.candidates || []).map((candidate) => `${candidate.acordCode} ${candidate.label}`)),
    ].join(" "));

    const selectedSemanticTokens = selectedInsight.semanticTokens;

    const filtered = fieldInsights.filter((item) => {
      if (item.field.id === selectedInsight.field.id) return false;
      if (item.cluster !== selectedInsight.cluster) return false;
      if (!hasMeaningfulSemanticLabel(item.field)) return false;
      if (!hasMeaningfulAcordCandidates(item.field, selectedMapping?.candidates)) return false;
      const semanticMatch = hasTokenOverlap(item.semanticTokens, selectedSemanticTokens);
      const acordMatch = hasTokenOverlap(item.acordTokens, selectedAcordTokens);
      return semanticMatch && acordMatch;
    });

    return filtered
      .sort((left, right) => right.confidence - left.confidence || left.label.localeCompare(right.label))
      .slice(0, 25);
  }, [fieldInsights, selectedField, selectedMapping?.candidates]);

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

  const mappingHistory = (selectedMapping?.associationHistory || []).slice(0, 5);
  const ontologyFieldCount = Array.isArray(ontologyDocument?.fields) ? ontologyDocument.fields.length : 0;
  const mappedFieldCount = fields.filter((field) => Boolean(field.metadata?.acordCode?.trim())).length;
  const nonFieldArtifactCount = fields.filter((field) => field.metadata?.artifactClassification === "non_field_artifact").length;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-end" }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", letterSpacing: "0.08em", textTransform: "uppercase" }}>Field Workspace</div>
          <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>
            {isMappingMode ? "ACORD-first mapping workflow for the selected field." : "Select a field on the canvas to enter mapping mode."}
          </div>
        </div>
      </div>

      {isMappingMode ? (
      <div style={{ display: "grid", gap: 14 }}>
          <section style={{ border: "1px solid #d9e2ec", borderRadius: 12, background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)", padding: 12, display: "grid", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
              <div>
                <h4 style={{ margin: 0, color: "#0f172a" }}>Field Properties</h4>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>Mapping-mode properties for the current field.</div>
              </div>
            </div>
            <PropertiesPanel selectedField={selectedField} showAcordMappingSection={false} compactMode />
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
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>Only fields in the same cluster with overlapping ACORD candidates and semantic labels.</div>
            </div>
            <div style={{ fontSize: 12, color: "#64748b" }}>{selectedField ? "Showing fields with strict semantic and ACORD overlap." : "Select a field to show meaningful similar fields."}</div>
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
              <div style={{ fontSize: 12, color: "#64748b" }}>No fields met cluster + ACORD + semantic similarity requirements.</div>
            )}
          </section>

          <details style={{ border: "1px solid #d9e2ec", borderRadius: 12, background: "#f8fafc", padding: 12 }}>
            <summary style={{ cursor: "pointer", color: "#0f172a", fontWeight: 700 }}>Semantic Interpretation</summary>
            <div style={{ marginTop: 10, display: "grid", gap: 6, fontSize: 12, color: "#334155" }}>
              <div>Semantic label: {selectedFieldMetadata?.semanticLabel || "-"}</div>
              <div>Artifact classification: {selectedFieldMetadata?.artifactClassification || "-"}</div>
              <div>Category mode: {selectedFieldMetadata?.categoryMode || "-"}</div>
              <div>Confidence: {formatPercent(selectedFieldMetadata?.confidenceScore || 0)}</div>
            </div>
          </details>

          <details style={{ border: "1px solid #d9e2ec", borderRadius: 12, background: "#f8fafc", padding: 12 }}>
            <summary style={{ cursor: "pointer", color: "#0f172a", fontWeight: 700 }}>Ontology Metadata</summary>
            <div style={{ marginTop: 10, display: "grid", gap: 6, fontSize: 12, color: "#334155" }}>
              <div>ACORD code: {selectedFieldMetadata?.acordCode || "-"}</div>
              <div>ACORD label: {selectedFieldMetadata?.acordLabel || "-"}</div>
              <div>Extraction block: {selectedFieldMetadata?.extractionBlockId || "-"}</div>
              <div>Ontology field coverage: {ontologyFieldCount} field(s)</div>
            </div>
          </details>

          <details style={{ border: "1px solid #d9e2ec", borderRadius: 12, background: "#f8fafc", padding: 12 }}>
            <summary style={{ cursor: "pointer", color: "#0f172a", fontWeight: 700 }}>Document-Level Diagnostics</summary>
            <div style={{ marginTop: 10, display: "grid", gap: 6, fontSize: 12, color: "#334155" }}>
              <div>Total fields: {fields.length}</div>
              <div>Mapped fields: {mappedFieldCount}</div>
              <div>Non-field artifacts: {nonFieldArtifactCount}</div>
              <div>Ontology-linked fields: {ontologyFieldIds.size}</div>
            </div>
          </details>
      </div>
      ) : (
      <section style={{ border: "1px solid #d9e2ec", borderRadius: 12, background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)", padding: 12, display: "grid", gap: 8 }}>
        <h4 style={{ margin: 0, color: "#0f172a" }}>Mapping Mode</h4>
        <div style={{ fontSize: 12, color: "#475569" }}>
          Select any field on the canvas to open mapping-mode properties, ACORD mapping, and similar-field tools.
        </div>
      </section>
      )}
    </div>
  );
}

export default DesignerRightPanel;