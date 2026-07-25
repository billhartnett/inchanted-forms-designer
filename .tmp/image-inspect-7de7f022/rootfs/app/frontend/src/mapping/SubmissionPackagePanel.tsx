import { useMemo, useState } from "react";
import { getDefaultOntologyMetadata } from "../../../shared/src/acord/ontology";
import type { MappingPersistencePayload } from "../../../shared/src/types";
import { useDesignerStore } from "../designer/state/useDesignerStore";
import { useExtractionStore } from "../state/extractionStore";
import { useMappingStore } from "../state/mappingStore";

const API_BASE_URL = (() => {
  const configured = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  if (configured) return configured;
  if (typeof window === "undefined") return "";
  const { protocol, hostname } = window.location;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return `${protocol}//${hostname}:7071`;
  }
  return "";
})();

function apiUrl(path: string): string {
  return API_BASE_URL ? `${API_BASE_URL}${path}` : path;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: `Request failed: ${response.status}` }));
    throw new Error(body?.error || `Request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

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

export function SubmissionPackagePanel() {
  const documentId = useMappingStore((state) => state.documentId || "current-document");
  const mappingCount = useMappingStore((state) => Object.keys(state.mappings).length);
  const submissionPackage = useMappingStore((state) => state.submissionPackage);
  const submissionStatus = useMappingStore((state) => state.submissionStatus);
  const carrierSubmissionResponse = useMappingStore((state) => state.carrierSubmissionResponse);
  const submissionDrift = useMappingStore((state) => state.submissionDrift);
  const setSubmissionPackage = useMappingStore((state) => state.setSubmissionPackage);
  const setSubmissionStatus = useMappingStore((state) => state.setSubmissionStatus);
  const setCarrierSubmissionResponse = useMappingStore((state) => state.setCarrierSubmissionResponse);
  const setSubmissionDrift = useMappingStore((state) => state.setSubmissionDrift);
  const setSubmissionOverride = useMappingStore((state) => state.setSubmissionOverride);
  const setSelectedSubmissionVersion = useMappingStore((state) => state.setSelectedSubmissionVersion);
  const [status, setStatus] = useState<string | null>(null);

  const payload = useMemo(() => buildPayload(), [documentId, mappingCount, submissionPackage?.packageHash]);

  const generatePackage = async () => {
    if (!payload) {
      setStatus("No mapping payload available.");
      return;
    }

    const response = await fetchJson<{
      submissionPackage: NonNullable<MappingPersistencePayload["submissionPackage"]>;
      drift: NonNullable<MappingPersistencePayload["submissionDrift"]>;
    }>(apiUrl("/api/submission/package/generate"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload, includeSemanticLineage: true }),
    });

    setSubmissionPackage(response.submissionPackage);
    setSubmissionDrift(response.drift);
    setSelectedSubmissionVersion(response.submissionPackage.packageId);
    setStatus(`Generated package ${response.submissionPackage.packageId}.`);
  };

  const submitToCarrier = async () => {
    if (!payload) {
      setStatus("No mapping payload available.");
      return;
    }

    const response = await fetchJson<{
      package: NonNullable<MappingPersistencePayload["submissionPackage"]>;
      status: NonNullable<MappingPersistencePayload["submissionStatus"]>;
      response: NonNullable<MappingPersistencePayload["carrierSubmissionResponse"]>;
      drift: NonNullable<MappingPersistencePayload["submissionDrift"]>;
    }>(apiUrl("/api/submission/carrier/submit"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload, includeSemanticLineage: true }),
    });

    setSubmissionPackage(response.package);
    setSubmissionStatus(response.status);
    setCarrierSubmissionResponse(response.response);
    setSubmissionDrift(response.drift);
    setSelectedSubmissionVersion(response.package.packageId);
    setStatus(`Submitted ${response.status.submissionId} with status ${response.status.status}.`);
  };

  const refreshStatus = async () => {
    if (!submissionStatus?.submissionId) {
      setStatus("No submission ID to refresh.");
      return;
    }

    const response = await fetchJson<{
      status: NonNullable<MappingPersistencePayload["submissionStatus"]>;
      response?: NonNullable<MappingPersistencePayload["carrierSubmissionResponse"]>;
    }>(
      `${apiUrl("/api/submission/status")}?submissionId=${encodeURIComponent(submissionStatus.submissionId)}`,
      { method: "GET" },
    );

    setSubmissionStatus(response.status);
    if (response.response) {
      setCarrierSubmissionResponse(response.response);
    }
    setStatus(`Refreshed status ${response.status.status}.`);
  };

  const forceCarrier = () => {
    setSubmissionOverride({
      overrideId: `force-carrier-${Date.now()}`,
      action: "force-carrier",
      carrierId: "markel",
      changedAt: new Date().toISOString(),
      changedBy: "reviewer",
      reason: "force carrier route for review",
    });
    setStatus("Applied force-carrier override to markel.");
  };

  const forceSubmit = () => {
    setSubmissionOverride({
      overrideId: `force-submit-${Date.now()}`,
      action: "force-submit",
      changedAt: new Date().toISOString(),
      changedBy: "reviewer",
      reason: "force submit despite underwriting block",
    });
    setStatus("Applied force-submit override.");
  };

  const forcePendingStatus = () => {
    setSubmissionOverride({
      overrideId: `force-status-${Date.now()}`,
      action: "force-status",
      forcedStatus: "pending",
      changedAt: new Date().toISOString(),
      changedBy: "reviewer",
      reason: "manual status override for governance review",
    });
    setStatus("Applied force-status override to pending.");
  };

  return (
    <section style={{ border: "1px solid #d9e2ec", borderRadius: 12, padding: 12, background: "#f8fafc", display: "grid", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <h3 style={{ margin: 0 }}>Submission Package</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={generatePackage}>Generate Package</button>
          <button type="button" onClick={submitToCarrier}>Submit to Carrier</button>
          <button type="button" onClick={refreshStatus}>Refresh Status</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={forceCarrier}>Force Carrier</button>
        <button type="button" onClick={forceSubmit}>Force Submit</button>
        <button type="button" onClick={forcePendingStatus}>Force Pending Status</button>
      </div>

      <div style={{ fontSize: 12, color: "#334155" }}>
        Package: {submissionPackage?.packageId || "not generated"}
      </div>
      <div style={{ fontSize: 12, color: "#334155" }}>
        Status: {submissionStatus?.status || "draft"}
      </div>
      <div style={{ fontSize: 12, color: submissionDrift?.hasDrift ? "#92400e" : "#166534" }}>
        Drift: {submissionDrift?.hasDrift ? "detected" : "stable"}
      </div>

      <details>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>ACORD XML</summary>
        <pre style={{ whiteSpace: "pre-wrap", fontSize: 11, background: "#fff", padding: 8, border: "1px solid #cbd5e1", borderRadius: 8 }}>
          {submissionPackage?.acordXml || "No ACORD XML generated."}
        </pre>
      </details>

      <details>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>Carrier Payload</summary>
        <pre style={{ whiteSpace: "pre-wrap", fontSize: 11, background: "#fff", padding: 8, border: "1px solid #cbd5e1", borderRadius: 8 }}>
          {submissionPackage?.carrierPayloads?.[0]?.payload || "No carrier payload generated."}
        </pre>
      </details>

      <details>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>Risk and Decision Bundle</summary>
        <pre style={{ whiteSpace: "pre-wrap", fontSize: 11, background: "#fff", padding: 8, border: "1px solid #cbd5e1", borderRadius: 8 }}>
          {JSON.stringify(
            {
              riskReport: submissionPackage?.riskReport,
              decisionReport: submissionPackage?.decisionReport,
            },
            null,
            2,
          )}
        </pre>
      </details>

      <details>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>Carrier Response</summary>
        <pre style={{ whiteSpace: "pre-wrap", fontSize: 11, background: "#fff", padding: 8, border: "1px solid #cbd5e1", borderRadius: 8 }}>
          {JSON.stringify(carrierSubmissionResponse || { message: "No carrier response yet." }, null, 2)}
        </pre>
      </details>

      {status ? <div style={{ fontSize: 12, color: "#334155" }}>{status}</div> : null}
    </section>
  );
}
