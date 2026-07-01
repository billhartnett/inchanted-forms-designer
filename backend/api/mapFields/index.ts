import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { createHash } from "node:crypto";

import {
  mapBlocksWithAcord,
} from "../../mapping";
import { getDefaultOntologyMetadata } from "shared/acord";
import { coerceExtractedBlock } from "../../extraction";
import type {
  CalibrationProfile,
  ExtractedBlock,
  FieldMapping,
  MappingPersistencePayload,
  UnifiedDecisionGraph,
} from "../../types";

type LayoutLmPageImageInput = {
  page: number;
  imageBase64: string;
};

type LayoutLmPageDimensionsInput = {
  page: number;
  width: number;
  height: number;
};

type LayoutLmTopPrediction = {
  eLabelName: string;
  logit: number;
  probability: number;
  category?: string;
  refinementPath?: string;
};

type LayoutLmFieldEvaluation = {
  page: number;
  tokenCount: number;
  topPredictions: LayoutLmTopPrediction[];
};

type LayoutLmInferResponse = {
  top_n_predictions?: Array<{
    eLabelName?: string;
    logit?: number;
    probability?: number;
    category?: string;
    refinement_path?: string;
  }>;
  block_distributions?: Array<{
    blockId?: string;
    top_n_predictions?: Array<{
      eLabelName?: string;
      logit?: number;
      probability?: number;
      category?: string;
      refinement_path?: string;
    }>;
  }>;
};

type MapFieldsRequest = {
  documentId?: string;
  blocks?: ExtractedBlock[];
  context?: string;
  deterministic?: boolean;
  calibrationProfile?: CalibrationProfile;
  familyId?: string;
  decisionGraph?: UnifiedDecisionGraph;
  semanticMemorySnapshot?: MappingPersistencePayload["semanticMemorySnapshot"];
  semanticMemoryDecisions?: MappingPersistencePayload["semanticMemoryDecisions"];
  pageImages?: LayoutLmPageImageInput[];
  pageDimensions?: LayoutLmPageDimensionsInput[];
  layoutLmPrimaryClassifier?: boolean;
  wave5GeometryEnabled?: boolean;
  wave5CategoryModeEnabled?: boolean;
  wave5ReflowEnabled?: boolean;
  wave5TuningProfile?: {
    stageOneBaseWeight?: number;
    stageOneSemanticWeight?: number;
    stageTwoStageOneWeight?: number;
    stageTwoGeometryWeight?: number;
    stageThreeStageTwoWeight?: number;
    stageThreeCategoryWeight?: number;
    stageThreeBias?: number;
    fusionSemanticWeight?: number;
    fusionGeometryWeight?: number;
    fusionCategoryWeight?: number;
    contextBoostScale?: number;
    carrierBaseBoost?: number;
    carrierTokenBoost?: number;
    carrierPolicyBoost?: number;
  };
};

const LAYOUTLM_INFER_URL =
  process.env.LAYOUTLM_INFER_URL || "http://localhost:8090/infer";
const LAYOUTLM_BATCH_INFER_URL =
  process.env.LAYOUTLM_BATCH_INFER_URL || "http://localhost:8090/infer-batch";
const LAYOUTLM_TOP_N = 10;
const LAYOUTLM_TIMEOUT_MS = Math.max(
  30000,
  Number(process.env.LAYOUTLM_TIMEOUT_MS || 90000),
);
const LAYOUTLM_PAGE_CONCURRENCY = Math.max(
  1,
  Number(process.env.LAYOUTLM_PAGE_CONCURRENCY || 1),
);
const LAYOUTLM_USE_BATCH_ENDPOINT = process.env.LAYOUTLM_USE_BATCH_ENDPOINT === "1";
const LAYOUTLM_BATCH_PAGE_SIZE = Math.max(
  1,
  Number(process.env.LAYOUTLM_BATCH_PAGE_SIZE || 1),
);
const LAYOUTLM_MAX_ELIGIBLE_PAGES = Math.max(
  1,
  Number(process.env.LAYOUTLM_MAX_ELIGIBLE_PAGES || 1),
);
const LAYOUTLM_MAX_PAGE_TOKENS = Math.max(
  64,
  Number(process.env.LAYOUTLM_MAX_PAGE_TOKENS || 128),
);
const LAYOUTLM_MAX_TOKENS_PER_BLOCK = Math.max(
  1,
  Number(process.env.LAYOUTLM_MAX_TOKENS_PER_BLOCK || 8),
);
const LAYOUTLM_PAGE_CACHE_TTL_MS = Math.max(
  0,
  Number(process.env.LAYOUTLM_PAGE_CACHE_TTL_MS || 30 * 60 * 1000),
);
const LAYOUTLM_PAGE_CACHE_MAX_ENTRIES = Math.max(
  16,
  Number(process.env.LAYOUTLM_PAGE_CACHE_MAX_ENTRIES || 1024),
);
const LAYOUTLM_MODEL_VERSION =
  process.env.CATEGORY_MODEL_DIR ||
  process.env.FINETUNED_MODEL_DIR ||
  process.env.LAYOUTLM_MODEL_VERSION ||
  "unknown-model";

