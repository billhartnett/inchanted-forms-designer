import type {
  SemanticMemoryDecision,
  SemanticMemoryEntry,
  SemanticMemoryRecommendation,
  SemanticMemorySnapshot,
} from "../acord";
import {
  evaluateSemanticFusion,
  type CrossDocumentFusionConflict,
  type SemanticFusionReport,
} from "./semanticFusion";
import type { MappingPersistencePayload } from "../types";

type FusionDocument = {
  fixtureId: string;
  payload: MappingPersistencePayload;
};

export type LongitudinalMemoryDifference = {
  key: string;
  baselineValue: string | number | null;
  currentValue: string | number | null;
};

export type LongitudinalMemoryDriftReport = {
  hasDrift: boolean;
  driftHash: string;
  differences: LongitudinalMemoryDifference[];
  confidenceDrift: number;
  conflictRecurrenceDelta: number;
  stabilityDrift: number;
};

export type PrioritizedConflictRecurrence = {
  conflictId: string;
  groupId: string;
  canonicalCode: string;
  class: CrossDocumentFusionConflict["class"];
  recurrence: number;
  severityScore: number;
  priority: "low" | "medium" | "high";
  warning: string;
};

const CANONICAL_GENERATED_AT = "1970-01-01T00:00:00.000Z";

function toFixed(value: number): number {
  return Number(value.toFixed(6));
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return toFixed(values.reduce((sum, current) => sum + current, 0) / values.length);
}

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

function recurrenceWeight(conflictClass: CrossDocumentFusionConflict["class"]): number {
  if (conflictClass === "cross-ontology-disagreement") return 1;
  if (conflictClass === "cross-family-disagreement") return 0.7;
  return 0.45;
}

function mergeLineage(values: string[]): string[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}

function applyDecisionsToSnapshot(
  snapshot: SemanticMemorySnapshot,
  decisions: SemanticMemoryDecision[],
): SemanticMemorySnapshot {
  if (!decisions.length) {
    return snapshot;
  }

  const sortedDecisions = [...decisions].sort((left, right) =>
    left.decisionId.localeCompare(right.decisionId),
  );

  const pinned = [...sortedDecisions]
    .reverse()
    .find((decision) => decision.action === "pin" && decision.targetVersionId);

  return {
    ...snapshot,
    pinnedVersionId: pinned?.targetVersionId || snapshot.pinnedVersionId,
    lineage: mergeLineage([
      ...snapshot.lineage,
      ...sortedDecisions.map((decision) =>
        `memory.decision:${decision.action}:${decision.targetVersionId || "none"}:${decision.groupId || "all"}`,
      ),
    ]),
  };
}

export function buildSemanticMemorySnapshot(
  documents: FusionDocument[],
  options?: {
    previousSnapshot?: SemanticMemorySnapshot;
    decisions?: SemanticMemoryDecision[];
  },
): SemanticMemorySnapshot {
  const fusion = evaluateSemanticFusion(documents, {
    fusionOverrides: documents.flatMap((document) => document.payload.fusionOverrides || []),
  });

  return updateSemanticMemoryFromFusion(fusion, options);
}

