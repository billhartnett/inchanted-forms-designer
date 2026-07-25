"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.emitGeometryModeDiagnostics = emitGeometryModeDiagnostics;
const semanticGeometryFusionIntegrationScaffold_1 = require("./semanticGeometryFusionIntegrationScaffold");
function normalizeCarrierId(carrierId) {
    return String(carrierId || "global").trim().toLowerCase().replace(/[^a-z0-9_]/g, "") || "global";
}
function clamp01(value) {
    if (!Number.isFinite(value))
        return 0;
    if (value <= 0)
        return 0;
    if (value >= 1)
        return 1;
    return Number(value.toFixed(6));
}
function emitGeometryModeDiagnostics(input) {
    const fusionSummary = (0, semanticGeometryFusionIntegrationScaffold_1.summarizeSemanticGeometryFusionDiagnostics)(input.fusionResults);
    const maxClusterSize = input.clusters.reduce((max, cluster) => Math.max(max, cluster.blockIds.length), 0);
    const stageLatencyMs = Math.max(0, Number((input.stageLatencyMs || 0).toFixed(3)));
    const hotspot = stageLatencyMs >= 120
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
