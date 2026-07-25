import {
  GeometryBlock,
  CarrierGeometryPattern,
  applyCarrierPatternAdjustments,
  scoreRelativeGeometryCandidate,
} from "./geometryArchitectureScaffold";
import { fuseSemanticAndGeometryScores } from "./semanticArchitectureScaffold";

export type SemanticGeometryFusionCandidate = {
  candidateId: string;
  anchorBlock: GeometryBlock;
  candidateBlock: GeometryBlock;
  semanticScore: number;
  semanticConfidence: number;
  geometryConfidence: number;
};

export type SemanticGeometryFusionIntegrationInput = {
  candidates: SemanticGeometryFusionCandidate[];
  carrierPatterns?: CarrierGeometryPattern[];
};

export type SemanticGeometryFusionIntegrationResult = {
  candidateId: string;
  semanticScore: number;
  geometryScore: number;
  fusedScore: number;
  semanticContribution: number;
  geometryContribution: number;
  matchedCarrierPatternIds: string[];
};

export type SemanticGeometryFusionDiagnostics = {
  candidateCount: number;
  topCandidateId: string | null;
  topFusedScore: number;
  meanFusedScore: number;
  maxSemanticContribution: number;
  maxGeometryContribution: number;
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return Number(value.toFixed(6));
}

export function integrateSemanticGeometryFusion(
  input: SemanticGeometryFusionIntegrationInput,
): SemanticGeometryFusionIntegrationResult[] {
  const patterns = input.carrierPatterns || [];

  const results = input.candidates.map((candidate) => {
    const rawGeometryScore = scoreRelativeGeometryCandidate({
      anchor: candidate.anchorBlock,
      candidate: candidate.candidateBlock,
    });

    const adjustedGeometry = applyCarrierPatternAdjustments(
      rawGeometryScore,
      candidate.candidateBlock,
      patterns,
    );

    const fused = fuseSemanticAndGeometryScores({
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

  return results.sort(
    (left, right) =>
      right.fusedScore - left.fusedScore ||
      right.semanticScore - left.semanticScore ||
      left.candidateId.localeCompare(right.candidateId),
  );
}

export function summarizeSemanticGeometryFusionDiagnostics(
  results: SemanticGeometryFusionIntegrationResult[],
): SemanticGeometryFusionDiagnostics {
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
  const meanFusedScore =
    results.reduce((sum, result) => sum + result.fusedScore, 0) / results.length;

  const maxSemanticContribution = results.reduce(
    (max, result) => Math.max(max, result.semanticContribution),
    0,
  );
  const maxGeometryContribution = results.reduce(
    (max, result) => Math.max(max, result.geometryContribution),
    0,
  );

  return {
    candidateCount: results.length,
    topCandidateId: top.candidateId,
    topFusedScore: clamp01(top.fusedScore),
    meanFusedScore: clamp01(meanFusedScore),
    maxSemanticContribution: clamp01(maxSemanticContribution),
    maxGeometryContribution: clamp01(maxGeometryContribution),
  };
}
