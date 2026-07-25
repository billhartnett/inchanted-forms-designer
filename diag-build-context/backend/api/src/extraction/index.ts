import type { ExtractedBlock } from "shared/types";
import { normalizeBoundingBox } from "./bboxNormalization";

export { createDocumentAnalysisClient } from "./documentIntelligence";
export { buildTypedField, buildTypedFields } from "./fieldFactory";
export { detectLabel, detectLabels } from "./labelDetection";
export { normalizeExtractedPages, normalizeExtractedLine } from "./pageExtraction";
export { inferSemanticField, inferSemanticFields } from "./semanticInference";
export { buildHybridFieldExtraction } from "./hybridFieldExtraction";
export {
  classifyBlockSemantic,
  classifyCategoryMode,
  classifySemanticLabel,
} from "./semanticLabelClassifier";
export { boundsFromPolygon, normalizeBoundingBox } from "./bboxNormalization";

function hashString(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

function normalizeNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Number(value.toFixed(4))
    : fallback;
}

export function coerceExtractedBlock(
  raw: Partial<ExtractedBlock> | undefined,
  index: number,
): ExtractedBlock {
  const page =
    typeof raw?.page === "number" && Number.isFinite(raw.page)
      ? Math.max(1, Math.floor(raw.page))
      : 1;
  const type =
    raw?.type === "checkbox" ||
    raw?.type === "radio" ||
    raw?.type === "signature" ||
    raw?.type === "table" ||
    raw?.type === "kvp"
      ? raw.type
      : "text";
  const text = typeof raw?.text === "string" ? raw.text : "";
  const boundingBox = normalizeBoundingBox(raw?.boundingBox, {
    x: 40,
    y: 40 + index * 24,
    width: 300,
    height: 20,
  });
  const normalizedBounds = {
    x: normalizeNumber(boundingBox.x, 0),
    y: normalizeNumber(boundingBox.y, 0),
    width: normalizeNumber(boundingBox.width, 0),
    height: normalizeNumber(boundingBox.height, 0),
  };
  const deterministicId = `block-${hashString(
    `${page}:${type}:${text}:${normalizedBounds.x}:${normalizedBounds.y}:${normalizedBounds.width}:${normalizedBounds.height}`,
  )}`;

  return {
    id:
      typeof raw?.id === "string" && raw.id.trim()
        ? raw.id
        : deterministicId,
    page,
    type,
    text,
    boundingBox: normalizedBounds,
    confidence:
      typeof raw?.confidence === "number" && Number.isFinite(raw.confidence)
        ? Number(Math.min(1, Math.max(0, raw.confidence)).toFixed(4))
        : 0.8,
  };
}

export function extractBlocksFromPlainText(text: string): ExtractedBlock[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) =>
      coerceExtractedBlock(
        {
          id: `line-${index + 1}`,
          page: 1,
          type: "text",
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
}