export function updateSemanticMemoryFromFusion(
  fusion: SemanticFusionReport,
  options?: {
    previousSnapshot?: SemanticMemorySnapshot;
    decisions?: SemanticMemoryDecision[];
  },
): SemanticMemorySnapshot {
  const previous = options?.previousSnapshot;
  const previousByGroup = new Map(
    (previous?.entries || []).map((entry) => [entry.groupId, entry]),
  );

  const conflictWeightByGroup = new Map<string, number>();
  for (const conflict of fusion.conflicts) {
    const current = conflictWeightByGroup.get(conflict.groupId) || 0;
    conflictWeightByGroup.set(
      conflict.groupId,
      toFixed(current + recurrenceWeight(conflict.class)),
    );
  }

  const entries: SemanticMemoryEntry[] = fusion.profiles
    .map((profile) => {
      const previousEntry = previousByGroup.get(profile.groupId);
      const previousConfidence = previousEntry?.confidenceHistory || [];
      const previousRationale = previousEntry?.rationaleHistory || [];
      const nextConfidenceHistory = [...previousConfidence, profile.fusedConfidenceScore].slice(-12);
      const nextRationaleHistory = [...previousRationale, profile.rationaleDistribution].slice(-12);
      const previousOccurrence = previousEntry?.occurrenceCount || 0;
      const nextOccurrence = previousOccurrence + profile.documentIds.length;
      const previousRecurrence = previousEntry?.conflictRecurrence || 0;
      const nextRecurrence = toFixed(
        previousRecurrence + (conflictWeightByGroup.get(profile.groupId) || 0),
      );
      const confidenceStability =
        nextConfidenceHistory.length <= 1
          ? 1
          : 1 -
            clamp01(
              Math.abs(
                nextConfidenceHistory[nextConfidenceHistory.length - 1] -
                  nextConfidenceHistory[0],
              ),
            );
      const recurrencePenalty = clamp01(nextRecurrence / Math.max(1, nextOccurrence));
      const stabilityScore = toFixed(clamp01(confidenceStability * (1 - recurrencePenalty * 0.5)));

      return {
        groupId: profile.groupId,
        canonicalCode: profile.canonicalCode,
        equivalentCodes: [...profile.equivalentCodes].sort((a, b) => a.localeCompare(b)),
        representativeCode: profile.acordCode,
        occurrenceCount: nextOccurrence,
        confidenceHistory: nextConfidenceHistory.map((value) => toFixed(value)),
        rationaleHistory: nextRationaleHistory,
        families: [...profile.families].sort((a, b) => a.localeCompare(b)),
        ontologyNamespaces: [...profile.ontologyNamespaces].sort((a, b) => a.localeCompare(b)),
        conflictRecurrence: nextRecurrence,
        lastSeenAt: CANONICAL_GENERATED_AT,
        stabilityScore,
        lineage: mergeLineage([
          ...(previousEntry?.lineage || []),
          ...profile.lineage,
          `memory.group=${profile.groupId}`,
          `memory.occurrence=${nextOccurrence}`,
          `memory.stability=${stabilityScore}`,
        ]),
      };
    })
    .sort((left, right) =>
      left.canonicalCode.localeCompare(right.canonicalCode) ||
      left.groupId.localeCompare(right.groupId),
    );

  const nextVersion = (previous ? Number(previous.versionId.replace("memory-v", "")) || 0 : 0) + 1;
  const versionId = `memory-v${nextVersion}`;
  const seed = {
    versionId,
    sourceProfileHash: fusion.profileHash,
    sourceUnificationHash: fusion.unificationHash,
    sourceConflictHash: fusion.conflictHash,
    entries,
  };

  const snapshot: SemanticMemorySnapshot = {
    generatedAt: CANONICAL_GENERATED_AT,
    versionId,
    memoryHash: hashString(stableSerialize(seed)),
    sourceProfileHash: fusion.profileHash,
    sourceUnificationHash: fusion.unificationHash,
    sourceConflictHash: fusion.conflictHash,
    pinnedVersionId: previous?.pinnedVersionId,
    entries,
    lineage: mergeLineage([
      `memory.version=${versionId}`,
      `memory.source.profile=${fusion.profileHash}`,
      `memory.source.unification=${fusion.unificationHash}`,
      `memory.source.conflict=${fusion.conflictHash}`,
    ]),
  };

  return applyDecisionsToSnapshot(snapshot, options?.decisions || []);
}

export function prioritizeConflictRecurrence(
  fusion: SemanticFusionReport,
  snapshot?: SemanticMemorySnapshot,
): PrioritizedConflictRecurrence[] {
  const recurrenceByGroup = new Map(
    (snapshot?.entries || []).map((entry) => [entry.groupId, entry.conflictRecurrence]),
  );

  return fusion.conflicts
    .map((conflict) => {
      const recurrence = recurrenceByGroup.get(conflict.groupId) || 0;
      const severityScore = toFixed(
        clamp01(
          recurrenceWeight(conflict.class) * 0.6 +
            Math.min(1, recurrence / 10) * 0.4,
        ),
      );
      const priority: PrioritizedConflictRecurrence["priority"] =
        severityScore >= 0.75 ? "high" : severityScore >= 0.45 ? "medium" : "low";

      return {
        conflictId: conflict.conflictId,
        groupId: conflict.groupId,
        canonicalCode: conflict.canonicalCode,
        class: conflict.class,
        recurrence: toFixed(recurrence),
        severityScore,
        priority,
        warning: conflict.warning,
      };
    })
    .sort((left, right) =>
      right.severityScore - left.severityScore || left.conflictId.localeCompare(right.conflictId),
    );
}

