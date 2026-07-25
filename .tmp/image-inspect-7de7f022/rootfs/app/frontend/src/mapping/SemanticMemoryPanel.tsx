import { useMemo, useState } from "react";
import {
  buildSemanticMemorySnapshot,
  evaluateLongitudinalMemoryDrift,
  evaluateSemanticFusion,
  generateSemanticMemoryRecommendations,
  prioritizeConflictRecurrence,
} from "../../../shared/src/quality";
import type { MappingPersistencePayload } from "../../../shared/src/types";
import { getDefaultOntologyMetadata } from "../../../shared/src/acord/ontology";
import { useDesignerStore } from "../designer/state/useDesignerStore";
import { useExtractionStore } from "../state/extractionStore";
import { useMappingStore } from "../state/mappingStore";

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
        mapping.decisionGraph.confidenceThresholds || extraction.decisionGraph.confidenceThresholds,
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

export function SemanticMemoryPanel() {
  const mappingCount = useMappingStore((state) => Object.keys(state.mappings).length);
  const documentId = useMappingStore((state) => state.documentId || "current-document");
  const semanticMemorySnapshot = useMappingStore((state) => state.semanticMemorySnapshot);
  const semanticMemoryDecisions = useMappingStore((state) => state.semanticMemoryDecisions);
  const selectedSemanticMemoryVersion = useMappingStore(
    (state) => state.selectedSemanticMemoryVersion,
  );
  const setSemanticMemorySnapshot = useMappingStore(
    (state) => state.setSemanticMemorySnapshot,
  );
  const setSemanticMemoryDecision = useMappingStore(
    (state) => state.setSemanticMemoryDecision,
  );
  const setSelectedSemanticMemoryVersion = useMappingStore(
    (state) => state.setSelectedSemanticMemoryVersion,
  );
  const [status, setStatus] = useState<string | null>(null);

  const payload = useMemo(
    () => buildPayload(),
    [documentId, mappingCount, semanticMemorySnapshot, semanticMemoryDecisions, selectedSemanticMemoryVersion],
  );

  const fusionReport = useMemo(() => {
    if (!payload) return null;
    return evaluateSemanticFusion([{ fixtureId: payload.documentId || documentId, payload }], {
      fusionOverrides: payload.fusionOverrides || [],
    });
  }, [documentId, payload]);

  const memorySnapshot = useMemo(() => {
    if (!payload || !fusionReport) return null;
    return buildSemanticMemorySnapshot(
      [{ fixtureId: payload.documentId || documentId, payload }],
      {
        previousSnapshot: semanticMemorySnapshot,
        decisions: semanticMemoryDecisions,
      },
    );
  }, [documentId, fusionReport, payload, semanticMemoryDecisions, semanticMemorySnapshot]);

  const recommendations = useMemo(() => {
    if (!fusionReport || !memorySnapshot) return [];
    return generateSemanticMemoryRecommendations(fusionReport, memorySnapshot);
  }, [fusionReport, memorySnapshot]);

  const prioritizedConflicts = useMemo(() => {
    if (!fusionReport || !memorySnapshot) return [];
    return prioritizeConflictRecurrence(fusionReport, memorySnapshot);
  }, [fusionReport, memorySnapshot]);

  const memoryDrift = useMemo(() => {
    if (!memorySnapshot) return null;
    return evaluateLongitudinalMemoryDrift(semanticMemorySnapshot, memorySnapshot);
  }, [memorySnapshot, semanticMemorySnapshot]);

  const commitSnapshot = () => {
    if (!memorySnapshot) {
      setStatus("No semantic memory snapshot available.");
      return;
    }

    setSemanticMemorySnapshot(memorySnapshot);
    setSelectedSemanticMemoryVersion(memorySnapshot.versionId);
    setStatus(`Semantic memory snapshot ${memorySnapshot.versionId} updated.`);
  };

  const pinSnapshot = () => {
    if (!memorySnapshot) {
      return;
    }

    setSemanticMemoryDecision({
      decisionId: `pin-${memorySnapshot.versionId}`,
      action: "pin",
      targetVersionId: memorySnapshot.versionId,
      changedAt: new Date().toISOString(),
      changedBy: "reviewer",
      reason: "manual pin",
    });
    setSelectedSemanticMemoryVersion(memorySnapshot.versionId);
    setStatus(`Pinned semantic memory version ${memorySnapshot.versionId}.`);
  };

  const rollbackToPinned = () => {
    if (!semanticMemorySnapshot?.pinnedVersionId) {
      setStatus("No pinned semantic memory version is available.");
      return;
    }

    setSemanticMemoryDecision({
      decisionId: `rollback-${semanticMemorySnapshot.pinnedVersionId}`,
      action: "rollback",
      targetVersionId: semanticMemorySnapshot.pinnedVersionId,
      changedAt: new Date().toISOString(),
      changedBy: "reviewer",
      reason: "rollback to pinned version",
    });
    setSelectedSemanticMemoryVersion(semanticMemorySnapshot.pinnedVersionId);
    setStatus(`Rollback requested to ${semanticMemorySnapshot.pinnedVersionId}.`);
  };

  const generateReport = () => {
    if (!memorySnapshot || !fusionReport || !memoryDrift) {
      setStatus("No semantic memory report available.");
      return;
    }

    downloadJson(
      `${JSON.stringify(
        {
          documentId,
          memorySnapshot,
          memoryDrift,
          recommendations,
          prioritizedConflicts,
          fusionHashes: {
            profileHash: fusionReport.profileHash,
            unificationHash: fusionReport.unificationHash,
            conflictHash: fusionReport.conflictHash,
          },
        },
        null,
        2,
      )}\n`,
      `${documentId}.semantic-memory-report.json`,
    );
    setStatus("Generated semantic memory report.");
  };

  if (!payload || !memorySnapshot || !memoryDrift) {
    return (
      <section style={{ border: "1px solid #d9e2ec", borderRadius: 12, padding: 12, background: "#f8fafc" }}>
        <h3 style={{ marginTop: 0, marginBottom: 8 }}>Semantic Memory</h3>
        <div style={{ fontSize: 12, color: "#475569" }}>
          Load mappings to evaluate longitudinal semantic memory and recommendations.
        </div>
      </section>
    );
  }

  return (
    <section style={{ border: "1px solid #d9e2ec", borderRadius: 12, padding: 12, background: "#f8fafc", display: "grid", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <h3 style={{ margin: 0 }}>Semantic Memory</h3>
        <button type="button" onClick={generateReport}>Generate Memory Report</button>
      </div>

      <div style={{ fontSize: 12, color: "#334155" }}>
        Version {memorySnapshot.versionId} • hash {memorySnapshot.memoryHash} • entries {memorySnapshot.entries.length}
      </div>
      <div style={{ fontSize: 12, color: "#334155" }}>
        Recommendations {recommendations.length} • high priority {recommendations.filter((item) => item.priority === "high").length} • high severity conflicts {prioritizedConflicts.filter((item) => item.priority === "high").length}
      </div>
      <div style={{ fontSize: 12, color: memoryDrift.hasDrift ? "#92400e" : "#166534" }}>
        Longitudinal drift {memoryDrift.hasDrift ? "detected" : "stable"} • confidence {memoryDrift.confidenceDrift.toFixed(3)} • recurrence {memoryDrift.conflictRecurrenceDelta.toFixed(3)} • stability {memoryDrift.stabilityDrift.toFixed(3)}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={commitSnapshot}>Accept Memory Update</button>
        <button type="button" onClick={pinSnapshot}>Pin Version</button>
        <button type="button" onClick={rollbackToPinned}>Rollback To Pinned</button>
      </div>

      <div style={{ borderTop: "1px solid #cbd5e1", paddingTop: 8, display: "grid", gap: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}>Top Recommendations</div>
        {recommendations.slice(0, 8).map((recommendation) => (
          <div key={recommendation.recommendationId} style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 8, background: "#ffffff" }}>
            <div style={{ fontSize: 12, color: "#0f172a" }}>
              {recommendation.recommendedCode} • group {recommendation.groupId}
            </div>
            <div style={{ fontSize: 12, color: "#334155" }}>
              Priority {recommendation.priority} • confidence {Math.round(recommendation.confidence * 100)}% • based on {recommendation.basedOnVersionId}
            </div>
            <div style={{ fontSize: 12, color: "#475569" }}>{recommendation.reason}</div>
          </div>
        ))}
      </div>

      <div style={{ borderTop: "1px solid #cbd5e1", paddingTop: 8, display: "grid", gap: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}>Conflict Recurrence</div>
        {prioritizedConflicts.length === 0 ? (
          <div style={{ fontSize: 12, color: "#166534" }}>No recurring conflicts detected.</div>
        ) : (
          prioritizedConflicts.slice(0, 8).map((conflict) => (
            <div key={conflict.conflictId} style={{ border: "1px solid #fbbf24", borderRadius: 8, padding: 8, background: "#fffbeb" }}>
              <div style={{ fontSize: 12, color: "#7c2d12", fontWeight: 700 }}>
                {conflict.class} • {conflict.priority}
              </div>
              <div style={{ fontSize: 12, color: "#92400e" }}>
                {conflict.canonicalCode} • recurrence {conflict.recurrence.toFixed(3)} • severity {conflict.severityScore.toFixed(3)}
              </div>
              <div style={{ fontSize: 12, color: "#92400e" }}>{conflict.warning}</div>
            </div>
          ))
        )}
      </div>

      {status ? <div style={{ fontSize: 12, color: "#334155" }}>{status}</div> : null}
    </section>
  );
}
