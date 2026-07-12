import type { BoundingBox } from "shared/types";

export function normalizeBoundingBox(
  value: Partial<BoundingBox> | undefined,
  fallback?: Partial<BoundingBox>,
): BoundingBox {
  return {
    x: Number.isFinite(value?.x) ? Number(value?.x) : Number(fallback?.x ?? 0),
    y: Number.isFinite(value?.y) ? Number(value?.y) : Number(fallback?.y ?? 0),
    width: Math.max(
      1,
      Number.isFinite(value?.width)
        ? Number(value?.width)
        : Number(fallback?.width ?? 1),
    ),
    height: Math.max(
      1,
      Number.isFinite(value?.height)
        ? Number(value?.height)
        : Number(fallback?.height ?? 1),
    ),
  };
}

export function boundsFromPolygon(
  polygon:
    | Array<number>
    | Array<{
        x?: number;
        y?: number;
      }>
    | undefined,
  scaleX = 1,
  scaleY = 1,
): BoundingBox {
  if (!Array.isArray(polygon) || polygon.length === 0) {
    return normalizeBoundingBox(undefined, { x: 0, y: 0, width: 1, height: 1 });
  }

  const points =
    typeof polygon[0] === "number"
      ? (polygon as number[]).reduce<Array<{ x: number; y: number }>>((acc, value, index, source) => {
          if (index % 2 === 0 && index + 1 < source.length) {
            acc.push({
              x: Number(value) * scaleX,
              y: Number(source[index + 1]) * scaleY,
            });
          }
          return acc;
        }, [])
      : (polygon as Array<{ x?: number; y?: number }>).map((point) => ({
          x: Number(point.x ?? 0) * scaleX,
          y: Number(point.y ?? 0) * scaleY,
        }));

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);

  return normalizeBoundingBox({
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(1, Math.max(...xs) - Math.min(...xs)),
    height: Math.max(1, Math.max(...ys) - Math.min(...ys)),
  });
}