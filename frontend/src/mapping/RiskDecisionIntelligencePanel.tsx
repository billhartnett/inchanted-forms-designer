import { useMemo, useState } from "react";
import {
  buildRiskFactorSnapshot,
  buildRiskScoringSnapshot,
  buildUnderwritingDecisionSnapshot,
  evaluateRiskScoring,
  evaluateUnderwritingDecision,
  evaluateUnderwritingDecisionDrift,
  extractRiskFactors,
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

export function RiskDecisionIntelligencePanel() {
  const documentId = useMappingStore((state) => state.documentId || "current-document");
  const mappingCount = useMappingStore((state) => Object.keys(state.mappings).length);
  const previousRiskSnapshot = useMappingStore((state) => state.riskFactorSnapshot);
  const previousScoreSnapshot = useMappingStore((state) => state.riskScoringSnapshot);
  const previousDecisionSnapshot = useMappingStore((state) => state.underwritingDecisionSnapshot);
  const riskOverrides = useMappingStore((state) => state.riskFactorOverrides);
  const decisionOverrides = useMappingStore((state) => state.underwritingDecisionOverrides);
  const decisionDecisions = useMappingStore((state) => state.underwritingDecisionDecisions);
  const setRiskSnapshot = useMappingStore((state) => state.setRiskFactorSnapshot);
  const setRiskOverride = useMappingStore((state) => state.setRiskFactorOverride);
  const setRiskScoreSnapshot = useMappingStore((state) => state.setRiskScoringSnapshot);
  const setDecisionSnapshot = useMappingStore((state) => state.setUnderwritingDecisionSnapshot);
  const setDecisionOverride = useMappingStore((state) => state.setUnderwritingDecisionOverride);
  const setDecisionGov = useMappingStore((state) => state.setUnderwritingDecisionGovernanceDecision);
  const setDecisionDrift = useMappingStore((state) => state.setUnderwritingDecisionDrift);
  const setSelectedDecisionVersion = useMappingStore((state) => state.setSelectedUnderwritingDecisionVersion);
  const [status, setStatus] = useState<string | null>(null);

  const payload = useMemo(
    () => buildPayload(),
    [
      documentId,
      mappingCount,
      previousRiskSnapshot,
      previousScoreSnapshot,
      previousDecisionSnapshot,
      riskOverrides,
      decisionOverrides,
      decisionDecisions,
    ],
  );

  const riskSignals = useMemo(() => {
    if (!payload) return [];
    return extractRiskFactors(payload, { overrides: riskOverrides });
  }, [payload, riskOverrides]);

  const riskSnapshot = useMemo(() => {
    if (!payload) return undefined;
    return buildRiskFactorSnapshot(payload, {
      previousSnapshot: previousRiskSnapshot,
      overrides: riskOverrides,
    });
  }, [payload, previousRiskSnapshot, riskOverrides]);

  const riskScoring = useMemo(() => {
    if (!payload) return undefined;
    return evaluateRiskScoring(payload, { signals: riskSignals });
  }, [payload, riskSignals]);

  const riskScoreSnapshot = useMemo(() => {
    if (!payload) return undefined;
    return buildRiskScoringSnapshot(payload, {
      previousSnapshot: previousScoreSnapshot,
      signals: riskSignals,
    });
  }, [payload, previousScoreSnapshot, riskSignals]);

  const decisionReport = useMemo(() => {
    if (!payload || !riskScoring) return undefined;
    return evaluateUnderwritingDecision(payload, {
      riskSignals,
      riskScoring,
      overrides: decisionOverrides,
    });
  }, [payload, riskSignals, riskScoring, decisionOverrides]);

  const decisionSnapshot = useMemo(() => {
    if (!payload || !riskScoring) return undefined;
    return buildUnderwritingDecisionSnapshot(payload, {
      previousSnapshot: previousDecisionSnapshot,
      riskSignals,
      riskScoring,
      overrides: decisionOverrides,
      decisions: decisionDecisions,
    });
  }, [payload, previousDecisionSnapshot, riskSignals, riskScoring, decisionOverrides, decisionDecisions]);

  const decisionDrift = useMemo(() => {
    if (!decisionSnapshot) return undefined;
    return evaluateUnderwritingDecisionDrift(
      {
        riskFactorSnapshot: previousRiskSnapshot,
        riskScoringSnapshot: previousScoreSnapshot,
        underwritingRuleSnapshot: payload?.underwritingRuleSnapshot,
        underwritingDecisionSnapshot: previousDecisionSnapshot,
        underwritingDecisionOverrides: decisionOverrides,
      },
      {
        riskFactorSnapshot: riskSnapshot,
        riskScoringSnapshot: riskScoreSnapshot,
        underwritingRuleSnapshot: payload?.underwritingRuleSnapshot,
        underwritingDecisionSnapshot: decisionSnapshot,
        underwritingDecisionOverrides: decisionOverrides,
      },
    );
  }, [decisionOverrides, decisionSnapshot, payload?.underwritingRuleSnapshot, previousDecisionSnapshot, previousRiskSnapshot, previousScoreSnapshot, riskScoreSnapshot, riskSnapshot]);

  const acceptDecision = () => {
    if (!riskSnapshot || !riskScoreSnapshot || !decisionSnapshot || !decisionDrift) return;
    setRiskSnapshot(riskSnapshot);
    setRiskScoreSnapshot(riskScoreSnapshot);
    setDecisionSnapshot(decisionSnapshot);
    setDecisionDrift(decisionDrift);
    setSelectedDecisionVersion(decisionSnapshot.versionId);
    setDecisionGov({
      decisionId: `accept-${decisionSnapshot.versionId}`,
      action: "accept",
      targetVersionId: decisionSnapshot.versionId,
      changedAt: new Date().toISOString(),
      changedBy: "reviewer",
      reason: "accept underwriting decision intelligence",
    });
    setStatus(`Accepted decision snapshot ${decisionSnapshot.versionId}.`);
  };

  const pinDecision = () => {
    if (!decisionSnapshot) return;
    setSelectedDecisionVersion(decisionSnapshot.versionId);
    setDecisionGov({
      decisionId: `pin-${decisionSnapshot.versionId}`,
      action: "pin",
      targetVersionId: decisionSnapshot.versionId,
      changedAt: new Date().toISOString(),
      changedBy: "reviewer",
      reason: "pin underwriting decision snapshot",
    });
    setStatus(`Pinned decision snapshot ${decisionSnapshot.versionId}.`);
  };

  const rollbackDecision = () => {
    const pinned = [...decisionDecisions]
      .reverse()
      .find((item) => item.action === "pin" && item.targetVersionId);
    if (!pinned?.targetVersionId) {
      setStatus("No pinned decision version available.");
      return;
    }

    setDecisionGov({
      decisionId: `rollback-${pinned.targetVersionId}`,
      action: "rollback",
      targetVersionId: pinned.targetVersionId,
      changedAt: new Date().toISOString(),
      changedBy: "reviewer",
      reason: "rollback underwriting decision snapshot",
    });
    setSelectedDecisionVersion(pinned.targetVersionId);
    setStatus(`Rollback requested to ${pinned.targetVersionId}.`);
  };

  const addRiskOverride = () => {
    const signal = riskSignals[0];
    if (!signal) {
      setStatus("No risk factor signal available for override.");
      return;
    }
    setRiskOverride({
      signalId: signal.signalId,
      forcedSeverity: Math.min(1, signal.severity + 0.1),
      active: true,
      changedAt: new Date().toISOString(),
      changedBy: "reviewer",
      reason: "manual risk severity override",
    });
    setStatus(`Added risk override for ${signal.signalId}.`);
  };

  const addDecisionOverride = () => {
    if (!decisionReport) {
      setStatus("No decision available for override.");
      return;
    }
    const forced = decisionReport.outcome === "decline" ? "refer-to-underwriter" : "accept-with-conditions";
    setDecisionOverride({
      decisionId: decisionReport.decisionId,
      forcedOutcome: forced,
      changedAt: new Date().toISOString(),
      changedBy: "reviewer",
      reason: "manual outcome override",
    });
    setStatus(`Applied decision override to ${forced}.`);
  };

  const generateReport = () => {
    if (!riskSnapshot || !riskScoring || !riskScoreSnapshot || !decisionReport || !decisionSnapshot || !decisionDrift) {
      setStatus("No risk and decision report available.");
      return;
    }

    downloadJson(
      `${JSON.stringify(
        {
          riskFactors: riskSignals,
          riskFactorSnapshot: riskSnapshot,
          riskScoring,
          riskScoringSnapshot: riskScoreSnapshot,
          underwritingDecision: decisionReport,
          underwritingDecisionSnapshot: decisionSnapshot,
          underwritingDecisionDrift: decisionDrift,
        },
        null,
        2,
      )}\n`,
      `${documentId}.underwriting-decision-intelligence.json`,
    );
    setStatus("Generated underwriting decision report.");
  };

  if (!payload || !riskScoring || !riskSnapshot || !riskScoreSnapshot || !decisionReport || !decisionSnapshot || !decisionDrift) {
    return (
      <section style={{ border: "1px solid #d9e2ec", borderRadius: 12, padding: 12, background: "#f8fafc" }}>
        <h3 style={{ marginTop: 0, marginBottom: 8 }}>Risk and Decision Intelligence</h3>
        <div style={{ fontSize: 12, color: "#475569" }}>
          Load mappings to evaluate deterministic risk factors and underwriting decision intelligence.
        </div>
      </section>
    );
  }

  return (
    <section style={{ border: "1px solid #d9e2ec", borderRadius: 12, padding: 12, background: "#f8fafc", display: "grid", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <h3 style={{ margin: 0 }}>Risk and Decision Intelligence</h3>
        <button type="button" onClick={generateReport}>Generate Underwriting Decision Report</button>
      </div>
      <div style={{ fontSize: 12, color: "#334155" }}>
        Risk factors {riskSnapshot.signalCount} • hash {riskSnapshot.riskFactorHash}
      </div>
      <div style={{ fontSize: 12, color: "#334155" }}>
        Risk score {riskScoring.weightedScore.toFixed(3)} ({riskScoring.classification}) • carrier class {riskScoring.carrierClass}
      </div>
      <div style={{ fontSize: 12, color: "#334155" }}>
        Decision {decisionReport.outcome} • snapshot {decisionSnapshot.versionId} • hash {decisionSnapshot.decisionHash}
      </div>
      <div style={{ fontSize: 12, color: decisionDrift.hasDrift ? "#92400e" : "#166534" }}>
        Drift {decisionDrift.hasDrift ? "detected" : "stable"} • {decisionDrift.differences.length} changes
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={acceptDecision}>Accept Decision Snapshot</button>
        <button type="button" onClick={addRiskOverride}>Override Risk Factor</button>
        <button type="button" onClick={addDecisionOverride}>Override Decision Outcome</button>
        <button type="button" onClick={pinDecision}>Pin Decision Version</button>
        <button type="button" onClick={rollbackDecision}>Rollback Decision Snapshot</button>
      </div>

      <div style={{ borderTop: "1px solid #cbd5e1", paddingTop: 8, display: "grid", gap: 4 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}>Risk Factors</div>
        {riskSignals.slice(0, 8).map((signal) => (
          <div key={signal.signalId} style={{ fontSize: 12, color: "#334155" }}>
            {signal.category} • {signal.code} • severity {signal.severity.toFixed(3)} • confidence {signal.confidence.toFixed(3)}
          </div>
        ))}
      </div>

      <div style={{ borderTop: "1px solid #cbd5e1", paddingTop: 8, display: "grid", gap: 4 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}>Rule Outcomes</div>
        {decisionReport.firedRules.slice(0, 8).map((rule) => (
          <div key={rule.ruleId} style={{ fontSize: 12, color: rule.passed ? "#166534" : "#92400e" }}>
            {rule.ruleId} • {rule.passed ? "pass" : "fail"} • {rule.severity}
          </div>
        ))}
      </div>

      <div style={{ borderTop: "1px solid #cbd5e1", paddingTop: 8, display: "grid", gap: 4 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}>Decision Rationale</div>
        {decisionReport.rationale.map((line) => (
          <div key={line} style={{ fontSize: 12, color: "#334155" }}>
            {line}
          </div>
        ))}
      </div>

      {status ? <div style={{ fontSize: 12, color: "#334155" }}>{status}</div> : null}
    </section>
  );
}
