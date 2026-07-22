import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import {
  coerceExtractedBlock,
  extractBlocksFromPlainText,
  createDocumentAnalysisClient,
  normalizeExtractedPages,
  inferSemanticFields,
  buildHybridFieldExtraction,
} from "../extraction";
import { mapBlocksWithAcord } from "../mapping";
import type {
  ExtractedBlock,
  FieldMapping,
  PageExtraction,
  ExtractDocumentErrorResponse,
  ExtractDocumentMultipartSuccessResponse,
  ExtractDocumentJsonBlocksSuccessResponse,
  ExtractDocumentPlainTextSuccessResponse,
} from "../types";

type ExtractDocumentRequest = {
  documentId?: string;
  text?: string;
  blocks?: Partial<ExtractedBlock>[];
};

// Document Intelligence returns coordinates in inches (prebuilt-layout model).
// The designer canvas renders at 96 DPI (standard screen resolution).
const CANVAS_DPI = 96;

/** Convert Document Intelligence inch-unit coordinates to canvas pixel coordinates. */
function scaleBoundingBoxToPixels(
  bbox: ExtractedBlock["boundingBox"],
  unit: string | undefined,
): ExtractedBlock["boundingBox"] {
  if (unit !== "inch") return bbox;
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
function buildBlocksFromPages(pages: PageExtraction[]): ExtractedBlock[] {
  const blocks: ExtractedBlock[] = [];
  for (const page of pages) {
    const unit = (page as any).unit as string | undefined;
    const pageW = typeof page.width === "number" ? page.width : 8.5;
    const pageH = typeof page.height === "number" ? page.height : 11;

    (page as any).pixelWidth = unit === "inch" ? pageW * CANVAS_DPI : pageW;
    (page as any).pixelHeight = unit === "inch" ? pageH * CANVAS_DPI : pageH;

    for (let i = 0; i < page.lines.length; i++) {
      const line = page.lines[i];
      const text = (line.content ?? "").trim();
      if (!text) continue;

      const rawBbox = line.boundingBox ?? { x: 0, y: 0, width: 100, height: 20 };
      const scaledBbox = scaleBoundingBoxToPixels(rawBbox, unit);

      let type: ExtractedBlock["type"] = "text";
      if (/\u2610|\u2611|\u2612|\[\s*\]|\(\s*\)/.test(text)) {
        type = "checkbox";
      } else if (/^selection_mark_(selected|unselected)_\d+$/i.test(text)) {
        type = "checkbox";
      } else if (/\bsignature\b|\bsign here\b|\bauthorized.{0,20}signature\b/i.test(text)) {
        type = "signature";
      } else if (/^[a-z0-9\s\-\/\.,#&'"()]{2,60}:\s*.{1,}/i.test(text)) {
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
async function enrichWithMappingEngine(
  blocks: ExtractedBlock[],
  documentId: string,
  context: InvocationContext,
): Promise<{ mappings: FieldMapping[]; fieldTypes: Record<string, string> }> {
  const semanticInferences = inferSemanticFields(blocks);
  const fieldTypes: Record<string, string> = Object.fromEntries(
    semanticInferences.map((inf) => [inf.blockId, inf.fieldType]),
  );

  let mappings: FieldMapping[] = [];
  try {
    mappings = await mapBlocksWithAcord(blocks, {
      context: "document-extraction",
      deterministic: false,
    });
  } catch (err: any) {
    context.warn(
      `[extractDocument] mapping engine error for ${documentId}: ${err?.message ?? "unknown"}`,
    );
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

function buildStructuralDelta(
  blocks: ExtractedBlock[],
  baselineDocumentId: string | null = null,
): ExtractDocumentMultipartSuccessResponse["structuralDelta"] {
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

export async function extractDocument(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const fileName = request.headers.get("x-file-name") ?? "document.pdf";

      const client = createDocumentAnalysisClient();
      if (!client) {
        const jsonBody: ExtractDocumentErrorResponse = {
          error: "Document Intelligence is not configured",
          details:
            "Set DI_ENDPOINT and DI_KEY in backend/api/local.settings.json. " +
            "See backend/api/local.settings.example.json for the required shape.",
          requiredEnvVars: ["DI_ENDPOINT", "DI_KEY"],
        };
        return {
          status: 503,
          jsonBody,
        };
      }

      const form = await request.formData();
      const file = form.get("file") as File | null;
      if (!file) {
        const jsonBody: ExtractDocumentErrorResponse = { error: "No file uploaded" };
        return { status: 400, jsonBody };
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const poller = await client.beginAnalyzeDocument("prebuilt-layout", buffer);
      const result = await poller.pollUntilDone();
      const pages = normalizeExtractedPages(result.pages ?? []);
      const blocks = buildBlocksFromPages(pages);
      const hybridExtraction = await buildHybridFieldExtraction({
        pages,
        rawResult: result,
      });
      const documentId = `doc-${Date.now()}`;

      const { mappings, fieldTypes } = await enrichWithMappingEngine(blocks, documentId, context);

      const pageDimensions = pages.map((p) => ({
        page: p.pageNumber,
        width: (p as any).pixelWidth ?? p.width ?? 816,
        height: (p as any).pixelHeight ?? p.height ?? 1056,
        unit: "pixel" as const,
      }));

      const structuralDelta = buildStructuralDelta(blocks);
      const selectionMarks = blocks.filter((b) => /^selection_mark_(selected|unselected)_\d+$/i.test(b.text));
      const jsonBody: ExtractDocumentMultipartSuccessResponse = {
        documentId,
        fileName,
        extractionMethod: "document-intelligence-wave8",
        extractedAt: new Date().toISOString(),
        pages,
        blocks,
        fields: hybridExtraction.fields,
        fieldCatalog: hybridExtraction.fieldCatalog,
        groupedStructures: {
          tables: hybridExtraction.tables,
          questionAnswerPairs: hybridExtraction.questionAnswerPairs,
          checkboxGroups: hybridExtraction.checkboxGroups,
        },
        extractionDiagnostics: hybridExtraction.diagnostics,
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
          averageConfidence:
            blocks.reduce((sum, b) => sum + b.confidence, 0) / (blocks.length || 1),
          language: "en",
        },
      };

      return {
        status: 200,
        jsonBody,
      };
    }

    const body = (await request.json()) as ExtractDocumentRequest;

    if (Array.isArray(body?.blocks) && body.blocks.length > 0) {
      const blocks = body.blocks.map((block, index) => coerceExtractedBlock(block, index));
      const documentId = body.documentId ?? `doc-json-${Date.now()}`;
      const { mappings, fieldTypes } = await enrichWithMappingEngine(blocks, documentId, context);
      const jsonBody: ExtractDocumentJsonBlocksSuccessResponse = {
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
      };

      return {
        status: 200,
        jsonBody,
      };
    }

    const text = typeof body?.text === "string" ? body.text : "";
    const lines = text.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);

    if (lines.length === 0) {
      const jsonBody: ExtractDocumentErrorResponse = {
        error: "Provide blocks[], text, or a multipart file upload with a PDF",
      };
      return {
        status: 400,
        jsonBody,
      };
    }

    const blocks: ExtractedBlock[] = extractBlocksFromPlainText(lines.join("\n"));
    const documentId = body?.documentId ?? `doc-text-${Date.now()}`;
    const { mappings, fieldTypes } = await enrichWithMappingEngine(blocks, documentId, context);
    const jsonBody: ExtractDocumentPlainTextSuccessResponse = {
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
    };

    return {
      status: 200,
      jsonBody,
    };
  } catch (error: any) {
    context.error("[extractDocument] unhandled error:", error);
    const jsonBody: ExtractDocumentErrorResponse = {
      error: "Failed to extract document",
      details: error?.message ?? "Unknown error",
    };
    return {
      status: 500,
      jsonBody,
    };
  }
}

export default extractDocument;
