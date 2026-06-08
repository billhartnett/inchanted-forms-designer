import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";

import {
  type ExtractedBlock,
  mapBlocksToAcord,
} from "../src/services/mappingEngine";

type MapFieldsRequest = {
  documentId?: string;
  blocks?: ExtractedBlock[];
  context?: string;
};

function isValidBlockType(value: unknown): value is ExtractedBlock["type"] {
  return (
    value === "text" ||
    value === "checkbox" ||
    value === "radio" ||
    value === "signature" ||
    value === "table" ||
    value === "kvp"
  );
}

function sanitizeBlock(raw: any, index: number): ExtractedBlock {
  return {
    id:
      typeof raw?.id === "string" && raw.id.trim()
        ? raw.id
        : `block-${index + 1}`,
    page:
      typeof raw?.page === "number" && Number.isFinite(raw.page)
        ? Math.max(1, Math.floor(raw.page))
        : 1,
    type: isValidBlockType(raw?.type) ? raw.type : "text",
    text: typeof raw?.text === "string" ? raw.text : "",
    boundingBox: {
      x:
        typeof raw?.boundingBox?.x === "number" &&
        Number.isFinite(raw.boundingBox.x)
          ? raw.boundingBox.x
          : 0,
      y:
        typeof raw?.boundingBox?.y === "number" &&
        Number.isFinite(raw.boundingBox.y)
          ? raw.boundingBox.y
          : 0,
      width:
        typeof raw?.boundingBox?.width === "number" &&
        Number.isFinite(raw.boundingBox.width)
          ? raw.boundingBox.width
          : 0,
      height:
        typeof raw?.boundingBox?.height === "number" &&
        Number.isFinite(raw.boundingBox.height)
          ? raw.boundingBox.height
          : 0,
    },
    confidence:
      typeof raw?.confidence === "number" && Number.isFinite(raw.confidence)
        ? Math.min(1, Math.max(0, raw.confidence))
        : 0.5,
  };
}

export async function mapFields(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const body = (await request.json()) as MapFieldsRequest;

    if (!Array.isArray(body?.blocks) || body.blocks.length === 0) {
      return {
        status: 400,
        jsonBody: {
          error: "blocks must be a non-empty array",
        },
      };
    }

    const blocks = body.blocks
      .map(sanitizeBlock)
      .filter((block) => block.text.trim().length > 0);

    if (blocks.length === 0) {
      return {
        status: 400,
        jsonBody: {
          error: "No valid text blocks found",
        },
      };
    }

    const mappings = await mapBlocksToAcord(blocks, {
      context: body.context,
    });

    return {
      status: 200,
      jsonBody: {
        documentId: body.documentId,
        mappings,
      },
    };
  } catch (error: any) {
    context.error("mapFields error", error);
    return {
      status: 500,
      jsonBody: {
        error: "Failed to map fields",
        details: error?.message || "Unknown error",
      },
    };
  }
}

app.http("mapFields", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "mapFields",
  handler: mapFields,
});
