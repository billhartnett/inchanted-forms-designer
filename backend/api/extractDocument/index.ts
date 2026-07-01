import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import {
  coerceExtractedBlock,
  extractBlocksFromPlainText,
  createDocumentAnalysisClient,
  normalizeExtractedPages,
  inferSemanticFields,
} from "../../extraction";
import { mapBlocksWithAcord } from "../../mapping";
import type { ExtractedBlock, FieldMapping, PageExtraction } from "../../types";

type ExtractDocumentRequest = {
  documentId?: string;
  text?: string;
  blocks?: Partial<ExtractedBlock>[];
};

const POINTS_PER_INCH = 72;
const CANVAS_DPI = 96;
const SCALE_FACTOR = CANVAS_DPI / POINTS_PER_INCH; // ~1.333x

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

function buildBlocksFromPages(pages: PageExtraction[]): ExtractedBlock[] {
  const blocks: ExtractedBlock[] = [];
  for (const page of pages) {
    const unit = (page as any).unit as string | undefined;
    const pageW = typeof page.width === "number" ? page.width : 8.5;
    const pageH = typeof page.height === "number" ? page.height : 11;
    const pixelW = unit === "inch" ? pageW * CANVAS_DPI : pageW;
    const pixelH = unit === "inch" ? pageH * CANVAS_DPI : pageH;

    for (let i = 0; i < page.lines.length; i++) {
      const line = page.lines[i];
      const text = (line.content ?? "").trim();
      if (!text) continue;

      const rawBbox = line.boundingBox ?? { x: 0, y: 0, width: 100, height: 20 };
      const scaledBbox = scaleBoundingBoxToPixels(rawBbox, unit);

      // Detect block type from text content
      let type: ExtractedBlock["type"] = "text";
      if (/\u2610|\u2611|\u2612|\[\s?\]|\(\s?\)/.test(text)) type = "checkbox";
      else if (/signature|sign here/i.test(text)) type = "signature";
      else if (/^[a-z0-9\s\-\/\.,#&]+:\s*.+$/i.test(text)) type = "kvp";

      blocks.push({
        id: `p${page.pageNumber}-l${i + 1}`,
        page: page.pageNumber,
        type,
        text,
        boundingBox: scaledBbox,
        confidence: line.confidence ?? 0.9,
      });
    }

    // Store page pixel dimensions back for reference
    (page as any).pixelWidth = pixelW;
    (page as any).pixelHeight = pixelH;
  }
  return blocks;
}

function generateMockBlocks(): ExtractedBlock[] {
  // Realistic ACORD 125 Commercial Insurance Application blocks
  return [
    // Named Insured / Applicant
    { id: "b1", page: 1, type: "kvp", text: "Named Insured:", confidence: 0.95, boundingBox: { x: 36, y: 72, width: 120, height: 18 } },
    { id: "b2", page: 1, type: "text", text: "ABC Company LLC", confidence: 0.93, boundingBox: { x: 165, y: 72, width: 200, height: 18 } },
    // Address
    { id: "b3", page: 1, type: "kvp", text: "Mailing Address:", confidence: 0.94, boundingBox: { x: 36, y: 100, width: 120, height: 18 } },
    { id: "b4", page: 1, type: "text", text: "123 Main Street", confidence: 0.92, boundingBox: { x: 165, y: 100, width: 180, height: 18 } },
    { id: "b5", page: 1, type: "kvp", text: "City:", confidence: 0.93, boundingBox: { x: 36, y: 125, width: 50, height: 18 } },
    { id: "b6", page: 1, type: "text", text: "Springfield", confidence: 0.91, boundingBox: { x: 90, y: 125, width: 100, height: 18 } },
    { id: "b7", page: 1, type: "kvp", text: "State:", confidence: 0.92, boundingBox: { x: 200, y: 125, width: 50, height: 18 } },
    { id: "b8", page: 1, type: "text", text: "IL", confidence: 0.91, boundingBox: { x: 255, y: 125, width: 40, height: 18 } },
    { id: "b9", page: 1, type: "kvp", text: "ZIP Code:", confidence: 0.92, boundingBox: { x: 310, y: 125, width: 70, height: 18 } },
    { id: "b10", page: 1, type: "text", text: "62701", confidence: 0.90, boundingBox: { x: 385, y: 125, width: 60, height: 18 } },
    // Contact / Phone
    { id: "b11", page: 1, type: "kvp", text: "Phone:", confidence: 0.93, boundingBox: { x: 36, y: 155, width: 55, height: 18 } },
    { id: "b12", page: 1, type: "text", text: "(217) 555-1234", confidence: 0.90, boundingBox: { x: 95, y: 155, width: 120, height: 18 } },
    // Policy dates
    { id: "b13", page: 1, type: "kvp", text: "Effective Date:", confidence: 0.95, boundingBox: { x: 36, y: 185, width: 110, height: 18 } },
    { id: "b14", page: 1, type: "text", text: "01/01/2025", confidence: 0.91, boundingBox: { x: 155, y: 185, width: 90, height: 18 } },
    { id: "b15", page: 1, type: "kvp", text: "Expiration Date:", confidence: 0.94, boundingBox: { x: 260, y: 185, width: 120, height: 18 } },
    { id: "b16", page: 1, type: "text", text: "01/01/2026", confidence: 0.91, boundingBox: { x: 385, y: 185, width: 90, height: 18 } },
    // Coverage checkboxes
    { id: "b17", page: 1, type: "checkbox", text: "☐ Commercial General Liability", confidence: 0.90, boundingBox: { x: 36, y: 220, width: 180, height: 22 } },
    { id: "b18", page: 1, type: "checkbox", text: "☐ Business Auto", confidence: 0.89, boundingBox: { x: 36, y: 248, width: 130, height: 22 } },
    { id: "b19", page: 1, type: "checkbox", text: "☐ Workers Compensation", confidence: 0.88, boundingBox: { x: 36, y: 276, width: 165, height: 22 } },
    { id: "b20", page: 1, type: "checkbox", text: "☐ Property", confidence: 0.88, boundingBox: { x: 36, y: 304, width: 80, height: 22 } },
    // Business description
    { id: "b21", page: 1, type: "kvp", text: "Description of Operations:", confidence: 0.90, boundingBox: { x: 36, y: 340, width: 190, height: 18 } },
    { id: "b22", page: 1, type: "text", text: "General contracting and construction", confidence: 0.88, boundingBox: { x: 36, y: 362, width: 280, height: 18 } },
    // Employees
    { id: "b23", page: 1, type: "kvp", text: "Number of Employees:", confidence: 0.91, boundingBox: { x: 36, y: 390, width: 155, height: 18 } },
    { id: "b24", page: 1, type: "text", text: "25", confidence: 0.89, boundingBox: { x: 200, y: 390, width: 50, height: 18 } },
    // Premium
    { id: "b25", page: 1, type: "kvp", text: "Annual Premium:", confidence: 0.92, boundingBox: { x: 36, y: 418, width: 125, height: 18 } },
    { id: "b26", page: 1, type: "text", text: "$12,500.00", confidence: 0.90, boundingBox: { x: 170, y: 418, width: 90, height: 18 } },
    // Agent / Producer
    { id: "b27", page: 1, type: "kvp", text: "Agent Name:", confidence: 0.93, boundingBox: { x: 36, y: 450, width: 100, height: 18 } },
    { id: "b28", page: 1, type: "text", text: "Jane Smith", confidence: 0.91, boundingBox: { x: 145, y: 450, width: 120, height: 18 } },
    // Signature
    { id: "b29", page: 1, type: "signature", text: "Authorized Representative Signature:", confidence: 0.88, boundingBox: { x: 36, y: 720, width: 250, height: 24 } },
    { id: "b30", page: 1, type: "kvp", text: "Date:", confidence: 0.90, boundingBox: { x: 300, y: 720, width: 45, height: 18 } },
  ];
}

async function enrichWithMappingEngine(
  blocks: ExtractedBlock[],
  documentId: string,
  context: InvocationContext,
): Promise<{ mappings: FieldMapping[]; fieldTypes: Record<string, string> }> {
  // Run field type inference
  const semanticInferences = inferSemanticFields(blocks);
  const fieldTypes: Record<string, string> = {};
  for (const inf of semanticInferences) {
    fieldTypes[inf.blockId] = inf.fieldType;
  }

  // Run ACORD mapping engine
  let mappings: FieldMapping[] = [];
  try {
    mappings = await mapBlocksWithAcord(blocks, {
      context: "document-extraction",
      deterministic: false,
    });
  } catch (err: any) {
    context.warn(`extractDocument mapping engine failed: ${err?.message}`);
    // Return blocks as stub mappings with no candidates
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

export async function extractDocument(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    // Check if this is a multipart form upload (file)
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const fileName = request.headers.get("x-file-name") || "document.pdf";

      let extractionMethod = "mock-wave8";
      let pages: PageExtraction[] = [];
      let rawBlocks: ExtractedBlock[] = [];

      try {
        const client = createDocumentAnalysisClient();
        if (client) {
          const form = await request.formData();
          const file = form.get("file") as File;

          if (!file) {
            return {
              status: 400,
              jsonBody: { error: "No file uploaded" },
            };
          }

          const buffer = Buffer.from(await file.arrayBuffer());
          const poller = await client.beginAnalyzeDocument("prebuilt-layout", buffer);
          const result = await poller.pollUntilDone();
          pages = normalizeExtractedPages(result.pages ?? []);
          rawBlocks = buildBlocksFromPages(pages);
          extractionMethod = "document-intelligence";
        } else {
          // Document Intelligence not configured — use realistic mock blocks
          rawBlocks = generateMockBlocks();
          pages = [
            {
              pageNumber: 1,
              width: 816,
              height: 1056,
              lines: [],
            } as PageExtraction,
          ];
        }
      } catch (extractionError: any) {
        context.warn(`extractDocument DI failed, using mock: ${extractionError.message}`);
        rawBlocks = generateMockBlocks();
        pages = [
          {
            pageNumber: 1,
            width: 816,
            height: 1056,
            lines: [],
          } as PageExtraction,
        ];
        extractionMethod = "mock-wave8-fallback";
      }

      const documentId = `doc-${Date.now()}`;

      // Enrich blocks with Wave 8 mapping engine
      const { mappings, fieldTypes } = await enrichWithMappingEngine(
        rawBlocks,
        documentId,
        context,
      );

      // Build page dimensions for geometry normalization
      const pageDimensions = pages.map((p) => ({
        page: p.pageNumber,
        width: (p as any).pixelWidth ?? p.width ?? 816,
        height: (p as any).pixelHeight ?? p.height ?? 1056,
        unit: (p as any).unit ?? "pixel",
      }));

      // Build structural delta metadata (empty for first extraction)
      const structuralDelta = {
        addedBlocks: rawBlocks.length,
        removedBlocks: 0,
        changedBlocks: 0,
        totalBlocks: rawBlocks.length,
        deltaVersion: 1,
        baselineDocumentId: null,
      };

      return {
        status: 200,
        jsonBody: {
          documentId,
          fileName,
          extractionMethod,
          extractedAt: new Date().toISOString(),
          pages,
          blocks: rawBlocks,
          mappings,
          fieldTypes,
          pageDimensions,
          structuralDelta,
          summary: {
            totalPages: pages.length,
            totalBlocks: rawBlocks.length,
            totalMappings: mappings.length,
            checkboxCount: rawBlocks.filter((b) => b.type === "checkbox").length,
            signatureCount: rawBlocks.filter((b) => b.type === "signature").length,
            kvpCount: rawBlocks.filter((b) => b.type === "kvp").length,
            confidence:
              rawBlocks.reduce((sum, b) => sum + b.confidence, 0) / (rawBlocks.length || 1),
            language: "en",
          },
        },
      };
    }

    // Handle JSON-based requests (existing behavior)
    const body = (await request.json()) as ExtractDocumentRequest;

    if (Array.isArray(body?.blocks) && body.blocks.length > 0) {
      const blocks = body.blocks.map((block, index) =>
        coerceExtractedBlock(block, index),
      );

      // Enrich JSON-supplied blocks with mapping engine too
      const documentId = body.documentId ?? `doc-json-${Date.now()}`;
      const { mappings, fieldTypes } = await enrichWithMappingEngine(
        blocks,
        documentId,
        context,
      );

      return {
        status: 200,
        jsonBody: {
          documentId,
          blocks,
          mappings,
          fieldTypes,
          structuralDelta: { addedBlocks: blocks.length, removedBlocks: 0, changedBlocks: 0, totalBlocks: blocks.length, deltaVersion: 1, baselineDocumentId: null },
          summary: { totalBlocks: blocks.length, totalMappings: mappings.length },
        },
      };
    }

    const text = typeof body?.text === "string" ? body.text : "";
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      return {
        status: 400,
        jsonBody: {
          error: "Provide either blocks[], text, or multipart file upload",
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
        blocks,
        mappings,
        fieldTypes,
        summary: { totalBlocks: blocks.length, totalMappings: mappings.length },
      },
    };
  } catch (error: any) {
    context.error("extractDocument error", error);
    return {
      status: 500,
      jsonBody: {
        error: "Failed to extract document blocks",
        details: error?.message || "Unknown error",
      },
    };
  }
}

app.http("extractDocument", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "extractDocument",
  handler: extractDocument,
});
