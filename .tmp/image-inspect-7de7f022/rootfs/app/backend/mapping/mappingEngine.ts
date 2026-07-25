import type { ExtractedBlock, FieldMapping, MappingPersistencePayload } from "shared/types";
import {
  getLastReducerDebugSnapshot as getServiceReducerDebugSnapshot,
  mapBlocksToAcord,
  type ReducerDebugSnapshot,
} from "../api/src/services/mappingEngine";
import { buildMappingRationale } from "./mappingRationale";
import type { CalibrationProfile } from "shared/types";
import { resolveSemanticConflicts } from "shared/quality";
import type { ConflictResolutionDecision } from "shared/quality";
import { applyWave8Gating } from "./wave8Gating";

export async function mapBlocksWithAcord(
  blocks: ExtractedBlock[],
  options?: {
    context?: string;
    deterministic?: boolean;
    calibrationProfile?: CalibrationProfile;
    familyId?: string;
    semanticMemorySnapshot?: MappingPersistencePayload["semanticMemorySnapshot"];
    semanticMemoryDecisions?: MappingPersistencePayload["semanticMemoryDecisions"];
    layoutLmPrimaryClassifier?: boolean;
    wave5GeometryEnabled?: boolean;
    wave5CategoryModeEnabled?: boolean;
    wave5ReflowEnabled?: boolean;
    wave5TuningProfile?: {
      stageOneBaseWeight?: number;
      stageOneSemanticWeight?: number;
      stageTwoStageOneWeight?: number;
      stageTwoGeometryWeight?: number;
      stageThreeStageTwoWeight?: number;
      stageThreeCategoryWeight?: number;
      stageThreeBias?: number;
      fusionSemanticWeight?: number;
      fusionGeometryWeight?: number;
      fusionCategoryWeight?: number;
      contextBoostScale?: number;
      carrierBaseBoost?: number;
      carrierTokenBoost?: number;
      carrierPolicyBoost?: number;
    };
    layoutLmByBlock?: Record<
      string,
      {
        page: number;
        tokenCount: number;
        topPredictions: Array<{
          eLabelName: string;
          logit: number;
          probability: number;
        }>;
      }
    >;
    carrierAdapterOverrides?: MappingPersistencePayload["carrierAdapterOverrides"];
    underwritingRuleOverrides?: MappingPersistencePayload["underwritingRuleOverrides"];
  },
): Promise<FieldMapping[]> {
  const mappings = await mapBlocksToAcord(blocks, options);

  const gatedMappings = applyWave8Gating(mappings);

  const payload = {
    version: 1 as const,
    documentId: "in-memory-document",
    pages: [],
    fields: [],
    mappings: gatedMappings.map((mapping) => ({
      extractionBlockId: mapping.blockId,
      mapping,
    })),
    decisionGraph: {
      labels: {},
      fields: {},
      mappings: {},
      confidenceThresholds: {
        accepted: 0.8,
        review: 0.6,
        rejected: 0.45,
      },
    },
    overrides: {},
    suppressedOcrBlockIds: [],
    associationEdits: [],
    schemaArtifacts: [],
    calibrationProfile: options?.calibrationProfile,
    formFamily: options?.familyId
      ? {
          familyId: options.familyId,
          familyLabel: options.familyId,
          confidence: 1,
          signatureHash: "runtime",
          layoutSignature: [],
          semanticSignature: [],
          evidence: [],
          classifiedAt: new Date().toISOString(),
          classifierVersion: "runtime",
        }
      : undefined,
    semanticMemorySnapshot: options?.semanticMemorySnapshot,
    semanticMemoryDecisions: options?.semanticMemoryDecisions,
    carrierAdapterOverrides: options?.carrierAdapterOverrides,
    underwritingRuleOverrides: options?.underwritingRuleOverrides,
  };

  const conflictReport = resolveSemanticConflicts(payload, {
    familyId: options?.familyId,
    calibrationProfile: options?.calibrationProfile,
  });

  const resolutionByBlock = new Map<string, ConflictResolutionDecision>(
    conflictReport.decisions
      .filter((decision) => Boolean(decision.extractionBlockId) && Boolean(decision.resolvedAcordCode))
      .map((decision) => [decision.extractionBlockId, decision]),
  );

  return gatedMappings.map((mapping) => {
    const resolution = resolutionByBlock.get(mapping.blockId);
    const preserveTargetedAnchorPromotion = Boolean(
      (mapping as any)?.mappingDiagnostics?.wave8TargetedAnchorPromoted,
    );
    const resolvedChosen =
      preserveTargetedAnchorPromotion
        ? mapping.chosen
        : resolution && mapping.suggestions.length
        ? mapping.suggestions.find((item) => item.acordCode === resolution.resolvedAcordCode) ||
          mapping.chosen
        : mapping.chosen;

    const rationale = buildMappingRationale({
      ...mapping,
      chosen: resolvedChosen,
    });

    const conflictsForBlock = conflictReport.conflicts.filter((conflict) =>
      conflict.extractionBlockIds.includes(mapping.blockId),
    );
    const memoryEntry =
      options?.semanticMemorySnapshot?.entries.find(
        (entry) => entry.groupId === resolvedChosen?.unification?.groupId,
      ) || undefined;

    return {
      ...mapping,
      chosen: resolvedChosen,
      rationale: {
        ...rationale,
        arbitrationEvidence: resolution ? [resolution.reason] : [],
        memoryEvidence: memoryEntry
          ? [
              `Memory version ${options?.semanticMemorySnapshot?.versionId || "unknown"}`,
              `Stability ${Math.round(memoryEntry.stabilityScore * 100)}%`,
              `Occurrences ${memoryEntry.occurrenceCount}`,
            ]
          : [],
        memoryLineage: memoryEntry?.lineage || [],
        conflictLineage: conflictsForBlock.flatMap((conflict) => conflict.lineage || []),
      },
    };
  });
}

export function getLastReducerDebugSnapshot(): ReducerDebugSnapshot {
  return getServiceReducerDebugSnapshot();
}