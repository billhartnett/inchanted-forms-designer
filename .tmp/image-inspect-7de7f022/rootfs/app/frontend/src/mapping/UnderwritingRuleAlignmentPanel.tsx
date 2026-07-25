import { useMemo, useState } from "react";
import {
  buildUnderwritingRuleSnapshot,
  evaluateUnderwritingRules,
  evaluateUnderwritingRuleDrift,
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

  if (!Object.keys(mapping.mappings).length) return null;

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

export function UnderwritingRuleAlignmentPanel() {
  const documentId = useMappingStore((state) => state.documentId || "current-document");
  const mappingCount = useMappingStore((state) => Object.keys(state.mappings).length);
  const previousSnapshot = useMappingStore((state) => state.underwritingRuleSnapshot);
  const overrides = useMappingStore((state) => state.underwritingRuleOverrides);
  const decisions = useMappingStore((state) => state.underwritingRuleDecisions);
  const setSnapshot = useMappingStore((state) => state.setUnderwritingRuleSnapshot);
  const setOverride = useMappingStore((state) => state.setUnderwritingRuleOverride);
  const setDecision = useMappingStore((state) => state.setUnderwritingRuleDecision);
  const setSelectedVersion = useMappingStore((state) => state.setSelectedUnderwritingRuleVersion);
  const [status, setStatus] = useState<string | null>(null);

  const payload = useMemo(() => buildPayload(), [documentId, mappingCount, overrides, decisions, previousSnapshot]);

  const report = useMemo(() => {
    if (!payload) return null;
    return evaluateUnderwritingRules(payload, {
      familyId: payload.formFamily?.familyId,
      overrides,
    });
  }, [overrides, payload]);

  const snapshot = useMemo(() => {
    if (!payload) return undefined;
    return buildUnderwritingRuleSnapshot(payload, {
      previousSnapshot,
      decisions,
      overrides,
    });
  }, [decisions, overrides, payload, previousSnapshot]);

  const drift = useMemo(() => {
    if (!snapshot) return null;
    return evaluateUnderwritingRuleDrift(previousSnapshot, snapshot);
  }, [previousSnapshot, snapshot]);

  const acceptSnapshot = () => {
    if (!snapshot) return;
    setSnapshot(snapshot);
    setSelectedVersion(snapshot.versionId);
    setDecision({
      decisionId: `accept-${snapshot.versionId}`,
      action: "accept",
      targetVersionId: snapshot.versionId,
      changedAt: new Date().toISOString(),
      changedBy: "reviewer",
      reason: "accept underwriting alignment",
    });
    setStatus(`Accepted underwriting snapshot ${snapshot.versionId}.`);
  };

  const pinSnapshot = () => {
    if (!snapshot) return;
    setSelectedVersion(snapshot.versionId);
    setDecision({
      decisionId: `pin-${snapshot.versionId}`,
      action: "pin",
      targetVersionId: snapshot.versionId,
      changedAt: new Date().toISOString(),
      changedBy: "reviewer",
      reason: "pin underwriting snapshot",
    });
    setStatus(`Pinned underwriting snapshot ${snapshot.versionId}.`);
  };

  const rollbackSnapshot = () => {
    const pin = [...decisions].reverse().find((item) => item.action === "pin" && item.targetVersionId);
    if (!pin?.targetVersionId) {
      setStatus("No pinned underwriting version available.");
      return;
    }

    setDecision({
      decisionId: `rollback-${pin.targetVersionId}`,
      action: "rollback",
      targetVersionId: pin.targetVersionId,
      changedAt: new Date().toISOString(),
      changedBy: "reviewer",
      reason: "rollback underwriting snapshot",
    });
    setSelectedVersion(pin.targetVersionId);
    setStatus(`Rollback requested to ${pin.targetVersionId}.`);
  };

  const addOverride = () => {
    const first = report?.evaluations[0]?.results.find((item) => !item.passed);
    const blockId = report?.evaluations[0]?.extractionBlockId;
    if (!first || !blockId) {
      setStatus("No failing rule available for override.");
      return;
    }

    setOverride({
      ruleId: first.ruleId,
      extractionBlockId: blockId,
      forcedPass: true,
      changedAt: new Date().toISOString(),
      changedBy: "reviewer",
      reason: "manual underwriting override",
    });
    setStatus(`Added override for ${first.ruleId}.`);
  };

  const generateReport = () => {
    if (!report || !snapshot || !drift) {
      setStatus("No underwriting report available.");
      return;
    }

    downloadJson(
      `${JSON.stringify({ report, snapshot, drift }, null, 2)}\n`,
      `${documentId}.underwriting-rule-report.json`,
    );
    setStatus("Generated underwriting rule report.");
  };

  if (!payload || !report || !snapshot || !drift) {
    return (
      <section style={{ border: "1px solid #d9e2ec", borderRadius: 12, padding: 12, background: "#f8fafc" }}>
        <h3 style={{ marginTop: 0, marginBottom: 8 }}>Underwriting Rule Alignment</h3>
        <div style={{ fontSize: 12, color: "#475569" }}>
          Load mappings to evaluate carrier underwriting rule alignment and drift.
        </div>
      </section>
    );
  }

  return (
    <section style={{ border: "1px solid #d9e2ec", borderRadius: 12, padding: 12, background: "#f8fafc", display: "grid", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <h3 style={{ margin: 0 }}>Underwriting Rule Alignment</h3>
        <button type="button" onClick={generateReport}>Generate Rule Report</button>
      </div>
      <div style={{ fontSize: 12, color: "#334155" }}>
        Version {snapshot.versionId} • rules {snapshot.rulesHash} • outcomes {snapshot.outcomeHash}
      </div>
      <div style={{ fontSize: 12, color: drift.hasDrift ? "#92400e" : "#166534" }}>
        Drift {drift.hasDrift ? "detected" : "stable"} • conflicts {snapshot.conflictCount} • blockers {snapshot.blockerCount}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={acceptSnapshot}>Accept Rule Alignment</button>
        <button type="button" onClick={addOverride}>Override Rule Outcome</button>
        <button type="button" onClick={pinSnapshot}>Pin Rule Version</button>
        <button type="button" onClick={rollbackSnapshot}>Rollback Rule Snapshot</button>
      </div>
      <div style={{ borderTop: "1px solid #cbd5e1", paddingTop: 8, display: "grid", gap: 6 }}>
        {report.evaluations.slice(0, 8).map((item) => (
          <div key={item.extractionBlockId} style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 8, background: "#ffffff", fontSize: 12, color: "#334155" }}>
            {item.extractionBlockId} • {item.candidateCode} • delta {item.combinedScoreDelta.toFixed(3)} • blocker {item.hasBlocker ? "yes" : "no"}
          </div>
        ))}
      </div>
      {status ? <div style={{ fontSize: 12, color: "#334155" }}>{status}</div> : null}
    </section>
  );
}
