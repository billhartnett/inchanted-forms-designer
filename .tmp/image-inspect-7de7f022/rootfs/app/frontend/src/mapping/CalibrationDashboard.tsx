import { useMemo, useState } from "react";
import {
  createDefaultCalibrationProfile,
  evaluateMappingQuality,
} from "../../../shared/src/quality";
import type {
  CalibrationProfile,
  MappingPersistencePayload,
  ReviewConfidenceThresholds,
} from "../../../shared/src/types";
import { useDesignerStore } from "../designer/state/useDesignerStore";
import { useExtractionStore } from "../state/extractionStore";
import { useMappingStore } from "../state/mappingStore";

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

function quantize(value: number): number {
  return Number(value.toFixed(3));
}

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
    calibrationProfile: mappingState.calibrationProfile,
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

function updateThresholds(
  profile: CalibrationProfile,
  thresholds: ReviewConfidenceThresholds,
): CalibrationProfile {
  return {
    ...profile,
    globalThresholds: thresholds,
    updatedAt: new Date().toISOString(),
  };
}

export function CalibrationDashboard() {
  const documentId = useMappingStore((state) => state.documentId);
  const mappingCount = useMappingStore((state) => Object.keys(state.mappings).length);
  const schemaArtifacts = useMappingStore((state) => state.schemaArtifacts);
  const calibrationProfile = useMappingStore((state) => state.calibrationProfile);
  const setCalibrationProfile = useMappingStore((state) => state.setCalibrationProfile);
  const loadCalibrationProfile = useMappingStore((state) => state.loadCalibrationProfile);
  const saveCalibrationProfile = useMappingStore((state) => state.saveCalibrationProfile);

  const [overrideCode, setOverrideCode] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const payload = useMemo(() => buildPayload(), [documentId, mappingCount, schemaArtifacts]);

  const report = useMemo(() => {
    if (!payload) {
      return null;
    }

    return evaluateMappingQuality({
      payload,
      fixtureId: payload.documentId,
      topN: 3,
      calibrationProfile: payload.calibrationProfile || createDefaultCalibrationProfile(),
    });
  }, [payload]);

  const handleGlobalThreshold = (key: keyof ReviewConfidenceThresholds, value: number) => {
    const next = {
      ...calibrationProfile.globalThresholds,
      [key]: clamp01(value),
    };
    const normalized: ReviewConfidenceThresholds = {
      accepted: Math.max(next.accepted, next.review),
      review: Math.max(next.review, next.rejected),
      rejected: next.rejected,
    };
    setCalibrationProfile(updateThresholds(calibrationProfile, normalized));
  };

  const handleSignalWeight = (
    key: keyof CalibrationProfile["signalWeights"],
    value: number,
  ) => {
    setCalibrationProfile({
      ...calibrationProfile,
      signalWeights: {
        ...calibrationProfile.signalWeights,
        [key]: Math.max(0, quantize(value)),
      },
      updatedAt: new Date().toISOString(),
    });
  };

  const handleApplyCodeOverride = () => {
    const code = overrideCode.trim();
    if (!code) {
      setStatus("Enter an ACORD code to create an override.");
      return;
    }

    setCalibrationProfile({
      ...calibrationProfile,
      codeThresholdOverrides: {
        ...calibrationProfile.codeThresholdOverrides,
        [code]: calibrationProfile.globalThresholds,
      },
      updatedAt: new Date().toISOString(),
    });
    setStatus(`Override created for ${code}.`);
  };

  const handleRemoveCodeOverride = (code: string) => {
    const next = { ...calibrationProfile.codeThresholdOverrides };
    delete next[code];
    setCalibrationProfile({
      ...calibrationProfile,
      codeThresholdOverrides: next,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleLoadProfile = async () => {
    setBusy(true);
    try {
      const profile = await loadCalibrationProfile(calibrationProfile.profileId);
      setStatus(`Loaded calibration profile ${profile.profileId} v${profile.version}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to load calibration profile.");
    } finally {
      setBusy(false);
    }
  };

  const handleSaveProfile = async () => {
    setBusy(true);
    try {
      const profile = await saveCalibrationProfile({
        reason: "reviewer-guided calibration",
        summary: "Updated from calibration dashboard controls",
      });
      setStatus(`Saved calibration profile ${profile.profileId} v${profile.version}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to save calibration profile.");
    } finally {
      setBusy(false);
    }
  };

  const handleGenerateReport = () => {
    if (!report || !payload?.documentId) {
      setStatus("No mapping payload available for calibration report generation.");
      return;
    }

    const content = `${JSON.stringify(report.calibration, null, 2)}\n`;
    downloadJson(content, `${payload.documentId}.calibration-report.json`);
    setStatus("Calibration report generated and downloaded.");
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
        <h3 style={{ marginTop: 0, marginBottom: 8 }}>Calibration dashboard</h3>
        <div style={{ fontSize: 12, color: "#475569" }}>
          Load mappings to calibrate confidence thresholds and rationale signal weights.
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
        gap: 10,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <h3 style={{ marginTop: 0, marginBottom: 0 }}>Calibration dashboard</h3>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={handleLoadProfile} disabled={busy}>
            Load profile
          </button>
          <button type="button" onClick={handleSaveProfile} disabled={busy}>
            Save profile
          </button>
          <button type="button" onClick={handleGenerateReport}>
            Generate Calibration Report
          </button>
        </div>
      </div>

      <div style={{ fontSize: 12, color: "#334155" }}>
        Profile {calibrationProfile.profileId} v{calibrationProfile.version} • calibrated accuracy {Math.round(report.calibration.calibratedAccuracy * 100)}% • signal stability {Math.round(report.calibration.rationaleWeightedSignalStability * 100)}%
      </div>

      <div style={{ display: "grid", gap: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#0f172a" }}>Global confidence thresholds</div>
        <label style={{ fontSize: 12, color: "#334155", display: "grid", gap: 4 }}>
          Accepted ({calibrationProfile.globalThresholds.accepted.toFixed(2)})
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={calibrationProfile.globalThresholds.accepted}
            onChange={(event) =>
              handleGlobalThreshold("accepted", Number(event.target.value))
            }
          />
        </label>
        <label style={{ fontSize: 12, color: "#334155", display: "grid", gap: 4 }}>
          Review ({calibrationProfile.globalThresholds.review.toFixed(2)})
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={calibrationProfile.globalThresholds.review}
            onChange={(event) =>
              handleGlobalThreshold("review", Number(event.target.value))
            }
          />
        </label>
        <label style={{ fontSize: 12, color: "#334155", display: "grid", gap: 4 }}>
          Rejected ({calibrationProfile.globalThresholds.rejected.toFixed(2)})
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={calibrationProfile.globalThresholds.rejected}
            onChange={(event) =>
              handleGlobalThreshold("rejected", Number(event.target.value))
            }
          />
        </label>
      </div>

      <div style={{ display: "grid", gap: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#0f172a" }}>Rationale signal weights</div>
        {(
          ["embedding", "lexical", "dictionary", "heuristic"] as const
        ).map((key) => (
          <label key={key} style={{ fontSize: 12, color: "#334155", display: "grid", gap: 4 }}>
            {key} ({calibrationProfile.signalWeights[key].toFixed(2)})
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={calibrationProfile.signalWeights[key]}
              onChange={(event) =>
                handleSignalWeight(key, Number(event.target.value))
              }
            />
          </label>
        ))}
      </div>

      <div style={{ display: "grid", gap: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#0f172a" }}>Per-ACORD threshold overrides</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            value={overrideCode}
            onChange={(event) => setOverrideCode(event.target.value)}
            placeholder="ACORD code"
            style={{ flex: 1 }}
          />
          <button type="button" onClick={handleApplyCodeOverride}>
            Add override
          </button>
        </div>
        {Object.entries(calibrationProfile.codeThresholdOverrides)
          .sort((a, b) => a[0].localeCompare(b[0]))
          .slice(0, 8)
          .map(([code, thresholds]) => (
            <div
              key={code}
              style={{
                border: "1px solid #d9e2ec",
                borderRadius: 8,
                padding: 8,
                background: "#ffffff",
                display: "flex",
                justifyContent: "space-between",
                gap: 8,
                fontSize: 12,
                color: "#334155",
              }}
            >
              <span>
                {code}: acc {thresholds.accepted.toFixed(2)} / rev {thresholds.review.toFixed(2)} / rej {thresholds.rejected.toFixed(2)}
              </span>
              <button type="button" onClick={() => handleRemoveCodeOverride(code)}>
                Remove
              </button>
            </div>
          ))}
      </div>

      <div style={{ fontSize: 12, color: "#334155" }}>
        Confidence distribution: {report.calibration.confidenceDistribution
          .map((bucket) => `${bucket.bucket}=${bucket.count}`)
          .join(" • ")}
      </div>

      <div style={{ fontSize: 12, color: "#334155" }}>
        Low-confidence fields {report.calibration.lowConfidenceFields.length} • disagreement clusters {report.calibration.unstableSignals.length}
      </div>

      <div style={{ display: "grid", gap: 4 }}>
        {report.calibration.perCodeProfiles.slice(0, 8).map((profile) => (
          <div key={profile.acordCode} style={{ fontSize: 12, color: "#475569" }}>
            {profile.acordCode}: avg {profile.avgConfidence.toFixed(3)}, threshold {profile.threshold.toFixed(3)}, below {profile.belowThresholdCount}/{profile.fields}
          </div>
        ))}
      </div>

      {status ? <div style={{ fontSize: 12, color: "#334155" }}>{status}</div> : null}
    </section>
  );
}
