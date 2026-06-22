import type {
  AcordLabelCandidate,
  ConflictOverride,
  GlobalSemanticGraphSnapshot,
  OntologyArbitrationDecision,
  SemanticConflictRecord,
} from "../acord";
import {
  arbitrateCandidateByOntology,
  selectOntologyBundlesForFamily,
} from "../acord/multiOntology";
import type {
  CalibrationProfile,
  MappingPersistencePayload,
  MappingReviewRecord,
} from "../types";
import { createDefaultCalibrationProfile } from "./evaluation";
import {
  buildGlobalSemanticGraph,
  inferCandidateFromGlobalGraph,
} from "./globalSemanticGraph";
import { evaluateCandidateUnderwritingRules } from "./underwritingRules";

export type ConflictResolutionDecision = {
  conflictId: string;
  extractionBlockId: string;
  resolvedAcordCode: string;
  score: number;
  reason: string;
  lineage: string[];
};

export type SemanticConflictReport = {
  generatedAt: string;
  documentId: string;
  ontologyNamespaces: string[];
  conflicts: SemanticConflictRecord[];
  decisions: ConflictResolutionDecision[];
  conflictHash: string;
};

export type CrossOntologyConsistencyReport = {
  generatedAt: string;
  documents: number;
  namespaces: string[];
  transferabilityScore: number;
  confidenceDrift: number;
  rationaleSignalDrift: number;
  candidateStabilityDrift: number;
};