type LayoutLmInferInput = {
  pageImageBase64: string;
  ocrTokens: string[];
  boundingBoxes: [number, number, number, number][];
  tokenBlockIds: string[];
};

type LayoutLmPageCacheEntry = {
  expiresAt: number;
  value: LayoutLmInferResponse;
};

type LayoutLmPagePlan = {
  page: number;
  inferInput: LayoutLmInferInput;
  cacheKey: string;
  tokenCountsByBlock: Map<string, number>;
  signalScore: number;
};

type LayoutLmDiagnostics = {
  pageCount: number;
  eligiblePageCount: number;
  skippedPageCount: number;
  cacheHitCount: number;
  cacheMissCount: number;
  blockCacheHitCount: number;
  blockCacheMissCount: number;
  batchCallCount: number;
  batchItemCount: number;
  singleInferCount: number;
  batchFallbackCount: number;
  skipReasons: Record<string, number>;
};

const layoutLmPageCache = new Map<string, LayoutLmPageCacheEntry>();
const layoutLmBlockCache = new Map<string, LayoutLmPageCacheEntry>();
const layoutLmCategoryPriorCache = new Map<
  string,
  { expiresAt: number; counts: Record<string, number>; total: number }
>();
const LAYOUTLM_CATEGORY_PRIOR_MIN_COUNT = Math.max(
  1,
  Number(process.env.LAYOUTLM_CATEGORY_PRIOR_MIN_COUNT || 3),
);
const LAYOUTLM_CATEGORY_PRIOR_SHARE = Math.max(
  0.4,
  Math.min(0.95, Number(process.env.LAYOUTLM_CATEGORY_PRIOR_SHARE || 0.65)),
);
const TOKEN_STOPWORDS = new Set([
  "the",
  "and",
  "or",
  "of",
  "to",
  "for",
  "a",
  "an",
  "in",
  "on",
  "at",
  "by",
  "with",
  "is",
  "are",
  "be",
  "as",
  "from",
]);

function stableHash(input: string): string {
  return createHash("sha1").update(input).digest("hex");
}

function normalizeBase64Payload(imageBase64: string): string {
  return imageBase64.replace(/^data:[^,]+,/, "").replace(/\s+/g, "").trim();
}

function normalizeFingerprintText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildPageImageFingerprint(imageBase64: string): string {
  return stableHash(normalizeBase64Payload(imageBase64));
}

function buildDocumentFingerprint(
  documentId: string | undefined,
  pageImages: LayoutLmPageImageInput[] | undefined,
): string {
  if (documentId && documentId.trim().length > 0) {
    return stableHash(`doc:${normalizeFingerprintText(documentId)}`);
  }
  const minimal = (pageImages || [])
    .map((item) => `${item.page}:${buildPageImageFingerprint(item.imageBase64)}`)
    .sort((a, b) => a.localeCompare(b))
    .join("|");
  return stableHash(`pages:${minimal}`);
}

function buildPageRequestFingerprint(input: LayoutLmInferInput): string {
  const tokenSig = input.ocrTokens.map((token) => normalizeFingerprintText(token)).join("\u001f");
  const bboxSig = input.boundingBoxes.map((box) => box.join(",")).join("\u001e");
  const blockSig = input.tokenBlockIds
    .map((blockId) => normalizeFingerprintText(blockId))
    .join("\u001f");
  const imageSig = buildPageImageFingerprint(input.pageImageBase64);
  return stableHash(`${tokenSig}|${bboxSig}|${blockSig}|${imageSig}`);
}

function buildPageCacheKey(args: {
  documentFingerprint: string;
  page: number;
  modelVersion: string;
  topN: number;
  requestFingerprint: string;
}): string {
  return [
    args.documentFingerprint,
    String(args.page),
    args.modelVersion,
    String(args.topN),
    args.requestFingerprint,
  ].join("::");
}

function pruneLayoutLmPageCache(now: number): void {
  for (const [key, entry] of layoutLmPageCache.entries()) {
    if (entry.expiresAt <= now) {
      layoutLmPageCache.delete(key);
    }
  }

  while (layoutLmPageCache.size > LAYOUTLM_PAGE_CACHE_MAX_ENTRIES) {
    const oldestKey = layoutLmPageCache.keys().next().value;
    if (!oldestKey) break;
    layoutLmPageCache.delete(oldestKey);
  }
}

