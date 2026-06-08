import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";

import { type ExtractedBlock } from "../src/services/mappingEngine";

type ExtractDocumentRequest = {
  documentId?: string;
  text?: string;
  blocks?: Partial<ExtractedBlock>[];
};

function toBlock(raw: Partial<ExtractedBlock>, index: number): ExtractedBlock {
  return {
    id:
      typeof raw.id === "string" && raw.id.trim()
        ? raw.id
        : `block-${index + 1}`,
    page:
      typeof raw.page === "number" && Number.isFinite(raw.page)
        ? Math.max(1, Math.floor(raw.page))
        : 1,
    type:
      raw.type === "checkbox" ||
      raw.type === "radio" ||
      raw.type === "signature" ||
      raw.type === "table" ||
      raw.type === "kvp"
        ? raw.type
        : "text",
    text: typeof raw.text === "string" ? raw.text : "",
    boundingBox: {
      x:
        typeof raw.boundingBox?.x === "number" &&
        Number.isFinite(raw.boundingBox.x)
          ? raw.boundingBox.x
          : 40,
      y:
        typeof raw.boundingBox?.y === "number" &&
        Number.isFinite(raw.boundingBox.y)
          ? raw.boundingBox.y
          : 40 + index * 24,
      width:
        typeof raw.boundingBox?.width === "number" &&
        Number.isFinite(raw.boundingBox.width)
          ? raw.boundingBox.width
          : 300,
      height:
        typeof raw.boundingBox?.height === "number" &&
        Number.isFinite(raw.boundingBox.height)
          ? raw.boundingBox.height
          : 20,
    },
    confidence:
      typeof raw.confidence === "number" && Number.isFinite(raw.confidence)
        ? Math.min(1, Math.max(0, raw.confidence))
        : 0.8,
  };
}

export async function extractDocument(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const body = (await request.json()) as ExtractDocumentRequest;

    if (Array.isArray(body?.blocks) && body.blocks.length > 0) {
      const blocks = body.blocks.map((block, index) => toBlock(block, index));
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

    const blocks: ExtractedBlock[] = lines.map((line, index) =>
      toBlock(
        {
          id: `line-${index + 1}`,
          type: "text",
          page: 1,
          text: line,
          confidence: 0.85,
          boundingBox: {
            x: 40,
            y: 40 + index * 24,
            width: 520,
            height: 20,
          },
        },
        index,
      ),
    );

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
