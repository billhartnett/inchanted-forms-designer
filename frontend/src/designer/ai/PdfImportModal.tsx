import { pdfToImages } from "../../utils/pdfToImages";
import { useState, type ChangeEvent } from "react";
import type { AcordLabelCandidate } from "../../../../shared/src/acord/acordTypes";
import type {
  BoundingBox,
  ExtractionArtifacts,
  ExtractionResult,
  ExtractedBlock,
  Field,
  FieldDraft,
  FieldMetadataSource,
  FieldMapping,
  LabelDetection,
  NormalizedBoundingBox,
  PageExtraction,
  SemanticFieldType,
} from "../../../../shared/src/types";
import { ExtractionViewer } from "../../extraction";
import { useExtractionStore } from "../../state";
import { useMappingStore } from "../../state/mappingStore";
import {
  runHybridExtraction,
  runMappingFlow,
} from "../../api/wave9Integration";
import { useDesignerStore } from "../state/useDesignerStore";

type ImportResult = {
  importedPages: number;
  mappedFields: number;
  warning?: string;
};

type PdfImportModalProps = {
  onClose: () => void;
  onImportResult?: (result: ImportResult) => void;
  mode?: "import" | "map-only";
};

type HybridCatalogRole =
  | "input"
  | "business"
  | "contact"
  | "producer"
  | "agency"
  | "applicant"
  | "company"
  | "underwriter"
  | "address"
  | "email"
  | "phone"
  | "website"
  | "checkbox"
  | "select"
  | "table-cell"
  | "value-region"
  | "row_label"
  | "column_header"
  | "question"
  | "label"
  | "header"
  | "title"
  | "footer"
  | "description";

type HybridCatalogEntry = {
  id: string;
  page: number;
  role: HybridCatalogRole;
  valueType: string;
  text: string;
  boundingBox: BoundingBox;
  semanticValueRegion?: BoundingBox;
  semanticLabel?: string;
  groupId?: string;
  tableId?: string;
  rowIndex?: number;
  columnIndex?: number;
};

type ExtractDocumentResponse = Pick<ExtractionResult, "pages"> & {
  documentId?: string;
  blocks?: ExtractedBlock[];
  fieldCatalog?: HybridCatalogEntry[];
  groupedStructures?: Record<string, unknown>;
  bboxNormalization?: Record<string, unknown>;
  pageDimensions?: Array<{ page: number; width: number; height: number }>;
};

type HybridMappingResponse = {
  mappings?: FieldMapping[];
  mappedFields?: FieldMapping[];
  fieldCatalog?: HybridCatalogEntry[];
  groupedStructures?: Record<string, unknown>;
  bboxNormalization?: Record<string, unknown>;
};

type MapFieldMapping = FieldMapping;

type DraftMappedField = {
  blockId: string;
  blockType: ExtractedBlock["type"];
  pageIndex: number;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  accepted: boolean;
  chosen?: AcordLabelCandidate;
  semanticRole?: HybridCatalogRole;
  /** Typed field shape built from buildTypedFieldPreview. Used in applyMappedFields. */
  fieldPreview?: Field;
};

type Wave8AnchorPromotion = { id?: string; label?: string; reason?: string };
type Wave8CheckboxCandidate = {
  blockId?: string;
  text?: string;
  checked?: boolean;
  confidence?: number;
  boundingBox?: BoundingBox;
};
type Wave8PairedLabel = {
  text?: string;
  blockId?: string;
  boundingBox?: BoundingBox;
};
type Wave8SelectionMarkAssociation = {
  selectionMarkBlockId?: string;
  labelBlockId?: string;
  labelText?: string;
  checked?: boolean;
  confidence?: number;
  boundingBox?: BoundingBox;
};
type Wave8ResolverFlags = {
  contractorsInsuredNameResolverApplied?: boolean;
  wave8TargetedAnchorPromoted?: string;
};
type Wave8GatingMetadata = {
  passed?: boolean;
  thresholdDecision?: string;
  thresholdReason?: string;
  rejectReasons?: string[];
  semanticConsistency?: number;
  dictionaryConsistency?: number;
  categoryConsistency?: number;
  supervisionBoost?: number;
};
type Wave8SuppressionMetadata = {
  suppressed?: boolean;
  reason?: string;
  iou?: number;
  winnerBlockId?: string;
  nonField?: boolean;
  headerBlock?: boolean;
};
type HybridFieldMetadata = {
  blockId: string;
  blockGeometry: BoundingBox;
  categoryMode?: string;
  semanticLabel: string;
  pairedLabel?: Wave8PairedLabel;
  resolverFlags: Wave8ResolverFlags;
  supervisionBoost?: number;
  gatingMetadata: Wave8GatingMetadata;
  suppressionMetadata: Wave8SuppressionMetadata;
  fieldType?: SemanticFieldType;
  selectionMarkAssociations: Wave8SelectionMarkAssociation[];
  checkboxCandidates: Wave8CheckboxCandidate[];
  anchorPromotions: Wave8AnchorPromotion[];
  confidenceScores: {
    confidenceScore?: number;
    normalizedConfidenceScore?: number;
    semanticScore?: number;
    dictionaryScore?: number;
    categoryScore?: number;
    supervisionBoost?: number;
  };
  groupKey: string;
  groupLabel: string;
  semanticRole?: HybridCatalogRole;
  tableId?: string;
  rowIndex?: number;
  columnIndex?: number;
};

type AutoMapSummary = {
  totalBlocks: number;
  keptBlocks: number;
  filteredBlocks: number;
  filteredByReason: Record<string, number>;
  filteredSamples: Array<{ reason: string; text: string }>;
  candidateMappings: number;
  keptMappings: number;
  filteredMappings: number;
};

function hasAlphabetic(text: string) {
  return /[a-z]/i.test(text);
}

function normalizeOcrText(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasFieldCueToken(text: string) {
  const normalized = normalizeOcrText(text);
  if (!normalized) return false;

  return /(name|address|city|state|zip|postal|phone|email|dob|birth|date|policy|insured|applicant|license|years|employees|number of)/.test(
    normalized,
  );
}

function isLikelyInstructionOrQuestion(text: string) {
  const normalized = normalizeOcrText(text);
  if (!normalized) return false;

  if (/[?]$/.test(text.trim())) return true;

  if (
    /^(if yes|if no|please explain|describe|list |include |to be submitted)/.test(
      normalized,
    )
  ) {
    return true;
  }

  return /(supplemental application|submitted with acord|claims during the last|operations in detail)/.test(
    normalized,
  );
}

function isLikelyHeaderLogoText(text: string) {
  const normalized = normalizeOcrText(text);
  if (!normalized) return false;

  const hasOrgWords =
    /(insurance company|agency|services|corporation|inc|llc|www|phone|fax)/.test(
      normalized,
    );
  const hasPhoneLike = /(\d{3}[\s\-\)]*\d{3}[\s\-]\d{4})/.test(text);
  return hasOrgWords || hasPhoneLike;
}

function isLikelySectionTitle(text: string) {
  const normalized = normalizeOcrText(text);
  if (!normalized) return false;

  const tokens = normalized.split(" ").filter(Boolean);
  if (tokens.length < 3) return false;

  const hasTitleWords =
    /(application|supplemental|coverage|insurance|contractors)/.test(
      normalized,
    );

  const uppercaseOnly = text
    .replace(/[^A-Za-z]/g, "")
    .split("")
    .every((char) => char === char.toUpperCase());

  return hasTitleWords || uppercaseOnly;
}

function isLikelyTabularSchemaText(text: string) {
  const normalized = normalizeOcrText(text);
  if (!normalized) return false;

  if (/^\d+\.$/.test(normalized) || /^[a-z]\.$/.test(normalized)) {
    return true;
  }

  if (/\byes\b.*\bno\b|\bno\b.*\byes\b/.test(normalized)) {
    return true;
  }

  return /(type of work performed|receipts|location|start date|end date|full time employees|part time employees|day laborers|kind of license|license no|year license issued|date of corporate filing)/.test(
    normalized,
  );
}