function readLayoutLmPageCache(key: string): LayoutLmInferResponse | undefined {
  if (LAYOUTLM_PAGE_CACHE_TTL_MS <= 0) return undefined;
  const now = Date.now();
  const found = layoutLmPageCache.get(key);
  if (!found) return undefined;
  if (found.expiresAt <= now) {
    layoutLmPageCache.delete(key);
    return undefined;
  }
  return found.value;
}

function readLayoutLmBlockCache(key: string): LayoutLmFieldEvaluation | undefined {
  const found = readLayoutLmPageCache(key);
  if (!found || typeof found !== "object") return undefined;
  return found as unknown as LayoutLmFieldEvaluation;
}

function writeLayoutLmBlockCache(key: string, value: LayoutLmFieldEvaluation): void {
  writeLayoutLmPageCache(key, value as unknown as LayoutLmInferResponse);
}

function readLayoutLmCategoryPrior(documentFingerprint: string): Record<string, number> | undefined {
  const now = Date.now();
  const found = layoutLmCategoryPriorCache.get(documentFingerprint);
  if (!found) return undefined;
  if (found.expiresAt <= now) {
    layoutLmCategoryPriorCache.delete(documentFingerprint);
    return undefined;
  }
  return found.counts;
}

function updateLayoutLmCategoryPrior(documentFingerprint: string, categories: string[]): void {
  if (categories.length === 0 || LAYOUTLM_PAGE_CACHE_TTL_MS <= 0) return;
  const now = Date.now();
  const found = layoutLmCategoryPriorCache.get(documentFingerprint);
  const counts = { ...(found?.counts || {}) };
  let total = Number(found?.total || 0);
  for (const category of categories) {
    const normalized = category.trim();
    if (!normalized) continue;
    counts[normalized] = (counts[normalized] || 0) + 1;
    total += 1;
  }
  layoutLmCategoryPriorCache.set(documentFingerprint, {
    expiresAt: now + LAYOUTLM_PAGE_CACHE_TTL_MS,
    counts,
    total,
  });
}

function hasStrongLayoutLmCategoryPrior(documentFingerprint: string): boolean {
  const found = layoutLmCategoryPriorCache.get(documentFingerprint);
  if (!found || found.expiresAt <= Date.now() || found.total < LAYOUTLM_CATEGORY_PRIOR_MIN_COUNT) {
    return false;
  }
  const maxCount = Object.values(found.counts).reduce((max, count) => Math.max(max, count), 0);
  if (maxCount <= 0) return false;
  return maxCount / Math.max(1, found.total) >= LAYOUTLM_CATEGORY_PRIOR_SHARE;
}

function applyLayoutLmCategoryPrior(
  documentFingerprint: string,
  topPredictions: LayoutLmTopPrediction[],
): LayoutLmTopPrediction[] {
  if (topPredictions.length <= 1) return topPredictions;
  const prior = readLayoutLmCategoryPrior(documentFingerprint);
  if (!prior) return topPredictions;
  return [...topPredictions].sort((left, right) => {
    const leftPrior = left.category ? Number(prior[left.category] || 0) : 0;
    const rightPrior = right.category ? Number(prior[right.category] || 0) : 0;
    if (rightPrior !== leftPrior) return rightPrior - leftPrior;
    return right.probability - left.probability;
  });
}

function extractLayoutLmCategories(infer: LayoutLmInferResponse): string[] {
  const out: string[] = [];
  for (const item of infer.top_n_predictions || []) {
    if (item?.category) out.push(String(item.category));
  }
  for (const dist of infer.block_distributions || []) {
    const first = Array.isArray(dist?.top_n_predictions) ? dist.top_n_predictions[0] : undefined;
    if (first?.category) out.push(String(first.category));
  }
  return out;
}

