import { useMemo, useState } from "react";
import {
  createDefaultCalibrationProfile,
  evaluateMappingQuality,
  type MappingQualityReport,
} from "../../../shared/src/quality";
import { getDefaultOntologyMetadata } from "../../../shared/src/acord/ontology";
import type { MappingPersistencePayload } from "../../../shared/src/types";
import { useDesignerStore } from "../designer/state/useDesignerStore";
import { useExtractionStore } from "../state/extractionStore";
import { useMappingStore } from "../state/mappingStore";

const BASELINE_STORAGE_PREFIX = "mapping-quality-baseline:";

function buildQualityPayload(): MappingPersistencePayload | null {
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
    ontologyAlignment: getDefaultOntologyMetadata(),
    fusionOverrides: mappingState.fusionOverrides,
    semanticFusionSnapshot: mappingState.semanticFusionSnapshot,
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

export function MappingQualityInspector() {
  const documentId = useMappingStore((state) => state.documentId);
  const mappingCount = useMappingStore((state) => Object.keys(state.mappings).length);
  const schemaArtifacts = useMappingStore((state) => state.schemaArtifacts);
  const [status, setStatus] = useState<string | null>(null);

  const payload = useMemo(() => buildQualityPayload(), [mappingCount, documentId, schemaArtifacts]);

  const baseline = useMemo(() => {
    if (!payload?.documentId) {
      return undefined;
    }

    try {
      const raw = localStorage.getItem(`${BASELINE_STORAGE_PREFIX}${payload.documentId}`);
      return raw ? (JSON.parse(raw) as MappingQualityReport) : undefined;
    } catch {
      return undefined;
    }
  }, [payload?.documentId]);

  const report = useMemo(() => {
    if (!payload) {
      return null;
    }

    return evaluateMappingQuality({
      payload,
      fixtureId: payload.documentId,
      baseline,
      topN: 3,
      calibrationProfile: payload.calibrationProfile,
    });
  }, [baseline, payload]);

  const generateQualityReport = () => {
    if (!report || !payload?.documentId) {
      setStatus("No mapping payload available for quality report generation.");
      return;
    }

    const json = `${JSON.stringify(report, null, 2)}\n`;
    downloadJson(json, `${payload.documentId}.mapping-quality.json`);
    localStorage.setItem(`${BASELINE_STORAGE_PREFIX}${payload.documentId}`, json);
    setStatus("Quality report downloaded and stored as local baseline.");
  };

  if (!payload || !report) {
    return (
      <section
        style={{
          border: "1px solid #d9e2ec",
          borderRadius: 12,
          padding: 12,
          background: "#f8fafc",
        }}
      >
        <h3 style={{ marginTop: 0, marginBottom: 8 }}>Mapping quality</h3>
        <div style={{ fontSize: 12, color: "#475569" }}>
          Load mappings to inspect quality metrics and generate deterministic reports.
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
        <h3 style={{ marginTop: 0, marginBottom: 0 }}>Mapping quality</h3>
        <button type="button" onClick={generateQualityReport}>
          Generate Quality Report
        </button>
      </div>

      <div style={{ fontSize: 12, color: "#334155" }}>
        Exact accuracy {Math.round(report.totals.exactAccuracy * 100)}% • Top-N accuracy {Math.round(report.totals.topNAccuracy * 100)}% • Association fidelity {Math.round(report.totals.associationAccuracy * 100)}%
      </div>

      <div style={{ fontSize: 12, color: "#334155" }}>
        Chosen in top-N {Math.round(report.totals.chosenWithinTopNRate * 100)}% ({report.totals.chosenWithinTopN}/{report.totals.fieldsEvaluated})
      </div>

      <div style={{ fontSize: 12, color: "#334155" }}>
        Rationale signals: embedding avg {report.rationaleSignalDistribution.embedding.avg} • lexical avg {report.rationaleSignalDistribution.lexical.avg} • dictionary avg {report.rationaleSignalDistribution.dictionary.avg} • heuristic avg {report.rationaleSignalDistribution.heuristic.avg}
      </div>

      <div style={{ fontSize: 12, color: "#334155" }}>
        Calibration: profile {report.calibration.profileId} v{report.calibration.profileVersion} • calibrated accuracy {Math.round(report.calibration.calibratedAccuracy * 100)}% • ranking quality {Math.round(report.calibration.thresholdAdjustedRankingQuality * 100)}%
      </div>

      <div style={{ fontSize: 12, color: "#334155" }}>
        Ontology: {report.ontology.ontologyVersion} • {report.ontology.valid ? "valid" : `${report.ontology.issues.length} issues`}
      </div>

      <div style={{ fontSize: 12, color: "#334155" }}>
        Transferability: {Math.round(report.transferability.transferabilityScore * 100)}% • confidence drift {report.transferability.confidenceDrift.toFixed(3)} • stability drift {report.transferability.candidateStabilityDrift.toFixed(3)}
      </div>

      <div style={{ fontSize: 12, color: "#334155" }}>
        Fusion: confidence {Math.round(report.fusion.fusedConfidenceScore * 100)}% • ranking {Math.round(report.fusion.fusedRankingQuality * 100)}% • profile {report.fusion.profileHash}
      </div>

      <div style={{ fontSize: 12, color: "#334155" }}>
        Fused rationale: emb {report.fusion.fusedRationaleDistribution.embedding.toFixed(3)} • lex {report.fusion.fusedRationaleDistribution.lexical.toFixed(3)} • dict {report.fusion.fusedRationaleDistribution.dictionary.toFixed(3)} • heur {report.fusion.fusedRationaleDistribution.heuristic.toFixed(3)}
      </div>

      <div style={{ fontSize: 12, color: "#334155" }}>
        Low-confidence fields {report.calibration.lowConfidenceFields.length} • borderline {report.calibration.borderlineFields.length} • unstable signals {report.calibration.unstableSignals.length}
      </div>

      <div style={{ fontSize: 12, color: "#334155" }}>
        Hashes: mapping {report.artifactHashes.mappingDecisionHash} • ui {report.artifactHashes.uiSchemaHash} • json {report.artifactHashes.jsonSchemaHash} • xml {report.artifactHashes.xmlHash}
      </div>

      <div
        style={{
          fontSize: 12,
          color: report.drift.hasDrift ? "#991b1b" : "#166534",
        }}
      >
        Drift: {report.drift.hasDrift ? `${report.drift.differences.length} differences` : "none detected"}
      </div>

      {report.drift.hasDrift ? (
        <ul style={{ margin: 0, paddingLeft: 18, color: "#7f1d1d", fontSize: 12 }}>
          {report.drift.differences.map((difference) => (
            <li key={difference.key}>
              {difference.key}: {String(difference.baselineValue)} to {String(difference.currentValue)}
            </li>
          ))}
        </ul>
      ) : null}

      <div style={{ display: "grid", gap: 4 }}>
        {report.fields.slice(0, 8).map((field) => (
          <div key={`${field.fieldId}-${field.extractionBlockId}`} style={{ fontSize: 12, color: "#475569" }}>
            {field.fieldId}: chosen {field.chosenAcordCode || "none"}, rank {field.chosenRank || "n/a"}, top-N {field.chosenWithinTopN ? "yes" : "no"}, association {field.associationCorrect ? "ok" : "mismatch"}
          </div>
        ))}
      </div>

      {status ? <div style={{ fontSize: 12, color: "#334155" }}>{status}</div> : null}
    </section>
  );
}
