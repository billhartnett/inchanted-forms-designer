"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSemanticNeighborhoods = buildSemanticNeighborhoods;
exports.buildMultiTokenSemanticWindows = buildMultiTokenSemanticWindows;
exports.buildSemanticLattice = buildSemanticLattice;
exports.resolveCarrierSpecificSemanticPriors = resolveCarrierSpecificSemanticPriors;
exports.scoreContextAwareSemanticCandidate = scoreContextAwareSemanticCandidate;
exports.fuseSemanticAndGeometryScores = fuseSemanticAndGeometryScores;
function normalizeToken(token) {
    return String(token || "")
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "")
        .trim();
}
function stableId(parts) {
    return parts
        .map((part) => normalizeToken(part))
        .filter((part) => part.length > 0)
        .join("::");
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
function buildSemanticNeighborhoods(tokens, radius = 2) {
    const normalized = tokens.map(normalizeToken).filter((token) => token.length > 0);
    const boundedRadius = Math.max(1, Math.min(6, Math.floor(radius)));
    const neighborhoods = [];
    for (let index = 0; index < normalized.length; index += 1) {
        const anchorToken = normalized[index];
        const start = Math.max(0, index - boundedRadius);
        const end = Math.min(normalized.length, index + boundedRadius + 1);
        const neighborTokens = normalized
            .slice(start, end)
            .filter((token, innerIndex) => start + innerIndex !== index)
            .sort((left, right) => left.localeCompare(right));
        neighborhoods.push({
            anchorToken,
            neighborTokens,
            neighborhoodId: stableId(["nh", String(index), anchorToken]),
        });
    }
    return neighborhoods;
}
function buildMultiTokenSemanticWindows(tokens, minWindowSize = 2, maxWindowSize = 4) {
    const normalized = tokens.map(normalizeToken).filter((token) => token.length > 0);
    const minSize = Math.max(1, Math.min(8, Math.floor(minWindowSize)));
    const maxSize = Math.max(minSize, Math.min(8, Math.floor(maxWindowSize)));
    const windows = [];
    for (let size = minSize; size <= maxSize; size += 1) {
        for (let startIndex = 0; startIndex + size <= normalized.length; startIndex += 1) {
            const endIndex = startIndex + size - 1;
            const windowTokens = normalized.slice(startIndex, endIndex + 1);
            windows.push({
                startIndex,
                endIndex,
                tokens: windowTokens,
                windowId: stableId(["win", String(startIndex), String(endIndex), ...windowTokens]),
            });
        }
    }
    return windows;
}
function buildSemanticLattice(neighborhoods, windows) {
    const nodeMap = new Map();
    const edges = [];
    for (const neighborhood of neighborhoods) {
        const anchorNodeId = stableId(["node", neighborhood.anchorToken, neighborhood.neighborhoodId]);
        if (!nodeMap.has(anchorNodeId)) {
            nodeMap.set(anchorNodeId, {
                nodeId: anchorNodeId,
                token: neighborhood.anchorToken,
                layer: 0,
            });
        }
        for (const neighborToken of neighborhood.neighborTokens) {
            const neighborNodeId = stableId(["node", neighborToken]);
            if (!nodeMap.has(neighborNodeId)) {
                nodeMap.set(neighborNodeId, {
                    nodeId: neighborNodeId,
                    token: neighborToken,
                    layer: 1,
                });
            }
            edges.push({
                fromNodeId: anchorNodeId,
                toNodeId: neighborNodeId,
                edgeType: "neighbor",
            });
        }
    }
    for (const window of windows) {
        for (let index = 0; index < window.tokens.length - 1; index += 1) {
            const fromNodeId = stableId(["node", window.tokens[index]]);
            const toNodeId = stableId(["node", window.tokens[index + 1]]);
            if (!nodeMap.has(fromNodeId)) {
                nodeMap.set(fromNodeId, {
                    nodeId: fromNodeId,
                    token: window.tokens[index],
                    layer: 2,
                });
            }
            if (!nodeMap.has(toNodeId)) {
                nodeMap.set(toNodeId, {
                    nodeId: toNodeId,
                    token: window.tokens[index + 1],
                    layer: 2,
                });
            }
            edges.push({
                fromNodeId,
                toNodeId,
                edgeType: "window",
            });
        }
    }
    const nodes = [...nodeMap.values()].sort((left, right) => left.layer - right.layer || left.nodeId.localeCompare(right.nodeId));
    const dedupedEdges = [...new Map(edges.map((edge) => [stableId([edge.fromNodeId, edge.toNodeId, edge.edgeType]), edge])).values()]
        .sort((left, right) => left.fromNodeId.localeCompare(right.fromNodeId) ||
        left.toNodeId.localeCompare(right.toNodeId) ||
        left.edgeType.localeCompare(right.edgeType));
    return {
        nodes,
        edges: dedupedEdges,
    };
}
function resolveCarrierSpecificSemanticPriors(carrierId, globalPriors, carrierPriorMap) {
    const normalizedCarrier = normalizeToken(carrierId || "");
    const carrierPriors = normalizedCarrier.length > 0 && carrierPriorMap && carrierPriorMap[normalizedCarrier]
        ? carrierPriorMap[normalizedCarrier]
        : [];
    const combined = [...globalPriors, ...carrierPriors]
        .map((entry) => ({
        concept: normalizeToken(entry.concept),
        weight: clamp01(entry.weight),
    }))
        .filter((entry) => entry.concept.length > 0)
        .sort((left, right) => left.concept.localeCompare(right.concept) || right.weight - left.weight);
    const byConcept = new Map();
    for (const prior of combined) {
        const existing = byConcept.get(prior.concept);
        if (!existing || prior.weight > existing.weight) {
            byConcept.set(prior.concept, prior);
        }
    }
    return [...byConcept.values()].sort((left, right) => left.concept.localeCompare(right.concept));
}
function scoreContextAwareSemanticCandidate(input) {
    const tokenOverlap = clamp01(input.tokenOverlapScore);
    const neighborhoodCoverage = clamp01(input.neighborhoodCoverage);
    const latticeConnectivity = clamp01(input.latticeConnectivity);
    const carrierPriorWeight = clamp01(input.carrierPriorWeight || 0);
    const contextBoost = clamp01(input.contextBoost || 0);
    const baseScore = tokenOverlap * 0.34 +
        neighborhoodCoverage * 0.24 +
        latticeConnectivity * 0.22 +
        carrierPriorWeight * 0.12 +
        contextBoost * 0.08;
    return clamp01(baseScore);
}
function fuseSemanticAndGeometryScores(input) {
    const semanticConfidence = clamp01(input.semanticConfidence);
    const geometryConfidence = clamp01(input.geometryConfidence);
    const confidenceTotal = semanticConfidence + geometryConfidence;
    const semanticContribution = confidenceTotal > 0
        ? semanticConfidence / confidenceTotal
        : 0.5;
    const geometryContribution = 1 - semanticContribution;
    const fusedScore = clamp01(clamp01(input.semanticScore) * semanticContribution +
        clamp01(input.geometryScore) * geometryContribution);
    return {
        fusedScore,
        semanticContribution: Number(semanticContribution.toFixed(6)),
        geometryContribution: Number(geometryContribution.toFixed(6)),
    };
}
