import { useEffect, useMemo, useState } from "react";
import {
  buildUnifiedAcordXmlFromFusion,
  buildUnifiedSchemaFromFusion,
  evaluateSemanticFusion,
  getCrossFormUnificationGraph,
} from "../../../shared/src/quality";
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

function downloadText(content: string, fileName: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
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

export function SemanticFusionPanel() {
  const mappingCount = useMappingStore((state) => Object.keys(state.mappings).length);
  const documentId = useMappingStore((state) => state.documentId || "current-document");
  const fusionOverrides = useMappingStore((state) => state.fusionOverrides);
  const setFusionOverride = useMappingStore((state) => state.setFusionOverride);
  const setSemanticFusionSnapshot = useMappingStore((state) => state.setSemanticFusionSnapshot);
  const [status, setStatus] = useState<string | null>(null);

  const payload = useMemo(() => buildPayload(), [documentId, mappingCount, fusionOverrides]);
  const unificationGraph = useMemo(() => getCrossFormUnificationGraph(), []);

  const fusionReport = useMemo(() => {
    if (!payload) return null;
    return evaluateSemanticFusion(
      [{ fixtureId: payload.documentId || documentId, payload }],
      {
        fusionOverrides,
      },
    );
  }, [documentId, fusionOverrides, payload]);

  useEffect(() => {
    if (!fusionReport) return;
    setSemanticFusionSnapshot({
      generatedAt: fusionReport.generatedAt,
      profileHash: fusionReport.profileHash,
      unificationHash: fusionReport.unificationHash,
      conflictHash: fusionReport.conflictHash,
    });
  }, [fusionReport, setSemanticFusionSnapshot]);

  const handleGenerateFusionReport = () => {
    if (!fusionReport) {
      setStatus("No fusion report available.");
      return;
    }

    const unifiedSchema = buildUnifiedSchemaFromFusion(fusionReport);
    const unifiedXml = buildUnifiedAcordXmlFromFusion(fusionReport);

    downloadJson(
      `${JSON.stringify(
        {
          fusionReport,
          unifiedSchema,
          unifiedXmlHash: unifiedXml.unifiedXmlHash,
        },
        null,
        2,
      )}\n`,
      `${documentId}.fusion-report.json`,
    );
    downloadText(unifiedXml.xml, `${documentId}.unified.acord.xml`, "application/xml");
    setStatus("Generated fusion report, unified schema snapshot, and unified XML.");
  };

  const applyOverride = (groupId: string, forcedAcordCode: string) => {
    if (!forcedAcordCode) return;

    setFusionOverride({
      groupId,
      forcedAcordCode,
      changedAt: new Date().toISOString(),
      changedBy: "reviewer",
      reason: "manual fusion decision",
    });
    setStatus(`Fusion override applied for ${groupId} -> ${forcedAcordCode}`);
  };

  if (!payload || !fusionReport) {
    return (
      <section style={{ border: "1px solid #d9e2ec", borderRadius: 12, padding: 12, background: "#f8fafc" }}>
        <h3 style={{ marginTop: 0, marginBottom: 8 }}>Semantic Fusion</h3>
        <div style={{ fontSize: 12, color: "#475569" }}>
          Load mappings to inspect fused semantics and unified field groups.
        </div>
      </section>
    );
  }

  return (
    <section style={{ border: "1px solid #d9e2ec", borderRadius: 12, padding: 12, background: "#f8fafc", display: "grid", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <h3 style={{ margin: 0 }}>Semantic Fusion</h3>
        <button type="button" onClick={handleGenerateFusionReport}>
          Generate Fusion Report
        </button>
      </div>

      <div style={{ fontSize: 12, color: "#334155" }}>
        Profiles {fusionReport.profiles.length} • Conflicts {fusionReport.conflicts.length} • Fused ranking {Math.round(fusionReport.fusedRankingQuality * 100)}%
      </div>

      <div style={{ fontSize: 12, color: "#334155" }}>
        Consistency: document {Math.round(fusionReport.fusedConsistency.crossDocumentAgreement * 100)}% • family {Math.round(fusionReport.fusedConsistency.crossFamilyAgreement * 100)}% • ontology {Math.round(fusionReport.fusedConsistency.crossOntologyAgreement * 100)}%
      </div>

      <div style={{ fontSize: 12, color: "#334155" }}>
        Unified rationale: embedding {fusionReport.fusedRationaleDistribution.embedding.toFixed(3)} • lexical {fusionReport.fusedRationaleDistribution.lexical.toFixed(3)} • dictionary {fusionReport.fusedRationaleDistribution.dictionary.toFixed(3)} • heuristic {fusionReport.fusedRationaleDistribution.heuristic.toFixed(3)}
      </div>

      <div style={{ borderTop: "1px solid #cbd5e1", paddingTop: 8, display: "grid", gap: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}>Unified Fields</div>
        {fusionReport.profiles.slice(0, 12).map((profile) => {
          const override = fusionOverrides.find((item) => item.groupId === profile.groupId);
          const overrideCode = override?.forcedAcordCode || profile.acordCode;
          const options = Array.from(new Set([profile.canonicalCode, ...profile.equivalentCodes])).sort((a, b) =>
            a.localeCompare(b),
          );

          return (
            <div key={profile.groupId} style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 8, display: "grid", gap: 5 }}>
              <div style={{ fontSize: 12, color: "#0f172a" }}>
                {profile.canonicalCode} • group {profile.groupId}
              </div>
              <div style={{ fontSize: 12, color: "#334155" }}>
                Equivalents: {profile.equivalentCodes.join(", ")}
              </div>
              <div style={{ fontSize: 12, color: "#334155" }}>
                Fused confidence {Math.round(profile.fusedConfidenceScore * 100)}% • docs {profile.documentIds.length} • families {profile.families.join(", ")}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <select
                  value={overrideCode}
                  onChange={(event) => applyOverride(profile.groupId, event.target.value)}
                  style={{ flex: 1 }}
                >
                  {options.map((code) => (
                    <option key={`${profile.groupId}-${code}`} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ borderTop: "1px solid #cbd5e1", paddingTop: 8, display: "grid", gap: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}>Cross-Document Conflicts</div>
        {fusionReport.conflicts.length === 0 ? (
          <div style={{ fontSize: 12, color: "#166534" }}>No fusion conflicts detected.</div>
        ) : (
          fusionReport.conflicts.slice(0, 10).map((conflict) => (
            <div key={conflict.conflictId} style={{ border: "1px solid #fbbf24", borderRadius: 8, padding: 8, background: "#fffbeb" }}>
              <div style={{ fontSize: 12, color: "#7c2d12", fontWeight: 700 }}>
                {conflict.class}
              </div>
              <div style={{ fontSize: 12, color: "#92400e" }}>{conflict.warning}</div>
              <div style={{ fontSize: 12, color: "#92400e" }}>
                Codes: {conflict.codes.join(", ")} • Families: {conflict.families.join(", ")} • Ontologies: {conflict.ontologyNamespaces.join(", ")}
              </div>
            </div>
          ))
        )}
      </div>

      <div style={{ borderTop: "1px solid #cbd5e1", paddingTop: 8, display: "grid", gap: 4 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}>Unification Graph</div>
        <div style={{ fontSize: 12, color: "#334155" }}>
          Graph hash {unificationGraph.graphHash} • groups {unificationGraph.groups.length} • edges {unificationGraph.edges.length}
        </div>
      </div>

      {status ? <div style={{ fontSize: 12, color: "#334155" }}>{status}</div> : null}
    </section>
  );
}
