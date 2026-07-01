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
} from "../../extraction";
import type { ExtractedBlock } from "../../types";

type ExtractDocumentRequest = {
  documentId?: string;
  text?: string;
  blocks?: Partial<ExtractedBlock>[];
};

function generateMockExtraction(fileName: string) {
  return {
    documentId: `doc-${Date.now()}`,
    fileName,
    extractionMethod: "mock-for-testing",
    extractedAt: new Date().toISOString(),
    blocks: [
      {
        blockId: "block-1",
        text: "Mock ACORD 125 Form",
        confidence: 0.95,
        boundingBox: { x: 0, y: 0, width: 100, height: 20 },
      },
      {
        blockId: "block-2",
        text: "Insurance Application",
        confidence: 0.92,
        boundingBox: { x: 0, y: 25, width: 100, height: 20 },
      },
      {
        blockId: "block-3",
        text: "Insured Name: [Name Field]",
        confidence: 0.88,
        boundingBox: { x: 0, y: 50, width: 100, height: 15 },
      },
      {
        blockId: "block-4",
        text: "Address: [Address Field]",
        confidence: 0.87,
        boundingBox: { x: 0, y: 70, width: 100, height: 15 },
      },
    ],
    summary: {
      totalPages: 1,
      totalBlocks: 4,
      confidence: 0.905,
      language: "en",
    },
    message: "Mock extraction for testing. File upload successful but returns simulated data.",
  };
}

export async function extractDocument(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    // Check if this is a multipart form upload (file)
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      // For file uploads, try real extraction if configured, otherwise return mock
      const fileName = request.headers.get("x-file-name") || "document.pdf";
      
      try {
        // Try to use Document Intelligence for real extraction
        const client = createDocumentAnalysisClient();
        if (!client) {
          // Document Intelligence not configured, return mock
          return {
            status: 200,
            jsonBody: generateMockExtraction(fileName),
          };
        }

        const form = await request.formData();
        const file = form.get("file") as File;

        if (!file) {
          return {
            status: 400,
            jsonBody: { error: "No file uploaded" },
          };
        }

        const buffer = Buffer.from(await file.arrayBuffer());

        // Use the prebuilt layout model for text + bounding boxes
        const poller = await client.beginAnalyzeDocument("prebuilt-layout", buffer);
        const result = await poller.pollUntilDone();
        const pages = normalizeExtractedPages(result.pages ?? []);

        return {
          status: 200,
          jsonBody: {
            documentId: `doc-${Date.now()}`,
            fileName,
            extractionMethod: "document-intelligence",
            extractedAt: new Date().toISOString(),
            pages,
            summary: {
              totalPages: pages.length,
              totalLines: pages.reduce((sum, p) => sum + p.lines.length, 0),
              confidence: pages.reduce(
                (sum, p) => sum + p.lines.reduce((s, l) => s + (l.confidence || 0.8), 0),
                0
              ) / (pages.reduce((sum, p) => sum + p.lines.length, 0) || 1),
              language: "en",
            },
          },
        };
      } catch (extractionError: any) {
        // Fall back to mock if Document Intelligence fails
        context.log("Document Intelligence extraction failed, using mock:", extractionError.message);
        return {
          status: 200,
          jsonBody: generateMockExtraction(fileName),
        };
      }
    }

    // Handle JSON-based requests (existing behavior)
    const body = (await request.json()) as ExtractDocumentRequest;

    if (Array.isArray(body?.blocks) && body.blocks.length > 0) {
      const blocks = body.blocks.map((block, index) =>
        coerceExtractedBlock(block, index),
      );
      return {
        status: 200,
        jsonBody: {
          documentId: body.documentId,
          blocks,
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
          error: "Provide either blocks[] or text",
        },
      };
    }

    const blocks: ExtractedBlock[] = extractBlocksFromPlainText(lines.join("\n"));

    return {
      status: 200,
      jsonBody: {
        documentId: body.documentId,
        blocks,
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