export function generateSemanticMemoryRecommendations(
  fusion: SemanticFusionReport,
  snapshot?: SemanticMemorySnapshot,
): SemanticMemoryRecommendation[] {
  const entryByGroup = new Map((snapshot?.entries || []).map((entry) => [entry.groupId, entry]));
  const prioritizedConflicts = prioritizeConflictRecurrence(fusion, snapshot);
  const conflictScoreByGroup = new Map(
    prioritizedConflicts.map((conflict) => [conflict.groupId, conflict.severityScore]),
  );

  return fusion.profiles
    .map((profile) => {
      const memoryEntry = entryByGroup.get(profile.groupId);
      const conflictSeverity = conflictScoreByGroup.get(profile.groupId) || 0;
      const memoryStability = memoryEntry?.stabilityScore || 0;
      const confidence = toFixed(
        clamp01(profile.fusedConfidenceScore * 0.65 + memoryStability * 0.35 - conflictSeverity * 0.2),
      );
      const priority: SemanticMemoryRecommendation["priority"] =
        confidence < 0.55 || conflictSeverity >= 0.7
          ? "high"
          : confidence < 0.75 || conflictSeverity >= 0.45
            ? "medium"
            : "low";

      return {
        recommendationId: `rec-${hashString(`${profile.groupId}:${profile.acordCode}`)}`,
        groupId: profile.groupId,
        recommendedCode: profile.acordCode,
        confidence,
        priority,
        reason:
          priority === "high"
            ? "Conflict recurrence or instability detected; reviewer confirmation is recommended."
            : "Longitudinal semantic memory supports this selection.",
        basedOnVersionId: snapshot?.versionId || "memory-v0",
        lineage: mergeLineage([
          ...(memoryEntry?.lineage || []),
          ...profile.lineage,
          `memory.recommendation.priority=${priority}`,
          `memory.recommendation.confidence=${confidence}`,
        ]),
      };
    })
    .sort((left, right) =>
      left.groupId.localeCompare(right.groupId) ||
      left.recommendedCode.localeCompare(right.recommendedCode),
    );
}

export function evaluateLongitudinalMemoryDrift(
  baseline: SemanticMemorySnapshot | undefined,
  current: SemanticMemorySnapshot,
): LongitudinalMemoryDriftReport {
  if (!baseline) {
    return {
      hasDrift: false,
      driftHash: hashString(stableSerialize({ baseline: null, current: current.memoryHash })),
      differences: [],
      confidenceDrift: 0,
      conflictRecurrenceDelta: 0,
      stabilityDrift: 0,
    };
  }

  const baselineConfidence = average(
    baseline.entries.map((entry) => entry.confidenceHistory[entry.confidenceHistory.length - 1] || 0),
  );
  const currentConfidence = average(
    current.entries.map((entry) => entry.confidenceHistory[entry.confidenceHistory.length - 1] || 0),
  );
  const baselineRecurrence = toFixed(
    baseline.entries.reduce((sum, entry) => sum + entry.conflictRecurrence, 0),
  );
  const currentRecurrence = toFixed(
    current.entries.reduce((sum, entry) => sum + entry.conflictRecurrence, 0),
  );
  const baselineStability = average(baseline.entries.map((entry) => entry.stabilityScore));
  const currentStability = average(current.entries.map((entry) => entry.stabilityScore));

  const differences: LongitudinalMemoryDifference[] = [
    {
      key: "memoryHash",
      baselineValue: baseline.memoryHash,
      currentValue: current.memoryHash,
    },
    {
      key: "versionId",
      baselineValue: baseline.versionId,
      currentValue: current.versionId,
    },
    {
      key: "entryCount",
      baselineValue: baseline.entries.length,
      currentValue: current.entries.length,
    },
    {
      key: "avgConfidence",
      baselineValue: baselineConfidence,
      currentValue: currentConfidence,
    },
    {
      key: "conflictRecurrence",
      baselineValue: baselineRecurrence,
      currentValue: currentRecurrence,
    },
    {
      key: "avgStability",
      baselineValue: baselineStability,
      currentValue: currentStability,
    },
  ].filter((item) => item.baselineValue !== item.currentValue);

  return {
    hasDrift: differences.length > 0,
    driftHash: hashString(
      stableSerialize({
        baseline: baseline.memoryHash,
        current: current.memoryHash,
        differences,
      }),
    ),
    differences,
    confidenceDrift: toFixed(currentConfidence - baselineConfidence),
    conflictRecurrenceDelta: toFixed(currentRecurrence - baselineRecurrence),
    stabilityDrift: toFixed(currentStability - baselineStability),
  };
}

