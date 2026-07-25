import { useMemo, useState } from "react";
import {
  buildGlobalSemanticGraph,
  evaluateGlobalSemanticDrift,
  evaluateGraphInference,
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

export function SemanticGraphExplorerPanel() {
  const documentId = useMappingStore((state) => state.documentId || "current-document");
  const mappingCount = useMappingStore((state) => Object.keys(state.mappings).length);
  const previousSnapshot = useMappingStore((state) => state.globalSemanticGraphSnapshot);
  const edgeOverrides = useMappingStore((state) => state.globalSemanticGraphEdgeOverrides);
  const mergeDecisions = useMappingStore((state) => state.globalSemanticGraphMergeDecisions);
  const setSnapshot = useMappingStore((state) => state.setGlobalSemanticGraphSnapshot);
  const setEdgeOverride = useMappingStore((state) => state.setGlobalSemanticGraphEdgeOverride);
  const setMergeDecision = useMappingStore((state) => state.setGlobalSemanticGraphMergeDecision);
  const setSelectedVersion = useMappingStore((state) => state.setSelectedGlobalSemanticGraphVersion);
  const [status, setStatus] = useState<string | null>(null);

  const payload = useMemo(() => buildPayload(), [documentId, mappingCount, edgeOverrides, mergeDecisions, previousSnapshot]);

  const graphResult = useMemo(() => {
    if (!payload) return null;
    return buildGlobalSemanticGraph(
      [{ fixtureId: payload.documentId || documentId, payload }],
      {
        previousSnapshot,
        memorySnapshot: payload.semanticMemorySnapshot,
        edgeOverrides,
        mergeDecisions,
      },
    );
  }, [documentId, edgeOverrides, mergeDecisions, payload, previousSnapshot]);

  const inference = useMemo(() => {
    if (!payload || !graphResult) return [];
    return evaluateGraphInference(payload, graphResult.snapshot);
  }, [graphResult, payload]);

  const drift = useMemo(() => {
    if (!graphResult) return null;
    return evaluateGlobalSemanticDrift(previousSnapshot, graphResult.snapshot);
  }, [graphResult, previousSnapshot]);

  const acceptGraph = () => {
    if (!graphResult) return;
    setSnapshot(graphResult.snapshot);
    setSelectedVersion(graphResult.snapshot.versionId);
    setMergeDecision({
      decisionId: `accept-${graphResult.snapshot.versionId}`,
      action: "accept-merge",
      targetVersionId: graphResult.snapshot.versionId,
      changedAt: new Date().toISOString(),
      changedBy: "reviewer",
      reason: "accept merged graph",
    });
    setStatus(`Accepted graph ${graphResult.snapshot.versionId}.`);
  };

  const pinGraph = () => {
    if (!graphResult) return;
    setMergeDecision({
      decisionId: `pin-${graphResult.snapshot.versionId}`,
      action: "pin-version",
      targetVersionId: graphResult.snapshot.versionId,
      changedAt: new Date().toISOString(),
      changedBy: "reviewer",
      reason: "pin global semantic graph",
    });
    setSelectedVersion(graphResult.snapshot.versionId);
    setStatus(`Pinned graph ${graphResult.snapshot.versionId}.`);
  };

  const rollbackGraph = () => {
    if (!previousSnapshot?.pinnedVersionId) {
      setStatus("No pinned graph version available.");
      return;
    }

    setMergeDecision({
      decisionId: `rollback-${previousSnapshot.pinnedVersionId}`,
      action: "rollback-version",
      targetVersionId: previousSnapshot.pinnedVersionId,
      changedAt: new Date().toISOString(),
      changedBy: "reviewer",
      reason: "rollback graph to pinned version",
    });
    setSelectedVersion(previousSnapshot.pinnedVersionId);
    setStatus(`Rollback requested to ${previousSnapshot.pinnedVersionId}.`);
  };

  const addEquivalenceOverride = () => {
    if (!graphResult || graphResult.snapshot.nodes.length < 2) {
      setStatus("Not enough graph nodes to create override.");
      return;
    }

    const left = graphResult.snapshot.nodes[0];
    const right = graphResult.snapshot.nodes[1];
    setEdgeOverride({
      fromNodeId: left.nodeId,
      toNodeId: right.nodeId,
      edgeType: "equivalence",
      weight: 0.8,
      active: true,
      changedAt: new Date().toISOString(),
      changedBy: "reviewer",
      reason: "manual equivalence override",
    });
    setStatus(`Added equivalence override for ${left.code} -> ${right.code}.`);
  };

  const generateReport = () => {
    if (!graphResult || !drift) {
      setStatus("No graph report available.");
      return;
    }

    downloadJson(
      `${JSON.stringify(
        {
          graphSnapshot: graphResult.snapshot,
          harmonization: graphResult.harmonization,
          drift,
          inference,
        },
        null,
        2,
      )}\n`,
      `${documentId}.global-semantic-graph-report.json`,
    );
    setStatus("Generated global semantic graph report.");
  };

  if (!payload || !graphResult || !drift) {
    return (
      <section style={{ border: "1px solid #d9e2ec", borderRadius: 12, padding: 12, background: "#f8fafc" }}>
        <h3 style={{ marginTop: 0, marginBottom: 8 }}>Semantic Graph Explorer</h3>
        <div style={{ fontSize: 12, color: "#475569" }}>
          Load mappings to inspect the global semantic graph and harmonization drift.
        </div>
      </section>
    );
  }

  const nodeCounts = graphResult.snapshot.nodes.reduce<Record<string, number>>((acc, node) => {
    acc[node.nodeType] = (acc[node.nodeType] || 0) + 1;
    return acc;
  }, {});

  return (
    <section style={{ border: "1px solid #d9e2ec", borderRadius: 12, padding: 12, background: "#f8fafc", display: "grid", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <h3 style={{ margin: 0 }}>Semantic Graph Explorer</h3>
        <button type="button" onClick={generateReport}>Generate Graph Report</button>
      </div>

      <div style={{ fontSize: 12, color: "#334155" }}>
        Graph {graphResult.snapshot.versionId} • hash {graphResult.snapshot.graphHash} • nodes {graphResult.snapshot.nodeCount} • edges {graphResult.snapshot.edgeCount}
      </div>
      <div style={{ fontSize: 12, color: "#334155" }}>
        Harmonization {graphResult.harmonization.harmonizationHash} • namespaces {graphResult.harmonization.namespaces.join(", ")} • compatibility violations {graphResult.harmonization.compatibilityViolations.length}
      </div>
      <div style={{ fontSize: 12, color: drift.hasDrift ? "#92400e" : "#166534" }}>
        Drift {drift.hasDrift ? "detected" : "stable"} • {drift.differences.length} change points
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={acceptGraph}>Accept Graph Merge</button>
        <button type="button" onClick={addEquivalenceOverride}>Override Graph Edge</button>
        <button type="button" onClick={pinGraph}>Pin Graph Version</button>
        <button type="button" onClick={rollbackGraph}>Rollback Graph Snapshot</button>
      </div>

      <div style={{ borderTop: "1px solid #cbd5e1", paddingTop: 8, display: "grid", gap: 4 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}>Node Breakdown</div>
        {Object.entries(nodeCounts).map(([type, count]) => (
          <div key={type} style={{ fontSize: 12, color: "#334155" }}>
            {type}: {count}
          </div>
        ))}
      </div>

      <div style={{ borderTop: "1px solid #cbd5e1", paddingTop: 8, display: "grid", gap: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}>Graph Inference</div>
        {inference.slice(0, 8).map((item) => (
          <div key={item.extractionBlockId} style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 8, background: "#ffffff" }}>
            <div style={{ fontSize: 12, color: "#0f172a" }}>
              {item.extractionBlockId} • {item.chosenCode || "unmapped"}
            </div>
            <div style={{ fontSize: 12, color: "#334155" }}>
              inferred {item.inferredCodes.join(", ") || "none"} • confidence {Math.round(item.confidence * 100)}% • abstain {item.abstain ? "yes" : "no"}
            </div>
            <div style={{ fontSize: 12, color: "#475569" }}>{item.explainability.join(" • ")}</div>
          </div>
        ))}
      </div>

      {status ? <div style={{ fontSize: 12, color: "#334155" }}>{status}</div> : null}
    </section>
  );
}