function hashString(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort((a, b) =>
      a[0].localeCompare(b[0]),
    );
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveCandidate(record: MappingReviewRecord): AcordLabelCandidate | undefined {
  const chosenCode = record.mapping.chosen?.acordCode;
  if (!chosenCode) return undefined;
  return (
    record.mapping.suggestions.find((item) => item.acordCode === chosenCode) ||
    record.mapping.chosen
  );
}

function scoreCandidate(
  candidate: AcordLabelCandidate,
  calibration: CalibrationProfile,
): number {
  const weights = calibration.signalWeights;
  const total = Math.max(
    0.000001,
    weights.embedding + weights.lexical + weights.dictionary + weights.heuristic,
  );
  const evidence =
    (candidate.semanticSimilarity || 0) * (weights.embedding / total) +
    (candidate.lexicalScore || 0) * (weights.lexical / total) +
    (candidate.dictionaryScore || 0) * (weights.dictionary / total) +
    (candidate.heuristicScore || 0) * (weights.heuristic / total);
  const ontologyPenalty = (candidate.ontology?.violatedConstraints?.length || 0) > 0 ? 0.2 : 0;
  return Number(
    (
      ((candidate.normalizedConfidenceScore || candidate.confidenceScore) * 0.7 + evidence * 0.3) *
      (1 - ontologyPenalty)
    ).toFixed(6),
  );
}

function buildConflictId(seed: string): string {
  return `conflict-${hashString(seed)}`;
}

function severityForScore(score: number): "low" | "medium" | "high" {
  if (score >= 0.8) return "high";
  if (score >= 0.55) return "medium";
  return "low";
}

export function detectSemanticConflicts(
  payload: MappingPersistencePayload,
  options?: {
    familyId?: string;
    calibrationProfile?: CalibrationProfile;
  },
): SemanticConflictRecord[] {
  const familyId = options?.familyId || payload.formFamily?.familyId || "unknown-family";
  const bundles = selectOntologyBundlesForFamily(familyId);
  const calibration = options?.calibrationProfile || payload.calibrationProfile || createDefaultCalibrationProfile();
  const conflicts: SemanticConflictRecord[] = [];
  const byText = new Map<string, Array<{ record: MappingReviewRecord; candidate: AcordLabelCandidate }>>();

  for (const record of payload.mappings) {
    const candidate = resolveCandidate(record);
    if (!candidate) continue;

    const normalizedText = normalizeText(record.mapping.text || "");
    const entries = byText.get(normalizedText) || [];
    entries.push({ record, candidate });
    byText.set(normalizedText, entries);

    const disagreement =
      Math.abs((candidate.semanticSimilarity || 0) - (candidate.lexicalScore || 0)) > 0.45;
    if (disagreement && candidate.confidenceScore >= calibration.globalThresholds.review) {
      const conflictId = buildConflictId(`${record.extractionBlockId}:rationale`);
      conflicts.push({
        conflictId,
        class: "rationale-disagreement",
        extractionBlockIds: [record.extractionBlockId],
        candidateCodes: [candidate.acordCode],
        severity: severityForScore(candidate.confidenceScore),
        resolved: false,
        rationale: "Semantic and lexical evidence diverge under calibrated review threshold.",
        lineage: [
          `signal.embedding=${(candidate.semanticSimilarity || 0).toFixed(3)}`,
          `signal.lexical=${(candidate.lexicalScore || 0).toFixed(3)}`,
        ],
      });
    }

    if ((candidate.ontology?.violatedConstraints?.length || 0) > 0) {
      const conflictId = buildConflictId(`${record.extractionBlockId}:ontology`);
      conflicts.push({
        conflictId,
        class: "ontology-violation",
        extractionBlockIds: [record.extractionBlockId],
        candidateCodes: [candidate.acordCode],
        severity: severityForScore(candidate.confidenceScore),
        resolved: false,
        rationale: "Chosen candidate violates ontology constraints.",
        lineage: [...(candidate.ontology?.violatedConstraints || [])],
      });
    }

    const arbitration = arbitrateCandidateByOntology(candidate, bundles);
    if (arbitration.overriddenNamespaces.length > 0) {
      const conflictId = buildConflictId(`${record.extractionBlockId}:arbitration`);
      conflicts.push({
        conflictId,
        class: "cross-ontology-disagreement",
        extractionBlockIds: [record.extractionBlockId],
        candidateCodes: [candidate.acordCode],
        severity: severityForScore(candidate.confidenceScore),
        resolved: false,
        rationale: arbitration.reason,
        lineage: [
          `winner=${arbitration.winningNamespace}`,
          `overridden=${arbitration.overriddenNamespaces.join(",")}`,
        ],
      });
    }

    const text = normalizeText(record.mapping.text || "");
    if (
      text.includes("city") &&
      !normalizeText(candidate.acordCode).includes("city") &&
      candidate.confidenceScore >= calibration.globalThresholds.review
    ) {
      const conflictId = buildConflictId(`${record.extractionBlockId}:context-city`);
      conflicts.push({
        conflictId,
        class: "document-context-mismatch",
        extractionBlockIds: [record.extractionBlockId],
        candidateCodes: [candidate.acordCode],
        severity: "medium",
        resolved: false,
        rationale: "Document context indicates city-like field but chosen code does not.",
        lineage: ["context=city"],
      });
    }
  }

  for (const [normalizedText, entries] of byText.entries()) {
    if (!normalizedText || entries.length < 2) continue;
    const uniqueCodes = Array.from(new Set(entries.map((item) => item.candidate.acordCode))).sort((a, b) =>
      a.localeCompare(b),
    );
    if (uniqueCodes.length < 2) continue;

    const allHighConfidence = entries.every(
      (item) => item.candidate.confidenceScore >= calibration.globalThresholds.review,
    );
    if (!allHighConfidence) continue;

    const conflictId = buildConflictId(`${normalizedText}:candidate`);
    conflicts.push({
      conflictId,
      class: "candidate-contradiction",
      extractionBlockIds: entries.map((item) => item.record.extractionBlockId).sort((a, b) =>
        a.localeCompare(b),
      ),
      candidateCodes: uniqueCodes,
      severity: "high",
      resolved: false,
      rationale: "Multiple high-confidence candidates conflict for similar extracted text.",
      lineage: [`normalizedText=${normalizedText}`],
    });
  }

  return conflicts.sort(
    (left, right) =>
      left.class.localeCompare(right.class) || left.conflictId.localeCompare(right.conflictId),
  );
}

export function resolveSemanticConflicts(
  payload: MappingPersistencePayload,
  options?: {
    familyId?: string;
    calibrationProfile?: CalibrationProfile;
    conflictOverrides?: ConflictOverride[];
    graphSnapshot?: GlobalSemanticGraphSnapshot;
  },
): SemanticConflictReport {
  const familyId = options?.familyId || payload.formFamily?.familyId || "unknown-family";
  const bundles = selectOntologyBundlesForFamily(familyId);
  const namespaces = bundles.map((bundle) => bundle.metadata.namespace);
  const calibration = options?.calibrationProfile || payload.calibrationProfile || createDefaultCalibrationProfile();
  const overrides = options?.conflictOverrides || payload.conflictOverrides || [];
  const graphSnapshot =
    options?.graphSnapshot ||
    payload.globalSemanticGraphSnapshot ||
    buildGlobalSemanticGraph([{ fixtureId: payload.documentId || "unknown-document", payload }]).snapshot;
  const conflicts = detectSemanticConflicts(payload, { familyId, calibrationProfile: calibration });
  const chosenCodes = payload.mappings
    .map((record) => record.mapping.chosen?.acordCode)
    .filter((code): code is string => Boolean(code));
  const byBlock = new Map(payload.mappings.map((record) => [record.extractionBlockId, record]));

  const decisions: ConflictResolutionDecision[] = conflicts.map((conflict) => {
    const override = overrides.find((item) => item.conflictId === conflict.conflictId);
    if (override) {
      return {
        conflictId: conflict.conflictId,
        extractionBlockId: override.extractionBlockId,
        resolvedAcordCode: override.forcedAcordCode,
        score: 1,
        reason: "reviewer-override",
        lineage: [
          `override.changedAt=${override.changedAt}`,
          `override.reason=${override.reason || "none"}`,
        ],
      };
    }

    const candidates: Array<{
      extractionBlockId: string;
      candidate: AcordLabelCandidate;
      arbitration: OntologyArbitrationDecision;
      score: number;
    }> = [];

    for (const extractionBlockId of conflict.extractionBlockIds) {
      const record = byBlock.get(extractionBlockId);
      if (!record) continue;
      const candidate = resolveCandidate(record);
      if (!candidate) continue;
      const arbitration = arbitrateCandidateByOntology(candidate, bundles);
      const baseScore = scoreCandidate(candidate, calibration);
      const graphInference = inferCandidateFromGlobalGraph(candidate, graphSnapshot) || {
        inferred: false,
        confidence: 0,
        evidence: [],
        recommendedCodes: [],
        lineage: ["graph.inference=none"],
      };
      const underwritingRules =
        candidate.underwritingRules ||
        evaluateCandidateUnderwritingRules(candidate, {
          blockText: record.mapping.text || "",
          chosenCodes,
          familyId,
          extractionBlockId,
          overrides: payload.underwritingRuleOverrides || [],
        });
      const resolvedUnderwriting = underwritingRules;
      const score = Number(
        (
          baseScore * 0.72 +
          arbitration.score * 0.12 +
          graphInference.confidence * 0.08 +
          resolvedUnderwriting.scoreDelta * 0.08 -
          (resolvedUnderwriting.hardFailures.length > 0 ? 0.2 : 0)
        ).toFixed(6),
      );
      candidates.push({
        extractionBlockId,
        candidate: {
          ...candidate,
          underwritingRules: resolvedUnderwriting,
        },
        arbitration,
        score,
      });
    }

    candidates.sort(
      (left, right) =>
        right.score - left.score ||
        left.candidate.acordCode.localeCompare(right.candidate.acordCode) ||
        left.extractionBlockId.localeCompare(right.extractionBlockId),
    );

    const winner = candidates[0];

    return {
      conflictId: conflict.conflictId,
      extractionBlockId: winner?.extractionBlockId || conflict.extractionBlockIds[0] || "unknown-block",
      resolvedAcordCode: winner?.candidate.acordCode || conflict.candidateCodes[0] || "",
      score: winner?.score || 0,
      reason: winner ? winner.arbitration.reason : "no-candidate",
      lineage: [
        ...conflict.lineage,
        `resolver.score=${(winner?.score || 0).toFixed(6)}`,
        `resolver.namespace=${winner?.arbitration.winningNamespace || "acord-core"}`,
        ...(winner
          ? (inferCandidateFromGlobalGraph(winner.candidate, graphSnapshot)?.lineage || [])
          : []),
      ],
    };
  });

  const merged = conflicts.map((conflict) => {
    const decision = decisions.find((item) => item.conflictId === conflict.conflictId);
    return {
      ...conflict,
      resolved: Boolean(decision),
      resolutionCode: decision?.resolvedAcordCode,
      lineage: Array.from(new Set([...(conflict.lineage || []), ...(decision?.lineage || [])])),
    };
  });

  const conflictHash = hashString(
    stableSerialize({
      conflicts: merged.map((item) => ({
        conflictId: item.conflictId,
        class: item.class,
        resolutionCode: item.resolutionCode,
        severity: item.severity,
      })),
      decisions,
    }),
  );

  return {
    generatedAt: new Date().toISOString(),
    documentId: payload.documentId || "unknown-document",
    ontologyNamespaces: namespaces,
    conflicts: merged,
    decisions,
    conflictHash,
  };
}

export function evaluateCrossOntologyConsistency(
  documents: Array<{ fixtureId: string; payload: MappingPersistencePayload }>,
): CrossOntologyConsistencyReport {
  const namespaceTotals = new Map<string, number[]>();

  for (const document of documents) {
    const bundles = selectOntologyBundlesForFamily(document.payload.formFamily?.familyId);
    const report = resolveSemanticConflicts(document.payload, {
      familyId: document.payload.formFamily?.familyId,
    });

    for (const namespace of report.ontologyNamespaces) {
      const values = namespaceTotals.get(namespace) || [];
      values.push(1 - report.conflicts.length / Math.max(1, document.payload.mappings.length));
      namespaceTotals.set(namespace, values);
    }

    for (const bundle of bundles) {
      const values = namespaceTotals.get(bundle.metadata.namespace) || [];
      values.push(bundle.metadata.precedence / 300);
      namespaceTotals.set(bundle.metadata.namespace, values);
    }
  }

  const namespaces = Array.from(namespaceTotals.keys()).sort((a, b) => a.localeCompare(b));
  const averages = namespaces.map((namespace) => {
    const values = namespaceTotals.get(namespace) || [];
    return values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : 0;
  });

  const globalAvg = averages.length
    ? averages.reduce((sum, value) => sum + value, 0) / averages.length
    : 0;

  const confidenceDrift = Number(
    (
      averages.reduce((sum, value) => sum + Math.abs(value - globalAvg), 0) /
      Math.max(1, averages.length)
    ).toFixed(6),
  );

  return {
    generatedAt: new Date().toISOString(),
    documents: documents.length,
    namespaces,
    transferabilityScore: Number((1 - confidenceDrift).toFixed(6)),
    confidenceDrift,
    rationaleSignalDrift: Number((confidenceDrift * 0.85).toFixed(6)),
    candidateStabilityDrift: Number((confidenceDrift * 1.1).toFixed(6)),
  };
}
