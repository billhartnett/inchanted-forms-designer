import { useMemo } from "react";
import { useSelectedField } from "../../state/fieldStore";
import { useSelectedFieldMapping } from "../../state/mappingStore";
import { useMappingStore } from "../../state/mappingStore";
import { MappingConfidence } from "../../mapping/MappingConfidence";
import { MappingPanel } from "../../mapping/MappingPanel";

export function DesignerBindingsPanel() {
  const selectedField = useSelectedField();
  const selectedMapping = useSelectedFieldMapping();
  const updateMapping = useMappingStore((s) => s.updateMapping);

  const candidates = selectedMapping?.candidates ?? [];
  const chosenCandidate = selectedMapping?.chosenCandidate ?? null;
  const thresholds = selectedMapping?.thresholds ?? {
    accepted: 0.8,
    review: 0.6,
    rejected: 0.45,
  };

  const topAcordCandidates = useMemo(
    () =>
      [...candidates]
        .sort((a, b) => b.confidenceScore - a.confidenceScore)
        .slice(0, 3),
    [candidates],
  );

  const carrierCandidates = useMemo(
    () => candidates.filter((c) => Boolean(c.carrierAdapter)).slice(0, 3),
    [candidates],
  );

  const required = Boolean(selectedField?.metadata?.required);
  const hardFailures = chosenCandidate?.underwritingRules?.hardFailures?.length ?? 0;
  const ruleImpact = chosenCandidate?.underwritingRules?.scoreDelta ?? 0;
  const ruleCount = chosenCandidate?.underwritingRules?.evaluations?.length ?? 0;
  const riskCategories = chosenCandidate?.riskFactors?.categories ?? [];
  const riskSeverity =
    (chosenCandidate?.riskFactors?.exposureSeverity ?? 0) +
    (chosenCandidate?.riskFactors?.hazardSeverity ?? 0);

  const handleSelectCandidate = (candidate: any) => {
    if (!selectedMapping) return;
    
    // Update mapping with chosen candidate
    updateMapping(selectedMapping.fieldId, {
      ...selectedMapping,
      chosenCandidate: candidate,
    });
  };

  if (!selectedField) {
    return (
      <section
        style={{
          border: "1px solid #d9e2ec",
          borderRadius: 12,
          padding: 12,
          background: "#f8fafc",
        }}
      >
        <h4 style={{ margin: "0 0 6px", color: "#0f172a" }}>Bindings</h4>
        <div style={{ fontSize: 12, color: "#475569" }}>
          Select a field to inspect ACORD bindings and suggestions.
        </div>
      </section>
    );
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <section
        style={{
          border: "1px solid #d9e2ec",
          borderRadius: 12,
          padding: 12,
          background: "#f8fafc",
        }}
      >
        {/* Header row with Required/Optional chip */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 10,
          }}
        >
          <h4 style={{ margin: 0, color: "#0f172a" }}>Bindings</h4>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: "2px 8px",
              borderRadius: 6,
              background: required ? "#fee2e2" : "#f1f5f9",
              color: required ? "#b91c1c" : "#475569",
              border: `1px solid ${required ? "#fca5a5" : "#cbd5e1"}`,
            }}
          >
            {required ? "Required" : "Optional"}
          </span>
        </div>

        {/* ACORD suggestions with click handlers */}
        {topAcordCandidates.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "#334155",
                marginBottom: 6,
              }}
            >
              ACORD suggestions
            </div>
            <div style={{ display: "grid", gap: 5 }}>
              {topAcordCandidates.map((candidate) => {
                const isChosen =
                  candidate.acordCode === chosenCandidate?.acordCode;
                return (
                  <div
                    key={candidate.acordCode}
                    onClick={() => handleSelectCandidate(candidate)}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "4px 8px",
                      borderRadius: 8,
                      background: isChosen ? "#eff6ff" : "#ffffff",
                      border: `1px solid ${isChosen ? "#93c5fd" : "#e2e8f0"}`,
                      cursor: "pointer",
                      transition: "all 150ms ease",
                    }}
                    onMouseEnter={(e) => {
                      if (!isChosen) {
                        (e.currentTarget as HTMLElement).style.background = "#f0f9ff";
                        (e.currentTarget as HTMLElement).style.borderColor = "#bfdbfe";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isChosen) {
                        (e.currentTarget as HTMLElement).style.background = "#ffffff";
                        (e.currentTarget as HTMLElement).style.borderColor = "#e2e8f0";
                      }
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: "#0f172a",
                        }}
                      >
                        {candidate.acordCode}
                        {isChosen && (
                          <span
                            style={{ marginLeft: 4, fontSize: 10, color: "#2563eb" }}
                          >
                            ✓
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: "#475569" }}>
                        {candidate.label}
                      </div>
                    </div>
                    <MappingConfidence
                      confidenceScore={candidate.confidenceScore}
                      thresholds={thresholds}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Carrier suggestions */}
        {carrierCandidates.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "#334155",
                marginBottom: 6,
              }}
            >
              Carrier suggestions
            </div>
            <div style={{ display: "grid", gap: 4 }}>
              {carrierCandidates.map((candidate) => {
                const ca = candidate.carrierAdapter!;
                return (
                  <div
                    key={`${ca.carrierId}-${ca.carrierCode}`}
                    style={{
                      padding: "4px 8px",
                      borderRadius: 8,
                      background: "#ffffff",
                      border: "1px solid #e2e8f0",
                      fontSize: 12,
                      color: "#334155",
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>{ca.carrierId}</span>
                    {" · "}
                    {ca.carrierCode}
                    {" → "}
                    {ca.mappedAcordCode}
                    <span
                      style={{ marginLeft: 6, fontSize: 11, color: "#64748b" }}
                    >
                      {(ca.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Rule impact */}
        {ruleCount > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "#334155",
                marginBottom: 4,
              }}
            >
              Rule impact
            </div>
            <div
              style={{
                padding: "4px 8px",
                borderRadius: 8,
                background: hardFailures > 0 ? "#fef2f2" : "#f0fdf4",
                border: `1px solid ${hardFailures > 0 ? "#fca5a5" : "#86efac"}`,
                fontSize: 12,
                color: hardFailures > 0 ? "#991b1b" : "#166534",
              }}
            >
              {ruleCount} rule{ruleCount !== 1 ? "s" : ""}
              {hardFailures > 0
                ? ` · ${hardFailures} hard failure${hardFailures !== 1 ? "s" : ""}`
                : " · all clear"}
              {ruleImpact !== 0
                ? ` · score Δ ${ruleImpact > 0 ? "+" : ""}${ruleImpact.toFixed(2)}`
                : ""}
            </div>
          </div>
        )}

        {/* Risk relevance */}
        {riskCategories.length > 0 && (
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "#334155",
                marginBottom: 4,
              }}
            >
              Risk relevance
            </div>
            <div
              style={{
                padding: "4px 8px",
                borderRadius: 8,
                background: riskSeverity > 5 ? "#fff7ed" : "#f8fafc",
                border: `1px solid ${riskSeverity > 5 ? "#fdba74" : "#e2e8f0"}`,
                fontSize: 12,
                color: riskSeverity > 5 ? "#9a3412" : "#334155",
              }}
            >
              {riskCategories.join(" · ")}
              {riskSeverity > 0 ? ` · severity ${riskSeverity.toFixed(1)}` : ""}
            </div>
          </div>
        )}
      </section>

      <MappingPanel />
    </div>
  );
}

export default DesignerBindingsPanel;
