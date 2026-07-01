"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.integrateSemanticGeometryFusion = integrateSemanticGeometryFusion;
exports.summarizeSemanticGeometryFusionDiagnostics = summarizeSemanticGeometryFusionDiagnostics;
const geometryArchitectureScaffold_1 = require("./geometryArchitectureScaffold");
const semanticArchitectureScaffold_1 = require("./semanticArchitectureScaffold");
function clamp01(value) {
    if (!Number.isFinite(value))
        return 0;
    if (value <= 0)
        return 0;
    if (value >= 1)
        return 1;
    return Number(value.toFixed(6));
}
function integrateSemanticGeometryFusion(input) {
    const patterns = input.carrierPatterns || [];
    const results = input.candidates.map((candidate) => {
        const rawGeometryScore = (0, geometryArchitectureScaffold_1.scoreRelativeGeometryCandidate)({
            anchor: candidate.anchorBlock,
            candidate: candidate.candidateBlock,
        });
        const adjustedGeometry = (0, geometryArchitectureScaffold_1.applyCarrierPatternAdjustments)(rawGeometryScore, candidate.candidateBlock, patterns);
        const fused = (0, semanticArchitectureScaffold_1.fuseSemanticAndGeometryScores)({
            semanticScore: candidate.semanticScore,
            geometryScore: adjustedGeometry.score,
            semanticConfidence: candidate.semanticConfidence,
            geometryConfidence: candidate.geometryConfidence,
        });
        return {
            candidateId: candidate.candidateId,
            semanticScore: clamp01(candidate.semanticScore),
            geometryScore: clamp01(adjustedGeometry.score),
            fusedScore: clamp01(fused.fusedScore),
            semanticContribution: clamp01(fused.semanticContribution),
            geometryContribution: clamp01(fused.geometryContribution),
            matchedCarrierPatternIds: adjustedGeometry.matchedPatternIds,
        };
    });
    return results.sort((left, right) => right.fusedScore - left.fusedScore ||
        right.semanticScore - left.semanticScore ||
        left.candidateId.localeCompare(right.candidateId));
}
function summarizeSemanticGeometryFusionDiagnostics(results) {
    if (results.length === 0) {
        return {
            candidateCount: 0,
            topCandidateId: null,
            topFusedScore: 0,
            meanFusedScore: 0,
            maxSemanticContribution: 0,
            maxGeometryContribution: 0,
        };
    }
    const top = results[0];
    const meanFusedScore = results.reduce((sum, result) => sum + result.fusedScore, 0) / results.length;
    const maxSemanticContribution = results.reduce((max, result) => Math.max(max, result.semanticContribution), 0);
    const maxGeometryContribution = results.reduce((max, result) => Math.max(max, result.geometryContribution), 0);
    return {
        candidateCount: results.length,
        topCandidateId: top.candidateId,
        topFusedScore: clamp01(top.fusedScore),
        meanFusedScore: clamp01(meanFusedScore),
        maxSemanticContribution: clamp01(maxSemanticContribution),
        maxGeometryContribution: clamp01(maxGeometryContribution),
    };
}
