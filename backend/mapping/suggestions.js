"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchAcordLabels = searchAcordLabels;
exports.lookupAcordLabel = lookupAcordLabel;
exports.listAcordLabels = listAcordLabels;
exports.getAcordDictionarySummary = getAcordDictionarySummary;
exports.suggestAcordLabel = suggestAcordLabel;
const acordDictionary_1 = require("./acordDictionary");
function searchAcordLabels(query, limit = 20) {
    return (0, acordDictionary_1.searchAcordDictionary)(query, limit);
}
function lookupAcordLabel(acordCode) {
    return (0, acordDictionary_1.lookupAcordByCode)(acordCode);
}
function listAcordLabels() {
    return (0, acordDictionary_1.getAllAcordEntries)();
}
function getAcordDictionarySummary() {
    return (0, acordDictionary_1.getAcordDictionaryState)();
}
function suggestAcordLabel(text, context) {
    const combined = `${text} ${context ?? ""}`.trim();
    const [best] = (0, acordDictionary_1.searchAcordDictionary)(combined, 1);
    if (!best) {
        return {
            acordCode: "ACORD.UNKNOWN",
            label: "Unknown Field",
            confidenceScore: 0.5,
            source: "ai",
        };
    }
    const confidenceScore = Math.min(0.99, 0.5 + best.score / 300);
    return {
        acordCode: best.entry.acordCode,
        label: best.entry.label,
        description: best.entry.description,
        confidenceScore: Number(confidenceScore.toFixed(2)),
        source: "ai",
    };
}