function writeLayoutLmPageCache(key: string, value: LayoutLmInferResponse): void {
  if (LAYOUTLM_PAGE_CACHE_TTL_MS <= 0) return;
  const now = Date.now();
  pruneLayoutLmPageCache(now);
  layoutLmPageCache.set(key, {
    expiresAt: now + LAYOUTLM_PAGE_CACHE_TTL_MS,
    value,
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeBoxTo1000(
  box: ExtractedBlock["boundingBox"],
  pageWidth: number,
  pageHeight: number,
): [number, number, number, number] {
  const safeWidth = Math.max(1, pageWidth);
  const safeHeight = Math.max(1, pageHeight);

  const x0 = Math.round(clamp((box.x / safeWidth) * 1000, 0, 1000));
  const y0 = Math.round(clamp((box.y / safeHeight) * 1000, 0, 1000));
  const x1 = Math.round(
    clamp(((box.x + box.width) / safeWidth) * 1000, x0, 1000),
  );
  const y1 = Math.round(
    clamp(((box.y + box.height) / safeHeight) * 1000, y0, 1000),
  );

  return [x0, y0, x1, y1];
}

function tokenizeBlockText(text: string): string[] {
  return text
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function collapseTokensAggressive(tokens: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  let previous = "";
  for (const raw of tokens) {
    const normalized = normalizeFingerprintText(raw).replace(/\s+/g, "");
    if (!normalized || normalized.length < 2) continue;
    if (TOKEN_STOPWORDS.has(normalized)) continue;
    if (normalized === previous) continue;
    if (seen.has(normalized) && !/\d/.test(normalized)) continue;
    previous = normalized;
    seen.add(normalized);
    out.push(raw);
    if (out.length >= LAYOUTLM_MAX_TOKENS_PER_BLOCK) {
      break;
    }
  }
  return out;
}

function hasFieldCueText(text: string): boolean {
  return /(?:[:?]$|\b(name|address|city|state|zip|postal|phone|email|date|policy|insured|applicant|effective|expiration|coverage|limit|premium|number|id|code|license|vin|loss|claim|year)\b)/i.test(
    text,
  );
}

function isLikelyLowSignalPage(pageBlocks: ExtractedBlock[]): string | undefined {
  const tokenCount = pageBlocks.reduce(
    (sum, block) => sum + tokenizeBlockText(block.text).length,
    0,
  );
  const fieldCueCount = pageBlocks.filter((block) => hasFieldCueText(block.text)).length;
  const averageTokensPerBlock = pageBlocks.length > 0 ? tokenCount / pageBlocks.length : 0;

  if (tokenCount < 14) {
    return "low-token-page";
  }

  if (fieldCueCount === 0 && tokenCount < 40) {
    return "no-field-cues";
  }

  if (fieldCueCount <= 1 && pageBlocks.length <= 3 && averageTokensPerBlock < 8) {
    return "sparse-field-cues";
  }

  if (fieldCueCount > 0) {
    return undefined;
  }

  if (pageBlocks.length === 1 && tokenCount <= 12) {
    return "singleton-low-signal";
  }

  if (
    pageBlocks.length <= 3 &&
    fieldCueCount <= 1 &&
    tokenCount <= 24
  ) {
    return "minimal-field-signal";
  }

  if (
    pageBlocks.length <= 2 &&
    tokenCount <= 18 &&
    pageBlocks.every((block) => {
      const normalized = block.text.trim().toLowerCase();
      return (
        normalized.length === 0 ||
        normalized.length > 140 ||
        /(?:acord|application|supplement|certificate|insurance|company|inc|llc|www|fax|phone)/.test(
          normalized,
        )
      );
    })
  ) {
    return "nonfield-page";
  }

  return undefined;
}

function hasGeometrySkipSignal(
  pageBlocks: ExtractedBlock[],
  dims: { width: number; height: number },
): string | undefined {
  const pageArea = Math.max(1, dims.width * dims.height);
  const coverage = pageBlocks.reduce((sum, block) => {
    const area = Math.max(0, block.boundingBox.width) * Math.max(0, block.boundingBox.height);
    return sum + area;
  }, 0) / pageArea;
  const middleBand = pageBlocks.filter((block) => {
    const centerY = block.boundingBox.y + block.boundingBox.height / 2;
    return centerY >= dims.height * 0.2 && centerY <= dims.height * 0.85;
  }).length;

  if (coverage < 0.012 && middleBand === 0) {
    return "geometry-header-footer-only";
  }
  if (pageBlocks.length <= 3 && coverage < 0.008) {
    return "geometry-sparse-coverage";
  }
  return undefined;
}

function shouldEarlyExitBlockEvaluation(block: ExtractedBlock, tokenCount: number): boolean {
  const normalized = normalizeFingerprintText(block.text);
  if (tokenCount <= 1) return true;
  if (normalized.length < 3) return true;
  if (!hasFieldCueText(block.text) && tokenCount < 3 && !/\d/.test(block.text)) {
    return true;
  }
  return false;
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    out.push(items.slice(index, index + chunkSize));
  }
  return out;
}

async function inferLayoutLmForPage(input: LayoutLmInferInput): Promise<LayoutLmInferResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LAYOUTLM_TIMEOUT_MS);
  try {
    const response = await fetch(LAYOUTLM_INFER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        page_image_base64: input.pageImageBase64,
        ocr_tokens: input.ocrTokens,
        bounding_boxes: input.boundingBoxes,
        token_block_ids: input.tokenBlockIds,
        top_n: LAYOUTLM_TOP_N,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `LayoutLM infer failed (${response.status}): ${errorText || "unknown error"}`,
      );
    }

    return (await response.json()) as LayoutLmInferResponse;
  } finally {
    clearTimeout(timeout);
  }
}