function isAllCapsShortLabel(text: string) {
  const normalized = text.trim().replace(/[^A-Za-z\s]/g, "");
  if (!normalized) return false;

  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || tokens.length > 3) return false;

  const allCaps = tokens.every((token) => /^[A-Z]+$/.test(token));
  const shortWordCount = tokens.every((token) => token.length <= 6);

  return allCaps && shortWordCount;
}

function inferBlockType(text: string): ExtractedBlock["type"] {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  if (/\u2610|\u2611|\u2612|\[\s?\]|\(\s?\)|selection_mark_(selected|unselected)/.test(trimmed)) {
    return "checkbox";
  }

  if (/signature|sign here|signed by|authorized signature/i.test(lower)) {
    return "signature";
  }

  if (/^[a-z0-9\s\-\/\.,#&]+:\s*.+$/i.test(trimmed)) {
    return "kvp";
  }

  return "text";
}

function isValueLikeField(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return false;

  if (trimmed.endsWith(":")) return false;

  return (
    /\d/.test(trimmed) ||
    /\b(yes|no|n\/a|male|female)\b/i.test(trimmed) ||
    /^[A-Za-z][A-Za-z\s'\-]+$/.test(trimmed)
  );
}

function blockPriority(block: ExtractedBlock): number {
  if (block.type === "kvp") return 100;
  if (block.type === "checkbox" || block.type === "radio") return 90;
  if (block.type === "signature") return 80;
  if (isValueLikeField(block.text)) return 70;
  return 10;
}

function hasCheckboxShapeCue(text: string): boolean {
  return /\u2610|\u2611|\u2612|\[\s?\]|\(\s?\)|\byes\s*\/\s*no\b|\bno\s*\/\s*yes\b|selection_mark_(selected|unselected)/i.test(
    text,
  );
}

function hasTokenOverlap(left: string, right: string): boolean {
  const leftTokens = normalizeOcrText(left).split(" ").filter((t) => t.length >= 3);
  const rightTokens = normalizeOcrText(right).split(" ").filter((t) => t.length >= 3);
  if (leftTokens.length === 0 || rightTokens.length === 0) return false;

  return leftTokens.some((l) => rightTokens.some((r) => r.includes(l) || l.includes(r)));
}

function isCandidateCompatible(text: string, label: string): boolean {
  const source = normalizeOcrText(text);
  const candidate = normalizeOcrText(label);

  if (!source || !candidate) return false;
  if (hasTokenOverlap(source, candidate)) return true;

  if (/\bname\b/.test(source) && /\b(name|insured|applicant|contact)\b/.test(candidate)) return true;
  if (/\baddress\b/.test(source) && /\b(address|street|city|state|postal|zip|location)\b/.test(candidate)) return true;
  if (/\b(city|state)\b/.test(source) && /\b(city|state|province|postal|zip|address)\b/.test(candidate)) return true;
  if (/\b(zip|postal)\b/.test(source) && /\b(zip|postal)\b/.test(candidate)) return true;
  if (/\b(phone|fax|email)\b/.test(source) && /\b(phone|fax|email|contact)\b/.test(candidate)) return true;
  if (/\b(date|dob|birth)\b/.test(source) && /\b(date|birth)\b/.test(candidate)) return true;

  return false;
}

function isHardMismatch(text: string, label: string): boolean {
  const source = normalizeOcrText(text);
  const candidate = normalizeOcrText(label);

  if (/\bagent\b/.test(source) && /\bnamed insured|insured given|applicant given\b/.test(candidate)) {
    return true;
  }

  if (/\b(id|code|sub code|customer id|bureau)\b/.test(source) && /\bname|insured|applicant\b/.test(candidate)) {
    return true;
  }

  if (/\bzip|postal\b/.test(source) && !/\bzip|postal|address\b/.test(candidate)) {
    return true;
  }

  return false;
}

function readImageSize(
  dataUrl: string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () =>
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () =>
      reject(new Error("Failed to read PDF image dimensions"));
    image.src = dataUrl;
  });
}

function toMetadataSource(source: AcordLabelCandidate["source"]) {
  if (source === "manual") {
    return "manual";
  }

  return source === "ai" ? "ai" : "ocr";
}

function buildLabelDetections(
  blocks: ExtractedBlock[],
  rejectionByBlockId: Map<string, string>,
): LabelDetection[] {
  return blocks.map((block) => {
    const normalizedText = normalizeOcrText(block.text);
    const cues: string[] = [];

    if (block.text.trim().endsWith(":")) {
      cues.push("trailing-colon");
    }

    if (hasFieldCueToken(block.text)) {
      cues.push("field-cue-token");
    }

    if (block.type === "checkbox") {
      cues.push("checkbox-shape");
    }

    const rejectedReason = rejectionByBlockId.get(block.id);

    return {
      blockId: block.id,
      normalizedText,
      isLabel: !rejectedReason && cues.length > 0,
      cues,
      rejectedReason,
    };
  });
}

function inferFieldType(
  block: ExtractedBlock,
  candidate?: AcordLabelCandidate,
): SemanticFieldType {
  if (block.type === "checkbox") return "checkbox";
  if (block.type === "radio") return "radio";
  if (block.type === "signature") return "signature";

  const text = `${block.text} ${candidate?.label ?? ""} ${candidate?.description ?? ""}`.toLowerCase();
  if (/(date|dob|birth|effective|expiration)/.test(text)) return "date";
  if (/(amount|premium|deductible|limit|employees|number|zip|postal|years)/.test(text)) {
    return "numeric";
  }

  return "text";
}

function toCanonicalName(text: string) {
  return normalizeOcrText(text).replace(/\s+/g, "_");
}

function isBoxLike(value: unknown): value is BoundingBox {
  if (!value || typeof value !== "object") return false;
  const box = value as Partial<BoundingBox>;
  return (
    Number.isFinite(box.x) &&
    Number.isFinite(box.y) &&
    Number.isFinite(box.width) &&
    Number.isFinite(box.height)
  );
}

function toBoundingBox(value: unknown, fallback: BoundingBox): BoundingBox {
  if (!isBoxLike(value)) {
    return fallback;
  }

  return {
    x: Number(value.x) || 0,
    y: Number(value.y) || 0,
    width: Math.max(1, Number(value.width) || 1),
    height: Math.max(1, Number(value.height) || 1),
  };
}

function deriveHybridGroupLabel(semanticLabel: string, rawText: string): string {
  const text = normalizeOcrText(`${semanticLabel} ${rawText}`);
  if (/namedinsured|insured|identity|person_name/.test(text)) return "identity";
  if (/producer|agent|agency/.test(text)) return "agent";
  if (/applicant|party_information/.test(text)) return "applicant";
  if (/operations|operations_description|contracting/.test(text)) return "operations";
  return "general";
}

