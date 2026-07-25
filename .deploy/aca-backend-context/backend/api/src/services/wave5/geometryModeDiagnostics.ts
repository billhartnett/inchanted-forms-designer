import {
  GeometryCluster,
  MultiBlockGeometryContext,
} from "./geometryArchitectureScaffold";
import {
  SemanticGeometryFusionIntegrationResult,
  summarizeSemanticGeometryFusionDiagnostics,
} from "./semanticGeometryFusionIntegrationScaffold";

export type GeometryModeDiagnosticsInput = {
  carrierId?: string;
  pageIndex: number;
  clusterCount: number;
  clusters: GeometryCluster[];
  context: MultiBlockGeometryContext;
  fusionResults: SemanticGeometryFusionIntegrationResult[];
  stageLatencyMs?: number;
};

export type GeometryModeDiagnostics = {
  mode: "geometry";
  carrierId: string;
  pageIndex: number;
  clusterCount: number;
  maxClusterSize: number;
  contextBlockCount: number;
  topFusionCandidateId: string | null;
  topFusionScore: number;
  meanFusionScore: number;
  stageLatencyMs: number;
  hotspot: "none" | "clustering" | "fusion";
};

function normalizeCarrierId(carrierId: string | undefined): string {
  return String(carrierId || "global").trim().toLowerCase().replace(/[^a-z0-9_]/g, "") || "global";
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return Number(value.toFixed(6));
}

export function emitGeometryModeDiagnostics(
  input: GeometryModeDiagnosticsInput,
): GeometryModeDiagnostics {
  const fusionSummary = summarizeSemanticGeometryFusionDiagnostics(input.fusionResults);
  const maxClusterSize = input.clusters.reduce(
    (max, cluster) => Math.max(max, cluster.blockIds.length),
    0,
  );

  const stageLatencyMs = Math.max(0, Number((input.stageLatencyMs || 0).toFixed(3)));
  const hotspot =
    stageLatencyMs >= 120
      ? "fusion"
      : maxClusterSize >= 8
        ? "clustering"
        : "none";

  return {
    mode: "geometry",
    carrierId: normalizeCarrierId(input.carrierId),
    pageIndex: Math.max(0, Math.floor(input.pageIndex || 0)),
    clusterCount: Math.max(0, input.clusterCount),
    maxClusterSize,
    contextBlockCount: input.context.contextBlockIds.length,
    topFusionCandidateId: fusionSummary.topCandidateId,
    topFusionScore: clamp01(fusionSummary.topFusedScore),
    meanFusionScore: clamp01(fusionSummary.meanFusedScore),
    stageLatencyMs,
    hotspot,
  };
}
