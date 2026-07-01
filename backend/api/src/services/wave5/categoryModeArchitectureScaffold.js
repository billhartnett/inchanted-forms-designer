"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveCategoryModePriors = resolveCategoryModePriors;
exports.buildCategoryModeSemanticWindows = buildCategoryModeSemanticWindows;
exports.resolveCategoryModeGeometryPatterns = resolveCategoryModeGeometryPatterns;
exports.resolveCategoryModeOverrideTables = resolveCategoryModeOverrideTables;
exports.integrateCategoryModeScoring = integrateCategoryModeScoring;
exports.resolveCategoryForCode = resolveCategoryForCode;
const acordTaxonomy_1 = require("../acordTaxonomy");
function normalizeToken(token) {
    return String(token || "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .trim();
}
function toTokens(text) {
    return String(text || "")
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .map((token) => token.trim())
        .filter((token) => token.length > 0);
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
function stableId(parts) {
    return parts
        .map((part) => normalizeToken(part))
        .filter((part) => part.length > 0)
        .join("::");
}
function resolveGlobalPriors() {
    return [
        { category: "insured", weight: 0.56, source: "global" },
        { category: "risk", weight: 0.52, source: "global" },
        { category: "policy", weight: 0.49, source: "global" },
        { category: "carrier", weight: 0.46, source: "global" },
    ];
}
function resolveCarrierPriors(carrierId) {
    const normalized = normalizeToken(carrierId || "");
    if (!normalized)
        return [];
    const carrierMap = {
        acord: [{ category: "policy", weight: 0.58, source: "carrier" }],
        iso: [{ category: "risk", weight: 0.57, source: "carrier" }],
    };
    return carrierMap[normalized] || [];
}
function resolveCategoryModePriors(categories, carrierId) {
    const byCategory = new Map();
    const evidenceCounts = new Map();
    for (const category of categories) {
        const normalized = normalizeToken(category);
        if (!normalized)
            continue;
        evidenceCounts.set(normalized, (evidenceCounts.get(normalized) || 0) + 1);
    }
    const inputs = [...resolveGlobalPriors(), ...resolveCarrierPriors(carrierId)];
    for (const prior of inputs) {
        const existing = byCategory.get(prior.category);
        if (!existing || prior.weight > existing.weight) {
            byCategory.set(prior.category, {
                category: prior.category,
                weight: clamp01(prior.weight),
                source: prior.source,
            });
        }
    }
    const totalEvidence = Math.max(1, [...evidenceCounts.values()].reduce((sum, count) => sum + count, 0));
    for (const [category, count] of evidenceCounts.entries()) {
        const evidenceWeight = clamp01(0.35 + count / totalEvidence);
        const existing = byCategory.get(category);
        if (!existing || evidenceWeight > existing.weight) {
            byCategory.set(category, {
                category,
                weight: evidenceWeight,
                source: "evidence",
            });
        }
    }
    return [...byCategory.values()].sort((left, right) => right.weight - left.weight || left.category.localeCompare(right.category));
}
function buildCategoryModeSemanticWindows(blockText, minWindowSize = 2, maxWindowSize = 4) {
    const tokens = toTokens(blockText);
    const windows = [];
    const minSize = Math.max(1, Math.min(12, Math.floor(minWindowSize)));
    const maxSize = Math.max(minSize, Math.min(12, Math.floor(maxWindowSize)));
    for (let size = minSize; size <= maxSize; size += 1) {
        for (let startIndex = 0; startIndex + size <= tokens.length; startIndex += 1) {
            const endIndex = startIndex + size - 1;
            const windowTokens = tokens.slice(startIndex, endIndex + 1);
            windows.push({
                windowId: stableId(["cat", "win", String(startIndex), String(endIndex), ...windowTokens]),
                startIndex,
                endIndex,
                tokens: windowTokens,
            });
        }
    }
    return windows;
}
function resolveCategoryModeGeometryPatterns(carrierId) {
    const basePatterns = [
        { patternId: "insured-header", labelTokens: ["insured", "name"], weight: 0.72 },
        { patternId: "risk-location", labelTokens: ["location", "risk"], weight: 0.69 },
        { patternId: "policy-period", labelTokens: ["policy", "effective"], weight: 0.66 },
    ];
    const normalized = normalizeToken(carrierId || "");
    if (!normalized) {
        return basePatterns;
    }
    const carrierPatterns = {
        acord: [{ patternId: "acord-applicant", labelTokens: ["applicant", "insured"], weight: 0.74 }],
        iso: [{ patternId: "iso-premises", labelTokens: ["premises", "location"], weight: 0.73 }],
    };
    return [...basePatterns, ...(carrierPatterns[normalized] || [])].sort((left, right) => right.weight - left.weight || left.patternId.localeCompare(right.patternId));
}
function resolveCategoryModeOverrideTables(blockText, carrierId) {
    const text = ` ${toTokens(blockText).join(" ")} `;
    const defaultRules = [
        {
            ruleId: "insured-name-routing",
            triggerTokens: ["insured", "name"],
            targetAcordCodes: ["INSURED_NAME"],
            boost: 0.12,
        },
        {
            ruleId: "policy-number-routing",
            triggerTokens: ["policy", "number"],
            targetAcordCodes: ["POLICY_NUMBER"],
            boost: 0.12,
        },
    ];
    const normalized = normalizeToken(carrierId || "");
    const carrierRules = normalized
        ? [
            {
                ruleId: `${normalized}-producer-code-routing`,
                triggerTokens: ["producer", "code"],
                targetAcordCodes: ["PRODUCER_CODE"],
                boost: 0.1,
            },
        ]
        : [];
    const allRules = [...defaultRules, ...carrierRules];
    return allRules.filter((rule) => rule.triggerTokens.every((token) => text.includes(` ${normalizeToken(token)} `)));
}
function computeWindowCoverage(candidateTokens, windows) {
    if (windows.length === 0)
        return 0;
    let bestCoverage = 0;
    for (const window of windows) {
        if (window.tokens.length === 0)
            continue;
        const matched = window.tokens.filter((token) => candidateTokens.has(token)).length;
        bestCoverage = Math.max(bestCoverage, matched / window.tokens.length);
    }
    return clamp01(bestCoverage);
}
function computePatternScore(candidateTokens, patterns) {
    if (patterns.length === 0)
        return 0;
    let best = 0;
    for (const pattern of patterns) {
        const overlap = pattern.labelTokens.filter((token) => candidateTokens.has(normalizeToken(token))).length;
        const normalizedOverlap = pattern.labelTokens.length > 0 ? overlap / pattern.labelTokens.length : 0;
        best = Math.max(best, normalizedOverlap * clamp01(pattern.weight));
    }
    return clamp01(best);
}
function resolveOverrideBoost(acordCode, rules) {
    let boost = 0;
    for (const rule of rules) {
        if (rule.targetAcordCodes.includes(acordCode)) {
            boost = Math.max(boost, clamp01(rule.boost));
        }
    }
    return clamp01(boost);
}
function integrateCategoryModeScoring(input) {
    const priorByCategory = new Map(input.priors.map((prior) => [normalizeToken(prior.category), clamp01(prior.weight)]));
    const scored = input.candidates.map((candidate) => {
        const candidateTokens = new Set(toTokens(candidate.label));
        const priorContribution = clamp01(priorByCategory.get(normalizeToken(candidate.category)) || 0);
        const semanticWindowContribution = computeWindowCoverage(candidateTokens, input.semanticWindows);
        const geometryPatternContribution = computePatternScore(candidateTokens, input.geometryPatterns);
        const overrideContribution = resolveOverrideBoost(candidate.acordCode, input.overrideRules);
        const fusedScore = clamp01(clamp01(candidate.baseConfidence) * 0.4 +
            clamp01(candidate.semanticScore) * 0.2 +
            clamp01(candidate.geometryScore) * 0.2 +
            priorContribution * 0.1 +
            semanticWindowContribution * 0.06 +
            geometryPatternContribution * 0.02 +
            overrideContribution * 0.02);
        return {
            candidateId: candidate.candidateId,
            acordCode: candidate.acordCode,
            category: candidate.category,
            fusedScore,
            priorContribution,
            semanticWindowContribution,
            geometryPatternContribution,
            overrideContribution,
        };
    });
    return scored.sort((left, right) => right.fusedScore - left.fusedScore ||
        right.priorContribution - left.priorContribution ||
        left.acordCode.localeCompare(right.acordCode));
}
function resolveCategoryForCode(acordCode) {
    return normalizeToken((0, acordTaxonomy_1.getCategoryForAcordCode)(acordCode) || "uncategorized") || "uncategorized";
}
