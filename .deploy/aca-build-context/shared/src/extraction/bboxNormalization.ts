import type { BoundingBox, PolygonPoint } from "shared/types";

function toPoint(value: any): PolygonPoint | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const x = Number((value as any).x);
  const y = Number((value as any).y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  return { x, y };
}

export function boundsFromPolygon(polygon: any): BoundingBox {
  const points = Array.isArray(polygon)
    ? polygon
        .map((point) => (typeof point === "number" ? null : toPoint(point)))
        .filter((point): point is PolygonPoint => Boolean(point))
    : [];

  if (points.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    x: minX,
    y: minY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
  };
}

export function normalizeBoundingBox(
  raw: Partial<BoundingBox> | undefined,
  fallback: BoundingBox,
): BoundingBox {
  return {
    x: typeof raw?.x === "number" && Number.isFinite(raw.x) ? raw.x : fallback.x,
    y: typeof raw?.y === "number" && Number.isFinite(raw.y) ? raw.y : fallback.y,
    width: typeof raw?.width === "number" && Number.isFinite(raw.width) ? raw.width : fallback.width,
    height: typeof raw?.height === "number" && Number.isFinite(raw.height) ? raw.height : fallback.height,
  };
}