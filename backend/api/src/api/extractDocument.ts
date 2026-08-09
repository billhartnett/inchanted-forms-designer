import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import {
  coerceExtractedBlock,
  extractBlocksFromPlainText,
  buildHybridFieldExtraction,
  createDocumentAnalysisClient,
  normalizeExtractedPages,
  inferSemanticFields,
} from "../extraction";
import { mapBlocksWithAcord } from "../mapping";
import type { ExtractedBlock, FieldMapping } from "../types";

type ExtractDocumentRequest = {
  documentId?: string;
  text?: string;
  blocks?: Partial<ExtractedBlock>[];
};

const CANVAS_DPI = 96;

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

function inferFieldTypes(blocks: ExtractedBlock[]): Record<string, string> {
  return Object.fromEntries(
    inferSemanticFields(blocks).map((inference) => [inference.blockId, inference.fieldType]),
  );
}

function buildStructuralDelta(
  blocks: ExtractedBlock[],
  baselineDocumentId: string | null = null,
) {
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
        return {
          status: 503,
          jsonBody: {
            error: "Document Intelligence is not configured",
            details:
              "Set DI_ENDPOINT and DI_KEY in backend/api/local.settings.json. " +
              "See backend/api/local.settings.example.json for the required shape.",
            requiredEnvVars: ["DI_ENDPOINT", "DI_KEY"],
          },
        };
      }

      const form = await request.formData();
      const file = form.get("file") as File | null;
      if (!file) {
        return { status: 400, jsonBody: { error: "No file uploaded" } };
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const poller = await client.beginAnalyzeDocument("prebuilt-layout", buffer);
      const result = await poller.pollUntilDone();
      const pages = normalizeExtractedPages(result.pages ?? []);
      const hybridExtraction = await buildHybridFieldExtraction({ pages, rawResult: result });
      const blocks = hybridExtraction.blocks;
      const documentId = `doc-${Date.now()}`;
      const isWave9HybridRoute = new URL(request.url).pathname.endsWith("/wave9/extraction/hybrid");
      const { mappings, fieldTypes } = isWave9HybridRoute
        ? { mappings: [], fieldTypes: inferFieldTypes(blocks) }
        : await enrichWithMappingEngine(blocks, documentId, context);

      const pageDimensions = pages.map((p) => ({
        page: p.pageNumber,
        width: (p.width ?? 8.5) * ((p as any).unit === "inch" ? CANVAS_DPI : 1),
        height: (p.height ?? 11) * ((p as any).unit === "inch" ? CANVAS_DPI : 1),
        unit: "pixel",
      }));

      const structuralDelta = buildStructuralDelta(blocks);
      const selectionMarks = blocks.filter((b) => /^selection_mark_(selected|unselected)_\d+$/i.test(b.text));

      return {
        status: 200,
        jsonBody: {
          documentId,
          contractVersion: "wave9.hybrid.v1",
          fileName,
          extractionMethod: "wave9-hybrid",
          extractedAt: new Date().toISOString(),
          pages,
          blocks,
          fields: hybridExtraction.fields,
          fieldCatalog: hybridExtraction.fieldCatalog,
          groupedStructures: hybridExtraction.groupedStructures,
          extractionDiagnostics: hybridExtraction.diagnostics,
          bboxNormalization: {
            coordinateSpace: "pixel",
            origin: "top-left",
            dpi: CANVAS_DPI,
            pageDimensions,
          },
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
        },
      };
    }

    const body = (await request.json()) as ExtractDocumentRequest;

    if (Array.isArray(body?.blocks) && body.blocks.length > 0) {
      const blocks = body.blocks.map((block, index) => coerceExtractedBlock(block, index));
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
    const lines = text.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);

    if (lines.length === 0) {
      return {
        status: 400,
        jsonBody: {
          error: "Provide blocks[], text, or a multipart file upload with a PDF",
        },
      };
    }

    const blocks: ExtractedBlock[] = extractBlocksFromPlainText(lines.join("\n"));
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
  } catch (error: any) {
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

export default extractDocument;
