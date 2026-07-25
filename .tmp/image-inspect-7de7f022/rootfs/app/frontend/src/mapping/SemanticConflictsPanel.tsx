import { useEffect, useMemo, useState } from "react";
import { resolveSemanticConflicts } from "../../../shared/src/quality";
import { getDefaultOntologyMetadata } from "../../../shared/src/acord/ontology";
import type { MappingPersistencePayload } from "../../../shared/src/types";
import { useDesignerStore } from "../designer/state/useDesignerStore";
import { useExtractionStore } from "../state/extractionStore";
import { useMappingStore } from "../state/mappingStore";

function downloadJson(content: string, fileName: string) {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function buildPayload(): MappingPersistencePayload | null {
  const mapping = useMappingStore.getState();
  const extraction = useExtractionStore.getState();
  const designer = useDesignerStore.getState();

  if (!Object.keys(mapping.mappings).length) {
    return null;
  }

  return {
    version: 1,
    documentId: mapping.documentId || extraction.documentId || "current-document",
    pages: extraction.pages,
    fields: designer.fields,
    mappings: Object.values(mapping.mappings),
    decisionGraph: {
      labels: extraction.decisionGraph.labels,
      fields: extraction.decisionGraph.fields,
      mappings: mapping.decisionGraph.mappings,
      confidenceThresholds:
        mapping.decisionGraph.confidenceThresholds ||
        extraction.decisionGraph.confidenceThresholds,
    },
    overrides: mapping.overrides,
    suppressedOcrBlockIds: extraction.suppressedOcrBlockIds,
    associationEdits: mapping.associationEdits,
    schemaArtifacts: mapping.schemaArtifacts,
    calibrationProfile: mapping.calibrationProfile,
    formFamily: mapping.formFamily,
    ontologyAlignment: getDefaultOntologyMetadata(),
    semanticConflicts: mapping.semanticConflicts,
    conflictOverrides: mapping.conflictOverrides,
    fusionOverrides: mapping.fusionOverrides,
    semanticFusionSnapshot: mapping.semanticFusionSnapshot,
    semanticMemorySnapshot: mapping.semanticMemorySnapshot,
    semanticMemoryDecisions: mapping.semanticMemoryDecisions,
    selectedSemanticMemoryVersion: mapping.selectedSemanticMemoryVersion,
    globalSemanticGraphSnapshot: mapping.globalSemanticGraphSnapshot,
    globalSemanticGraphEdgeOverrides: mapping.globalSemanticGraphEdgeOverrides,
    globalSemanticGraphMergeDecisions: mapping.globalSemanticGraphMergeDecisions,
    selectedGlobalSemanticGraphVersion: mapping.selectedGlobalSemanticGraphVersion,
    carrierAdapterSnapshot: mapping.carrierAdapterSnapshot,
    carrierAdapterOverrides: mapping.carrierAdapterOverrides,
    underwritingRuleSnapshot: mapping.underwritingRuleSnapshot,
    underwritingRuleOverrides: mapping.underwritingRuleOverrides,
    underwritingRuleDecisions: mapping.underwritingRuleDecisions,
    selectedUnderwritingRuleVersion: mapping.selectedUnderwritingRuleVersion,
    riskFactorSnapshot: mapping.riskFactorSnapshot,
    riskFactorOverrides: mapping.riskFactorOverrides,
    riskScoringSnapshot: mapping.riskScoringSnapshot,
    underwritingDecisionSnapshot: mapping.underwritingDecisionSnapshot,
    underwritingDecisionOverrides: mapping.underwritingDecisionOverrides,
    underwritingDecisionDecisions: mapping.underwritingDecisionDecisions,
    underwritingDecisionDrift: mapping.underwritingDecisionDrift,
    selectedUnderwritingDecisionVersion: mapping.selectedUnderwritingDecisionVersion,
    submissionPackage: mapping.submissionPackage,
    submissionOverrides: mapping.submissionOverrides,
    submissionStatus: mapping.submissionStatus,
    carrierSubmissionResponse: mapping.carrierSubmissionResponse,
    submissionDrift: mapping.submissionDrift,
    selectedSubmissionVersion: mapping.selectedSubmissionVersion,
  };
}

export function SemanticConflictsPanel() {
  const documentId = useMappingStore((state) => state.documentId || "current-document");
  const mappingCount = useMappingStore((state) => Object.keys(state.mappings).length);
  const familyId = useMappingStore((state) => state.formFamily?.familyId);
  const overrides = useMappingStore((state) => state.conflictOverrides);
  const setConflictOverride = useMappingStore((state) => state.setConflictOverride);
  const setSemanticConflicts = useMappingStore((state) => state.setSemanticConflicts);
  const chooseCandidate = useMappingStore((state) => state.chooseCandidate);
  const [status, setStatus] = useState<string | null>(null);

  const payload = useMemo(() => buildPayload(), [documentId, mappingCount, familyId, overrides]);

  const report = useMemo(() => {
    if (!payload) {
      return null;
    }
    return resolveSemanticConflicts(payload, {
      familyId,
      conflictOverrides: overrides,
      calibrationProfile: payload.calibrationProfile,
    });
  }, [familyId, overrides, payload]);

  useEffect(() => {
    if (report) {
      setSemanticConflicts(report.conflicts);
    }
  }, [report, setSemanticConflicts]);

  const generateReport = () => {
    if (!report) {
      setStatus("No semantic conflict report available.");
      return;
    }

    downloadJson(
      `${JSON.stringify(report, null, 2)}\n`,
      `${documentId}.semantic-conflicts.json`,
    );
    setStatus("Conflict report generated.");
  };

  const applyOverride = (conflictId: string, extractionBlockId: string, forcedAcordCode: string) => {
    if (!forcedAcordCode) {
      return;
    }

    setConflictOverride({
      conflictId,
      extractionBlockId,
      forcedAcordCode,
      changedAt: new Date().toISOString(),
      changedBy: "reviewer",
      reason: "manual conflict arbitration",
    });
    chooseCandidate(extractionBlockId, forcedAcordCode);
    setStatus(`Applied override for ${conflictId} -> ${forcedAcordCode}`);
  };

  if (!payload || !report) {
    return (
      <section style={{ border: "1px solid #d9e2ec", borderRadius: 12, padding: 12, background: "#f8fafc" }}>
        <h3 style={{ marginTop: 0, marginBottom: 8 }}>Semantic conflicts</h3>
        <div style={{ fontSize: 12, color: "#475569" }}>
          Load mappings to evaluate semantic conflicts and ontology arbitration.
        </div>
      </section>
    );
  }

  return (
    <section style={{ border: "1px solid #d9e2ec", borderRadius: 12, padding: 12, background: "#f8fafc", display: "grid", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <h3 style={{ margin: 0 }}>Semantic conflicts</h3>
        <button type="button" onClick={generateReport}>Generate Conflict Report</button>
      </div>

      <div style={{ fontSize: 12, color: "#334155" }}>
        Conflicts {report.conflicts.length} • Decisions {report.decisions.length} • Hash {report.conflictHash}
      </div>

      <div style={{ fontSize: 12, color: "#334155" }}>
        Ontology namespaces: {report.ontologyNamespaces.join(", ")}
      </div>

      {report.conflicts.length === 0 ? (
        <div style={{ fontSize: 12, color: "#166534" }}>No semantic conflicts detected.</div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {report.conflicts.slice(0, 12).map((conflict) => {
            const decision = report.decisions.find((item) => item.conflictId === conflict.conflictId);
            const extractionBlockId = decision?.extractionBlockId || conflict.extractionBlockIds[0] || "";
            const override = overrides.find((item) => item.conflictId === conflict.conflictId);
            const defaultCode = override?.forcedAcordCode || decision?.resolvedAcordCode || conflict.candidateCodes[0] || "";

            return (
              <div key={conflict.conflictId} style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 8, display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, color: "#0f172a" }}>
                  {conflict.class} • {conflict.severity} • {conflict.conflictId}
                </div>
                <div style={{ fontSize: 12, color: "#334155" }}>{conflict.rationale}</div>
                <div style={{ fontSize: 12, color: "#475569" }}>
                  Candidates: {conflict.candidateCodes.join(", ") || "none"}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <select
                    defaultValue={defaultCode}
                    onChange={(event) =>
                      applyOverride(conflict.conflictId, extractionBlockId, event.target.value)
                    }
                    style={{ flex: 1 }}
                  >
                    {conflict.candidateCodes.map((code) => (
                      <option key={`${conflict.conflictId}-${code}`} value={code}>
                        {code}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ fontSize: 11, color: "#64748b" }}>
                  Lineage: {conflict.lineage.join(" | ")}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {status ? <div style={{ fontSize: 12, color: "#334155" }}>{status}</div> : null}
    </section>
  );
}
