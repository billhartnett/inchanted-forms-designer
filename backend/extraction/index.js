"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeBoundingBox = exports.boundsFromPolygon = exports.inferSemanticFields = exports.inferSemanticField = exports.normalizeExtractedLine = exports.normalizeExtractedPages = exports.detectLabels = exports.detectLabel = exports.buildTypedFields = exports.buildTypedField = exports.createDocumentAnalysisClient = void 0;
exports.coerceExtractedBlock = coerceExtractedBlock;
exports.extractBlocksFromPlainText = extractBlocksFromPlainText;
const bboxNormalization_1 = require("./bboxNormalization");
var documentIntelligence_1 = require("./documentIntelligence");
Object.defineProperty(exports, "createDocumentAnalysisClient", { enumerable: true, get: function () { return documentIntelligence_1.createDocumentAnalysisClient; } });
var fieldFactory_1 = require("./fieldFactory");
Object.defineProperty(exports, "buildTypedField", { enumerable: true, get: function () { return fieldFactory_1.buildTypedField; } });
Object.defineProperty(exports, "buildTypedFields", { enumerable: true, get: function () { return fieldFactory_1.buildTypedFields; } });
var labelDetection_1 = require("./labelDetection");
Object.defineProperty(exports, "detectLabel", { enumerable: true, get: function () { return labelDetection_1.detectLabel; } });
Object.defineProperty(exports, "detectLabels", { enumerable: true, get: function () { return labelDetection_1.detectLabels; } });
var pageExtraction_1 = require("./pageExtraction");
Object.defineProperty(exports, "normalizeExtractedPages", { enumerable: true, get: function () { return pageExtraction_1.normalizeExtractedPages; } });
Object.defineProperty(exports, "normalizeExtractedLine", { enumerable: true, get: function () { return pageExtraction_1.normalizeExtractedLine; } });
var semanticInference_1 = require("./semanticInference");
Object.defineProperty(exports, "inferSemanticField", { enumerable: true, get: function () { return semanticInference_1.inferSemanticField; } });
Object.defineProperty(exports, "inferSemanticFields", { enumerable: true, get: function () { return semanticInference_1.inferSemanticFields; } });
var bboxNormalization_2 = require("./bboxNormalization");
Object.defineProperty(exports, "boundsFromPolygon", { enumerable: true, get: function () { return bboxNormalization_2.boundsFromPolygon; } });
Object.defineProperty(exports, "normalizeBoundingBox", { enumerable: true, get: function () { return bboxNormalization_2.normalizeBoundingBox; } });
function hashString(value) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
        hash ^= value.charCodeAt(i);
        hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
}
function normalizeNumber(value, fallback) {
    return typeof value === "number" && Number.isFinite(value)
        ? Number(value.toFixed(4))
        : fallback;
}
function coerceExtractedBlock(raw, index) {
    const page = typeof raw?.page === "number" && Number.isFinite(raw.page)
        ? Math.max(1, Math.floor(raw.page))
        : 1;
    const type = raw?.type === "checkbox" ||
        raw?.type === "radio" ||
        raw?.type === "signature" ||
        raw?.type === "table" ||
        raw?.type === "kvp"
        ? raw.type
        : "text";
    const text = typeof raw?.text === "string" ? raw.text : "";
    const boundingBox = (0, bboxNormalization_1.normalizeBoundingBox)(raw?.boundingBox, {
        x: 40,
        y: 40 + index * 24,
        width: 300,
        height: 20,
    });
    const normalizedBounds = {
        x: normalizeNumber(boundingBox.x, 0),
        y: normalizeNumber(boundingBox.y, 0),
        width: normalizeNumber(boundingBox.width, 0),
        height: normalizeNumber(boundingBox.height, 0),
    };
    const deterministicId = `block-${hashString(`${page}:${type}:${text}:${normalizedBounds.x}:${normalizedBounds.y}:${normalizedBounds.width}:${normalizedBounds.height}`)}`;
    return {
        id: typeof raw?.id === "string" && raw.id.trim()
            ? raw.id
            : deterministicId,
        page,
        type,
        text,
        boundingBox: normalizedBounds,
        confidence: typeof raw?.confidence === "number" && Number.isFinite(raw.confidence)
            ? Number(Math.min(1, Math.max(0, raw.confidence)).toFixed(4))
            : 0.8,
    };
}
function extractBlocksFromPlainText(text) {
    return text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line, index) => coerceExtractedBlock({
        id: `line-${index + 1}`,
        page: 1,
        type: "text",
        text: line,
        confidence: 0.85,
        boundingBox: {
            x: 40,
            y: 40 + index * 24,
            width: 520,
            height: 20,
        },
    }, index));
}