function readHybridMappingMetadata(
  mapping: MapFieldMapping,
  sourceBlock: ExtractedBlock,
): HybridFieldMetadata {
  const diag = ((mapping as any).mappingDiagnostics || {}) as Record<string, unknown>;
  const wave9Decision = (mapping as any).wave9Decision || undefined;
  const chosen =
    wave9Decision || mapping.chosen || (mapping as any).topCandidate || mapping.suggestions?.[0];

  const blockGeometry = toBoundingBox(
    (mapping as any).blockGeometry,
    toBoundingBox(mapping.boundingBox, sourceBlock.boundingBox),
  );

  const pairedLabel: Wave8PairedLabel | undefined = (() => {
    const paired = (mapping as any).pairedLabel as unknown;
    if (paired && typeof paired === "object") {
      const input = paired as Record<string, unknown>;
      return {
        text: typeof input.text === "string" ? input.text : undefined,
        blockId: typeof input.blockId === "string" ? input.blockId : undefined,
        boundingBox: isBoxLike(input.boundingBox)
          ? toBoundingBox(input.boundingBox, blockGeometry)
          : undefined,
      };
    }

    const pairLabel =
      typeof diag.wave8SelectionMarkPairLabel === "string"
        ? (diag.wave8SelectionMarkPairLabel as string)
        : undefined;
    if (pairLabel) {
      return { text: pairLabel };
    }
    return undefined;
  })();

  const selectionMarkAssociations: Wave8SelectionMarkAssociation[] = Array.isArray(
    (mapping as any).selectionMarkAssociations,
  )
    ? ((mapping as any).selectionMarkAssociations as Array<Record<string, unknown>>).map((entry) => ({
        selectionMarkBlockId:
          typeof entry.selectionMarkBlockId === "string"
            ? entry.selectionMarkBlockId
            : undefined,
        labelBlockId: typeof entry.labelBlockId === "string" ? entry.labelBlockId : undefined,
        labelText: typeof entry.labelText === "string" ? entry.labelText : undefined,
        checked: Boolean(entry.checked),
        confidence:
          typeof entry.confidence === "number" && Number.isFinite(entry.confidence)
            ? entry.confidence
            : undefined,
        boundingBox: isBoxLike(entry.boundingBox)
          ? toBoundingBox(entry.boundingBox, blockGeometry)
          : undefined,
      }))
    : [];

  const checkboxCandidates: Wave8CheckboxCandidate[] = Array.isArray(
    (mapping as any).checkboxCandidates,
  )
    ? ((mapping as any).checkboxCandidates as Array<Record<string, unknown>>).map((entry) => ({
        blockId: typeof entry.blockId === "string" ? entry.blockId : undefined,
        text: typeof entry.text === "string" ? entry.text : undefined,
        checked: Boolean(entry.checked),
        confidence:
          typeof entry.confidence === "number" && Number.isFinite(entry.confidence)
            ? entry.confidence
            : undefined,
        boundingBox: isBoxLike(entry.boundingBox)
          ? toBoundingBox(entry.boundingBox, blockGeometry)
          : undefined,
      }))
    : [];

  const hasCheckboxCue = hasCheckboxShapeCue(
    `${String(sourceBlock.text || "")} ${String(mapping.text || "")}`,
  );
  const declaredFieldType = String((mapping as any).fieldType || "").toLowerCase();
  const wave9FieldType = String((mapping as any).wave9FieldType || wave9Decision?.fieldType || "").toLowerCase();
  if (
    selectionMarkAssociations.length === 0 &&
    checkboxCandidates.length === 0 &&
    (sourceBlock.type === "checkbox" || declaredFieldType === "checkbox" || wave9FieldType === "checkbox" || hasCheckboxCue)
  ) {
    checkboxCandidates.push({
      blockId: mapping.blockId,
      text: String(mapping.text || sourceBlock.text || "").trim() || undefined,
      checked: /\u2611|\u2612/.test(`${String(sourceBlock.text || "")} ${String(mapping.text || "")}`),
      confidence: 0.35,
      boundingBox: blockGeometry,
    });
  }

  const anchorPromotions: Wave8AnchorPromotion[] = (() => {
    const explicit = (mapping as any).anchorPromotions;
    if (Array.isArray(explicit)) {
      return explicit.map((entry: Record<string, unknown>) => ({
        id: typeof entry.id === "string" ? entry.id : undefined,
        label: typeof entry.label === "string" ? entry.label : undefined,
        reason: typeof entry.reason === "string" ? entry.reason : undefined,
      }));
    }

    const promoted =
      typeof diag.wave8TargetedAnchorPromoted === "string"
        ? (diag.wave8TargetedAnchorPromoted as string)
        : "";
    return promoted ? [{ id: promoted, label: promoted, reason: "wave8_promotion" }] : [];
  })();

  const resolverFlags: Wave8ResolverFlags = {
    contractorsInsuredNameResolverApplied: Boolean(
      diag.contractorsInsuredNameResolverApplied ||
        (mapping as any)?.resolverFlags?.contractorsInsuredNameResolverApplied,
    ),
    wave8TargetedAnchorPromoted:
      (typeof diag.wave8TargetedAnchorPromoted === "string"
        ? (diag.wave8TargetedAnchorPromoted as string)
        : undefined) ||
      (typeof (mapping as any)?.resolverFlags?.wave8TargetedAnchorPromoted === "string"
        ? (mapping as any).resolverFlags.wave8TargetedAnchorPromoted
        : undefined),
  };

  const gatingMetadata: Wave8GatingMetadata = {
    passed:
      typeof (mapping as any)?.gatingMetadata?.passed === "boolean"
        ? (mapping as any).gatingMetadata.passed
        : Boolean((chosen as any)?.wave8Gating?.passed),
    thresholdDecision:
      typeof diag.thresholdDecision === "string"
        ? (diag.thresholdDecision as string)
        : undefined,
    thresholdReason:
      typeof diag.thresholdReason === "string"
        ? (diag.thresholdReason as string)
        : undefined,
    rejectReasons: Array.isArray((chosen as any)?.wave8Gating?.rejectReasons)
      ? ((chosen as any).wave8Gating.rejectReasons as string[])
      : undefined,
    semanticConsistency:
      typeof (chosen as any)?.semanticSimilarity === "number"
        ? (chosen as any).semanticSimilarity
        : undefined,
    dictionaryConsistency:
      typeof (chosen as any)?.dictionaryScore === "number"
        ? (chosen as any).dictionaryScore
        : undefined,
    categoryConsistency:
      typeof (chosen as any)?.categoryScore === "number"
        ? (chosen as any).categoryScore
        : undefined,
    supervisionBoost:
      typeof (chosen as any)?.supervisionBoost === "number"
        ? (chosen as any).supervisionBoost
        : undefined,
  };

  const suppressionMetadata: Wave8SuppressionMetadata = {
    suppressed: Boolean(
      (mapping as any)?.suppressionMetadata?.suppressed || diag.wave8OverlapSuppressed,
    ),
    reason:
      typeof (mapping as any)?.suppressionMetadata?.reason === "string"
        ? (mapping as any).suppressionMetadata.reason
        : typeof diag.thresholdReason === "string"
          ? (diag.thresholdReason as string)
          : undefined,
    iou:
      typeof diag.wave8OverlapIou === "number"
        ? (diag.wave8OverlapIou as number)
        : undefined,
    winnerBlockId:
      typeof diag.wave8OverlapWinnerBlockId === "string"
        ? (diag.wave8OverlapWinnerBlockId as string)
        : undefined,
    nonField:
      Boolean((mapping as any)?.suppressionMetadata?.nonField) ||
      /section_title|header|non_field|title/i.test(
        `${String(diag.thresholdReason || "")} ${String((mapping as any)?.suppressionMetadata?.reason || "")}`,
      ),
    headerBlock:
      Boolean((mapping as any)?.suppressionMetadata?.headerBlock) ||
      String((mapping as any)?.fieldType || "").toLowerCase() === "header" ||
      /section_title|header/i.test(
        `${String(diag.thresholdReason || "")} ${String((mapping as any)?.suppressionMetadata?.reason || "")}`,
      ),
  };

  const semanticLabel =
    String((mapping as any).semanticLabel || "").trim() ||
    String(sourceBlock.text || "").trim();
  const categoryMode =
    String((mapping as any).categoryMode || (chosen as any)?.categoryMode || "").trim() ||
    undefined;
  const groupLabel = deriveHybridGroupLabel(semanticLabel, sourceBlock.text || "");
  const groupKey =
    String((mapping as any).groupId || "").trim() ||
    `${mapping.blockId}::${Math.round(blockGeometry.x)}:${Math.round(blockGeometry.y)}:` +
      `${categoryMode || "none"}:${groupLabel}`;

  return {
    blockId: mapping.blockId,
    blockGeometry,
    categoryMode,
    semanticLabel,
    pairedLabel,
    resolverFlags,
    supervisionBoost:
      typeof (chosen as any)?.supervisionBoost === "number"
        ? (chosen as any).supervisionBoost
        : undefined,
    gatingMetadata,
    suppressionMetadata,
    fieldType: wave9Decision?.fieldType || (mapping as any).wave9FieldType || (mapping as any).fieldType,
    selectionMarkAssociations,
    checkboxCandidates,
    anchorPromotions,
    confidenceScores: {
      confidenceScore: chosen?.confidenceScore,
      normalizedConfidenceScore: (chosen as any)?.normalizedConfidenceScore,
      semanticScore: (chosen as any)?.semanticSimilarity,
      dictionaryScore: (chosen as any)?.dictionaryScore,
      categoryScore: (chosen as any)?.categoryScore,
      supervisionBoost: (chosen as any)?.supervisionBoost,
    },
    groupKey,
    groupLabel,
    semanticRole: (mapping as any).semanticRole,
    tableId: (mapping as any).tableId,
    rowIndex: (mapping as any).rowIndex,
    columnIndex: (mapping as any).columnIndex,
  };
}

