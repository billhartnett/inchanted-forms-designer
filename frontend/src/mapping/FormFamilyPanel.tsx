import { useEffect, useMemo, useState } from "react";
import {
  classifyFormFamily,
  evaluateMappingQuality,
  resolveFamilyCalibration,
  suggestFamilyCalibrationOverrides,
} from "../../../shared/src/quality";
import type { MappingPersistencePayload } from "../../../shared/src/types";
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
      confidenceThresholds: mapping.decisionGraph.confidenceThresholds,
    },
    overrides: mapping.overrides,
    suppressedOcrBlockIds: extraction.suppressedOcrBlockIds,
    associationEdits: mapping.associationEdits,
    schemaArtifacts: mapping.schemaArtifacts,
    calibrationProfile: mapping.calibrationProfile,
    formFamily: mapping.formFamily,
  };
}

function downloadJson(fileName: string, value: unknown) {
  const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function FormFamilyPanel() {
  const documentId = useMappingStore((state) => state.documentId);
  const mappingCount = useMappingStore((state) => Object.keys(state.mappings).length);
  const profile = useMappingStore((state) => state.calibrationProfile);
  const storedFamily = useMappingStore((state) => state.formFamily);
  const setFormFamily = useMappingStore((state) => state.setFormFamily);
  const acceptSuggestion = useMappingStore((state) => state.acceptCalibrationSuggestion);
  const [status, setStatus] = useState<string | null>(null);

  const payload = useMemo(() => buildPayload(), [documentId, mappingCount, profile, storedFamily]);
  const family = useMemo(
    () => (payload ? storedFamily || classifyFormFamily(payload, payload.documentId) : null),
    [payload, storedFamily],
  );
  const report = useMemo(
    () =>
      payload && family
        ? evaluateMappingQuality({
            payload,
            fixtureId: payload.documentId,
            calibrationProfile: profile,
            familyId: family.familyId,
          })
        : null,
    [family, payload, profile],
  );
  const resolved = useMemo(
    () => (family ? resolveFamilyCalibration(profile, family.familyId) : null),
    [family, profile],
  );
  const suggestions = useMemo(
    () =>
      payload && family
        ? suggestFamilyCalibrationOverrides(payload, profile, family)
        : [],
    [family, payload, profile],
  );

  useEffect(() => {
    if (family && !storedFamily) setFormFamily(family);
  }, [family, setFormFamily, storedFamily]);

  if (!payload || !family || !report || !resolved) {
    return (
      <section style={{ border: "1px solid #d9e2ec", borderRadius: 8, padding: 12, background: "#f8fafc" }}>
        <h3 style={{ margin: 0 }}>Form Family</h3>
        <div style={{ fontSize: 12, color: "#475569", marginTop: 8 }}>Load mappings to classify this form.</div>
      </section>
    );
  }

  const familyBias = report.calibration.biasByFormFamily.find(
    (item) => item.formFamily === family.familyId,
  );

  return (
    <section style={{ border: "1px solid #d9e2ec", borderRadius: 8, padding: 12, background: "#f8fafc", display: "grid", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
        <h3 style={{ margin: 0 }}>Form Family</h3>
        <button
          type="button"
          onClick={() => {
            downloadJson(`${payload.documentId}.family-report.json`, {
              family,
              coverage: report.coverage,
              calibration: report.calibration,
              resolvedCalibration: resolved,
              suggestions,
            });
            setStatus("Family report generated.");
          }}
        >
          Generate Family Report
        </button>
      </div>

      <div style={{ fontSize: 12, color: "#0f172a", fontWeight: 600 }}>{family.familyLabel}</div>
      <div style={{ fontSize: 12, color: "#475569" }}>
        Classification confidence {Math.round(family.confidence * 100)}% • signature {family.signatureHash}
      </div>
      <div style={{ fontSize: 12, color: "#475569" }}>
        Coverage: mapped {Math.round(report.coverage.mappedRate * 100)}% • correct {Math.round(report.coverage.correctRate * 100)}% • low confidence {Math.round(report.coverage.lowConfidenceRate * 100)}%
      </div>
      <div style={{ fontSize: 12, color: familyBias && familyBias.belowThresholdRate > 0.35 ? "#991b1b" : "#166534" }}>
        Family bias: {familyBias ? `${Math.round(familyBias.belowThresholdRate * 100)}% below threshold` : "no significant bias detected"}
      </div>
      <div style={{ fontSize: 12, color: "#334155" }}>
        Family thresholds: accept {resolved.thresholds.accepted.toFixed(2)} • review {resolved.thresholds.review.toFixed(2)} • reject {resolved.thresholds.rejected.toFixed(2)}
      </div>
      <div style={{ fontSize: 12, color: "#334155" }}>
        Evidence: {family.evidence.slice(0, 5).join(" • ")}
      </div>

      {suggestions.length > 0 ? (
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#0f172a" }}>Suggested overrides</div>
          {suggestions.slice(0, 5).map((suggestion) => (
            <div key={suggestion.suggestionId} style={{ border: "1px solid #d9e2ec", borderRadius: 8, padding: 8, background: "#fff", display: "grid", gap: 5 }}>
              <div style={{ fontSize: 12, color: "#334155" }}>
                {suggestion.acordCode || suggestion.kind}: {suggestion.reason}
              </div>
              <button
                type="button"
                onClick={() => {
                  acceptSuggestion(suggestion);
                  setStatus(`Accepted suggestion for ${suggestion.acordCode || suggestion.familyId}.`);
                }}
              >
                Accept into next profile version
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {status ? <div style={{ fontSize: 12, color: "#334155" }}>{status}</div> : null}
    </section>
  );
}
