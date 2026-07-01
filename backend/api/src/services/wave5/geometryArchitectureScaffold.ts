export type GeometryBlock = {
  blockId: string;
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
};

export type GeometryCluster = {
  clusterId: string;
  pageIndex: number;
  blockIds: string[];
  centroidX: number;
  centroidY: number;
};

export type RelativeGeometryScoreInput = {
  anchor: GeometryBlock;
  candidate: GeometryBlock;
  horizontalWeight?: number;
  verticalWeight?: number;
  areaWeight?: number;
};

export type MultiBlockGeometryContext = {
  anchorBlockId: string;
  pageIndex: number;
  contextBlockIds: string[];
  contextWindowSize: number;
};

export type CarrierGeometryPattern = {
  patternId: string;
  axis: "x" | "y" | "area";
  operator: "lt" | "lte" | "gt" | "gte" | "eq";
  threshold: number;
  weight: number;
};

export type CarrierGeometryPatternMap = Record<string, CarrierGeometryPattern[]>;

export type CarrierPatternAdjustment = {
  score: number;
  matchedPatternIds: string[];
};

function normalizeToken(token: string): string {
  return String(token || "")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .trim();
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return Number(value.toFixed(6));
}

function clampNonNegative(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Number(value.toFixed(6));
}

function stableId(parts: string[]): string {
  return parts
    .map((part) => normalizeToken(part))
    .filter((part) => part.length > 0)
    .join("::");
}

function normalizeBlock(block: GeometryBlock): GeometryBlock {
  return {
    blockId: stableId(["block", block.blockId || "unknown"]),
    pageIndex: Math.max(0, Math.floor(block.pageIndex || 0)),
    x: clampNonNegative(block.x),
    y: clampNonNegative(block.y),
    width: clampNonNegative(block.width),
    height: clampNonNegative(block.height),
    label: block.label,
  };
}

function centerOf(block: GeometryBlock): { x: number; y: number } {
  return {
    x: block.x + block.width / 2,
    y: block.y + block.height / 2,
  };
}

