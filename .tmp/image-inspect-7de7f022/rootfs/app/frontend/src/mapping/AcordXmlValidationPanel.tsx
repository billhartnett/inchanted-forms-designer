import { useMemo, useState } from "react";
import {
  createDefaultCalibrationProfile,
  diffAcordXmlSemantics,
  evaluateMultiDocumentConsistency,
  type MultiDocumentConsistencyReport,
  type XmlSemanticValidationReport,
  validateAcordXmlSemantic,
} from "../../../shared/src/quality";
import type { MappingPersistencePayload } from "../../../shared/src/types";
import { generateAcordXml } from "../schema";
import { useDesignerStore } from "../designer/state/useDesignerStore";
import { useExtractionStore } from "../state/extractionStore";
import { useMappingStore } from "../state/mappingStore";

const XML_BASELINE_PREFIX = "acord-xml-semantic-baseline:";
const CONSISTENCY_SNAPSHOTS_KEY = "acord-consistency-snapshots";
const CONSISTENCY_BASELINE_KEY = "acord-consistency-baseline";

type SnapshotRecord = {
  fixtureId: string;
  payload: MappingPersistencePayload;
};

function buildPayload(): MappingPersistencePayload | null {
  const mappingState = useMappingStore.getState();
  const extractionState = useExtractionStore.getState();
  const designerState = useDesignerStore.getState();
  if (!Object.keys(mappingState.mappings).length) {
    return null;
  }

  const documentId =
    mappingState.documentId || extractionState.documentId || "current-document";

  return {
    version: 1,
    documentId,
    pages: extractionState.pages,
    fields: designerState.fields,
    mappings: Object.values(mappingState.mappings),
    decisionGraph: {
      labels: extractionState.decisionGraph.labels,
      fields: extractionState.decisionGraph.fields,
      mappings: mappingState.decisionGraph.mappings,
      confidenceThresholds:
        mappingState.decisionGraph.confidenceThresholds ||
        extractionState.decisionGraph.confidenceThresholds,
    },
    overrides: mappingState.overrides,
    suppressedOcrBlockIds: extractionState.suppressedOcrBlockIds,
    associationEdits: mappingState.associationEdits,
    schemaArtifacts: mappingState.schemaArtifacts,
    calibrationProfile:
      mappingState.calibrationProfile || createDefaultCalibrationProfile(),
    formFamily: mappingState.formFamily,
  };
}