async function inferLayoutLmForPagesBatch(
  inputs: LayoutLmInferInput[],
): Promise<LayoutLmInferResponse[]> {
  if (!LAYOUTLM_USE_BATCH_ENDPOINT || inputs.length <= 1) {
    const out: LayoutLmInferResponse[] = [];
    for (const input of inputs) {
      out.push(await inferLayoutLmForPage(input));
    }
    return out;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LAYOUTLM_TIMEOUT_MS);
  try {
    const response = await fetch(LAYOUTLM_BATCH_INFER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        items: inputs.map((input) => ({
          page_image_base64: input.pageImageBase64,
          ocr_tokens: input.ocrTokens,
          bounding_boxes: input.boundingBoxes,
          token_block_ids: input.tokenBlockIds,
          top_n: LAYOUTLM_TOP_N,
        })),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `LayoutLM batch infer failed (${response.status}): ${errorText || "unknown error"}`,
      );
    }

    const payload = (await response.json()) as { results?: LayoutLmInferResponse[] };
    const results = Array.isArray(payload?.results) ? payload.results : [];
    if (results.length !== inputs.length) {
      throw new Error(
        `LayoutLM batch infer result length mismatch: expected ${inputs.length}, got ${results.length}`,
      );
    }
    return results;
  } finally {
    clearTimeout(timeout);
  }
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let cursor = 0;

  const runners = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      await worker(items[index], index);
    }
  });

  await Promise.all(runners);
}

