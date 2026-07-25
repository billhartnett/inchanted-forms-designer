"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMappingConfidenceBand = getMappingConfidenceBand;
exports.isAutoMappable = isAutoMappable;
function getMappingConfidenceBand(score) {
    if (score >= 0.8)
        return "high";
    if (score >= 0.6)
        return "medium";
    if (score >= 0.45)
        return "low";
    return "abstain";
}
function isAutoMappable(score) {
    return getMappingConfidenceBand(score) !== "abstain";
}
