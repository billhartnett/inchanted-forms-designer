"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractDocument = extractDocument;
const functions_1 = require("@azure/functions");
const extraction_1 = require("../../extraction");
const mapping_1 = require("../../mapping");
// Document Intelligence returns coordinates in inches (prebuilt-layout model).
// The designer canvas renders at 96 DPI (standard screen resolution).
const CANVAS_DPI = 96;
/** Convert Document Intelligence inch-unit coordinates to canvas pixel coordinates. */
function scaleBoundingBoxToPixels(bbox, unit) {
    if (unit !== "inch")
        return bbox;
    return {
        x: bbox.x * CANVAS_DPI,
        y: bbox.y * CANVAS_DPI,
        width: bbox.width * CANVAS_DPI,
        height: bbox.height * CANVAS_DPI,
    };
}
/**
 * Convert normalized DI PageExtraction lines to typed ExtractedBlock[].
 * Applies DPI scaling, detects checkbox/signature/kvp block types, and
 * tags each block with its source page number and a stable sequential ID.
 */
function buildBlocksFromPages(pages) {
    const blocks = [];
    for (const page of pages) {
        const unit = page.unit;
        const pageW = typeof page.width === "number" ? page.width : 8.5;
        const pageH = typeof page.height === "number" ? page.height : 11;
        page.pixelWidth = unit === "inch" ? pageW * CANVAS_DPI : pageW;
        page.pixelHeight = unit === "inch" ? pageH * CANVAS_DPI : pageH;
        for (let i = 0; i < page.lines.length; i++) {
            const line = page.lines[i];
            const text = (line.content ?? "").trim();
            if (!text)
                continue;
            const rawBbox = line.boundingBox ?? { x: 0, y: 0, width: 100, height: 20 };
            const scaledBbox = scaleBoundingBoxToPixels(rawBbox, unit);
            let type = "text";
            if (/\u2610|\u2611|\u2612|\[\s*\]|\(\s*\)/.test(text)) {
                type = "checkbox";
            }
            else if (/^selection_mark_(selected|unselected)_\d+$/i.test(text)) {
                type = "checkbox";
            }
            else if (/\bsignature\b|\bsign here\b|\bauthorized.{0,20}signature\b/i.test(text)) {
                type = "signature";
            }
            else if (/^[a-z0-9\s\-\/\.,#&'"()]{2,60}:\s*.{1,}/i.test(text)) {
                type = "kvp";
            }
            blocks.push({
                id: `p${page.pageNumber}-l${i + 1}`,
                page: page.pageNumber,
                type,
                text,
                boundingBox: scaledBbox,
                confidence: typeof line.confidence === "number" ? line.confidence : 0.9,
            });
        }
    }
    return blocks;
}
/**
 * Enrich extracted blocks with Wave 8 ACORD mapping engine output.
 * Runs inferSemanticFields() for typed classification and mapBlocksWithAcord()
 * for ranked ACORD label candidates. Mapping engine errors are isolated.
 */
async function enrichWithMappingEngine(blocks, documentId, context) {
    const semanticInferences = (0, extraction_1.inferSemanticFields)(blocks);
    const fieldTypes = Object.fromEntries(semanticInferences.map((inf) => [inf.blockId, inf.fieldType]));
    let mappings = [];
    try {
        mappings = await (0, mapping_1.mapBlocksWithAcord)(blocks, {
            context: "document-extraction",
            deterministic: false,
        });
    }
    catch (err) {
        context.warn(`[extractDocument] mapping engine error for ${documentId}: ${err?.message ?? "unknown"}`);
        mappings = blocks.map((block) => ({
            blockId: block.id,
            page: block.page,
            text: block.text,
            boundingBox: block.boundingBox,
            suggestions: [],
            chosen: undefined,
        }));
    }
    return { mappings, fieldTypes };
}
function buildStructuralDelta(blocks, baselineDocumentId = null) {
    return {
        addedBlocks: blocks.length,
        removedBlocks: 0,
        changedBlocks: 0,
        totalBlocks: blocks.length,
        checkboxDelta: blocks.filter((b) => b.type === "checkbox").length,
        signatureDelta: blocks.filter((b) => b.type === "signature").length,
        kvpDelta: blocks.filter((b) => b.type === "kvp").length,
        deltaVersion: 1,
        baselineDocumentId,
        extractedAt: new Date().toISOString(),
    };
}
async function extractDocument(request, context) {
    try {
        const contentType = request.headers.get("content-type") ?? "";
        if (contentType.includes("multipart/form-data")) {
            const fileName = request.headers.get("x-file-name") ?? "document.pdf";
            const client = (0, extraction_1.createDocumentAnalysisClient)();
            if (!client) {
                return {
                    status: 503,
                    jsonBody: {
                        error: "Document Intelligence is not configured",
                        details: "Set DI_ENDPOINT and DI_KEY in backend/api/local.settings.json. " +
                            "See backend/api/local.settings.example.json for the required shape.",
                        requiredEnvVars: ["DI_ENDPOINT", "DI_KEY"],
                    },
                };
            }
            const form = await request.formData();
            const file = form.get("file");
            if (!file) {
                return { status: 400, jsonBody: { error: "No file uploaded" } };
            }
            const buffer = Buffer.from(await file.arrayBuffer());
            const poller = await client.beginAnalyzeDocument("prebuilt-layout", buffer);
            const result = await poller.pollUntilDone();
            const pages = (0, extraction_1.normalizeExtractedPages)(result.pages ?? []);
            const blocks = buildBlocksFromPages(pages);
            const documentId = `doc-${Date.now()}`;
            const { mappings, fieldTypes } = await enrichWithMappingEngine(blocks, documentId, context);
            const pageDimensions = pages.map((p) => ({
                page: p.pageNumber,
                width: p.pixelWidth ?? p.width ?? 816,
                height: p.pixelHeight ?? p.height ?? 1056,
                unit: "pixel",
            }));
            const structuralDelta = buildStructuralDelta(blocks);
            const selectionMarks = blocks.filter((b) => /^selection_mark_(selected|unselected)_\d+$/i.test(b.text));
            return {
                status: 200,
                jsonBody: {
                    documentId,
                    fileName,
                    extractionMethod: "document-intelligence-wave8",
                    extractedAt: new Date().toISOString(),
                    pages,
                    blocks,
                    selectionMarks,
                    mappings,
                    fieldTypes,
                    pageDimensions,
                    structuralDelta,
                    summary: {
                        totalPages: pages.length,
                        totalBlocks: blocks.length,
                        totalMappings: mappings.length,
                        selectionMarkCount: selectionMarks.length,
                        checkboxCount: blocks.filter((b) => b.type === "checkbox").length,
                        signatureCount: blocks.filter((b) => b.type === "signature").length,
                        kvpCount: blocks.filter((b) => b.type === "kvp").length,
                        averageConfidence: blocks.reduce((sum, b) => sum + b.confidence, 0) / (blocks.length || 1),
                        language: "en",
                    },
                },
            };
        }
        const body = (await request.json());
        if (Array.isArray(body?.blocks) && body.blocks.length > 0) {
            const blocks = body.blocks.map((block, index) => (0, extraction_1.coerceExtractedBlock)(block, index));
            const documentId = body.documentId ?? `doc-json-${Date.now()}`;
            const { mappings, fieldTypes } = await enrichWithMappingEngine(blocks, documentId, context);
            return {
                status: 200,
                jsonBody: {
                    documentId,
                    extractionMethod: "json-blocks-wave8",
                    blocks,
                    mappings,
                    fieldTypes,
                    structuralDelta: buildStructuralDelta(blocks),
                    summary: {
                        totalBlocks: blocks.length,
                        totalMappings: mappings.length,
                        checkboxCount: blocks.filter((b) => b.type === "checkbox").length,
                    },
                },
            };
        }
        const text = typeof body?.text === "string" ? body.text : "";
        const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        if (lines.length === 0) {
            return {
                status: 400,
                jsonBody: {
                    error: "Provide blocks[], text, or a multipart file upload with a PDF",
                },
            };
        }
        const blocks = (0, extraction_1.extractBlocksFromPlainText)(lines.join("\n"));
        const documentId = body?.documentId ?? `doc-text-${Date.now()}`;
        const { mappings, fieldTypes } = await enrichWithMappingEngine(blocks, documentId, context);
        return {
            status: 200,
            jsonBody: {
                documentId,
                extractionMethod: "plain-text-wave8",
                blocks,
                mappings,
                fieldTypes,
                structuralDelta: buildStructuralDelta(blocks),
                summary: {
                    totalBlocks: blocks.length,
                    totalMappings: mappings.length,
                },
            },
        };
    }
    catch (error) {
        context.error("[extractDocument] unhandled error:", error);
        return {
            status: 500,
            jsonBody: {
                error: "Failed to extract document",
                details: error?.message ?? "Unknown error",
            },
        };
    }
}
functions_1.app.http("extractDocument", {
    methods: ["POST"],
    authLevel: "anonymous",
    route: "extractDocument",
    handler: extractDocument,
});
