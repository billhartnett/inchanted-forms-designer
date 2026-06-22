import type { ExtractedLine, PageExtraction } from "shared/types";
import { boundsFromPolygon } from "./bboxNormalization";

function quantize(value: number, digits = 4): number {
  return Number(value.toFixed(digits));
}

function compareLines(left: ExtractedLine, right: ExtractedLine): number {
  const leftY = left.boundingBox?.y ?? 0;
  const rightY = right.boundingBox?.y ?? 0;
  const leftX = left.boundingBox?.x ?? 0;
  const rightX = right.boundingBox?.x ?? 0;

  return (
    leftY - rightY ||
    leftX - rightX ||
    left.content.localeCompare(right.content)
  );
}

export function normalizeExtractedPages(rawPages: any[]): PageExtraction[] {
  const pages = rawPages.map((page) => ({
    pageNumber: Number(page?.pageNumber) || 1,
    width: typeof page?.width === "number" ? quantize(page.width) : undefined,
    height: typeof page?.height === "number" ? quantize(page.height) : undefined,
    unit: typeof page?.unit === "string" ? page.unit : undefined,
    lines: Array.isArray(page?.lines)
      ? page.lines.map((line: any) => normalizeExtractedLine(line)).sort(compareLines)
      : [],
  }));

  return pages.sort((left, right) => left.pageNumber - right.pageNumber);
}

export function normalizeExtractedLine(rawLine: any): ExtractedLine {
  const content = typeof rawLine?.content === "string" ? rawLine.content : "";
  const polygon = Array.isArray(rawLine?.polygon)
    ? rawLine.polygon
    : Array.isArray(rawLine?.boundingBox)
      ? rawLine.boundingBox
      : undefined;

  return {
    content,
    confidence:
      typeof rawLine?.confidence === "number" && Number.isFinite(rawLine.confidence)
        ? quantize(rawLine.confidence)
        : undefined,
    polygon:
      Array.isArray(polygon) && typeof polygon[0] !== "number"
        ? polygon.map((point: any) => ({
            x: Number(point?.x ?? 0),
            y: Number(point?.y ?? 0),
          }))
        : undefined,
    boundingBox: (() => {
      const bounds = boundsFromPolygon(polygon);
      return {
        x: quantize(bounds.x),
        y: quantize(bounds.y),
        width: quantize(bounds.width),
        height: quantize(bounds.height),
      };
    })(),
  };
}