async function evaluateLayoutLmAtPageLevel(
  blocks: ExtractedBlock[],
  pageImages: LayoutLmPageImageInput[] | undefined,
  pageDimensions: LayoutLmPageDimensionsInput[] | undefined,
  documentId: string | undefined,
  context: InvocationContext,
): Promise<{ byBlockId: Record<string, LayoutLmFieldEvaluation>; diagnostics: LayoutLmDiagnostics }> {
  if (!Array.isArray(pageImages) || pageImages.length === 0) {
    return {
      byBlockId: {},
      diagnostics: {
        pageCount: 0,
        eligiblePageCount: 0,
        skippedPageCount: 0,
        cacheHitCount: 0,
        cacheMissCount: 0,
        blockCacheHitCount: 0,
        blockCacheMissCount: 0,
        batchCallCount: 0,
        batchItemCount: 0,
        singleInferCount: 0,
        batchFallbackCount: 0,
        skipReasons: {},
      },
    };
  }

  const blocksByPage = new Map<number, ExtractedBlock[]>();
  for (const block of blocks) {
    const pageBlocks = blocksByPage.get(block.page) || [];
    pageBlocks.push(block);
    blocksByPage.set(block.page, pageBlocks);
  }

  const dimensionByPage = new Map<number, { width: number; height: number }>();
  for (const dim of pageDimensions || []) {
    if (
      Number.isFinite(dim?.page) &&
      Number.isFinite(dim?.width) &&
      Number.isFinite(dim?.height) &&
      dim.width > 0 &&
      dim.height > 0
    ) {
      dimensionByPage.set(dim.page, { width: dim.width, height: dim.height });
    }
  }

  const byBlockId: Record<string, LayoutLmFieldEvaluation> = {};
  const blockById = new Map<string, ExtractedBlock>();
  for (const block of blocks) {
    blockById.set(block.id, block);
  }
  const diagnostics: LayoutLmDiagnostics = {
    pageCount: pageImages.length,
    eligiblePageCount: 0,
    skippedPageCount: 0,
    cacheHitCount: 0,
    cacheMissCount: 0,
    blockCacheHitCount: 0,
    blockCacheMissCount: 0,
    batchCallCount: 0,
    batchItemCount: 0,
    singleInferCount: 0,
    batchFallbackCount: 0,
    skipReasons: {},
  };
  const documentFingerprint = buildDocumentFingerprint(documentId, pageImages);
  const pagePlans: Array<LayoutLmPagePlan | undefined> = new Array(pageImages.length);

  await runWithConcurrency(pageImages, LAYOUTLM_PAGE_CONCURRENCY, async (pageImage, index) => {
    const pageNumber = pageImage?.page;
    if (!Number.isFinite(pageNumber)) return;

    const pageBlocks = blocksByPage.get(pageNumber) || [];
    if (pageBlocks.length === 0) return;
    const pageFieldCueCount = pageBlocks.filter((block) => hasFieldCueText(block.text)).length;

    const dims = dimensionByPage.get(pageNumber);
    if (!dims) {
      diagnostics.skippedPageCount += 1;
      diagnostics.skipReasons.missing_page_dimensions =
        (diagnostics.skipReasons.missing_page_dimensions || 0) + 1;
      context.warn(
        `mapFields layoutlm skipped page ${pageNumber}: missing page dimensions`,
      );
      return;
    }

    const lowSignalReason = isLikelyLowSignalPage(pageBlocks);
    if (lowSignalReason) {
      diagnostics.skippedPageCount += 1;
      diagnostics.skipReasons[lowSignalReason] =
        (diagnostics.skipReasons[lowSignalReason] || 0) + 1;
      return;
    }

    const geometryReason = hasGeometrySkipSignal(pageBlocks, dims);
    if (geometryReason) {
      diagnostics.skippedPageCount += 1;
      diagnostics.skipReasons[geometryReason] =
        (diagnostics.skipReasons[geometryReason] || 0) + 1;
      return;
    }

    if (pageFieldCueCount <= 1 && hasStrongLayoutLmCategoryPrior(documentFingerprint)) {
      diagnostics.skippedPageCount += 1;
      diagnostics.skipReasons.category_prior_skip =
        (diagnostics.skipReasons.category_prior_skip || 0) + 1;
      return;
    }

    const ocrTokens: string[] = [];
    const boundingBoxes: [number, number, number, number][] = [];
    const tokenBlockIds: string[] = [];
    const tokenCountsByBlock = new Map<string, number>();

    for (const block of pageBlocks) {
      const tokens = collapseTokensAggressive(tokenizeBlockText(block.text));
      if (!tokens.length) continue;

      const normalizedBox = normalizeBoxTo1000(
        block.boundingBox,
        dims.width,
        dims.height,
      );

      const cappedTokens = tokens.slice(0, LAYOUTLM_MAX_TOKENS_PER_BLOCK);
      for (const token of cappedTokens) {
        if (ocrTokens.length >= LAYOUTLM_MAX_PAGE_TOKENS) {
          break;
        }
        ocrTokens.push(token);
        boundingBoxes.push(normalizedBox);
        tokenBlockIds.push(block.id);
        tokenCountsByBlock.set(block.id, (tokenCountsByBlock.get(block.id) || 0) + 1);
      }

      if (ocrTokens.length >= LAYOUTLM_MAX_PAGE_TOKENS) {
        break;
      }
    }

    if (!ocrTokens.length || !boundingBoxes.length) {
      diagnostics.skippedPageCount += 1;
      diagnostics.skipReasons.empty_token_payload =
        (diagnostics.skipReasons.empty_token_payload || 0) + 1;
      return;
    }

    const inferInput: LayoutLmInferInput = {
      pageImageBase64: pageImage.imageBase64,
      ocrTokens,
      boundingBoxes,
      tokenBlockIds,
    };

    const requestFingerprint = buildPageRequestFingerprint(inferInput);
    const cacheKey = buildPageCacheKey({
      documentFingerprint,
      page: pageNumber,
      modelVersion: LAYOUTLM_MODEL_VERSION,
      topN: LAYOUTLM_TOP_N,
      requestFingerprint,
    });

    pagePlans[index] = {
      page: pageNumber,
      inferInput,
      cacheKey,
      tokenCountsByBlock,
      signalScore: pageFieldCueCount * 100 + tokenCountsByBlock.size * 10 + ocrTokens.length,
    };
  });

  const readyPlans = pagePlans.filter((plan): plan is LayoutLmPagePlan => Boolean(plan));
  if (readyPlans.length === 0) {
    return { byBlockId, diagnostics };
  }

  readyPlans.sort(
    (left, right) =>
      right.signalScore - left.signalScore ||
      left.page - right.page,
  );

  const selectedPlans = readyPlans.slice(0, LAYOUTLM_MAX_ELIGIBLE_PAGES);
  const droppedPlans = Math.max(0, readyPlans.length - selectedPlans.length);
  if (droppedPlans > 0) {
    diagnostics.skippedPageCount += droppedPlans;
    diagnostics.skipReasons.eligible_page_cap_exceeded =
      (diagnostics.skipReasons.eligible_page_cap_exceeded || 0) + droppedPlans;
  }
  diagnostics.eligiblePageCount = selectedPlans.length;

  const pageResultByPage = new Map<number, LayoutLmInferResponse>();
  const cachedPlans: LayoutLmPagePlan[] = [];
  const uncachedPlans: LayoutLmPagePlan[] = [];

  for (const plan of selectedPlans) {
    const cached = readLayoutLmPageCache(plan.cacheKey);
    if (cached) {
      diagnostics.cacheHitCount += 1;
      pageResultByPage.set(plan.page, cached);
      cachedPlans.push(plan);
    } else {
      diagnostics.cacheMissCount += 1;
      uncachedPlans.push(plan);
    }
  }

  if (uncachedPlans.length > 0) {
    const batches = chunkArray(uncachedPlans, LAYOUTLM_BATCH_PAGE_SIZE);
    for (const batch of batches) {
      try {
        if (LAYOUTLM_USE_BATCH_ENDPOINT && batch.length > 1) {
          diagnostics.batchCallCount += 1;
          diagnostics.batchItemCount += batch.length;
          const results = await inferLayoutLmForPagesBatch(batch.map((plan) => plan.inferInput));
          results.forEach((result, resultIndex) => {
            const plan = batch[resultIndex];
            pageResultByPage.set(plan.page, result);
            writeLayoutLmPageCache(plan.cacheKey, result);
          });
        } else {
          diagnostics.singleInferCount += batch.length;
          if (batch.length > 1) {
            diagnostics.batchFallbackCount += 1;
          }
          for (const plan of batch) {
            const result = await inferLayoutLmForPage(plan.inferInput);
            pageResultByPage.set(plan.page, result);
            writeLayoutLmPageCache(plan.cacheKey, result);
          }
        }
      } catch (error: any) {
        context.warn(
          `mapFields layoutlm batch failed (${batch.length} pages): ${
            error?.message || "unknown"
          }`,
        );
        diagnostics.singleInferCount += batch.length;
        for (const plan of batch) {
          try {
            const result = await inferLayoutLmForPage(plan.inferInput);
            pageResultByPage.set(plan.page, result);
            writeLayoutLmPageCache(plan.cacheKey, result);
          } catch (singleError: any) {
            context.warn(
              `mapFields layoutlm fallback failed on page ${plan.page}: ${
                singleError?.message || "unknown"
              }`,
            );
          }
        }
      }
    }
  }

  for (const plan of selectedPlans) {
    const infer = pageResultByPage.get(plan.page);
    if (!infer) continue;
    updateLayoutLmCategoryPrior(documentFingerprint, extractLayoutLmCategories(infer));

    const pageBlocks = blocksByPage.get(plan.page) || [];
    const blockDistributions = Array.isArray(infer.block_distributions)
      ? infer.block_distributions
      : [];

    if (blockDistributions.length > 0) {
      for (const distribution of blockDistributions) {
        const blockId = String(distribution?.blockId || "").trim();
        if (!blockId) continue;
        const block = blockById.get(blockId);
        const tokenCount = plan.tokenCountsByBlock.get(blockId) || 0;
        if (block && shouldEarlyExitBlockEvaluation(block, tokenCount)) {
          diagnostics.skipReasons.block_early_exit =
            (diagnostics.skipReasons.block_early_exit || 0) + 1;
          continue;
        }

        const blockCacheKey = `${plan.cacheKey}::${normalizeFingerprintText(block?.text || blockId)}::${blockId}`;
        const cachedBlock = readLayoutLmBlockCache(blockCacheKey);
        if (cachedBlock) {
          diagnostics.blockCacheHitCount += 1;
          byBlockId[blockId] = cachedBlock;
          continue;
        }
        diagnostics.blockCacheMissCount += 1;

        const topPredictions: LayoutLmTopPrediction[] = Array.isArray(
          distribution.top_n_predictions,
        )
          ? distribution.top_n_predictions
              .map((item) => ({
                eLabelName: String(item?.eLabelName || ""),
                logit: Number(item?.logit || 0),
                probability: Number(item?.probability || 0),
                category: item?.category ? String(item.category) : undefined,
                refinementPath: item?.refinement_path ? String(item.refinement_path) : undefined,
              }))
              .filter((item) => item.eLabelName.length > 0)
          : [];

        const adjustedPredictions = applyLayoutLmCategoryPrior(
          documentFingerprint,
          topPredictions,
        );

        const evaluation: LayoutLmFieldEvaluation = {
          page: plan.page,
          tokenCount,
          topPredictions: adjustedPredictions,
        };
        byBlockId[blockId] = evaluation;
        writeLayoutLmBlockCache(blockCacheKey, evaluation);
      }
      continue;
    }

    const topPredictions: LayoutLmTopPrediction[] = Array.isArray(infer.top_n_predictions)
      ? infer.top_n_predictions
          .map((item) => ({
            eLabelName: String(item?.eLabelName || ""),
            logit: Number(item?.logit || 0),
            probability: Number(item?.probability || 0),
            category: item?.category ? String(item.category) : undefined,
            refinementPath: item?.refinement_path ? String(item.refinement_path) : undefined,
          }))
          .filter((item) => item.eLabelName.length > 0)
      : [];

    const adjustedPredictions = applyLayoutLmCategoryPrior(
      documentFingerprint,
      topPredictions,
    );
    for (const block of pageBlocks) {
      const blockTokenCount = plan.tokenCountsByBlock.get(block.id) || 0;
      if (shouldEarlyExitBlockEvaluation(block, blockTokenCount)) {
        diagnostics.skipReasons.block_early_exit =
          (diagnostics.skipReasons.block_early_exit || 0) + 1;
        continue;
      }
      const blockCacheKey = `${plan.cacheKey}::${normalizeFingerprintText(block.text)}::${block.id}`;
      const cachedBlock = readLayoutLmBlockCache(blockCacheKey);
      if (cachedBlock) {
        diagnostics.blockCacheHitCount += 1;
        byBlockId[block.id] = cachedBlock;
        continue;
      }
      diagnostics.blockCacheMissCount += 1;
      const evaluation: LayoutLmFieldEvaluation = {
        page: plan.page,
        tokenCount: blockTokenCount,
        topPredictions: adjustedPredictions,
      };
      byBlockId[block.id] = evaluation;
      writeLayoutLmBlockCache(blockCacheKey, evaluation);
    }
  }

  return {
    byBlockId,
    diagnostics,
  };
}