function buildTypedFieldPreview(
  mapping: MapFieldMapping,
  sourceBlock: ExtractedBlock,
): Field {
  const wave9Decision = (mapping as any).wave9Decision || undefined;
  const chosen =
    wave9Decision || mapping.chosen || (mapping as any).topCandidate || mapping.suggestions?.[0];
  const hybrid = readHybridMappingMetadata(mapping, sourceBlock);
  const shouldForceCheckbox =
    (hybrid.selectionMarkAssociations?.length || 0) > 0 ||
    (hybrid.checkboxCandidates?.length || 0) > 0 ||
    hasCheckboxShapeCue(`${String(sourceBlock.text || "")} ${String(mapping.text || "")}`);
  const fieldType = shouldForceCheckbox
    ? "checkbox"
    : (hybrid.fieldType as SemanticFieldType | undefined) ||
      (wave9Decision?.fieldType as SemanticFieldType | undefined) ||
      ((mapping as any).wave9FieldType as SemanticFieldType | undefined) ||
      ((mapping as any).fieldType as SemanticFieldType | undefined) ||
      inferFieldType(sourceBlock, chosen);
  const semanticLabel = hybrid.semanticLabel || String(mapping.text || "").trim() || String(chosen?.label || "").trim();
  const metadataSource: FieldMetadataSource = chosen
    ? toMetadataSource(chosen.source)
    : "ocr";
  const geometry = hybrid.blockGeometry || mapping.boundingBox;
  const rawX = Number(geometry.x) || 0;
  const rawY = Number(geometry.y) || 0;
  const rawW = Math.max(8, Number(geometry.width) || 80);
  const rawH = Math.max(8, Number(geometry.height) || 18);
  
  // Extract ACORD candidates from suggestions
  const acordCandidates = mapping.suggestions?.map((sugg) => ({
    acordCode: sugg.acordCode,
    label: sugg.label,
    confidenceScore: sugg.confidenceScore,
    source: (sugg.source as "dictionary" | "heuristic" | "embeddings" | "geometry" | "category" | "fusion" | undefined) || "dictionary",
    rationale: sugg.rationale,
  }));

  const base = {
    id: mapping.blockId,
    pageIndex: Math.max(0, mapping.page - 1),
    x: rawX,
    y: rawY,
    width: rawW,
    height: rawH,
    rotation: 0,
    opacity: 1,
    groupId: hybrid.groupKey || null,
    metadata: {
      acordCode: chosen?.acordCode ?? "",
      acordLabel: chosen?.label ?? semanticLabel,
      acordDescription: chosen?.description ?? "",
      fieldType,
      required: false,
      confidenceScore: chosen?.confidenceScore ?? sourceBlock.confidence,
      wave9Decision,
      wave9FieldType: wave9Decision?.fieldType || (mapping as any).wave9FieldType,
      wave9Suppression: (mapping as any).wave9Suppression,
      wave9GeometryContext: (mapping as any).wave9GeometryContext,
      wave9ConsistencyScore: (mapping as any).wave9ConsistencyScore,
      wave9ConfidenceCalibration: (mapping as any).wave9ConfidenceCalibration,
      source: metadataSource,
      extractionBlockId: mapping.blockId,
      semanticLabel,
      categoryMode: hybrid.categoryMode,
      acordCandidates,
      wave9Hybrid: hybrid,
      checkboxState: sourceBlock.type === "checkbox" ? {
        isCheckbox: true,
        checked:
          Boolean(hybrid.selectionMarkAssociations?.some((item: Wave8SelectionMarkAssociation) => item.checked)) ||
          Boolean(hybrid.checkboxCandidates?.some((item: Wave8CheckboxCandidate) => item.checked)),
        pattern: "\\u2610|\\u2611|\\u2612|\\[\\s*\\]",
      } : undefined,
      signatureState: sourceBlock.type === "signature" ? {
        isSignature: true,
        signed: false,
        pattern: "signature|sign here",
      } : undefined,
      // NEW: KVP data if applicable
      kvpData: sourceBlock.type === "kvp" ? {
        key: mapping.text.split(":")[0]?.trim() || "key",
        value: mapping.text.split(":")[1]?.trim() || "",
      } : undefined,
    },
  };

  if (fieldType === "numeric") {
    return {
      ...base,
      type: "numeric",
      stroke: "#1e293b",
      strokeWidth: 1,
      fill: "#ffffff",
      min: 0,
      max: 100,
      step: 1,
      value: null,
      placeholder: "0",
    };
  }

  if (fieldType === "date") {
    return {
      ...base,
      type: "date",
      stroke: "#1e293b",
      strokeWidth: 1,
      fill: "#ffffff",
      dateFormat: "MM/DD/YYYY",
      value: "",
      placeholder: "Pick a date",
    };
  }

  if (fieldType === "checkbox") {
    const checkboxAssoc = hybrid.selectionMarkAssociations?.[0];
    const checkboxCandidate = hybrid.checkboxCandidates?.[0];
    const checkboxGeometry = checkboxAssoc?.boundingBox || checkboxCandidate?.boundingBox;
    const checkedConfidence =
      checkboxAssoc?.confidence ?? checkboxCandidate?.confidence ?? 0;
    const checkedState =
      Boolean(checkboxAssoc?.checked || checkboxCandidate?.checked) ||
      checkedConfidence >= 0.5;
    return {
      ...base,
      type: "checkbox",
      x: checkboxGeometry ? checkboxGeometry.x : rawX,
      y: checkboxGeometry ? checkboxGeometry.y : rawY,
      width: checkboxGeometry ? checkboxGeometry.width : rawW,
      height: checkboxGeometry ? checkboxGeometry.height : rawH,
      stroke: "#1e293b",
      strokeWidth: 1,
      fill: "#ffffff",
      checked: checkedState,
      label: hybrid.pairedLabel?.text || checkboxAssoc?.labelText || mapping.text,
      metadata: {
        ...base.metadata,
        checkboxState: {
          isCheckbox: true,
          checked: checkedState,
        },
      },
    };
  }

  if (fieldType === "radio") {
    return {
      ...base,
      type: "radio",
      x: rawX,
      y: rawY,
      stroke: "#1e293b",
      strokeWidth: 1,
      fill: "#ffffff",
      checked: false,
      groupName: toCanonicalName(mapping.text) || "radio-group",
      label: mapping.text,
    };
  }

  if (fieldType === "signature") {
    return {
      ...base,
      type: "signature",
      stroke: "#1e293b",
      strokeWidth: 1,
      fill: "#ffffff",
      placeholder: "Sign here",
      signed: false,
      showStrokePreview: false,
      metadata: {
        ...base.metadata,
        signatureState: {
          isSignature: true,
          signed: false,
        },
      },
    };
  }

  return {
    ...base,
    type: "text",
    text: mapping.text,
    fontSize: 14,
    fontFamily: "Geist Variable",
    textAlign: "left",
    color: "#0f172a",
    stroke: "#1e293b",
    strokeWidth: 0,
  };
}

function buildNormalizedBoundingBoxes(blocks: ExtractedBlock[]): NormalizedBoundingBox[] {
  return blocks.map((block) => ({
    blockId: block.id,
    page: block.page,
    boundingBox: block.boundingBox,
  }));
}

type AutoMappingResult = {
  draftMappings: DraftMappedField[];
  artifacts: ExtractionArtifacts;
  mappings: FieldMapping[];
};

