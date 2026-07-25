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

const DI_FEATURES = ["ocr", "style", "selectionMark", "tables"] as const;

type DiPageCounts = {
  pageNumber: number;
  words: number;
  lines: number;
  selectionMarks: number;
  tableCells: number;
  boundingBoxes: number;
};

function hasBoxLikeGeometry(value: any): boolean {
  if (!value || typeof value !== "object") return false;

  const bbox = value.boundingBox;
  if (
    bbox &&
    typeof bbox === "object" &&
    typeof bbox.x === "number" &&
    typeof bbox.y === "number" &&
    typeof bbox.width === "number" &&
    typeof bbox.height === "number"
  ) {
    return true;
  }

  if (Array.isArray(value.polygon) && value.polygon.length > 0) {
    return true;
  }

  if (Array.isArray(value.boundingPolygon) && value.boundingPolygon.length > 0) {
    return true;
  }

  return false;
}

function buildDiDiagnostics(result: any, normalizedPages: Array<any>) {
  const rawPages = Array.isArray(result?.pages) ? result.pages : [];
  const tables = Array.isArray(result?.tables) ? result.tables : [];
  const keyValuePairs = Array.isArray(result?.keyValuePairs)
    ? result.keyValuePairs
    : [];

  const tableCellsByPage = new Map<number, number>();
  for (const table of tables) {
    const cells = Array.isArray(table?.cells) ? table.cells : [];
    for (const cell of cells) {
      const regionPage = Number(
        cell?.boundingRegions?.[0]?.pageNumber ??
          cell?.boundingRegion?.pageNumber ??
          cell?.pageNumber,
      );
      if (!Number.isFinite(regionPage)) continue;
      tableCellsByPage.set(
        regionPage,
        (tableCellsByPage.get(regionPage) || 0) + 1,
      );
    }
  }

  const perPage: DiPageCounts[] = rawPages.map((page: any) => {
    const pageNumber = Number(page?.pageNumber) || 1;
    const words = Array.isArray(page?.words) ? page.words : [];
    const lines = Array.isArray(page?.lines) ? page.lines : [];
    const selectionMarks = Array.isArray(page?.selectionMarks)
      ? page.selectionMarks
      : [];

    const wordBoxes = words.filter(hasBoxLikeGeometry).length;
    const lineBoxes = lines.filter(hasBoxLikeGeometry).length;
    const selectionMarkBoxes = selectionMarks.filter(hasBoxLikeGeometry).length;
    const tableCellBoxes = tableCellsByPage.get(pageNumber) || 0;

    return {
      pageNumber,
      words: words.length,
      lines: lines.length,
      selectionMarks: selectionMarks.length,
      tableCells: tableCellBoxes,
      boundingBoxes:
        wordBoxes + lineBoxes + selectionMarkBoxes + tableCellBoxes,
    };
  });

  const totals = {
    pages: rawPages.length,
    words: perPage.reduce((sum, item) => sum + item.words, 0),
    lines: perPage.reduce((sum, item) => sum + item.lines, 0),
    selectionMarks: perPage.reduce((sum, item) => sum + item.selectionMarks, 0),
    tables: tables.length,
    keyValuePairs: keyValuePairs.length,
    boundingBoxes: perPage.reduce((sum, item) => sum + item.boundingBoxes, 0),
  };

  const pageDimensions = normalizedPages.map((page: any) => ({
    pageNumber: Number(page?.pageNumber) || 1,
    width: typeof page?.width === "number" ? page.width : null,
    height: typeof page?.height === "number" ? page.height : null,
    unit: typeof page?.unit === "string" ? page.unit : null,
  }));

  return {
    responseShape: {
      topLevelKeys: Object.keys(result || {}),
      hasPages: rawPages.length > 0,
      hasTables: tables.length > 0,
      hasKeyValuePairs: keyValuePairs.length > 0,
      pageShapeKeys:
        rawPages.length > 0 && rawPages[0] && typeof rawPages[0] === "object"
          ? Object.keys(rawPages[0])
          : [],
      tableShapeKeys:
        tables.length > 0 && tables[0] && typeof tables[0] === "object"
          ? Object.keys(tables[0])
          : [],
      kvpShapeKeys:
        keyValuePairs.length > 0 &&
        keyValuePairs[0] &&
        typeof keyValuePairs[0] === "object"
          ? Object.keys(keyValuePairs[0])
          : [],
    },
    totals,
    perPage,
    pageDimensions,
  };
}

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
      const diRequestBody = {
        modelId: "prebuilt-layout",
        contentLengthBytes: buffer.byteLength,
        features: [...DI_FEATURES],
      };
      console.info(
        `[extractDocument][DI] request ${JSON.stringify(diRequestBody)}`,
      );

      let poller: Awaited<ReturnType<typeof client.beginAnalyzeDocument>>;
      try {
        poller = await client.beginAnalyzeDocument("prebuilt-layout", buffer, {
          features: DI_FEATURES as any,
        });
      } catch (featureError: any) {
        console.warn(
          `[extractDocument][DI] beginAnalyzeDocument with features failed, retrying without features: ${featureError?.message ?? "unknown"}`,
        );
        poller = await client.beginAnalyzeDocument("prebuilt-layout", buffer);
      }

      const result = await poller.pollUntilDone();
      const pages = normalizeExtractedPages(result.pages ?? []);
      const diDiagnostics = buildDiDiagnostics(result, pages);
      console.info(
        `[extractDocument][DI] responseShape ${JSON.stringify(diDiagnostics.responseShape)}`,
      );
      console.info(
        `[extractDocument][DI] counts ${JSON.stringify({
          pages: diDiagnostics.totals.pages,
          words: diDiagnostics.totals.words,
          lines: diDiagnostics.totals.lines,
          selectionMarks: diDiagnostics.totals.selectionMarks,
          tables: diDiagnostics.totals.tables,
          keyValuePairs: diDiagnostics.totals.keyValuePairs,
          boundingBoxesPerPage: diDiagnostics.perPage.map((item) => ({
            pageNumber: item.pageNumber,
            boundingBoxes: item.boundingBoxes,
          })),
        })}`,
      );
      const blocks = buildBlocksFromPages(pages);
      const hybridExtraction = await buildHybridFieldExtraction({
        pages,
        rawResult: result,
      });

      const groupedStructures = {
        tables: hybridExtraction.tables,
        questionAnswerPairs: hybridExtraction.questionAnswerPairs,
        checkboxGroups: hybridExtraction.checkboxGroups,
      };

      console.info(
        `[extractDocument][groupedStructures] ${JSON.stringify({
          tables: groupedStructures.tables.length,
          questionAnswerPairs: groupedStructures.questionAnswerPairs.length,
          checkboxGroups: groupedStructures.checkboxGroups.length,
          total:
            groupedStructures.tables.length +
            groupedStructures.questionAnswerPairs.length +
            groupedStructures.checkboxGroups.length,
        })}`,
      );

      console.info(
        `[extractDocument][diagnostics] ${JSON.stringify({
          totalWords: diDiagnostics.totals.words,
          totalSelectionMarks: diDiagnostics.totals.selectionMarks,
          totalTables: diDiagnostics.totals.tables,
          totalLines: diDiagnostics.totals.lines,
          totalBlocks: hybridExtraction.blocks.length,
          pageDimensions: diDiagnostics.pageDimensions,
        })}`,
      );
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
        groupedStructures,
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
