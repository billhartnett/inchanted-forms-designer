"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapBlocksWithAcord = mapBlocksWithAcord;
exports.getLastReducerDebugSnapshot = getLastReducerDebugSnapshot;
const mappingEngine_1 = require("../api/src/services/mappingEngine");
const mappingRationale_1 = require("./mappingRationale");
const quality_1 = require("shared/quality");
const wave8Gating_1 = require("./wave8Gating");
async function mapBlocksWithAcord(blocks, options) {
    const mappings = await (0, mappingEngine_1.mapBlocksToAcord)(blocks, options);
    const gatedMappings = (0, wave8Gating_1.applyWave8Gating)(mappings);
    const payload = {
        version: 1,
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
    const conflictReport = (0, quality_1.resolveSemanticConflicts)(payload, {
        familyId: options?.familyId,
        calibrationProfile: options?.calibrationProfile,
    });
    const resolutionByBlock = new Map(conflictReport.decisions
        .filter((decision) => Boolean(decision.extractionBlockId) && Boolean(decision.resolvedAcordCode))
        .map((decision) => [decision.extractionBlockId, decision]));
    return gatedMappings.map((mapping) => {
        const resolution = resolutionByBlock.get(mapping.blockId);
        const preserveTargetedAnchorPromotion = Boolean(mapping?.mappingDiagnostics?.wave8TargetedAnchorPromoted);
        const resolvedChosen = preserveTargetedAnchorPromotion
            ? mapping.chosen
            : resolution && mapping.suggestions.length
                ? mapping.suggestions.find((item) => item.acordCode === resolution.resolvedAcordCode) ||
                    mapping.chosen
                : mapping.chosen;
        const rationale = (0, mappingRationale_1.buildMappingRationale)({
            ...mapping,
            chosen: resolvedChosen,
        });
        const conflictsForBlock = conflictReport.conflicts.filter((conflict) => conflict.extractionBlockIds.includes(mapping.blockId));
        const memoryEntry = options?.semanticMemorySnapshot?.entries.find((entry) => entry.groupId === resolvedChosen?.unification?.groupId) || undefined;
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
function getLastReducerDebugSnapshot() {
    return (0, mappingEngine_1.getLastReducerDebugSnapshot)();
}
