import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import {
  coerceExtractedBlock,
  extractBlocksFromPlainText,
} from "../../extraction";
import type { ExtractedBlock } from "../../types";

type ExtractDocumentRequest = {
  documentId?: string;
  text?: string;
  blocks?: Partial<ExtractedBlock>[];
};

export async function extractDocument(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
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
