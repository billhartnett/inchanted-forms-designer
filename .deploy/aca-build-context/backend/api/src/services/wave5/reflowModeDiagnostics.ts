import type {
  ReflowMultiStageResult,
  ReflowParallelEvaluationResult,
} from "./reflowArchitectureScaffold";

export type ReflowModeDiagnosticsInput = {
  carrierId?: string;
  pageIndex: number;
  candidateCount: number;
  multiStageResults: ReflowMultiStageResult[];
  parallelResults: ReflowParallelEvaluationResult[];
  topFusionScore: number;
  stageLatencyMs?: number;
};

export type ReflowModeDiagnostics = {
  mode: "reflow";
  carrierId: string;
  pageIndex: number;
  candidateCount: number;
  stageCount: number;
  parallelCandidateCount: number;
  topFusionScore: number;
  meanStageThreeScore: number;
  stageLatencyMs: number;
  hotspot: "none" | "parallel" | "fusion";
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return Number(value.toFixed(6));
}

function normalizeCarrierId(value: string | undefined): string {
  return String(value || "global")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "") || "global";
}

export function emitReflowModeDiagnostics(
  input: ReflowModeDiagnosticsInput,
): ReflowModeDiagnostics {
  const meanStageThreeScore =
    input.multiStageResults.length > 0
      ? input.multiStageResults.reduce((sum, item) => sum + item.stageThreeScore, 0) /
        input.multiStageResults.length
      : 0;

  const stageLatencyMs = Math.max(0, Number((input.stageLatencyMs || 0).toFixed(3)));
  const hotspot =
    stageLatencyMs >= 140
      ? "fusion"
      : input.parallelResults.length >= 8
        ? "parallel"
        : "none";

  return {
    mode: "reflow",
    carrierId: normalizeCarrierId(input.carrierId),
    pageIndex: Math.max(0, Math.floor(input.pageIndex || 0)),
    candidateCount: Math.max(0, input.candidateCount),
    stageCount: 3,
    parallelCandidateCount: input.parallelResults.length,
    topFusionScore: clamp01(input.topFusionScore),
    meanStageThreeScore: clamp01(meanStageThreeScore),
    stageLatencyMs,
    hotspot,
  };
}