function createMappingDecisionGraph(
  mappings: FieldMapping[],
  existing?: UnifiedDecisionGraph,
): UnifiedDecisionGraph {
  const orderedMappings = [...mappings].sort(
    (left, right) =>
      left.blockId.localeCompare(right.blockId) ||
      left.page - right.page ||
      left.text.localeCompare(right.text),
  );

  return {
    labels: existing?.labels || {},
    fields: existing?.fields || {},
    mappings: Object.fromEntries(
      orderedMappings.map((mapping) => [
        mapping.blockId,
        {
          artifactId: mapping.blockId,
          decision: "pending" as const,
          linkedArtifactIds: [mapping.blockId].sort((left, right) => left.localeCompare(right)),
          chosenCandidateCode: mapping.chosen?.acordCode,
          candidateDecisions: Object.fromEntries(
            [...mapping.suggestions]
              .sort((left, right) => left.acordCode.localeCompare(right.acordCode))
              .map((candidate) => [candidate.acordCode, "pending" as const]),
          ),
          rationale: mapping.rationale,
        },
      ]),
    ),
    confidenceThresholds: existing?.confidenceThresholds || {
      accepted: 0.8,
      review: 0.6,
      rejected: 0.45,
    },
  };
}

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
  const block = coerceExtractedBlock(raw, index);
  return {
    ...block,
    type: isValidBlockType(raw?.type) ? raw.type : block.type,
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

    const layoutLmByBlockPromise = evaluateLayoutLmAtPageLevel(
      blocks,
      body.pageImages,
      body.pageDimensions,
      body.documentId,
      context,
    ).catch((error: any) => {
      context.warn(
        `mapFields layoutlm evaluation failed: ${error?.message || "unknown error"}`,
      );
      return {
        byBlockId: {} as Record<string, LayoutLmFieldEvaluation>,
        diagnostics: {
          pageCount: 0,
          eligiblePageCount: 0,
          skippedPageCount: 0,
          cacheHitCount: 0,
          cacheMissCount: 0,
          blockCacheHitCount: 0,
          blockCacheMissCount: 0,
          batchCallCount: 0,
          batchItemCount: 0,
          singleInferCount: 0,
          batchFallbackCount: 0,
          skipReasons: {},
        },
      };
    });

    const layoutLmEvaluation = await layoutLmByBlockPromise;
    const layoutLmByBlock = layoutLmEvaluation.byBlockId;

    const mappings = await mapBlocksWithAcord(blocks, {
      context: body.context,
      deterministic: body.deterministic === true,
      calibrationProfile: body.calibrationProfile,
      familyId: body.familyId,
      semanticMemorySnapshot: body.semanticMemorySnapshot,
      semanticMemoryDecisions: body.semanticMemoryDecisions,
      layoutLmByBlock,
      layoutLmPrimaryClassifier: body.layoutLmPrimaryClassifier,
      wave5GeometryEnabled: body.wave5GeometryEnabled,
      wave5CategoryModeEnabled: body.wave5CategoryModeEnabled,
      wave5ReflowEnabled: body.wave5ReflowEnabled,
      wave5TuningProfile: body.wave5TuningProfile,
    });
    const mappingsWithLayoutLm = mappings.map((mapping) => ({
      ...mapping,
      // Evaluation-only enrichment: no candidate scores or selected mapping are changed.
      layoutlmEvaluation: layoutLmByBlock[mapping.blockId],
    }));

    return {
      status: 200,
      jsonBody: {
        documentId: body.documentId,
        mappings: mappingsWithLayoutLm,
        decisionGraph: createMappingDecisionGraph(mappings, body.decisionGraph),
        layoutlmDiagnostics: layoutLmEvaluation.diagnostics,
        ontologyAlignment: getDefaultOntologyMetadata(),
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
