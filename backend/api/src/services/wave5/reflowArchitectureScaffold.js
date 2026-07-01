"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runMultiStageScoring = runMultiStageScoring;
exports.evaluateCandidatesInParallel = evaluateCandidatesInParallel;
exports.fuseSemanticGeometryCategory = fuseSemanticGeometryCategory;
exports.applyCarrierAwareScoring = applyCarrierAwareScoring;
exports.rerankWithContext = rerankWithContext;
function clamp01(value) {
    if (!Number.isFinite(value))
        return 0;
    if (value <= 0)
        return 0;
    if (value >= 1)
        return 1;
    return Number(value.toFixed(6));
}
function normalizeToken(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .trim();
}
function tokenize(value) {
    return String(value || "")
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .map((token) => token.trim())
        .filter((token) => token.length > 0);
}
function resolveTuning(profile) {
    const env = (name, fallback) => {
        const value = Number.parseFloat(process.env[name] || "");
        return Number.isFinite(value) ? value : fallback;
    };
    return {
        stageOneBaseWeight: Number(profile?.stageOneBaseWeight ?? env("WAVE5_TUNE_STAGE1_BASE_WEIGHT", 0.55)),
        stageOneSemanticWeight: Number(profile?.stageOneSemanticWeight ?? env("WAVE5_TUNE_STAGE1_SEM_WEIGHT", 0.45)),
        stageTwoStageOneWeight: Number(profile?.stageTwoStageOneWeight ?? env("WAVE5_TUNE_STAGE2_STAGE1_WEIGHT", 0.7)),
        stageTwoGeometryWeight: Number(profile?.stageTwoGeometryWeight ?? env("WAVE5_TUNE_STAGE2_GEOM_WEIGHT", 0.3)),
        stageThreeStageTwoWeight: Number(profile?.stageThreeStageTwoWeight ?? env("WAVE5_TUNE_STAGE3_STAGE2_WEIGHT", 0.75)),
        stageThreeCategoryWeight: Number(profile?.stageThreeCategoryWeight ?? env("WAVE5_TUNE_STAGE3_CAT_WEIGHT", 0.25)),
        stageThreeBias: Number(profile?.stageThreeBias ?? env("WAVE5_TUNE_STAGE3_BIAS", 0)),
        fusionSemanticWeight: Number(profile?.fusionSemanticWeight ?? env("WAVE5_TUNE_FUSION_SEM_WEIGHT", 0.42)),
        fusionGeometryWeight: Number(profile?.fusionGeometryWeight ?? env("WAVE5_TUNE_FUSION_GEOM_WEIGHT", 0.28)),
        fusionCategoryWeight: Number(profile?.fusionCategoryWeight ?? env("WAVE5_TUNE_FUSION_CAT_WEIGHT", 0.3)),
        contextBoostScale: Number(profile?.contextBoostScale ?? env("WAVE5_TUNE_RERANK_CONTEXT_BOOST", 0.04)),
        carrierBaseBoost: Number(profile?.carrierBaseBoost ?? env("WAVE5_TUNE_CARRIER_BASE_BOOST", 0.02)),
        carrierTokenBoost: Number(profile?.carrierTokenBoost ?? env("WAVE5_TUNE_CARRIER_TOKEN_BOOST", 0.015)),
        carrierPolicyBoost: Number(profile?.carrierPolicyBoost ?? env("WAVE5_TUNE_CARRIER_POLICY_BOOST", 0.01)),
    };
}
function runMultiStageScoring(candidates, tuningProfile) {
    const tuning = resolveTuning(tuningProfile);
    const stageResults = candidates.map((candidate) => {
        const stageOneScore = clamp01(candidate.baseScore * tuning.stageOneBaseWeight +
            candidate.semanticScore * tuning.stageOneSemanticWeight);
        const stageTwoScore = clamp01(stageOneScore * tuning.stageTwoStageOneWeight +
            candidate.geometryScore * tuning.stageTwoGeometryWeight);
        const stageThreeScore = clamp01(stageTwoScore * tuning.stageThreeStageTwoWeight +
            candidate.categoryScore * tuning.stageThreeCategoryWeight +
            tuning.stageThreeBias);
        return {
            candidateId: candidate.candidateId,
            acordCode: candidate.acordCode,
            stageOneScore,
            stageTwoScore,
            stageThreeScore,
        };
    });
    return stageResults.sort((left, right) => right.stageThreeScore - left.stageThreeScore || left.candidateId.localeCompare(right.candidateId));
}
async function evaluateCandidatesInParallel(stageResults) {
    const evaluations = await Promise.all(stageResults.map(async (item) => ({
        candidateId: item.candidateId,
        acordCode: item.acordCode,
        score: clamp01(item.stageThreeScore),
        evaluator: "parallel",
    })));
    return evaluations.sort((left, right) => right.score - left.score || left.candidateId.localeCompare(right.candidateId));
}
function fuseSemanticGeometryCategory(input, tuningProfile) {
    const tuning = resolveTuning(tuningProfile);
    return clamp01(clamp01(input.semanticScore) * tuning.fusionSemanticWeight +
        clamp01(input.geometryScore) * tuning.fusionGeometryWeight +
        clamp01(input.categoryScore) * tuning.fusionCategoryWeight);
}
function applyCarrierAwareScoring(input, tuningProfile) {
    const tuning = resolveTuning(tuningProfile);
    const normalizedCarrier = normalizeToken(input.carrierId || "");
    const text = ` ${tokenize(input.blockText || "").join(" ")} `;
    let boost = 0;
    if (normalizedCarrier)
        boost += tuning.carrierBaseBoost;
    if (text.includes(" carrier "))
        boost += tuning.carrierTokenBoost;
    if (text.includes(" policy "))
        boost += tuning.carrierPolicyBoost;
    return clamp01(clamp01(input.score) + boost);
}
function rerankWithContext(candidates, options) {
    const tuning = resolveTuning(options?.tuningProfile);
    const contextTokens = new Set(tokenize(options?.contextText || options?.blockText || ""));
    const reranked = candidates.map((candidate) => {
        const codeTokens = tokenize(candidate.acordCode);
        const overlap = codeTokens.length > 0
            ? codeTokens.filter((token) => contextTokens.has(token)).length / codeTokens.length
            : 0;
        const contextBoost = clamp01(overlap) * tuning.contextBoostScale;
        return {
            ...candidate,
            score: clamp01(candidate.score + contextBoost),
        };
    });
    return reranked.sort((left, right) => right.score - left.score || left.acordCode.localeCompare(right.acordCode));
}