function readSnapshots(): SnapshotRecord[] {
  try {
    const raw = localStorage.getItem(CONSISTENCY_SNAPSHOTS_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as SnapshotRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeSnapshots(records: SnapshotRecord[]) {
  localStorage.setItem(CONSISTENCY_SNAPSHOTS_KEY, JSON.stringify(records));
}

function downloadJson(fileName: string, payload: unknown) {
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function AcordXmlValidationPanel() {
  const documentId = useMappingStore((state) => state.documentId);
  const mappingCount = useMappingStore((state) => Object.keys(state.mappings).length);
  const schemaArtifacts = useMappingStore((state) => state.schemaArtifacts);
  const [status, setStatus] = useState<string | null>(null);

  const payload = useMemo(() => buildPayload(), [documentId, mappingCount, schemaArtifacts]);

  const semanticValidation = useMemo(() => {
    if (!payload) {
      return null;
    }

    const xml = generateAcordXml(payload).xml;
    return validateAcordXmlSemantic(payload, xml, payload.documentId || "current-document");
  }, [payload]);

  const baselineValidation = useMemo(() => {
    if (!payload?.documentId) {
      return undefined;
    }

    try {
      const raw = localStorage.getItem(`${XML_BASELINE_PREFIX}${payload.documentId}`);
      return raw ? (JSON.parse(raw) as XmlSemanticValidationReport) : undefined;
    } catch {
      return undefined;
    }
  }, [payload?.documentId]);

  const semanticDiff = useMemo(() => {
    if (!semanticValidation || !baselineValidation) {
      return undefined;
    }

    return diffAcordXmlSemantics(baselineValidation, semanticValidation);
  }, [baselineValidation, semanticValidation]);

  const consistency = useMemo(() => {
    const snapshots = readSnapshots();
    if (snapshots.length === 0) {
      return undefined;
    }

    const report = evaluateMultiDocumentConsistency({
      documents: snapshots.map((item) => ({
        fixtureId: item.fixtureId,
        payload: item.payload,
      })),
      calibrationProfile: payload?.calibrationProfile,
    });

    const baselineRaw = localStorage.getItem(CONSISTENCY_BASELINE_KEY);
    if (baselineRaw) {
      const baseline = JSON.parse(baselineRaw) as MultiDocumentConsistencyReport;
      report.drift = {
        hasDrift:
          baseline.consistencyHash !== report.consistencyHash ||
          baseline.lowConfidenceFields.length !== report.lowConfidenceFields.length ||
          baseline.disagreements.length !== report.disagreements.length,
        differences: [
          {
            key: "consistencyHash",
            baselineValue: baseline.consistencyHash,
            currentValue: report.consistencyHash,
          },
          {
            key: "lowConfidenceFields",
            baselineValue: baseline.lowConfidenceFields.length,
            currentValue: report.lowConfidenceFields.length,
          },
          {
            key: "disagreements",
            baselineValue: baseline.disagreements.length,
            currentValue: report.disagreements.length,
          },
        ].filter((item) => item.baselineValue !== item.currentValue),
      };
    }

    return report;
  }, [documentId, mappingCount, schemaArtifacts]);

  const handleGenerateConsistencyReport = () => {
    if (!payload || !payload.documentId) {
      setStatus("Load mappings before generating consistency report.");
      return;
    }

    const snapshots = readSnapshots().filter((item) => item.fixtureId !== payload.documentId);
    snapshots.push({
      fixtureId: payload.documentId,
      payload,
    });

    writeSnapshots(snapshots);
    const report = evaluateMultiDocumentConsistency({
      documents: snapshots,
      calibrationProfile: payload.calibrationProfile,
    });

    localStorage.setItem(CONSISTENCY_BASELINE_KEY, JSON.stringify(report));
    downloadJson(`${payload.documentId}.consistency-report.json`, report);
    setStatus("Consistency report generated, downloaded, and stored as local baseline.");
  };

  const handleSetSemanticBaseline = () => {
    if (!payload?.documentId || !semanticValidation) {
      setStatus("No semantic validation state available.");
      return;
    }

    localStorage.setItem(
      `${XML_BASELINE_PREFIX}${payload.documentId}`,
      JSON.stringify(semanticValidation),
    );
    setStatus("Current XML semantic validation stored as baseline.");
  };

  if (!payload || !semanticValidation) {
    return (
      <section
        style={{
          border: "1px solid #d9e2ec",
          borderRadius: 12,
          padding: 12,
          background: "#f8fafc",
        }}
      >
        <h3 style={{ marginTop: 0, marginBottom: 8 }}>ACORD XML validation</h3>
        <div style={{ fontSize: 12, color: "#475569" }}>
          Load mappings to validate semantic XML structure and consistency drift.
        </div>
      </section>
    );
  }

  return (
    <section
      style={{
        border: "1px solid #d9e2ec",
        borderRadius: 12,
        padding: 12,
        background: "#f8fafc",
        display: "grid",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <h3 style={{ marginTop: 0, marginBottom: 0 }}>ACORD XML validation</h3>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={handleSetSemanticBaseline}>
            Set XML Baseline
          </button>
          <button type="button" onClick={handleGenerateConsistencyReport}>
            Generate Consistency Report
          </button>
        </div>
      </div>

      <div style={{ fontSize: 12, color: semanticValidation.isValid ? "#166534" : "#991b1b" }}>
        XML semantic status: {semanticValidation.isValid ? "valid" : "invalid"} • nodes {semanticValidation.nodeCount} • codes {semanticValidation.codes.length}
      </div>

      <div style={{ fontSize: 12, color: "#334155" }}>
        Structural hash {semanticValidation.structuralHash} • Semantic hash {semanticValidation.semanticHash}
      </div>

      <div style={{ fontSize: 12, color: "#334155" }}>
        Required-node and hierarchy issues: {semanticValidation.issues.filter((item) => item.severity === "error").length} errors, {semanticValidation.issues.filter((item) => item.severity === "warning").length} warnings
      </div>

      {semanticValidation.issues.length > 0 ? (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "#475569" }}>
          {semanticValidation.issues.slice(0, 10).map((issue, index) => (
            <li key={`${issue.code}-${index}`}>
              {issue.code}: {issue.message}
            </li>
          ))}
        </ul>
      ) : null}

      {semanticValidation.crossFieldWarnings.length > 0 ? (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "#92400e" }}>
          {semanticValidation.crossFieldWarnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}

      {semanticDiff ? (
        <div style={{ fontSize: 12, color: semanticDiff.hasDrift ? "#991b1b" : "#166534" }}>
          Semantic drift: {semanticDiff.hasDrift ? `${semanticDiff.differences.length} differences` : "none"}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: "#475569" }}>Semantic drift: no baseline set for this document.</div>
      )}

      {consistency ? (
        <>
          <div style={{ fontSize: 12, color: "#334155" }}>
            Multi-document consistency: {consistency.documentCount} documents • {consistency.fields.length} ACORD codes • hash {consistency.consistencyHash}
          </div>
          <div style={{ fontSize: 12, color: "#334155" }}>
            Low-confidence codes: {consistency.lowConfidenceFields.length} • Rationale disagreements: {consistency.disagreements.length}
          </div>
          <div style={{ fontSize: 12, color: "#334155" }}>
            Reviewer warnings: {consistency.lowConfidenceFields.length > 0 || consistency.disagreements.length > 0 ? "Review confidence/rationale mismatches before final export." : "No major calibration warnings."}
          </div>
          {consistency.drift ? (
            <div style={{ fontSize: 12, color: consistency.drift.hasDrift ? "#991b1b" : "#166534" }}>
              Consistency drift: {consistency.drift.hasDrift ? `${consistency.drift.differences.length} differences` : "none"}
            </div>
          ) : null}
        </>
      ) : (
        <div style={{ fontSize: 12, color: "#475569" }}>
          Consistency metrics will appear after generating at least one consistency snapshot.
        </div>
      )}

      {status ? <div style={{ fontSize: 12, color: "#334155" }}>{status}</div> : null}
    </section>
  );
}