function classifyField(field: Field): Field {
  return {
    ...field,
    metadata: {
      ...(field.metadata || {}),
      artifactClassification: "field_value",
    },
  };
}

export default function PdfImportModal({
  onClose,
  onImportResult,
  mode = "import",
}: PdfImportModalProps) {
  const setPdfPages = useDesignerStore((s) => s.setPdfPages);
  const addField = useDesignerStore((s) => s.addField);
  const setExtractionArtifacts = useExtractionStore(
    (s) => s.setExtractionArtifacts,
  );
  const clearExtractionArtifacts = useExtractionStore((s) => s.clearExtraction);
  const extractionDecisionGraph = useExtractionStore((s) => s.decisionGraph);
  const suppressedOcrBlockIds = useExtractionStore((s) => s.suppressedOcrBlockIds);
  const acceptFieldReview = useExtractionStore((s) => s.acceptField);
  const rejectFieldReview = useExtractionStore((s) => s.rejectField);
  const initializeMappings = useMappingStore((s) => s.initializeMappings);
  const linkFieldToMapping = useMappingStore((s) => s.linkFieldToMapping);
  const clearMappingReview = useMappingStore((s) => s.clear);
  const [isAutoMapping, setIsAutoMapping] = useState(true);
  const [isReviewMode, setIsReviewMode] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const downloadDebugReport = () => {
    if (!funnelMetrics) {
      alert("No metrics collected yet. Run auto-map first.");
      return;
    }

    const report = {
      timestamp: new Date().toISOString(),
      diagnosticMode: useDiagnosticMode,
      metrics: {
        extractedOcrBlocks: funnelMetrics.extractedOcrBlocks,
        blocksAfterRejection: Object.fromEntries(funnelMetrics.blocksAfterRejection),
        rawMappingCandidates: funnelMetrics.rawMappingCandidates,
        candidatesAfterCompatibility: funnelMetrics.candidatesAfterCompatibility,
        candidatesAfterQuality: funnelMetrics.candidatesAfterQuality,
        finalAccepted: funnelMetrics.finalAccepted,
        rejectionReasons: funnelMetrics.rejectionReasons,
        topCandidatesPerBlock: funnelMetrics.topCandidatesPerBlock,
      },
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `pdf-mapping-debug-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };
  const [error, setError] = useState<string | null>(null);
  const [draftMappings, setDraftMappings] = useState<DraftMappedField[]>([]);
  const [importedPages, setImportedPages] = useState(0);
  const [autoMapSummary, setAutoMapSummary] = useState<AutoMapSummary | null>(
    null,
  );
  const [useDiagnosticMode, setUseDiagnosticMode] = useState(false);
  const [funnelMetrics, setFunnelMetrics] = useState<{
    extractedOcrBlocks: number;
    blocksAfterRejection: Map<string, number>;
    rawMappingCandidates: number;
    candidatesAfterCompatibility: number;
    candidatesAfterQuality: number;
    finalAccepted: number;
    rejectionReasons: Record<string, number>;
    topCandidatesPerBlock: Record<string, Array<{ label: string; score: number }>>;
  } | null>(null);

  async function runAutoMapping(
    file: File,
    pageImages: string[],
  ): Promise<AutoMappingResult> {
    const imageSizes = await Promise.all(pageImages.map(readImageSize));
    const extractPayload = (await runHybridExtraction(file)) as ExtractDocumentResponse;

    const pages: PageExtraction[] = Array.isArray(extractPayload.pages)
      ? extractPayload.pages
      : [];
    const scaleByPage = new Map<number, { x: number; y: number }>();
    for (const dimension of extractPayload.pageDimensions || []) {
      const imageSize = imageSizes[Math.max(0, dimension.page - 1)];
      const sourceWidth = Number(dimension.width) || imageSize?.width || 1;
      const sourceHeight = Number(dimension.height) || imageSize?.height || 1;
      scaleByPage.set(dimension.page, {
        x: imageSize?.width ? imageSize.width / sourceWidth : 1,
        y: imageSize?.height ? imageSize.height / sourceHeight : 1,
      });
    }
    const scaleBox = (box: BoundingBox, page: number): BoundingBox => {
      const scale = scaleByPage.get(page) || { x: 1, y: 1 };
      return {
        x: box.x * scale.x,
        y: box.y * scale.y,
        width: Math.max(1, box.width * scale.x),
        height: Math.max(1, box.height * scale.y),
      };
    };
    const canonicalBlocks = extractPayload.blocks || [];
    const blocks: ExtractedBlock[] = canonicalBlocks.map((block) => ({
      ...block,
      boundingBox: scaleBox(block.boundingBox, block.page),
    }));

    if (blocks.length === 0) {
      setAutoMapSummary({
        totalBlocks: 0,
        keptBlocks: 0,
        filteredBlocks: 0,
        filteredByReason: {},
        filteredSamples: [],
        candidateMappings: 0,
        keptMappings: 0,
        filteredMappings: 0,
      });
      return {
        draftMappings: [],
        artifacts: {
          documentId: file.name,
          pages,
          labels: [],
          fields: [],
          textBlocks: [],
          normalizedBBoxes: [],
        },
        mappings: [],
      };
    }

    const filteredOut: Array<{ id: string; reason: string }> = [];
    const keptBlocks = [...blocks];

    keptBlocks.sort((a, b) => blockPriority(b) - blockPriority(a));

    const ocrSummary = {
      totalBlocks: blocks.length,
      keptBlocks: keptBlocks.length,
      filteredBlocks: filteredOut.length,
      filteredByReason: filteredOut.reduce<Record<string, number>>(
        (acc, item) => {
          acc[item.reason] = (acc[item.reason] || 0) + 1;
          return acc;
        },
        {},
      ),
    };

    console.info("[auto-map] OCR block filter summary", ocrSummary);
    console.warn("[DEBUG] keptBlocks:", keptBlocks.length, "samples:", keptBlocks.slice(0, 2).map(b => ({id: b.id, text: b.text.substring(0, 20), bbox: b.boundingBox})));

    const rejectionByBlockId = new Map(filteredOut.map((item) => [item.id, item.reason]));
    const labels = buildLabelDetections(blocks, rejectionByBlockId);
    const normalizedBBoxes = buildNormalizedBoundingBoxes(blocks);

    if (keptBlocks.length === 0) {
      setAutoMapSummary({
        ...ocrSummary,
        filteredSamples: filteredOut.slice(0, 12).map((item) => {
          const block = blocks.find((candidate) => candidate.id === item.id);
          return {
            reason: item.reason,
            text: block?.text || item.id,
          };
        }),
        candidateMappings: 0,
        keptMappings: 0,
        filteredMappings: 0,
      });
      return {
        draftMappings: [],
        artifacts: {
          documentId: file.name,
          pages,
          labels,
          fields: [],
          textBlocks: blocks,
          normalizedBBoxes,
        },
        mappings: [],
      };
    }

    const mappingInputBlocks = canonicalBlocks;
    const mappingPayload = (await runMappingFlow({
      documentId: extractPayload.documentId || file.name,
      sourceDocumentName: file.name,
      lockSourceDocument: true,
      blocks: mappingInputBlocks,
      fieldCatalog: extractPayload.fieldCatalog || [],
      groupedStructures: extractPayload.groupedStructures || {},
      bboxNormalization: extractPayload.bboxNormalization || {},
      pageDimensions: extractPayload.pageDimensions || [],
      context: "Wave 9 hybrid PDF mapping",
    })) as HybridMappingResponse;
    const mappedCatalog = mappingPayload.fieldCatalog || extractPayload.fieldCatalog || [];
    const catalogById = new Map(mappedCatalog.map((entry) => [entry.id, entry]));
    const mappings = (mappingPayload.mappings || []).map((mapping) => {
      const catalog = catalogById.get(mapping.blockId);
      return {
        ...mapping,
        boundingBox: scaleBox(mapping.boundingBox, mapping.page),
        blockGeometry: scaleBox(mapping.boundingBox, mapping.page),
        semanticRole: catalog?.role,
        semanticLabel: catalog?.semanticLabel || catalog?.text || mapping.text,
        fieldType: catalog?.valueType,
        groupId: catalog?.groupId,
        tableId: catalog?.tableId,
        rowIndex: catalog?.rowIndex,
        columnIndex: catalog?.columnIndex,
      } as MapFieldMapping;
    });
    const promotedMappingIds = new Set(
      (mappingPayload.mappedFields || []).map((mapping) => mapping.blockId),
    );
    
    // DEBUG STEP 1: Log mapFields response in detail
    const mapFieldsDebug = {
      timestamp: new Date().toISOString(),
      totalInputBlocks: mappingInputBlocks.length,
      mappingInputTruncated: mappingInputBlocks.length < keptBlocks.length,
      totalMappingsReturned: mappings.length,
      mappingDetails: mappings.slice(0, 20).map((m, i) => ({
        idx: i,
        fieldId: m.blockId,
        text: m.text?.substring(0, 50),
        fieldType: m.fieldType || 'unknown',
        confidenceScore: m.chosen?.confidenceScore,
        acordCandidatesCount: m.suggestions?.length || 0,
        topCandidate: m.chosen ? { label: m.chosen.label, score: m.chosen.confidenceScore, source: m.chosen.source } : null,
      })),
    };
    console.error("[mapFields-RESPONSE-COUNT] Input: " + mappingInputBlocks.length + " blocks → Output: " + mappings.length + " mappings");
    console.log("[mapFields-response]", mapFieldsDebug);
    (window as any).__debugMapFieldsResponse = mapFieldsDebug;
    
    const sourceBlockById = new Map(
      mappingInputBlocks.map((block) => [block.id, block]),
    );

    const mappingCandidates = mappings
      .map((mapping) => {
        const sourceBlock = sourceBlockById.get(mapping.blockId);
        const text = (mapping.text || (mapping as any).semanticLabel || "").trim();
        if (!sourceBlock || (!text && !promotedMappingIds.has(mapping.blockId))) {
          return null;
        }

        return {
          mapping,
          sourceBlock,
          priority: blockPriority(sourceBlock),
        };
      })
      .filter((item): item is { mapping: MapFieldMapping; sourceBlock: ExtractedBlock; priority: number } =>
        Boolean(item),
      )
      .sort((a, b) => b.priority - a.priority);

    // DEBUG STEP 2: Collect detailed filter metrics
    const rejectionReasons: Record<string, number> = {};
    const topCandidatesPerBlock: Record<string, Array<{ label: string; score: number }>> = {};
    const filterBreakdown = {
      rejectedByHybridContract: 0,
      passed: 0,
    };
    const qualityMappings = mappingCandidates.filter(({ mapping }) => {
      if (!topCandidatesPerBlock[mapping.blockId]) {
        topCandidatesPerBlock[mapping.blockId] = [];
      }
      topCandidatesPerBlock[mapping.blockId] = (mapping.suggestions || [])
        .slice(0, 5)
        .map((s) => ({ label: s.label, score: s.confidenceScore }));

      filterBreakdown.passed += 1;
      return true;
    });
    
    // DEBUG STEP 3: Log quality filter results
    const qualityFilterDebug = {
      timestamp: new Date().toISOString(),
      debugModeActive: useDiagnosticMode,
      thresholds: {
        minConfidence: "mapping.gatingMetadata.minConfidence || 0",
        semanticConsistency: "mapping.gatingMetadata.semanticConsistency",
        dictionaryConsistency: "mapping.gatingMetadata.dictionaryConsistency",
        categoryConsistency: "mapping.gatingMetadata.categoryConsistency",
        supervisionBoost: "mapping.gatingMetadata.supervisionBoost",
      },
      mappingCandidatesCount: mappingCandidates.length,
      semanticSuppressionApplied: false,
      hybridContractResults: filterBreakdown,
      resultAfterHybridContract: qualityMappings.length,
      samples: qualityMappings.slice(0, 5).map(m => ({
        text: m.mapping.text?.substring(0, 40),
        chosen: m.mapping.chosen ? { label: m.mapping.chosen.label, score: m.mapping.chosen.confidenceScore } : null,
      })),
    };
    console.error("[quality-filtering-COUNT] Candidates in: " + mappingCandidates.length + " → Passed strict filter: " + qualityMappings.length + " → After fallback: " + qualityMappings.length);
    console.log("[quality-filtering]", qualityFilterDebug);
    (window as any).__debugQualityFiltering = qualityFilterDebug;

    const safeMappings = qualityMappings.map((item) => item.mapping);
    
    // DEBUG STEP 4: Log safe mappings before designerStore persistence
    console.error("[safe-mappings-COUNT] Ready to persist all " + safeMappings.length + " accepted fields");
    console.log("[safe-mappings-ready]", {
      totalSafeMappings: safeMappings.length,
      fieldsCap: "all",
      actualFieldsToCreate: safeMappings.length,
    });

    const mappingSummary = {
      candidateMappings: mappings.length,
      keptMappings: safeMappings.length,
      filteredMappings: mappings.length - safeMappings.length,
    };

    // Capture funnel metrics for diagnostics
    const newMetrics = {
      extractedOcrBlocks: keptBlocks.length,
      blocksAfterRejection: new Map(
        blocks.filter((b) => !filteredOut.find((f) => f.id === b.id)).map((b) => [b.id, 1]),
      ),
      rawMappingCandidates: mappings.length,
      candidatesAfterCompatibility: qualityMappings.length,
      candidatesAfterQuality: safeMappings.length,
      finalAccepted: safeMappings.length,
      rejectionReasons,
      topCandidatesPerBlock,
    };
    setFunnelMetrics(newMetrics);

    console.info(
      "[auto-map] Mapping output summary",
      { ...mappingSummary, diagnostic: useDiagnosticMode },
    );

    setAutoMapSummary({
      ...ocrSummary,
      filteredSamples: filteredOut.slice(0, 12).map((item) => {
        const block = blocks.find((candidate) => candidate.id === item.id);
        return {
          reason: item.reason,
          text: block?.text || item.id,
        };
      }),
      ...mappingSummary,
    });

    const fillableRoles = new Set<HybridCatalogRole>([
      "input",
      "business",
      "contact",
      "producer",
      "agency",
      "applicant",
      "company",
      "underwriter",
      "address",
      "email",
      "phone",
      "website",
      "checkbox",
      "select",
      "table-cell",
      "value-region",
    ]);
    const draftMappings = safeMappings
      .filter((mapping) =>
        promotedMappingIds.has(mapping.blockId) ||
        fillableRoles.has((mapping as any).semanticRole),
      )
      .map((mapping) => {
      const chosen = mapping.chosen || (mapping as any).topCandidate || mapping.suggestions?.[0];
      const sourceBlock = sourceBlockById.get(mapping.blockId);
      const blockType = sourceBlock?.type || "text";
      const fieldPreview = sourceBlock
        ? buildTypedFieldPreview(mapping, sourceBlock)
        : undefined;
      const draft: DraftMappedField = {
        blockId: mapping.blockId,
        blockType,
        pageIndex: Math.max(0, (mapping.page || 1) - 1),
        text: mapping.text,
        x: mapping.boundingBox.x,
        y: mapping.boundingBox.y,
        width: mapping.boundingBox.width,
        height: mapping.boundingBox.height,
        chosen,
        semanticRole: (mapping as any).semanticRole,
        accepted: false,
        fieldPreview,
      };

      return {
        ...draft,
        accepted: true,
      };
      });

    const fields = safeMappings
      .filter((mapping) =>
        promotedMappingIds.has(mapping.blockId) ||
        fillableRoles.has((mapping as any).semanticRole),
      )
      .map((mapping) => {
        const sourceBlock = sourceBlockById.get(mapping.blockId);
        return sourceBlock ? buildTypedFieldPreview(mapping, sourceBlock) : null;
      })
      .filter((field): field is Field => Boolean(field));

    return {
      draftMappings,
      artifacts: {
        documentId: file.name,
        pages,
        labels,
        fields,
        textBlocks: [],
        normalizedBBoxes,
      },
      mappings: safeMappings,
    };
  }

  function applyMappedFields(mappings: DraftMappedField[]) {
    // Build typed field objects from draft mappings, give each a fresh id.
    const fieldObjects: Field[] = mappings
      .filter((m) => m.fieldPreview)
      .map((m) => ({
        ...(m.fieldPreview as Field),
        id: crypto.randomUUID(),
      }))
      .map(classifyField);

    // Fall back to a plain text field for any mapping without a typed preview.
    for (const m of mappings) {
      if (m.fieldPreview) continue;
      const chosen = m.chosen;
      const fallback: Field = {
        id: crypto.randomUUID(),
        type: "text",
        pageIndex: m.pageIndex,
        x: m.x,
        y: m.y,
        width: Math.max(60, m.width),
        height: Math.max(22, m.height),
        rotation: 0,
        opacity: 1,
        text: m.text,
        fontSize: 13,
        fontFamily: "Geist Variable",
        textAlign: "left",
        color: "#0f172a",
        stroke: "#1e293b",
        strokeWidth: 0,
        groupId: null,
        metadata: {
          acordCode: chosen?.acordCode || "",
          acordLabel: chosen?.label || "",
          acordDescription: chosen?.description || "",
          fieldType: "text",
          required: false,
          confidenceScore: chosen?.confidenceScore ?? 0,
          source: chosen ? toMetadataSource(chosen.source) : "ocr",
          extractionBlockId: m.blockId,
        },
      };
      fieldObjects.push(classifyField(fallback));
    }

    // DEBUG STEP 5: Log field object construction
    console.error("[CRITICAL] applyMappedFields started with " + mappings.length + " draft mappings");
    console.error("[CRITICAL] Field objects constructed: " + fieldObjects.length);
    
    const pageDistribution: Record<number, number> = {};
    fieldObjects.forEach((f) => {
      const pageKey = Math.max(0, f.pageIndex ?? 0);
      pageDistribution[pageKey] = (pageDistribution[pageKey] || 0) + 1;
    });
    const designerStoreDebug = {
      timestamp: new Date().toISOString(),
      draftMappingsInput: mappings.length,
      fieldObjectsConstructed: fieldObjects.length,
      pageDistribution,
      sampleFields: fieldObjects.slice(0, 3).map((f) => ({
        id: f.id,
        text: ("text" in f ? f.text : f.metadata?.acordLabel || f.type).substring(0, 30),
        type: f.type,
        pageIndex: f.pageIndex,
        confidenceScore: f.metadata?.confidenceScore,
      })),
    };
    console.log("[designerStore-before-persist]", designerStoreDebug);
    (window as any).__debugDesignerStorePersistence = designerStoreDebug;

    if (fieldObjects.length === 0) {
      console.error("[F:0] FATAL: No field objects constructed. Mappings input: " + mappings.length);
      return 0;
    }

    // Push ALL extracted fields as amber draft overlays on the canvas.
    // User reviews visually on the form and clicks "Commit" to finalise.
    const preStoreFieldCount = useDesignerStore.getState().fields.length;
    console.error("[CRITICAL] designerStore fields BEFORE setDraftCanvasFields: " + preStoreFieldCount);
    useDesignerStore.getState().setDraftCanvasFields(fieldObjects);
    const committedDraftCount = useDesignerStore.getState().commitDraftCanvasFields();
    const postStoreFieldCount = useDesignerStore.getState().fields.length;
    console.error("[CRITICAL] designerStore fields AFTER setDraftCanvasFields: " + postStoreFieldCount);

    // DEBUG STEP 6: Verify persistence to designerStore
    const persistenceDebug = {
      timestamp: new Date().toISOString(),
      fieldsPersistenceAttempted: fieldObjects.length,
      designerStoreFieldsBeforePersist: preStoreFieldCount,
      designerStoreFieldsAfterPersist: postStoreFieldCount,
      fieldsActuallyAdded: postStoreFieldCount - preStoreFieldCount,
      committedDraftCount,
      persistenceSuccess: postStoreFieldCount > preStoreFieldCount,
      draftFields: useDesignerStore.getState().draftCanvasFields?.length || 0,
      allFieldsCount: useDesignerStore.getState().fields.length,
    };
    console.log("[designerStore-persistence]", persistenceDebug);
    (window as any).__debugDesignerStorePersistence = { ...designerStoreDebug, ...persistenceDebug };

    if (postStoreFieldCount === preStoreFieldCount) {
      console.error("[F:0] FATAL: DesignerStore persistence FAILED. Fields attempted: " + fieldObjects.length + ", actual added: " + (postStoreFieldCount - preStoreFieldCount));
    } else {
      console.error("[SUCCESS] DesignerStore persistence OK. Fields added: " + (postStoreFieldCount - preStoreFieldCount));
    }

    // Navigate to the page of the first extracted field.
    const firstPage = fieldObjects[0].pageIndex ?? 0;
    useDesignerStore.getState().setCurrentPdfPage(Math.max(0, firstPage));

    // Keep mapping store in sync.
    useMappingStore.getState().syncDesignerFields(useDesignerStore.getState().fields);

    return fieldObjects.length;
  }

  const pageCounts = draftMappings.reduce<Record<number, number>>(
    (acc, item) => {
      const page = item.pageIndex + 1;
      acc[page] = (acc[page] || 0) + 1;
      return acc;
    },
    {},
  );

  const pageCountText = Object.entries(pageCounts)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([page, count]) => `P${page}: ${count}`)
    .join(" • ");

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setDraftMappings([]);
    setImportedPages(0);
    setAutoMapSummary(null);
    setIsImporting(true);
    clearMappingReview();

    try {
      clearExtractionArtifacts();
      let pages: string[] = [];

      if (mode === "import") {
        const buffer = await file.arrayBuffer();
        pages = await pdfToImages(buffer);
        setPdfPages(pages);
      } else {
        const buffer = await file.arrayBuffer();
        pages = await pdfToImages(buffer);
        setPdfPages(pages);
      }

      setImportedPages(pages.length);

      if (mode === "map-only" && pages.length === 0) {
        setError(
          "No PDF is loaded. Import a PDF first, then run Auto-map PDF.",
        );
        return;
      }

      let mappedFields: DraftMappedField[] = [];
      let extractionArtifacts: ExtractionArtifacts = {
        pages: [],
        labels: [],
        fields: [],
        textBlocks: [],
        normalizedBBoxes: [],
      };
      let warning: string | undefined;

      if (mode === "map-only" || isAutoMapping) {
        try {
          const autoMapping = await runAutoMapping(file, pages);
          mappedFields = autoMapping.draftMappings;
          extractionArtifacts = {
            ...autoMapping.artifacts,
            fields: autoMapping.artifacts.fields.map(classifyField),
          };
          setExtractionArtifacts(extractionArtifacts);
          initializeMappings(file.name, autoMapping.mappings);
        } catch (mapError) {
          warning =
            mapError instanceof Error
              ? `OCR extraction failed: ${mapError.message}. Check /api/wave9/extraction/hybrid and retry.`
              : "OCR extraction failed. Check /api/wave9/extraction/hybrid and retry.";
        }
      }

      if ((mode !== "map-only" && !isAutoMapping) || warning) {
        onImportResult?.({
          importedPages: pages.length,
          mappedFields: 0,
          warning,
        });
        onClose();
        return;
      }

      if (mode === "map-only" && isReviewMode) {
        if (mappedFields.length === 0) {
          onImportResult?.({
            importedPages: pages.length,
            mappedFields: 0,
            warning: "OCR completed but no mappable text was returned.",
          });
          onClose();
          return;
        }

        setDraftMappings(mappedFields);
        return;
      }

      const appliedCount = applyMappedFields(mappedFields);
      onImportResult?.({
        importedPages: pages.length,
        mappedFields: appliedCount,
      });
      onClose();
    } catch (err) {
      console.error("PDF import error:", err);
      setError(err instanceof Error ? err.message : "Failed to import PDF");
    } finally {
      setIsImporting(false);
    }
  }

  function handleApplyReviewedMappings() {
    const appliedCount = applyMappedFields(draftMappings);
    onImportResult?.({
      importedPages,
      mappedFields: appliedCount,
    });
    setDraftMappings([]);
    onClose();
  }

  const acceptedDraftCount = draftMappings.filter(
    (item) => {
      const labelDecision =
        extractionDecisionGraph.labels[item.blockId]?.decision || "pending";
      const fieldDecision =
        extractionDecisionGraph.fields[item.blockId]?.decision || "pending";
      return (
        item.accepted &&
        !suppressedOcrBlockIds.includes(item.blockId) &&
        labelDecision !== "rejected" &&
        fieldDecision !== "rejected"
      );
    },
  ).length;

  function toggleDraftAccepted(blockId: string, nextAccepted: boolean) {
    setDraftMappings((current) =>
      current.map((item) =>
        item.blockId === blockId ? { ...item, accepted: nextAccepted } : item,
      ),
    );

    if (nextAccepted) {
      acceptFieldReview(blockId);
      return;
    }

    rejectFieldReview(blockId);
  }

  function handleDiscardReviewedMappings() {
    onImportResult?.({
      importedPages,
      mappedFields: 0,
      warning: "PDF imported. Reviewed mappings were discarded.",
    });
    setDraftMappings([]);
    onClose();
  }

  return (
    <div
      style={{ padding: 12, display: "flex", flexDirection: "column", gap: 12 }}
    >
      <h3 style={{ margin: 0, color: "#0f172a" }}>Import PDF Background</h3>
      <p style={{ margin: 0, color: "#334155" }}>
        {mode === "map-only"
          ? "Select the same source PDF to run ACORD auto-mapping and add mapped fields to the loaded pages."
          : "Upload a PDF and each page will render as a canvas background layer."}
      </p>
      {mode !== "map-only" && (
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={isAutoMapping}
            onChange={(e) => setIsAutoMapping(e.target.checked)}
            disabled={isImporting}
          />
          Auto-map ACORD fields from OCR text after import
        </label>
      )}
      {mode === "map-only" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={isReviewMode}
              onChange={(e) => setIsReviewMode(e.target.checked)}
              disabled={isImporting}
            />
            Review mappings before adding fields to canvas
          </label>
          <div style={{ fontSize: 12, color: "#64748b" }}>
            Enable review mode before selecting a file to keep the review table open.
          </div>
        </div>
      )}
      {mode === "map-only" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={useDiagnosticMode}
              onChange={(e) => setUseDiagnosticMode(e.target.checked)}
              disabled={isImporting}
            />
            Diagnostics: Bypass compatibility rules
          </label>
          <div style={{ fontSize: 12, color: "#64748b" }}>
            When enabled, the mapper will accept candidates even if they fail
            semantic validation, showing you the raw mapping output for debugging.
          </div>
          {funnelMetrics && (
            <button
              onClick={downloadDebugReport}
              style={{
                padding: "8px 12px",
                backgroundColor: "#0f172a",
                color: "white",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              Download Debug Report
            </button>
          )}
        </div>
      )}
      <input
        type="file"
        accept="application/pdf"
        onChange={handleFile}
        disabled={isImporting}
      />
      {isImporting && (
        <div style={{ color: "#334155", fontSize: 13 }}>
          {mode === "map-only"
            ? "Running ACORD auto-mapping..."
            : "Importing PDF and generating ACORD mappings..."}
        </div>
      )}

      {autoMapSummary && !isImporting && (
        <div
          style={{
            border: "1px solid #cbd5e1",
            borderRadius: 10,
            padding: 10,
            background: "#f8fafc",
            display: "flex",
            flexDirection: "column",
            gap: 6,
            fontSize: 12,
            color: "#334155",
          }}
        >
          <div style={{ fontWeight: 600, color: "#0f172a" }}>
            OCR Filter Summary
          </div>
          <div>
            OCR blocks: kept {autoMapSummary.keptBlocks} of{" "}
            {autoMapSummary.totalBlocks} (filtered{" "}
            {autoMapSummary.filteredBlocks})
          </div>
          <div>
            Mappings: kept {autoMapSummary.keptMappings} of{" "}
            {autoMapSummary.candidateMappings} (filtered{" "}
            {autoMapSummary.filteredMappings})
          </div>
          {Object.keys(autoMapSummary.filteredByReason).length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ color: "#475569" }}>Suppression reasons</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {Object.entries(autoMapSummary.filteredByReason)
                  .sort((a, b) => b[1] - a[1])
                  .map(([reason, count]) => (
                    <span
                      key={reason}
                      style={{
                        background: "#e2e8f0",
                        color: "#0f172a",
                        borderRadius: 999,
                        padding: "2px 8px",
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    >
                      {reason} ({count})
                    </span>
                  ))}
              </div>
              {autoMapSummary.filteredSamples.length > 0 && (
                <div
                  style={{
                    border: "1px solid #e2e8f0",
                    borderRadius: 8,
                    background: "#ffffff",
                    maxHeight: 96,
                    overflowY: "auto",
                    padding: 6,
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                  }}
                >
                  {autoMapSummary.filteredSamples.map((sample, index) => (
                    <div
                      key={`${sample.reason}-${index}`}
                      style={{ fontSize: 11, color: "#334155" }}
                    >
                      <strong>{sample.reason}:</strong> {sample.text}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {draftMappings.length > 0 && (
        <div
          style={{
            border: "1px solid #cbd5e1",
            borderRadius: 10,
            padding: 10,
            background: "#f8fafc",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <ExtractionViewer />
          <div style={{ fontWeight: 600, color: "#0f172a" }}>
            Review Mappings ({draftMappings.length})
          </div>
          <div style={{ fontSize: 12, color: "#475569" }}>
            {pageCountText || "Single page"}
          </div>
          <div style={{ fontSize: 12, color: "#334155" }}>
            Accepted for shape creation: {acceptedDraftCount} /{" "}
            {draftMappings.length}
          </div>
          <div
            style={{
              maxHeight: 180,
              overflowY: "auto",
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              background: "#ffffff",
            }}
          >
            {draftMappings.slice(0, 25).map((item, index) => (
              <div
                key={`${item.pageIndex}-${item.text}-${index}`}
                style={{
                  padding: "8px 10px",
                  borderBottom: "1px solid #f1f5f9",
                  fontSize: 12,
                  display: "flex",
                  gap: 8,
                  alignItems: "flex-start",
                }}
              >
                <label
                  style={{ display: "flex", gap: 6, alignItems: "center" }}
                >
                  <input
                    type="checkbox"
                    checked={item.accepted}
                    onChange={(e) =>
                      toggleDraftAccepted(item.blockId, e.target.checked)
                    }
                  />
                  <span style={{ color: "#0f172a" }}>Use</span>
                </label>
                <div>
                  <div style={{ fontWeight: 600, color: "#0f172a" }}>
                    P{item.pageIndex + 1}:{" "}
                    {item.chosen?.acordCode || "(unmapped)"}
                  </div>
                  <div style={{ color: "#0f172a" }}>
                    {item.chosen?.label || "No mapped ACORD label"}
                  </div>
                  <div style={{ color: "#334155" }}>{item.text}</div>
                  <div style={{ color: "#64748b" }}>
                    Source type: {item.blockType}
                  </div>
                  {item.chosen && (
                    <div style={{ color: "#64748b" }}>
                      Confidence:{" "}
                      {Math.round(item.chosen.confidenceScore * 100)}% • Source:{" "}
                      {item.chosen.source}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleApplyReviewedMappings}>
              Apply To Canvas
            </button>
            <button onClick={handleDiscardReviewedMappings}>Discard</button>
          </div>
        </div>
      )}

      {error && <div style={{ color: "#b91c1c", fontSize: 13 }}>{error}</div>}
      <div>
        <button onClick={onClose} disabled={isImporting}>
          Close
        </button>
      </div>
    </div>
  );
}
