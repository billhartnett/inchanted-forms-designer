/**
 * Geometry normalization utilities for coordinate transformation
 * Handles page-to-canvas coordinate conversion for multi-page PDFs
 */

export interface PageSize {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Normalize coordinates from PDF space to canvas space
 * Accounts for page scaling and multi-page layout
 */
export function normalizePageCoordinates(
  point: Point,
  pageIndex: number,
  pageSize: PageSize | null,
  canvasScale: number = 1,
  pageOffsets: number[] = []
): Point {
  if (!pageSize) return point;

  // Get Y offset for this page (account for multi-page vertical layout)
  const yOffset = pageOffsets[pageIndex] ?? 0;

  return {
    x: (point.x * canvasScale),
    y: (point.y * canvasScale) + yOffset,
  };
}

/**
 * Denormalize coordinates from canvas space back to PDF page space
 */
export function denormalizePageCoordinates(
  point: Point,
  pageIndex: number,
  pageSize: PageSize | null,
  canvasScale: number = 1,
  pageOffsets: number[] = []
): Point {
  if (!pageSize) return point;

  const yOffset = pageOffsets[pageIndex] ?? 0;

  return {
    x: point.x / canvasScale,
    y: (point.y - yOffset) / canvasScale,
  };
}

/**
 * Scale bounding box from PDF page coordinates to canvas coordinates
 */
export function scaleBoundingBox(
  bbox: BoundingBox,
  pageIndex: number,
  pageSize: PageSize | null,
  canvasScale: number = 1,
  pageOffsets: number[] = []
): BoundingBox {
  if (!pageSize) return bbox;

  const yOffset = pageOffsets[pageIndex] ?? 0;

  return {
    x: bbox.x * canvasScale,
    y: bbox.y * canvasScale + yOffset,
    width: bbox.width * canvasScale,
    height: bbox.height * canvasScale,
  };
}

/**
 * Compute Y offset for each page in a multi-page layout
 * Assumes pages are laid out vertically with optional padding
 */
export function computePageOffsets(
  pageCount: number,
  pageHeight: number,
  paddingBetweenPages: number = 20
): number[] {
  const offsets: number[] = [];
  let currentY = 0;

  for (let i = 0; i < pageCount; i++) {
    offsets.push(currentY);
    currentY += pageHeight + paddingBetweenPages;
  }

  return offsets;
}

/**
 * Calculate total canvas height for multi-page PDF
 */
export function calculateTotalCanvasHeight(
  pageCount: number,
  pageHeight: number,
  paddingBetweenPages: number = 20
): number {
  if (pageCount === 0) return 0;
  return pageCount * pageHeight + (pageCount - 1) * paddingBetweenPages;
}

/**
 * Get the page at a given Y coordinate
 * Useful for determining which page a field is on
 */
export function getPageAtYCoordinate(
  y: number,
  pageHeight: number,
  paddingBetweenPages: number = 20
): number {
  const cellHeight = pageHeight + paddingBetweenPages;
  return Math.floor(y / cellHeight);
}

/**
 * Constrain a field to stay within a single page
 */
export function constrainFieldToPage(
  field: BoundingBox,
  pageIndex: number,
  pageSize: PageSize,
  pageOffsets: number[]
): BoundingBox {
  const pageY = pageOffsets[pageIndex] ?? 0;
  const pageMaxY = pageY + pageSize.height;

  let constrained = { ...field };

  // Clamp X to page width
  constrained.x = Math.max(0, Math.min(constrained.x, pageSize.width - constrained.width));

  // Clamp Y to page height
  if (constrained.y < pageY) {
    constrained.y = pageY;
  }
  if (constrained.y + constrained.height > pageMaxY) {
    constrained.y = pageMaxY - constrained.height;
  }

  return constrained;
}

/**
 * Check if bounding box intersects with page bounds
 */
export function getBoundingBoxIntersection(
  bbox: BoundingBox,
  pageIndex: number,
  pageSize: PageSize,
  pageOffsets: number[]
): BoundingBox | null {
  const pageY = pageOffsets[pageIndex] ?? 0;
  const pageMaxY = pageY + pageSize.height;
  const pageMaxX = pageSize.width;

  // Check if completely outside
  if (
    bbox.x >= pageMaxX ||
    bbox.x + bbox.width <= 0 ||
    bbox.y >= pageMaxY ||
    bbox.y + bbox.height <= pageY
  ) {
    return null;
  }

  // Calculate intersection
  return {
    x: Math.max(0, bbox.x),
    y: Math.max(pageY, bbox.y),
    width: Math.min(pageMaxX, bbox.x + bbox.width) - Math.max(0, bbox.x),
    height: Math.min(pageMaxY, bbox.y + bbox.height) - Math.max(pageY, bbox.y),
  };
}
