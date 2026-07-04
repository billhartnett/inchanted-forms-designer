"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeExtractedPages = normalizeExtractedPages;
exports.normalizeExtractedLine = normalizeExtractedLine;
const bboxNormalization_1 = require("./bboxNormalization");
function quantize(value, digits = 4) {
    return Number(value.toFixed(digits));
}
function compareLines(left, right) {
    const leftY = left.boundingBox?.y ?? 0;
    const rightY = right.boundingBox?.y ?? 0;
    const leftX = left.boundingBox?.x ?? 0;
    const rightX = right.boundingBox?.x ?? 0;
    return (leftY - rightY ||
        leftX - rightX ||
        left.content.localeCompare(right.content));
}
function normalizeExtractedPages(rawPages) {
    const pages = rawPages.map((page) => ({
        pageNumber: Number(page?.pageNumber) || 1,
        width: typeof page?.width === "number" ? quantize(page.width) : undefined,
        height: typeof page?.height === "number" ? quantize(page.height) : undefined,
        unit: typeof page?.unit === "string" ? page.unit : undefined,
        lines: (() => {
            const normalizedLines = Array.isArray(page?.lines)
                ? page.lines.map((line) => normalizeExtractedLine(line))
                : [];
            const selectionLines = normalizeSelectionMarks(page?.selectionMarks);
            return [...normalizedLines, ...selectionLines].sort(compareLines);
        })(),
    }));
    return pages.sort((left, right) => left.pageNumber - right.pageNumber);
}
function normalizeExtractedLine(rawLine) {
    const content = typeof rawLine?.content === "string" ? rawLine.content : "";
    const polygon = Array.isArray(rawLine?.polygon)
        ? rawLine.polygon
        : Array.isArray(rawLine?.boundingBox)
            ? rawLine.boundingBox
            : undefined;
    return {
        content,
        confidence: typeof rawLine?.confidence === "number" && Number.isFinite(rawLine.confidence)
            ? quantize(rawLine.confidence)
            : undefined,
        polygon: Array.isArray(polygon) && typeof polygon[0] !== "number"
            ? polygon.map((point) => ({
                x: Number(point?.x ?? 0),
                y: Number(point?.y ?? 0),
            }))
            : undefined,
        boundingBox: (() => {
            const bounds = (0, bboxNormalization_1.boundsFromPolygon)(polygon);
            return {
                x: quantize(bounds.x),
                y: quantize(bounds.y),
                width: quantize(bounds.width),
                height: quantize(bounds.height),
            };
        })(),
    };
}
function normalizeSelectionMarks(rawSelectionMarks) {
    if (!Array.isArray(rawSelectionMarks)) {
        return [];
    }
    return rawSelectionMarks
        .map((mark, index) => {
        const state = typeof mark?.state === "string" ? mark.state.toLowerCase() : "unselected";
        const confidence = typeof mark?.confidence === "number" && Number.isFinite(mark.confidence)
            ? quantize(mark.confidence)
            : undefined;
        const polygon = Array.isArray(mark?.polygon)
            ? mark.polygon
            : Array.isArray(mark?.boundingPolygon)
                ? mark.boundingPolygon
                : undefined;
        const bounds = (0, bboxNormalization_1.boundsFromPolygon)(polygon);
        return {
            content: `selection_mark_${state}_${index + 1}`,
            confidence,
            polygon: Array.isArray(polygon) && typeof polygon[0] !== "number"
                ? polygon.map((point) => ({
                    x: Number(point?.x ?? 0),
                    y: Number(point?.y ?? 0),
                }))
                : undefined,
            boundingBox: {
                x: quantize(bounds.x),
                y: quantize(bounds.y),
                width: quantize(bounds.width),
                height: quantize(bounds.height),
            },
        };
    })
        .filter((line) => Boolean(line.boundingBox));
}