function euclideanDistance(
  left: { x: number; y: number },
  right: { x: number; y: number },
): number {
  const dx = left.x - right.x;
  const dy = left.y - right.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function buildGeometryClusters(
  blocks: GeometryBlock[],
  maxDistance = 0.14,
): GeometryCluster[] {
  const normalizedBlocks = blocks
    .map(normalizeBlock)
    .sort((left, right) => left.pageIndex - right.pageIndex || left.blockId.localeCompare(right.blockId));

  const boundedMaxDistance = Math.max(0.01, Math.min(1, maxDistance));
  const clusters: GeometryCluster[] = [];

  for (const block of normalizedBlocks) {
    const blockCenter = centerOf(block);

    let matchedCluster: GeometryCluster | undefined;
    for (const cluster of clusters) {
      if (cluster.pageIndex !== block.pageIndex) continue;
      const clusterCenter = { x: cluster.centroidX, y: cluster.centroidY };
      if (euclideanDistance(blockCenter, clusterCenter) <= boundedMaxDistance) {
        matchedCluster = cluster;
        break;
      }
    }

    if (!matchedCluster) {
      clusters.push({
        clusterId: stableId(["cluster", String(block.pageIndex), block.blockId]),
        pageIndex: block.pageIndex,
        blockIds: [block.blockId],
        centroidX: Number(blockCenter.x.toFixed(6)),
        centroidY: Number(blockCenter.y.toFixed(6)),
      });
      continue;
    }

    matchedCluster.blockIds.push(block.blockId);
    matchedCluster.blockIds.sort((left, right) => left.localeCompare(right));

    const count = matchedCluster.blockIds.length;
    matchedCluster.centroidX = Number(
      ((matchedCluster.centroidX * (count - 1) + blockCenter.x) / count).toFixed(6),
    );
    matchedCluster.centroidY = Number(
      ((matchedCluster.centroidY * (count - 1) + blockCenter.y) / count).toFixed(6),
    );
  }

  return clusters.sort(
    (left, right) =>
      left.pageIndex - right.pageIndex ||
      left.clusterId.localeCompare(right.clusterId),
  );
}

export function scoreRelativeGeometryCandidate(
  input: RelativeGeometryScoreInput,
): number {
  const anchor = normalizeBlock(input.anchor);
  const candidate = normalizeBlock(input.candidate);

  const horizontalWeight = clamp01(input.horizontalWeight ?? 0.42);
  const verticalWeight = clamp01(input.verticalWeight ?? 0.38);
  const areaWeight = clamp01(input.areaWeight ?? 0.2);
  const weightTotal = horizontalWeight + verticalWeight + areaWeight;

  const effectiveHorizontalWeight = weightTotal > 0 ? horizontalWeight / weightTotal : 0.42;
  const effectiveVerticalWeight = weightTotal > 0 ? verticalWeight / weightTotal : 0.38;
  const effectiveAreaWeight = 1 - effectiveHorizontalWeight - effectiveVerticalWeight;

  const dx = Math.abs(anchor.x - candidate.x);
  const dy = Math.abs(anchor.y - candidate.y);
  const anchorArea = anchor.width * anchor.height;
  const candidateArea = candidate.width * candidate.height;
  const maxArea = Math.max(anchorArea, candidateArea, 1e-6);
  const areaDelta = Math.abs(anchorArea - candidateArea) / maxArea;

  const horizontalScore = 1 - clamp01(dx);
  const verticalScore = 1 - clamp01(dy);
  const areaScore = 1 - clamp01(areaDelta);

  return clamp01(
    horizontalScore * effectiveHorizontalWeight +
      verticalScore * effectiveVerticalWeight +
      areaScore * effectiveAreaWeight,
  );
}

export function buildMultiBlockGeometryContext(
  blocks: GeometryBlock[],
  anchorBlockId: string,
  contextWindowSize = 6,
): MultiBlockGeometryContext {
  const normalizedBlocks = blocks
    .map(normalizeBlock)
    .sort((left, right) => left.pageIndex - right.pageIndex || left.blockId.localeCompare(right.blockId));

  const normalizedAnchorId = stableId(["block", anchorBlockId]);
  const anchor =
    normalizedBlocks.find((block) => block.blockId === normalizedAnchorId) ||
    normalizedBlocks[0] || {
      blockId: stableId(["block", "fallback"]),
      pageIndex: 0,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    };

  const boundedWindowSize = Math.max(1, Math.min(24, Math.floor(contextWindowSize)));
  const samePageBlocks = normalizedBlocks.filter((block) => block.pageIndex === anchor.pageIndex);
  const anchorCenter = centerOf(anchor);

  const orderedByDistance = samePageBlocks
    .map((block) => ({
      block,
      distance: euclideanDistance(anchorCenter, centerOf(block)),
    }))
    .sort(
      (left, right) =>
        left.distance - right.distance || left.block.blockId.localeCompare(right.block.blockId),
    )
    .slice(0, boundedWindowSize)
    .map((entry) => entry.block.blockId);

  return {
    anchorBlockId: anchor.blockId,
    pageIndex: anchor.pageIndex,
    contextBlockIds: orderedByDistance,
    contextWindowSize: boundedWindowSize,
  };
}

export function resolveCarrierSpecificGeometryPatterns(
  carrierId: string | undefined,
  globalPatterns: CarrierGeometryPattern[],
  carrierPatternMap?: CarrierGeometryPatternMap,
): CarrierGeometryPattern[] {
  const normalizedCarrier = normalizeToken(carrierId || "");
  const carrierPatterns =
    normalizedCarrier.length > 0 && carrierPatternMap && carrierPatternMap[normalizedCarrier]
      ? carrierPatternMap[normalizedCarrier]
      : [];

  const combined = [...globalPatterns, ...carrierPatterns]
    .map((pattern) => ({
      patternId: stableId(["pattern", pattern.patternId]),
      axis: pattern.axis,
      operator: pattern.operator,
      threshold: clamp01(pattern.threshold),
      weight: clamp01(pattern.weight),
    }))
    .sort((left, right) => left.patternId.localeCompare(right.patternId));

  const byId = new Map<string, CarrierGeometryPattern>();
  for (const pattern of combined) {
    const existing = byId.get(pattern.patternId);
    if (!existing || pattern.weight > existing.weight) {
      byId.set(pattern.patternId, pattern);
    }
  }

  return [...byId.values()].sort((left, right) => left.patternId.localeCompare(right.patternId));
}

function evaluatePattern(
  pattern: CarrierGeometryPattern,
  x: number,
  y: number,
  area: number,
): boolean {
  const operand = pattern.axis === "x" ? x : pattern.axis === "y" ? y : area;
  if (pattern.operator === "lt") return operand < pattern.threshold;
  if (pattern.operator === "lte") return operand <= pattern.threshold;
  if (pattern.operator === "gt") return operand > pattern.threshold;
  if (pattern.operator === "gte") return operand >= pattern.threshold;
  return Math.abs(operand - pattern.threshold) < 1e-6;
}

export function applyCarrierPatternAdjustments(
  baseScore: number,
  target: GeometryBlock,
  patterns: CarrierGeometryPattern[],
): CarrierPatternAdjustment {
  const normalizedTarget = normalizeBlock(target);
  const targetCenter = centerOf(normalizedTarget);
  const targetArea = normalizedTarget.width * normalizedTarget.height;

  let score = clamp01(baseScore);
  const matchedPatternIds: string[] = [];

  for (const pattern of patterns) {
    const isMatch = evaluatePattern(pattern, targetCenter.x, targetCenter.y, targetArea);
    if (!isMatch) continue;

    matchedPatternIds.push(pattern.patternId);
    score = clamp01(score + pattern.weight * 0.08);
  }

  return {
    score,
    matchedPatternIds: matchedPatternIds.sort((left, right) => left.localeCompare(right)),
  };
}
