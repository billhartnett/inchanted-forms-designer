"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.emitCategoryModeDiagnostics = emitCategoryModeDiagnostics;
function normalizeCarrierId(carrierId) {
    return String(carrierId || "global")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "") || "global";
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
function emitCategoryModeDiagnostics(input) {
    const sorted = [...input.scoringResults].sort((left, right) => right.fusedScore - left.fusedScore ||
        left.acordCode.localeCompare(right.acordCode));
    const top = sorted[0];
    const meanCategoryScore = sorted.length > 0
        ? sorted.reduce((sum, entry) => sum + entry.fusedScore, 0) / sorted.length
        : 0;
    const tieBreakStable = sorted.length <= 1
        ? true
        : sorted.every((entry, index) => {
            if (index === 0)
                return true;
            const prior = sorted[index - 1];
            if (prior.fusedScore !== entry.fusedScore)
                return true;
            return prior.acordCode.localeCompare(entry.acordCode) <= 0;
        });
    const stageLatencyMs = Math.max(0, Number((input.stageLatencyMs || 0).toFixed(3)));
    const hotspot = stageLatencyMs >= 120
        ? "scoring"
        : input.semanticWindows.length >= 18
            ? "windows"
            : "none";
    return {
        mode: "category",
        carrierId: normalizeCarrierId(input.carrierId),
        pageIndex: Math.max(0, Math.floor(input.pageIndex || 0)),
        priorsCount: input.priors.length,
        semanticWindowCount: input.semanticWindows.length,
        geometryPatternCount: input.geometryPatterns.length,
        overrideMatchCount: input.overrideRules.length,
        topCategoryCandidateId: top?.candidateId || null,
        topCategoryScore: clamp01(top?.fusedScore || 0),
        meanCategoryScore: clamp01(meanCategoryScore),
        tieBreakStable,
        stageLatencyMs,
        hotspot,
    };
}
