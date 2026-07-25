"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeAcordEntry = normalizeAcordEntry;
function toAcordDataType(value) {
    if (typeof value !== "string") {
        return "unknown";
    }
    const normalized = value.trim().toLowerCase();
    if (normalized === "string" ||
        normalized === "number" ||
        normalized === "boolean" ||
        normalized === "date" ||
        normalized === "datetime" ||
        normalized === "currency") {
        return normalized;
    }
    return "unknown";
}
function normalizeAcordEntry(entry) {
    return {
        acordCode: entry.acordCode,
        label: entry.label ?? entry.acordCode,
        description: entry.description ?? entry.label ?? entry.acordCode,
        dataType: toAcordDataType(entry.dataType),
        lob: entry.lob ?? "all",
        version: entry.version ?? "current",
        keywords: Array.isArray(entry.keywords)
            ? entry.keywords.filter((keyword) => typeof keyword === "string")
            : [],
    };
}
