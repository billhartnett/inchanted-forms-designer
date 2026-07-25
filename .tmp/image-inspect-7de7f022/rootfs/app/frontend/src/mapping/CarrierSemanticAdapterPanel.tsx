import { useMemo, useState } from "react";
import {
  buildCarrierAdapterSnapshot,
  evaluateCarrierAdapterDrift,
  evaluateCarrierAdapterMappings,
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

export function CarrierSemanticAdapterPanel() {
  const documentId = useMappingStore((state) => state.documentId || "current-document");
  const mappingCount = useMappingStore((state) => Object.keys(state.mappings).length);
  const previousSnapshot = useMappingStore((state) => state.carrierAdapterSnapshot);
  const overrides = useMappingStore((state) => state.carrierAdapterOverrides);
  const setSnapshot = useMappingStore((state) => state.setCarrierAdapterSnapshot);
  const setOverride = useMappingStore((state) => state.setCarrierAdapterOverride);
  const [status, setStatus] = useState<string | null>(null);

  const payload = useMemo(() => buildPayload(), [documentId, mappingCount, overrides, previousSnapshot]);

  const mappings = useMemo(() => {
    if (!payload) return [];
    return evaluateCarrierAdapterMappings(payload, {
      familyId: payload.formFamily?.familyId,
      overrides,
    });
  }, [overrides, payload]);

  const snapshot = useMemo(() => {
    if (!payload) return undefined;
    return buildCarrierAdapterSnapshot(
      [{ fixtureId: payload.documentId || documentId, payload }],
      {
        previousSnapshot,
        overrides,
      },
    );
  }, [documentId, overrides, payload, previousSnapshot]);

  const drift = useMemo(() => {
    if (!snapshot) return null;
    return evaluateCarrierAdapterDrift(previousSnapshot, snapshot);
  }, [previousSnapshot, snapshot]);

  const acceptSnapshot = () => {
    if (!snapshot) return;
    setSnapshot(snapshot);
    setStatus(`Accepted carrier adapter snapshot ${snapshot.versionId}.`);
  };

  const addOverride = () => {
    const target = mappings[0];
    if (!target) {
      setStatus("No adapter mapping available for override.");
      return;
    }

    setOverride({
      carrierId: target.carrierId,
      carrierCode: target.carrierCode,
      forcedAcordCode: target.mappedAcordCode,
      changedAt: new Date().toISOString(),
      changedBy: "reviewer",
      reason: "manual adapter override",
    });
    setStatus(`Added override for ${target.carrierCode}.`);
  };

  const generateReport = () => {
    if (!snapshot || !drift) {
      setStatus("No adapter report available.");
      return;
    }

    downloadJson(
      `${JSON.stringify({ snapshot, drift, mappings }, null, 2)}\n`,
      `${documentId}.carrier-adapter-report.json`,
    );
    setStatus("Generated carrier adapter report.");
  };

  if (!payload || !snapshot || !drift) {
    return (
      <section style={{ border: "1px solid #d9e2ec", borderRadius: 12, padding: 12, background: "#f8fafc" }}>
        <h3 style={{ marginTop: 0, marginBottom: 8 }}>Carrier Semantic Adapters</h3>
        <div style={{ fontSize: 12, color: "#475569" }}>
          Load mappings to evaluate carrier-specific semantic adapters.
        </div>
      </section>
    );
  }

  return (
    <section style={{ border: "1px solid #d9e2ec", borderRadius: 12, padding: 12, background: "#f8fafc", display: "grid", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <h3 style={{ margin: 0 }}>Carrier Semantic Adapters</h3>
        <button type="button" onClick={generateReport}>Generate Adapter Report</button>
      </div>
      <div style={{ fontSize: 12, color: "#334155" }}>
        Version {snapshot.versionId} • hash {snapshot.adapterHash} • carriers {snapshot.carrierIds.join(", ") || "none"}
      </div>
      <div style={{ fontSize: 12, color: drift.hasDrift ? "#92400e" : "#166534" }}>
        Drift {drift.hasDrift ? "detected" : "stable"} • {drift.differences.length} change points
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={acceptSnapshot}>Accept Adapter Snapshot</button>
        <button type="button" onClick={addOverride}>Override Adapter Mapping</button>
      </div>
      <div style={{ borderTop: "1px solid #cbd5e1", paddingTop: 8, display: "grid", gap: 6 }}>
        {mappings.slice(0, 8).map((item) => (
          <div key={`${item.extractionBlockId}:${item.carrierCode}`} style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 8, background: "#ffffff", fontSize: 12, color: "#334155" }}>
            {item.extractionBlockId} • {item.carrierCode} {"->"} {item.mappedAcordCode} ({Math.round(item.confidence * 100)}%)
          </div>
        ))}
      </div>
      {status ? <div style={{ fontSize: 12, color: "#334155" }}>{status}</div> : null}
    </section>
  );
}
