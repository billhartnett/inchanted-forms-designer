import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import {
  coerceExtractedBlock,
  extractBlocksFromPlainText,
  createDocumentAnalysisClient,
  normalizeExtractedPages,
  inferSemanticFields,
  buildTypedFields,
  buildHybridFieldExtraction,
} from "../extraction";
import type {
  ExtractedBlock,
  ExtractDocumentDiagnostics,
  ExtractDocumentGroupedStructures,
  ExtractDocumentErrorResponse,
  ExtractDocumentFieldCatalogEntry,
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

type CanonicalExtractResponse = {
  fields: ReturnType<typeof buildTypedFields>;
  fieldCatalog: ExtractDocumentFieldCatalogEntry[];
  groupedStructures: ExtractDocumentGroupedStructures;
  extractionDiagnostics: ExtractDocumentDiagnostics;
};

function buildEmptyGroupedStructures(): ExtractDocumentGroupedStructures {
  return {
    tables: [],
    questionAnswerPairs: [],
    checkboxGroups: [],
  };
}

function buildDiagnosticsFromBlocks(blocks: ExtractedBlock[]): ExtractDocumentDiagnostics {
  return {
    blankRegionCount: 0,
    tableCellCount: blocks.filter((block) => block.type === "table").length,
    inferredInputCount: blocks.length,
    layoutLmEvaluatedPages: 0,
    layoutLmFailures: 0,
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

      const jsonBody: CanonicalExtractResponse = {
        fields: hybridExtraction.fields,
        fieldCatalog: hybridExtraction.fieldCatalog,
        groupedStructures,
        extractionDiagnostics: hybridExtraction.diagnostics,
      };

      return {
        status: 200,
        jsonBody,
      };
    }

    const body = (await request.json()) as ExtractDocumentRequest;

    if (Array.isArray(body?.blocks) && body.blocks.length > 0) {
      const blocks = body.blocks.map((block, index) => coerceExtractedBlock(block, index));
      const inferences = inferSemanticFields(blocks);
      const fields = buildTypedFields(blocks, inferences);
      const jsonBody: CanonicalExtractResponse = {
        fields,
        fieldCatalog: [],
        groupedStructures: buildEmptyGroupedStructures(),
        extractionDiagnostics: buildDiagnosticsFromBlocks(blocks),
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
    const inferences = inferSemanticFields(blocks);
    const fields = buildTypedFields(blocks, inferences);
    const jsonBody: CanonicalExtractResponse = {
      fields,
      fieldCatalog: [],
      groupedStructures: buildEmptyGroupedStructures(),
      extractionDiagnostics: buildDiagnosticsFromBlocks(blocks),
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
