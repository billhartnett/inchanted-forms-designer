import type {
  BoundingBox,
  ExtractedBlock,
  Field,
  FieldMetadata,
  PageExtraction,
  SemanticFieldType,
} from "shared/types";
import type {
  ExtractDocumentDiagnostics,
  ExtractDocumentFieldCatalogEntry,
  ExtractDocumentFieldCatalogRole,
  ExtractDocumentFieldCatalogValueType,
  ExtractDocumentGroupedStructures,
} from "../types/extractDocumentContract";
import { boundsFromPolygon } from "./bboxNormalization";
import { classifyBlockSemantic } from "./semanticLabelClassifier";

const CANVAS_DPI = 96;

type HybridExtractionResult = {
  blocks: ExtractedBlock[];
  fields: Field[];
  fieldCatalog: ExtractDocumentFieldCatalogEntry[];
  groupedStructures: ExtractDocumentGroupedStructures;
  diagnostics: ExtractDocumentDiagnostics;
};

type PageGeometry = {
  unit?: string;
  width: number;
  height: number;
};

type InlineBlank = {
  box: BoundingBox;
  labelBox: BoundingBox;
  role: "input" | "value-region";
  valueType: ExtractDocumentFieldCatalogValueType;
  semanticLabel: string;
};

function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toPixels(value: number, unit: string | undefined): number {
  return unit === "inch" ? value * CANVAS_DPI : value;
}

export function toPixelBox(box: BoundingBox, unit: string | undefined): BoundingBox {
  return {
    x: toPixels(finite(box.x, 0), unit),
    y: toPixels(finite(box.y, 0), unit),
    width: Math.max(1, toPixels(finite(box.width, 1), unit)),
    height: Math.max(1, toPixels(finite(box.height, 1), unit)),
  };
}

function normalizedText(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function inferValueType(text: string): ExtractDocumentFieldCatalogValueType {
  const normalized = text.toLowerCase();
  if (/\b(phone|fax|telephone|mobile|cell\s*phone)\b/.test(normalized)) return "numeric";
  if (/\b(zip|postal|post\s*code|zip\s*code|year|years|tax\s*year|effective\s*year|license\s*number|fein|tax\s*id)\b/.test(normalized)) return "numeric";
  if (/\b(date|dob|birth|effective|expiration|expiry)\b/.test(normalized)) return "date";
  if (/%|\bpercentage\b|\brate\b/.test(normalized)) return "percentage";
  if (/\$|\b(cost|payroll|receipts|premium|amount|deductible)\b/.test(normalized)) return "currency";
  if (/\b(number|count|employees|limit|federal employer id)\b/.test(normalized)) return "numeric";
  if (/\b(select one|choose|options?)\b/.test(normalized)) return "dropdown";
  if (/\bsignature\b|\bsign here\b/.test(normalized)) return "signature";
  return "text";
}

function classifyLineRole(
  text: string,
  box: BoundingBox,
  page: PageGeometry,
): ExtractDocumentFieldCatalogRole {
  if (box.y + box.height >= page.height * 0.92) {
    return "footer";
  }
  if (/\?$/.test(text) || /^(do you|have you|are you|were there|if yes|describe|explain)\b/i.test(text)) {
    return "question";
  }
  if (/\b(markel|insurer|insurance\s+(company|group|corporation|services))\b/i.test(text) &&
    !/[:?]\s*$/.test(text)) return "header";
  if (isSectionHeading(text)) return "section-label";
  if (isFillableLabel(text)) return "label";
  if (box.y <= page.height * 0.08) {
    return "header";
  }
  const letters = text.replace(/[^A-Za-z]/g, "");
  if (
    !/_{3,}|\.{5,}|-{4,}/.test(text) &&
    text.length > 0 &&
    text.length <= 90 &&
    ((letters.length >= 4 && letters === letters.toUpperCase()) || box.height >= page.height * 0.022)
  ) {
    return "title";
  }
  if (text.length >= 120 || /^(note|please|instructions?|important)\b/i.test(text)) {
    return "description";
  }
  return "label";
}

function inlineBlankFromText(text: string, box: BoundingBox): InlineBlank | undefined {
  const blank = text.match(/_{3,}|\.{5,}|-{4,}/);
  if (!blank || text.length === 0) return undefined;
  const start = Math.max(0, text.indexOf(blank[0]));
  const before = text.slice(0, start);
  const after = text.slice(start + blank[0].length);
  const isCurrency = /\$\s*$/.test(before) || /^\s*\$/.test(after) || inferValueType(text) === "currency";
  const isPercentage = /%/.test(after) || inferValueType(text) === "percentage";
  const isNumeric = inferValueType(text) === "numeric";
  if (!/[A-Za-z0-9$%]/.test(text) || (!isCurrency && !isPercentage && !isNumeric && /^\W+$/.test(text))) {
    return undefined;
  }
  const valueType: ExtractDocumentFieldCatalogValueType = isCurrency
    ? "currency"
    : isPercentage
      ? "percentage"
      : isNumeric
        ? "numeric"
        : inferValueType(text);
  const semanticLabel = `${before.replace(/\$\s*$/, "")} ${after.replace(/^\s*%/, "")}`
    .replace(/[_\.\-\s]+/g, " ")
    .replace(/[:$%\s]+$/g, "")
    .trim() || (isCurrency ? "Dollar amount" : isPercentage ? "Percentage" : "Numeric value");
  const beforeWidth = box.width * (start / text.length);
  const afterStart = start + blank[0].length;
  const afterWidth = box.width * ((text.length - afterStart) / text.length);
  const labelBox = before.replace(/[$\s]+$/g, "").trim()
    ? { x: box.x, y: box.y, width: Math.max(1, beforeWidth), height: box.height }
    : after.replace(/^[%\s]+/g, "").trim()
      ? {
          x: box.x + box.width * (afterStart / text.length),
          y: box.y,
          width: Math.max(1, afterWidth),
          height: box.height,
        }
      : { ...box, width: Math.max(1, beforeWidth || afterWidth || box.width) };
  return {
    box: {
      x: box.x + box.width * (start / text.length),
      y: box.y,
      width: Math.max(1, box.width * (blank[0].length / text.length)),
      height: box.height,
    },
    labelBox,
    role: isCurrency ? "value-region" : "input",
    valueType,
    semanticLabel,
  };
}

function isNarrowTypedBlank(entry: ExtractDocumentFieldCatalogEntry, box: BoundingBox): boolean {
  return ["numeric", "currency", "percentage"].includes(entry.valueType) &&
    box.width >= 6 && box.width <= 64;
}

function isTypedBlank(entry: ExtractDocumentFieldCatalogEntry): boolean {
  return ["numeric", "currency", "percentage"].includes(entry.valueType);
}

function isQuestionText(value: string): boolean {
  return /\?$/.test(normalizedText(value));
}

function duplicatesExplicitCheckbox(
  entry: ExtractDocumentFieldCatalogEntry,
  catalog: ExtractDocumentFieldCatalogEntry[],
): boolean {
  if (entry.source !== "blank_detector" || !isQuestionText(entry.semanticLabel || entry.text)) {
    return false;
  }
  const valueRegion = entry.semanticValueRegion;
  if (!valueRegion) return false;
  return catalog.some((candidate) => {
    if (
      candidate.page !== entry.page ||
      candidate.role !== "checkbox" ||
      candidate.source !== "selection_mark"
    ) {
      return false;
    }
    const checkboxBox = candidate.semanticValueRegion || candidate.boundingBox;
    const verticalDistance = Math.abs(
      valueRegion.y + valueRegion.height / 2 - (checkboxBox.y + checkboxBox.height / 2),
    );
    const horizontalGap = Math.max(
      0,
      checkboxBox.x - (valueRegion.x + valueRegion.width),
      valueRegion.x - (checkboxBox.x + checkboxBox.width),
    );
    return verticalDistance <= 24 && horizontalGap <= 48;
  });
}

function hasSameRowExplicitCheckbox(
  label: ExtractDocumentFieldCatalogEntry,
  rawPages: any[],
): boolean {
  if (label.role !== "question") return false;
  for (const rawPage of rawPages) {
    if (Number(rawPage?.pageNumber || 1) !== label.page) continue;
    const marks = Array.isArray(rawPage?.selectionMarks) ? rawPage.selectionMarks : [];
    for (const mark of marks) {
      const box = toPixelBox(boundsFromPolygon(mark?.polygon || mark?.boundingPolygon), rawPage?.unit);
      const verticalDistance = Math.abs(
        label.boundingBox.y + label.boundingBox.height / 2 - (box.y + box.height / 2),
      );
      const horizontalGap = Math.max(
        0,
        box.x - (label.boundingBox.x + label.boundingBox.width),
        label.boundingBox.x - (box.x + box.width),
      );
      if (verticalDistance <= 24 && horizontalGap <= 48) return true;
    }
  }
  return false;
}

function hasValidFillableBox(entry: ExtractDocumentFieldCatalogEntry, box: BoundingBox): boolean {
  if (![box.x, box.y, box.width, box.height].every(Number.isFinite)) return false;
  const narrowTypedBlank = isNarrowTypedBlank(entry, box);
  if (entry.role === "checkbox") return box.width > 0 && box.height >= 6 && box.height <= 60;
  if (!narrowTypedBlank && (box.width < 20 || box.height < 6)) return false;
  if (narrowTypedBlank && (box.width < 6 || box.height < 2)) return false;
  return entry.role === "value-region" || box.height <= 60;
}

function normalizeFillableBox(
  entry: Pick<ExtractDocumentFieldCatalogEntry, "valueType">,
  box: BoundingBox,
  page: PageGeometry,
): BoundingBox {
  const typed = ["numeric", "currency", "percentage"].includes(entry.valueType);
  const targetHeight = typed ? Math.max(8, box.height) : box.height;
  const y = Math.max(0, Math.min(page.height - targetHeight, box.y - (targetHeight - box.height) / 2));
  const x = Math.max(0, Math.min(page.width, box.x));
  return {
    x,
    y,
    width: Math.max(1, Math.min(box.width, page.width - x)),
    height: Math.max(1, Math.min(targetHeight, page.height - y)),
  };
}

function distance(left: BoundingBox, right: BoundingBox): number {
  const leftX = left.x + left.width / 2;
  const leftY = left.y + left.height / 2;
  const rightX = right.x + right.width / 2;
  const rightY = right.y + right.height / 2;
  return Math.abs(leftY - rightY) * 0.8 + Math.abs(leftX - rightX) * 0.2;
}

function selectionLabelDistance(mark: BoundingBox, label: BoundingBox): number {
  const markCenterY = mark.y + mark.height / 2;
  const labelCenterY = label.y + label.height / 2;
  const verticalDistance = Math.abs(markCenterY - labelCenterY);
  const horizontalGap = label.x >= mark.x + mark.width
    ? label.x - (mark.x + mark.width)
    : Math.abs(mark.x - (label.x + label.width)) + 36;
  return verticalDistance * 3 + horizontalGap;
}

function intersectionArea(left: BoundingBox | undefined, right: BoundingBox | undefined): number {
  if (!left || !right) return 0;
  const width = Math.max(
    0,
    Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x),
  );
  const height = Math.max(
    0,
    Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y),
  );
  return width * height;
}

function entryValueBox(entry: Pick<ExtractDocumentFieldCatalogEntry, "semanticValueRegion" | "boundingBox">): BoundingBox {
  return entry.semanticValueRegion || entry.boundingBox || { x: 0, y: 0, width: 0, height: 0 };
}

function isAdjacentToFillableRegion(
  entry: ExtractDocumentFieldCatalogEntry,
  fillable: ExtractDocumentFieldCatalogEntry[],
): boolean {
  const box = entry.boundingBox;
  return fillable.some((candidate) => {
    if (candidate.page !== entry.page) return false;
    const region = candidate.semanticValueRegion || candidate.boundingBox;
    const horizontalGap = Math.max(0, Math.max(box.x, region.x) - Math.min(box.x + box.width, region.x + region.width));
    const verticalGap = Math.max(0, Math.max(box.y, region.y) - Math.min(box.y + box.height, region.y + region.height));
    const rowAligned = verticalGap <= Math.max(4, Math.min(box.height, region.height) * 0.5);
    const columnAligned = horizontalGap <= Math.max(4, Math.min(box.width, region.width) * 0.1);
    return (rowAligned && horizontalGap <= 16) || (columnAligned && verticalGap <= 12);
  });
}

function isCheckboxMarker(text: string): boolean {
  return /\b(yes|no)\b|selection_mark|[☐☑□■]/i.test(text);
}

function isLabelInBox(label: BoundingBox, box: BoundingBox): boolean {
  const labelArea = Math.max(1, label.width * label.height);
  return intersectionArea(label, box) / labelArea >= 0.65;
}

function isFillableLabel(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized || normalized.length > 90) return false;
  return /[:?]\s*$/.test(normalized) ||
    /\b(name|agency|producer|carrier|underwriter|applicant|insured|address|city|state|zip|postal|e-?mail|phone|fax|website|contact|representative|code|number|date|year|years|fein|soc sec|payroll|percentage|rate|amount|premium|deductible|limit|employees|sales|receipts|revenue)\b/i.test(normalized);
}

function isDeterministicFillableCandidate(
  entry: Pick<ExtractDocumentFieldCatalogEntry, "role" | "valueType" | "text" | "semanticLabel" | "source" | "semanticValueRegion" | "boundingBox">,
): boolean {
  if (entry.source === "pdf_widget") return true;
  if (entry.role === "checkbox" || entry.role === "select") return true;
  if (["label", "question", "section-label", "header", "title", "footer", "description", "column_header", "row_label"].includes(entry.role)) {
    return false;
  }
  if (entry.source === "di_table_cell") {
    const valueType = entry.valueType || inferValueType(normalizedText(entry.semanticLabel || entry.text || ""));
    return ["numeric", "currency", "percentage", "date"].includes(valueType) && Boolean(entry.semanticValueRegion || entry.boundingBox);
  }
  const candidateText = normalizedText(entry.semanticLabel || entry.text || "");
  const typedBlank = ["numeric", "currency", "percentage", "date"].includes(entry.valueType);
  if (typedBlank && Boolean(entry.semanticValueRegion || entry.boundingBox)) return true;
  if (!candidateText) return false;
  return isFillableLabel(candidateText) || /\b(phone|fax|email|zip|postal|state|city|address|number|year|date|license|tax|policy|coverage|premium|limit|amount|deductible|account|code|business name|legal name|agent|producer|carrier|underwriter)\b/i.test(candidateText);
}

function isLikelyResidualFillableLabel(entry: Pick<ExtractDocumentFieldCatalogEntry, "role" | "text" | "semanticLabel">): boolean {
  if (["label", "question"].includes(entry.role)) {
    const text = normalizedText(entry.semanticLabel || entry.text || "");
    return /\b(policy number|policy no|effective date|expiration date|date of birth|business name|legal name|agent name|producer name|underwriter|license number|tax id|tax identifier|year established|mailing address|website|carrier|insurer)\b/i.test(text);
  }
  return false;
}

function hasTableBoundaryCue(text: string): boolean {
  const normalized = normalizedText(text);
  return /\b(total|subtotal|premium|limit|deductible|rate|amount|coverage|county|state|city|zip|postal|code|status|date|class|year|month|day|term|description)\b/i.test(normalized);
}

function isTableBoundaryLabel(text: string): boolean {
  const normalized = normalizedText(text);
  return /\b(total|subtotal|premium|limit|deductible|amount|coverage|rate|class|date|status|description|year|term|county|city|state|zip|country)\b/i.test(normalized);
}

function hasStructuralTableHeaderCue(text: string): boolean {
  const normalized = normalizedText(text);
  return /\b(total|subtotal|premium|deductible|limit|coverage|rate|amount|status|class|term|description|effective|expiration|date|city|state|zip|postal|county|country|business|agent|producer|carrier|insurer|underwriter)\b/i.test(normalized);
}

function isStructuralTableHeaderNoise(text: string): boolean {
  const normalized = normalizedText(text);
  return /^(table|column|row|header|total|subtotal|description|class|status|amount|premium|deductible|limit|coverage|rate|city|state|zip|postal|county|country)$/i.test(normalized) ||
    (/^(yes|no)$/i.test(normalized) && normalized.length <= 3);
}

function isMultiRowHeaderCandidate(
  entry: Pick<ExtractDocumentFieldCatalogEntry, "id" | "role" | "text" | "semanticLabel" | "page" | "boundingBox">,
  catalog: ExtractDocumentFieldCatalogEntry[],
): boolean {
  const text = normalizedText(entry.semanticLabel || entry.text || "");
  if (!text || !/(address|business|legal|producer|agency|agent|carrier|insurer|underwriter|named insured|applicant|mailing)/i.test(text)) return false;
  const siblings = catalog.filter((candidate) =>
    candidate.page === entry.page &&
    candidate.id !== entry.id &&
    Math.abs(candidate.boundingBox.y - entry.boundingBox.y) <= 120 &&
    Math.abs(candidate.boundingBox.x - entry.boundingBox.x) <= 180,
  );
  return siblings.some((candidate) => /\b(address|city|state|zip|postal|producer|agent|agency|business|legal|name)\b/i.test(normalizedText(candidate.semanticLabel || candidate.text || "")));
}

function isLikelySuppressionNoise(entry: ExtractDocumentFieldCatalogEntry): boolean {
  if (entry.source !== "di_line") return false;
  if (["section-label", "header", "title", "footer", "description"].includes(entry.role)) return true;
  const text = normalizedText(entry.semanticLabel || entry.text || "");
  if (!text) return true;
  if (entry.role === "question") {
    return /^(please|note|instructions?|important|warning|remarks?|please review|attach|signature|required|optional)\b/i.test(text) ||
      text.length < 18 ||
      isStructuralTableHeaderNoise(text);
  }
  if (entry.role === "column_header" || entry.role === "row_label") return isStructuralTableHeaderNoise(text) || text.length < 18;
  return !isFillableLabel(text) && !isLikelyResidualFillableLabel(entry) && !hasTableBoundaryCue(text) && !hasStructuralTableHeaderCue(text) && !isStructuralTableHeaderNoise(text);
}

function preferredSemanticLabel(text: string): boolean {
  return /\b(agency|agent|producer|carrier|company|underwriter|applicant|insured|mailing address|address|e-?mail|phone)\b/i.test(text);
}

function largestRemainder(
  entry: ExtractDocumentFieldCatalogEntry,
  blocker: BoundingBox,
): BoundingBox {
  const box = entry.semanticValueRegion || entry.boundingBox;
  if (intersectionArea(box, blocker) === 0) return box;
  const minimumWidth = isNarrowTypedBlank(entry, box) ? 6 : entry.role === "checkbox" ? 1 : 20;
  const minimumHeight = isNarrowTypedBlank(entry, box) ? 2 : 6;
  const pieces = [
    { x: box.x, y: box.y, width: blocker.x - box.x, height: box.height },
    { x: blocker.x + blocker.width, y: box.y, width: box.x + box.width - blocker.x - blocker.width, height: box.height },
    { x: box.x, y: box.y, width: box.width, height: blocker.y - box.y },
    { x: box.x, y: blocker.y + blocker.height, width: box.width, height: box.y + box.height - blocker.y - blocker.height },
  ].filter((piece) =>
    piece.width >= minimumWidth &&
    piece.height >= minimumHeight &&
    (entry.role === "value-region" || piece.height <= 60)
  );
  return pieces.sort((left, right) => right.width * right.height - left.width * left.height)[0] || {
    ...box,
    width: 0,
    height: 0,
  };
}

function blankRegionAfterLabel(label: BoundingBox, container: BoundingBox): BoundingBox | undefined {
  const rightStart = Math.max(container.x, label.x + label.width + 2);
  const rightWidth = container.x + container.width - rightStart;
  if (rightWidth >= Math.max(18, container.width * 0.2)) {
    return {
      x: rightStart,
      y: container.y,
      width: rightWidth,
      height: container.height,
    };
  }

  const belowStart = Math.max(container.y, label.y + label.height + 2);
  const belowHeight = container.y + container.height - belowStart;
  if (belowHeight >= Math.max(10, container.height * 0.25)) {
    return {
      x: container.x,
      y: belowStart,
      width: container.width,
      height: belowHeight,
    };
  }
  return undefined;
}

function fillableRoleForRegion(
  labelText: string,
  labelBox: BoundingBox,
  region: BoundingBox,
): ExtractDocumentFieldCatalogRole {
  if (inferValueType(labelText) === "currency") return "value-region";
  if (inferValueType(labelText) === "dropdown") return "select";
  return region.height >= labelBox.height * 2.5 ? "value-region" : "input";
}

function isSectionHeading(text: string): boolean {
  return !/[:?]\s*$/.test(text) &&
    /\b(information|application|instructions?|remarks|history|coverage|overall operations?|operations overview)\b/i.test(text);
}

function adjacentWhitespaceRegion(
  label: ExtractDocumentFieldCatalogEntry,
  pageEntries: ExtractDocumentFieldCatalogEntry[],
  page: PageGeometry,
): BoundingBox | undefined {
  if (["description", "footer", "header", "title"].includes(label.role)) return undefined;
  if (!isFillableLabel(label.text) || isSectionHeading(label.text)) return undefined;
  const box = label.boundingBox;
  const gap = Math.max(2, box.height * 0.2);
  const pageRight = page.width - Math.max(12, page.width * 0.025);
  const rowTolerance = Math.max(box.height * 0.8, 8);
  const rightBlocker = pageEntries
    .filter((entry) => entry.id !== label.id && entry.boundingBox.x >= box.x + box.width)
    .filter((entry) => {
      const candidate = entry.boundingBox;
      const verticalOverlap = Math.min(box.y + box.height, candidate.y + candidate.height) -
        Math.max(box.y, candidate.y);
      return verticalOverlap > 0 || Math.abs(candidate.y - box.y) <= rowTolerance;
    })
    .sort((left, right) => left.boundingBox.x - right.boundingBox.x)[0];
  const columnRight = Math.min(pageRight, rightBlocker?.boundingBox.x - gap || pageRight);
  const horizontalStart = box.x + box.width + gap;
  const horizontalWidth = columnRight - horizontalStart;

  const belowBlocker = pageEntries
    .filter((entry) => entry.id !== label.id && entry.boundingBox.y >= box.y + box.height)
    .filter((entry) => {
      const candidate = entry.boundingBox;
      return candidate.x < columnRight && candidate.x + candidate.width > box.x;
    })
    .sort((left, right) => left.boundingBox.y - right.boundingBox.y)[0];
  const verticalStart = box.y + box.height + gap;
  const verticalBottom = Math.min(
    page.height - Math.max(12, page.height * 0.02),
    belowBlocker?.boundingBox.y - gap || page.height,
  );
  const verticalHeight = verticalBottom - verticalStart;
  const prefersVertical = verticalHeight >= box.height * 1.75 &&
    (/\baddress\b/i.test(label.text) || horizontalWidth < Math.max(36, box.width * 0.35));
  if (prefersVertical && columnRight - box.x >= Math.max(48, box.width)) {
    return {
      x: box.x,
      y: verticalStart,
      width: columnRight - box.x,
      height: verticalHeight,
    };
  }
  if (horizontalWidth >= Math.max(36, box.width * 0.35)) {
    return {
      x: horizontalStart,
      y: box.y,
      width: horizontalWidth,
      height: box.height,
    };
  }
  if (verticalHeight >= Math.max(10, box.height * 0.6) && columnRight > box.x) {
    return {
      x: box.x,
      y: verticalStart,
      width: columnRight - box.x,
      height: verticalHeight,
    };
  }
  return undefined;
}

function fieldType(valueType: ExtractDocumentFieldCatalogValueType): SemanticFieldType {
  if (valueType === "numeric" || valueType === "currency" || valueType === "percentage") return "numeric";
  if (valueType === "date") return "date";
  if (valueType === "dropdown") return "dropdown";
  if (valueType === "checkbox") return "checkbox";
  if (valueType === "signature") return "signature";
  return "text";
}

function createField(entry: ExtractDocumentFieldCatalogEntry): Field {
  const type = fieldType(entry.valueType);
  const box = entry.semanticValueRegion || entry.boundingBox;
  const semantic = classifyBlockSemantic({
    id: entry.id,
    page: entry.page,
    type: type === "checkbox" ? "checkbox" : "text",
    text: entry.text,
    boundingBox: box,
    confidence: entry.confidence,
  });
  const metadata: FieldMetadata = {
    acordCode: "",
    acordLabel: "",
    acordDescription: "",
    fieldType: type,
    required: false,
    confidenceScore: entry.confidence,
    source: "ocr",
    extractionBlockId: entry.id,
    semanticLabel: entry.semanticLabel || semantic.semanticLabel,
    categoryMode: entry.categoryMode || semantic.categoryMode,
    artifactClassification: "field value",
  };
  const common = {
    id: entry.id,
    pageIndex: entry.page - 1,
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    rotation: 0,
    opacity: 1,
    stroke: "#1e293b",
    strokeWidth: 1,
    fill: "#ffffff",
    groupId: entry.groupId || null,
    metadata,
  };
  if (type === "checkbox") {
    return { ...common, type, checked: /selected/i.test(entry.text), label: entry.text };
  }
  if (type === "date") {
    return { ...common, type, dateFormat: "MM/DD/YYYY", value: "", placeholder: "MM/DD/YYYY" };
  }
  if (type === "numeric") {
    return { ...common, type, min: 0, max: 100000000, step: entry.valueType === "percentage" ? 0.01 : 1, value: null, placeholder: "0" };
  }
  if (type === "dropdown") {
    return { ...common, type, options: [], selectedOption: "", placeholder: "Select", openPreview: false };
  }
  if (type === "signature") {
    return { ...common, type, placeholder: "Signature", signed: false, showStrokePreview: false };
  }
  return {
    ...common,
    type: "text",
    text: entry.text,
    fontSize: 14,
    fontFamily: "Geist Variable",
    textAlign: "left",
    color: "#0f172a",
  };
}

function buildCheckboxGroups(catalog: ExtractDocumentFieldCatalogEntry[]) {
  const groups: ExtractDocumentGroupedStructures["checkboxGroups"] = [];
  const marks = catalog.filter((entry) => entry.role === "checkbox");
  for (const page of new Set(marks.map((entry) => entry.page))) {
    const sorted = marks.filter((entry) => entry.page === page).sort((a, b) => a.boundingBox.y - b.boundingBox.y || a.boundingBox.x - b.boundingBox.x);
    let current: ExtractDocumentFieldCatalogEntry[] = [];
    const flush = () => {
      if (current.length === 0) return;
      const id = `checkbox-group-${groups.length + 1}`;
      groups.push({
        id,
        page,
        checkboxFieldIds: current.map((entry) => entry.id),
        labels: current.map((entry) => entry.semanticLabel || entry.text),
      });
      for (const entry of current) {
        entry.semanticGroupIds = [...new Set([...(entry.semanticGroupIds || []), id])];
      }
      current = [];
    };
    for (const entry of sorted) {
      const previous = current[current.length - 1];
      const sameChoiceSet = previous &&
        Math.abs(previous.boundingBox.y - entry.boundingBox.y) <= 18 &&
        Math.abs(previous.boundingBox.x - entry.boundingBox.x) <= 120;
      if (current.length && !sameChoiceSet) flush();
      current.push(entry);
    }
    flush();
  }
  return groups;
}

function buildAddressGroups(catalog: ExtractDocumentFieldCatalogEntry[]) {
  const groups: ExtractDocumentGroupedStructures["semanticGroups"] = [];
  const addressPattern = /\b(address|city|state|province|zip|postal|mailing|business name|legal name|named insured|carrier|insurer|underwriter)\b/i;
  for (const page of new Set(catalog.map((entry) => entry.page))) {
    const candidates = catalog
      .filter((entry) =>
        entry.page === page &&
        entry.semanticRole !== "Producer" &&
        Boolean(entry.semanticValueRegion) &&
        addressPattern.test(entry.semanticLabel || entry.text),
      )
      .sort((left, right) => left.boundingBox.y - right.boundingBox.y || left.boundingBox.x - right.boundingBox.x);
    let current: ExtractDocumentFieldCatalogEntry[] = [];
    const flush = () => {
      if (current.length < 2) {
        current = [];
        return;
      }
      const id = `address-block-p${page}-${groups.length + 1}`;
      for (const entry of current) {
        entry.semanticGroupIds = [...new Set([...(entry.semanticGroupIds || []), id])];
      }
      groups.push({
        id,
        page,
        kind: "address-block",
        fieldIds: current.map((entry) => entry.id),
        label: "Address block",
      });
      current = [];
    };
    for (const entry of candidates) {
      const previous = current[current.length - 1];
      const shouldFlush = previous && (
        entry.boundingBox.y - previous.boundingBox.y > 120 ||
        Math.abs(entry.boundingBox.x - previous.boundingBox.x) > 250
      );
      if (shouldFlush) flush();
      current.push(entry);
    }
    flush();
  }
  return groups;
}

const RP9_PRODUCER_LABELS: Array<{
  pattern: RegExp;
  cluster: NonNullable<ExtractDocumentFieldCatalogEntry["semanticCluster"]>;
}> = [
  { pattern: /^(?:AGENT NAME|AGENCY)$/i, cluster: "ProducerInformation" },
  { pattern: /^(?:ADDRESS|CITY|STATE|ZIP CODE)$/i, cluster: "ProducerAddress" },
  { pattern: /^(?:PHONE|FAX|E[ -]?MAIL(?: ADDRESS)?)$/i, cluster: "ProducerContact" },
  { pattern: /^(?:CODE|SUB CODE)$/i, cluster: "ProducerCodes" },
  { pattern: /^AGENCY CUSTOMER ID$/i, cluster: "ProducerCustomerId" },
  { pattern: /^AGENCY BILL$/i, cluster: "ProducerInformation" },
];

function normalizedProducerLabel(entry: ExtractDocumentFieldCatalogEntry): string {
  return String(entry.semanticLabel || entry.text || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function producerClusterForLabel(label: string) {
  return RP9_PRODUCER_LABELS.find((entry) => entry.pattern.test(label))?.cluster;
}

export function buildRp9ProducerGroups(catalog: ExtractDocumentFieldCatalogEntry[]) {
  const groups: ExtractDocumentGroupedStructures["semanticGroups"] = [];
  for (const page of new Set(catalog.map((entry) => entry.page))) {
    const pageEntries = catalog
      .filter((entry) => entry.page === page)
      .sort((left, right) => left.boundingBox.y - right.boundingBox.y || left.boundingBox.x - right.boundingBox.x);
    const anchors = pageEntries.filter((entry) => /^(?:AGENT NAME|AGENCY|AGENCY CUSTOMER ID|AGENCY BILL)$/i.test(normalizedProducerLabel(entry)));
    if (anchors.length === 0) continue;

    const producerRegions: ExtractDocumentFieldCatalogEntry[][] = [];
    for (const anchor of anchors) {
      const existing = producerRegions.find((region) =>
        region.some((entry) => Math.abs(entry.boundingBox.y - anchor.boundingBox.y) <= 260),
      );
      if (existing) existing.push(anchor);
      else producerRegions.push([anchor]);
    }

    producerRegions.forEach((regionAnchors, producerIndex) => {
      const top = Math.max(0, Math.min(...regionAnchors.map((entry) => entry.boundingBox.y)) - 20);
      const bottom = Math.max(...regionAnchors.map((entry) => entry.boundingBox.y)) + 140;
      const members = pageEntries.filter((entry) => {
        if (entry.boundingBox.y < top || entry.boundingBox.y > bottom) return false;
        return Boolean(producerClusterForLabel(normalizedProducerLabel(entry)));
      });
      if (members.length === 0) return;

      const informationId = `rp9-producer-information-p${page}-${producerIndex}`;
      for (const member of members) {
        member.semanticRole = "Producer";
        member.producerIndex = producerIndex;
        member.semanticCluster = producerClusterForLabel(normalizedProducerLabel(member));
        member.semanticGroupIds = [...new Set([...(member.semanticGroupIds || []), informationId])];
      }
      groups.push({ id: informationId, page, kind: "semantic", fieldIds: members.map((entry) => entry.id), label: "ProducerInformation" });

      for (const cluster of ["ProducerContact", "ProducerAddress", "ProducerCodes", "ProducerCustomerId"] as const) {
        const clusterMembers = members.filter((entry) => entry.semanticCluster === cluster);
        if (clusterMembers.length === 0) continue;
        const id = `rp9-${cluster.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase()}-p${page}-${producerIndex}`;
        for (const member of clusterMembers) member.semanticGroupIds = [...new Set([...(member.semanticGroupIds || []), id])];
        groups.push({ id, page, kind: "semantic", fieldIds: clusterMembers.map((entry) => entry.id), label: cluster });
      }
    });
  }
  return groups;
}

function buildStructuralSemanticGroups(catalog: ExtractDocumentFieldCatalogEntry[]): ExtractDocumentGroupedStructures["semanticGroups"] {
  const groups: ExtractDocumentGroupedStructures["semanticGroups"] = [];
  const tagged = new Set<string>();

  for (const page of new Set(catalog.map((entry) => entry.page))) {
    const rows = catalog.filter((entry) => entry.page === page && (entry.role === "table-cell" || entry.role === "row_label" || entry.role === "column_header"));
    const rowBuckets = new Map<string, ExtractDocumentFieldCatalogEntry[]>();
    for (const entry of rows) {
      const rowKey = `row-${entry.rowIndex ?? 0}`;
      if (!rowBuckets.has(rowKey)) rowBuckets.set(rowKey, []);
      rowBuckets.get(rowKey)!.push(entry);
    }
    for (const [rowKey, members] of rowBuckets.entries()) {
      if (members.length < 2) continue;
      const id = `structural-table-row-p${page}-${rowKey}`;
      for (const entry of members) {
        if (tagged.has(entry.id)) continue;
        entry.semanticGroupIds = [...new Set([...(entry.semanticGroupIds || []), id])];
        tagged.add(entry.id);
      }
      groups.push({
        id,
        page,
        kind: "table-row",
        fieldIds: members.map((entry) => entry.id),
        label: `Table row ${rowKey}`,
      });
    }
  }

  const businessPattern = /\b(business|legal|company|carrier|insurer|underwriter|named insured|applicant|mailing address|address|city|state|zip|postal)\b/i;
  for (const page of new Set(catalog.map((entry) => entry.page))) {
    const businessEntries = catalog.filter((entry) => entry.page === page && entry.semanticRole !== "Producer" && businessPattern.test(entry.semanticLabel || entry.text || ""));
    for (const candidate of businessEntries) {
      if (candidate.semanticGroupIds?.length) continue;
      if (!isMultiRowHeaderCandidate(candidate, catalog)) continue;
      const id = `business-identity-p${page}-${groups.length + 1}`;
      const peers = catalog.filter((entry) => entry.page === page && entry.id !== candidate.id && Math.abs(entry.boundingBox.y - candidate.boundingBox.y) <= 140 && businessPattern.test(entry.semanticLabel || entry.text || ""));
      const fieldIds = [...new Set([candidate.id, ...peers.map((entry) => entry.id)])];
      if (fieldIds.length < 2) continue;
      for (const entry of catalog.filter((entry) => fieldIds.includes(entry.id))) {
        entry.semanticGroupIds = [...new Set([...(entry.semanticGroupIds || []), id])];
      }
      groups.push({ id, page, kind: "semantic", fieldIds, label: "Business identity block" });
    }
  }

  return groups;
}

export async function buildHybridFieldExtraction(args: {
  pages: PageExtraction[];
  rawResult?: any;
}): Promise<HybridExtractionResult> {
  const rawPages = Array.isArray(args.rawResult?.pages) ? args.rawResult.pages : [];
  const catalog: ExtractDocumentFieldCatalogEntry[] = [];
  const labelInputPairs: ExtractDocumentGroupedStructures["labelInputPairs"] = [];
  const pageGeometry = new Map<number, PageGeometry>();
  for (const page of args.pages) {
    const unit = (page as any).unit as string | undefined;
    const geometry = {
      unit,
      width: toPixels(finite(page.width, 816), unit),
      height: toPixels(finite(page.height, 1056), unit),
    };
    pageGeometry.set(page.pageNumber, geometry);
    for (let index = 0; index < page.lines.length; index += 1) {
      const line = page.lines[index];
      const text = normalizedText(line.content);
      if (!text || /^selection_mark_/i.test(text)) continue;
      const box = toPixelBox(line.boundingBox || { x: 0, y: 0, width: 1, height: 1 }, unit);
      const lineRole = classifyLineRole(text, box, geometry);
      const inlineBlank = ["title", "header", "footer", "section-label"].includes(lineRole)
        ? undefined
        : inlineBlankFromText(text, box);
      const semanticValueRegion = inlineBlank
        ? normalizeFillableBox(inlineBlank, inlineBlank.box, geometry)
        : undefined;
      const labelEntry: ExtractDocumentFieldCatalogEntry = {
        id: `semantic-p${page.pageNumber}-l${index + 1}`,
        page: page.pageNumber,
        role: lineRole,
        valueType: "label",
        text,
        boundingBox: inlineBlank?.labelBox || box,
        semanticValueRegion,
        source: "di_line",
        confidence: finite(line.confidence, 0.85),
        semanticLabel: text.replace(/[:_\.\-\s]+$/g, "").trim() || text,
      };
      catalog.push(labelEntry);
      if (semanticValueRegion) {
        const pairId = `label-input-${labelInputPairs.length + 1}`;
        const inputId = `input-p${page.pageNumber}-l${index + 1}`;
        if (labelEntry.role !== "question") labelEntry.role = "label";
        labelEntry.groupId = pairId;
        labelEntry.semanticValueRegion = undefined;
        catalog.push({
          id: inputId,
          page: page.pageNumber,
          role: inlineBlank?.role || fillableRoleForRegion(text, box, semanticValueRegion),
          valueType: inlineBlank?.valueType || inferValueType(text),
          text: "",
          boundingBox: semanticValueRegion,
          semanticValueRegion,
          source: "blank_detector",
          confidence: finite(line.confidence, 0.85),
          semanticLabel: inlineBlank?.semanticLabel || text.replace(/[_\.\-\s]+$/g, "").trim(),
          labelBoundingBox: labelEntry.boundingBox,
          groupId: pairId,
        });
        labelInputPairs.push({
          id: pairId,
          page: page.pageNumber,
          labelBlockId: labelEntry.id,
          inputBlockId: inputId,
        });
      }
    }
  }

  const tables: ExtractDocumentGroupedStructures["tables"] = [];
  const rawTables = Array.isArray(args.rawResult?.tables) ? args.rawResult.tables : [];
  for (let tableIndex = 0; tableIndex < rawTables.length; tableIndex += 1) {
    const table = rawTables[tableIndex];
    const tableId = `table-${tableIndex + 1}`;
    const cells = Array.isArray(table?.cells) ? table.cells : [];
    const rowGroups = new Set<string>();
    const normalizedCells = cells.map((cell: any, cellIndex: number) => {
      const page = Math.max(1, Number(cell?.boundingRegions?.[0]?.pageNumber || table?.boundingRegions?.[0]?.pageNumber || 1));
      const unit = pageGeometry.get(page)?.unit;
      return {
        cell,
        cellIndex,
        page,
        box: toPixelBox(boundsFromPolygon(cell?.boundingRegions?.[0]?.polygon || table?.boundingRegions?.[0]?.polygon), unit),
        rowIndex: Math.max(0, Number(cell?.rowIndex || 0)),
        columnIndex: Math.max(0, Number(cell?.columnIndex || 0)),
        text: normalizedText(cell?.content),
      };
    });
    const pairedLabelIds = new Set<string>();
    const consumedCellIndexes = new Set<number>();
    for (const normalizedCell of normalizedCells) {
      const { cell, cellIndex, page, box, rowIndex, columnIndex, text } = normalizedCell;
      if (consumedCellIndexes.has(cellIndex)) continue;
      const inlineBlank = inlineBlankFromText(text, box);
      if (inlineBlank) {
        const normalizedBlankBox = normalizeFillableBox(
          inlineBlank,
          inlineBlank.box,
          pageGeometry.get(page) || { width: 816, height: 1056 },
        );
        const inputId = `input-${tableId}-r${rowIndex + 1}-c${columnIndex + 1}`;
        catalog.push({
          id: inputId,
          page,
          role: inlineBlank.role,
          valueType: inlineBlank.valueType,
          text: inlineBlank.semanticLabel,
          boundingBox: normalizedBlankBox,
          semanticValueRegion: normalizedBlankBox,
          source: "blank_detector",
          confidence: finite(cell?.confidence, 0.85),
          semanticLabel: inlineBlank.semanticLabel,
          labelBoundingBox: inlineBlank.labelBox,
          tableId,
          rowIndex,
          columnIndex,
        });
        continue;
      }
      const role: ExtractDocumentFieldCatalogRole = !text
        ? "table-cell"
        : rowIndex === 0
          ? "column_header"
          : columnIndex === 0
            ? "row_label"
            : "label";
      const groupId = rowIndex > 0 ? `${tableId}-row-${rowIndex + 1}` : undefined;
      if (groupId) rowGroups.add(groupId);
      const label = catalog
        .filter((entry) => entry.page === page && entry.source === "di_line" && !entry.groupId && !pairedLabelIds.has(entry.id))
        .filter((entry) => !isSectionHeading(entry.text) && isFillableLabel(entry.text) && (
          isLabelInBox(entry.boundingBox, box) ||
          (normalizedText(entry.text) === text && intersectionArea(entry.boundingBox, box) > 0)
        ))
        .sort((left, right) => intersectionArea(right.boundingBox, box) - intersectionArea(left.boundingBox, box))[0];
      const adjacentBlankCell = label
        ? normalizedCells
          .filter((candidate) =>
            candidate.page === page &&
            !consumedCellIndexes.has(candidate.cellIndex) &&
            !candidate.text &&
            (
              (candidate.rowIndex === rowIndex && candidate.columnIndex === columnIndex + 1) ||
              (candidate.rowIndex === rowIndex + 1 && candidate.columnIndex === columnIndex)
            ),
          )
          .sort((left, right) => {
            const leftHorizontal = left.rowIndex === rowIndex ? 0 : 1;
            const rightHorizontal = right.rowIndex === rowIndex ? 0 : 1;
            return leftHorizontal - rightHorizontal || distance(box, left.box) - distance(box, right.box);
          })[0]
        : undefined;
      const inputBox = label
        ? adjacentBlankCell?.box || blankRegionAfterLabel(label.boundingBox, box)
        : undefined;
      if (label && inputBox) {
        const pairId = `label-input-${labelInputPairs.length + 1}`;
        const inputRowIndex = adjacentBlankCell?.rowIndex ?? rowIndex;
        const inputColumnIndex = adjacentBlankCell?.columnIndex ?? columnIndex;
        const inputId = `input-${tableId}-r${inputRowIndex + 1}-c${inputColumnIndex + 1}`;
        const semanticRowGroupId = `${tableId}-row-${inputRowIndex + 1}`;
        rowGroups.add(semanticRowGroupId);
        const valueType = inferValueType(label.text);
        const normalizedInputBox = normalizeFillableBox(
          { valueType },
          inputBox,
          pageGeometry.get(page) || { width: 816, height: 1056 },
        );
        if (label.role !== "question") label.role = "label";
        label.groupId = pairId;
        label.semanticValueRegion = undefined;
        pairedLabelIds.add(label.id);
        if (adjacentBlankCell) consumedCellIndexes.add(adjacentBlankCell.cellIndex);
        catalog.push({
          id: inputId,
          page,
          role: fillableRoleForRegion(label.text, label.boundingBox, normalizedInputBox),
          valueType,
          text: label.semanticLabel || label.text,
          boundingBox: normalizedInputBox,
          semanticValueRegion: normalizedInputBox,
          source: "blank_detector",
          confidence: Math.min(label.confidence, finite(cell?.confidence, 0.85)),
          semanticLabel: label.semanticLabel || label.text,
          labelBoundingBox: label.boundingBox,
          groupId: pairId,
          semanticGroupIds: [semanticRowGroupId],
          tableId,
          rowIndex: inputRowIndex,
          columnIndex: inputColumnIndex,
        });
        labelInputPairs.push({
          id: pairId,
          page,
          labelBlockId: label.id,
          inputBlockId: inputId,
        });
        continue;
      }
      catalog.push({
        id: `${tableId}-r${rowIndex + 1}-c${columnIndex + 1}`,
        page,
        role,
        valueType: role === "table-cell" ? inferValueType(text) : "label",
        text,
        boundingBox: box,
        semanticValueRegion: role === "table-cell" ? box : undefined,
        source: "di_table_cell",
        confidence: finite(cell?.confidence, 0.85),
        groupId,
        semanticGroupIds: groupId ? [groupId] : undefined,
        tableId,
        rowIndex,
        columnIndex,
      });
    }
    tables.push({
      id: tableId,
      page: Math.max(1, Number(table?.boundingRegions?.[0]?.pageNumber || 1)),
      rowCount: Math.max(0, Number(table?.rowCount || 0)),
      columnCount: Math.max(0, Number(table?.columnCount || 0)),
      rowGroupIds: [...rowGroups],
    });
  }

  for (const [pageNumber, geometry] of pageGeometry) {
    const pageEntries = catalog.filter(
      (entry) => entry.page === pageNumber && entry.source === "di_line",
    );
    for (const label of pageEntries) {
      if (label.groupId || label.semanticValueRegion) continue;
      if (label.role === "question" && hasSameRowExplicitCheckbox(label, rawPages)) continue;
      const inlineBlank = inlineBlankFromText(label.text, label.boundingBox);
      const fallbackInputBox = inlineBlank
        ? normalizeFillableBox(inlineBlank, inlineBlank.box, geometry)
        : adjacentWhitespaceRegion(label, pageEntries, geometry);
      const inputBox = fallbackInputBox;
      if (!inputBox) continue;
      const pairId = `label-input-${labelInputPairs.length + 1}`;
      const inputId = `input-${label.id}`;
      const valueType = inferValueType(label.text);
      const normalizedInputBox = normalizeFillableBox({ valueType }, inputBox, geometry);
      if (label.role !== "question") label.role = "label";
      label.groupId = pairId;
      catalog.push({
        id: inputId,
        page: label.page,
        role: fillableRoleForRegion(label.text, label.boundingBox, normalizedInputBox),
        valueType,
        text: label.semanticLabel || label.text,
        boundingBox: normalizedInputBox,
        semanticValueRegion: normalizedInputBox,
        labelBoundingBox: label.boundingBox,
        source: "blank_detector",
        confidence: label.confidence,
        semanticLabel: label.semanticLabel || label.text,
        groupId: pairId,
      });
      labelInputPairs.push({
        id: pairId,
        page: label.page,
        labelBlockId: label.id,
        inputBlockId: inputId,
      });
    }
  }

  for (const [pageNumber, geometry] of pageGeometry) {
    const pageEntries = catalog.filter(
      (entry) => entry.page === pageNumber && entry.source === "di_line" && !entry.groupId,
    );
    for (const label of pageEntries) {
      if (label.groupId || !isFillableLabel(label.text) || isSectionHeading(label.text)) continue;
      const inlineBlank = inlineBlankFromText(label.text, label.boundingBox);
      if (!inlineBlank) continue;
      const pairId = `label-input-${labelInputPairs.length + 1}`;
      const inputId = `input-${label.id}-fallback`;
      const normalizedInputBox = normalizeFillableBox(inlineBlank, inlineBlank.box, geometry);
      label.groupId = pairId;
      label.role = label.role === "question" ? "question" : "label";
      catalog.push({
        id: inputId,
        page: label.page,
        role: inlineBlank.role,
        valueType: inlineBlank.valueType,
        text: "",
        boundingBox: normalizedInputBox,
        semanticValueRegion: normalizedInputBox,
        labelBoundingBox: label.boundingBox,
        source: "blank_detector",
        confidence: label.confidence,
        semanticLabel: inlineBlank.semanticLabel || label.semanticLabel || label.text,
        groupId: pairId,
      });
      labelInputPairs.push({
        id: pairId,
        page: label.page,
        labelBlockId: label.id,
        inputBlockId: inputId,
      });
    }
  }

  for (const entry of catalog.filter((candidate) => candidate.role === "table-cell")) {
    const header = catalog.find(
      (candidate) =>
        candidate.tableId === entry.tableId &&
        candidate.role === "column_header" &&
        candidate.columnIndex === entry.columnIndex,
    );
    const rowLabel = catalog.find(
      (candidate) =>
        candidate.tableId === entry.tableId &&
        candidate.role === "row_label" &&
        candidate.rowIndex === entry.rowIndex,
    );
    const typedSymbol = catalog.find((candidate) =>
      candidate.tableId === entry.tableId &&
      candidate.page === entry.page &&
      candidate.rowIndex === entry.rowIndex &&
      Math.abs(candidate.columnIndex - (entry.columnIndex ?? 0)) <= 1 &&
      /^\s*[$%]\s*$/.test(candidate.text),
    );
    const rowBoundaryKey = rowLabel?.text || header?.text || `row-${entry.rowIndex ?? 0}`;
    entry.semanticLabel = [header?.text, rowLabel?.text]
      .filter(Boolean)
      .join(" - ") ||
      (typedSymbol?.text === "$"
        ? "Dollar amount"
        : typedSymbol?.text === "%"
          ? "Percentage"
          : entry.text || `Table value ${rowBoundaryKey}`);
    entry.valueType = typedSymbol?.text === "$"
      ? "currency"
      : typedSymbol?.text === "%"
        ? "percentage"
        : inferValueType(entry.semanticLabel);
    entry.labelBoundingBox = rowLabel?.boundingBox || header?.boundingBox || typedSymbol?.boundingBox;
    entry.semanticValueRegion = normalizeFillableBox(
      entry,
      entry.semanticValueRegion || entry.boundingBox,
      pageGeometry.get(entry.page) || { width: 816, height: 1056 },
    );
    entry.boundingBox = entry.semanticValueRegion;
    entry.semanticGroupIds = [...new Set([...(entry.semanticGroupIds || []), `${entry.tableId}-row-${entry.rowIndex ?? 0}`])];
  }
  for (const entry of catalog.filter((candidate) => candidate.role === "column_header")) {
    entry.semanticLabel = entry.text ||
      `${entry.tableId || "Table"} column ${(entry.columnIndex ?? 0) + 1} header`;
  }

  for (const rawPage of rawPages) {
    const page = Math.max(1, Number(rawPage?.pageNumber || 1));
    const unit = pageGeometry.get(page)?.unit || rawPage?.unit;
    const marks = Array.isArray(rawPage?.selectionMarks) ? rawPage.selectionMarks : [];
    for (let index = 0; index < marks.length; index += 1) {
      const mark = marks[index];
      const box = toPixelBox(boundsFromPolygon(mark?.polygon || mark?.boundingPolygon), unit);
      const nearestLabel = catalog
        .filter((entry) =>
          entry.page === page &&
          entry.role !== "checkbox" &&
          Math.abs(
            entry.boundingBox.y + entry.boundingBox.height / 2 - (box.y + box.height / 2),
          ) <= Math.max(24, box.height * 1.5)
        )
        .map((entry) => ({ entry, score: selectionLabelDistance(box, entry.boundingBox) }))
        .sort((left, right) => left.score - right.score)[0]?.entry;
      catalog.push({
        id: `checkbox-p${page}-${index + 1}`,
        page,
        role: "checkbox",
        valueType: "checkbox",
        text: `selection_mark_${String(mark?.state || "unselected").toLowerCase()}_${index + 1}`,
        boundingBox: box,
        semanticValueRegion: box,
        source: "selection_mark",
        confidence: finite(mark?.confidence, 0.9),
        semanticLabel: nearestLabel?.semanticLabel || nearestLabel?.text,
      });
    }
  }

  const fillableRoles = new Set<ExtractDocumentFieldCatalogRole>([
    "input",
    "checkbox",
    "select",
    "table-cell",
    "value-region",
  ]);
  const pairedInputIds = new Set(labelInputPairs.map((pair) => pair.inputBlockId));
  const hasValidFillableGeometry = (entry: ExtractDocumentFieldCatalogEntry): boolean => {
    const box = entry.semanticValueRegion;
    return Boolean(box && hasValidFillableBox(entry, box));
  };
  const promotionCandidates = catalog.filter(
    (entry) => (
      fillableRoles.has(entry.role) ||
      entry.source === "pdf_widget" ||
      isDeterministicFillableCandidate(entry)
    ) &&
      (hasValidFillableGeometry(entry) || isDeterministicFillableCandidate(entry)) &&
      !duplicatesExplicitCheckbox(entry, catalog) &&
      (entry.role !== "table-cell" || Boolean(entry.labelBoundingBox && entry.semanticLabel !== "Table value") || isDeterministicFillableCandidate(entry)),
  );
  const fillable: ExtractDocumentFieldCatalogEntry[] = [];
  let overlappingGeometryConflictCount = 0;
  for (const entry of [...promotionCandidates].sort((left, right) => {
    const typedPriority = Number(isTypedBlank(right)) - Number(isTypedBlank(left));
    if (typedPriority !== 0) return typedPriority;
    const controlPriority = Number(right.role === "checkbox") - Number(left.role === "checkbox");
    if (controlPriority !== 0) return controlPriority;
    const pairPriority = Number(pairedInputIds.has(right.id)) - Number(pairedInputIds.has(left.id));
    if (pairPriority !== 0) return pairPriority;
    const leftSemantic = Number(preferredSemanticLabel(left.semanticLabel || left.text));
    const rightSemantic = Number(preferredSemanticLabel(right.semanticLabel || right.text));
    if (leftSemantic !== rightSemantic) return rightSemantic - leftSemantic;
    const leftBox = entryValueBox(left);
    const rightBox = entryValueBox(right);
    const leftArea = leftBox.width * leftBox.height;
    const rightArea = rightBox.width * rightBox.height;
    return leftArea - rightArea;
  })) {
    let box = entryValueBox(entry);
    const blockers = fillable.filter((candidate) =>
      candidate.page === entry.page && intersectionArea(box, entryValueBox(candidate)) > 0
    );
    overlappingGeometryConflictCount += blockers.length;
    if (blockers.length > 0 && !pairedInputIds.has(entry.id)) continue;
    for (const other of blockers) {
      const otherBox = entryValueBox(other);
      const overlap = intersectionArea(box, otherBox);
      const smallerArea = Math.max(1, Math.min(
        box.width * box.height,
        otherBox.width * otherBox.height,
      ));
      if (overlap / smallerArea >= 0.65) {
        box = { ...box, width: 0, height: 0 };
        break;
      }
      box = largestRemainder({ ...entry, semanticValueRegion: box }, otherBox);
    }
    if (!hasValidFillableGeometry({ ...entry, semanticValueRegion: box })) continue;
    entry.boundingBox = box;
    entry.semanticValueRegion = box;
    fillable.push(entry);
  }
  const questions = catalog.filter((entry) => entry.role === "question");
  const questionAnswerPairs: ExtractDocumentGroupedStructures["questionAnswerPairs"] = [];
  for (const question of questions) {
    const ownInputId = labelInputPairs.find((pair) => pair.labelBlockId === question.id)?.inputBlockId;
    const answer = fillable.find((entry) => entry.id === ownInputId) || fillable
      .filter((entry) => entry.page === question.page)
      .map((entry) => ({ entry, score: distance(question.boundingBox, entry.boundingBox) }))
      .sort((left, right) => left.score - right.score)[0]?.entry;
    if (!answer) continue;
    question.pairedAnswerId = answer.id;
    answer.pairedQuestionId = question.id;
    questionAnswerPairs.push({
      id: `qa-pair-${questionAnswerPairs.length + 1}`,
      page: question.page,
      questionFieldId: question.id,
      answerFieldId: answer.id,
    });
  }

  for (const groupId of [...new Set(catalog.filter((entry) => entry.groupId).map((entry) => entry.groupId as string))]) {
    const label = catalog.find((entry) => entry.groupId === groupId && entry.source === "di_line" && ["label", "question"].includes(entry.role));
    const input = catalog.find((entry) => entry.groupId === groupId && entry.source === "blank_detector" && fillableRoles.has(entry.role));
    if (!label || !input) continue;
    if (labelInputPairs.some((pair) => pair.labelBlockId === label.id && pair.inputBlockId === input.id)) continue;
    labelInputPairs.push({
      id: groupId,
      page: label.page,
      labelBlockId: label.id,
      inputBlockId: input.id,
    });
  }

  const catalogById = new Map(catalog.map((entry) => [entry.id, entry]));
  const pairedBlankInputIds = new Set(
    labelInputPairs
      .map((pair) => catalogById.get(pair.inputBlockId))
      .filter((entry): entry is ExtractDocumentFieldCatalogEntry => Boolean(entry && entry.source === "blank_detector"))
      .map((entry) => entry.id),
  );
  const fillableIds = new Set([
    ...fillable.map((entry) => entry.id),
    ...pairedBlankInputIds,
  ]);
  const validLabelInputPairs = labelInputPairs.filter((pair) => {
    const label = catalogById.get(pair.labelBlockId);
    const input = catalogById.get(pair.inputBlockId);
    const explicitCheckboxMatch = Boolean(
      label &&
      label.role === "question" &&
      input &&
      input.source === "blank_detector" &&
      duplicatesExplicitCheckbox(input, catalog),
    );
    return Boolean(
      label &&
      input &&
      !explicitCheckboxMatch &&
      (fillableIds.has(input.id) || input.source === "blank_detector") &&
      label.page === input.page &&
      ["label", "question"].includes(label.role) &&
      !isSectionHeading(label.text) &&
      (label.role === "question" || isFillableLabel(label.text)),
    );
  });
  const preservedGroupPairs = new Map<string, { labelBlockId: string; inputBlockId: string; page: number }>();
  for (const entry of catalog) {
    if (!entry.groupId) continue;
    const current = preservedGroupPairs.get(entry.groupId) || { labelBlockId: "", inputBlockId: "", page: entry.page };
    if (entry.source === "di_line" && ["label", "question"].includes(entry.role)) {
      current.labelBlockId = entry.id;
    }
    if (entry.source === "blank_detector" && fillableRoles.has(entry.role)) {
      current.inputBlockId = entry.id;
    }
    if (current.labelBlockId && current.inputBlockId) {
      preservedGroupPairs.set(entry.groupId, current);
    }
  }
  const fallbackPairs = [...preservedGroupPairs.values()]
    .filter((pair) => pair.labelBlockId && pair.inputBlockId)
    .filter((pair) => !validLabelInputPairs.some((existing) => existing.labelBlockId === pair.labelBlockId && existing.inputBlockId === pair.inputBlockId))
    .map((pair, index) => ({
      id: `label-input-${validLabelInputPairs.length + index + 1}`,
      page: pair.page,
      labelBlockId: pair.labelBlockId,
      inputBlockId: pair.inputBlockId,
    }));
  const finalLabelInputPairs = [...validLabelInputPairs, ...fallbackPairs];
  const pairedCatalogIds = new Set(
    finalLabelInputPairs.flatMap((pair) => [pair.labelBlockId, pair.inputBlockId]),
  );
  const validQuestionIds = new Set(questionAnswerPairs.map((pair) => pair.questionFieldId));
  const retainedCatalog = catalog.filter((entry) => {
    if (entry.source === "blank_detector" && entry.groupId) {
      const label = catalogById.get(entry.groupId ? finalLabelInputPairs.find((pair) => pair.inputBlockId === entry.id)?.labelBlockId || "" : "");
      if (label && label.role === "question" && duplicatesExplicitCheckbox(entry, catalog)) {
        return false;
      }
    }
    if (isLikelySuppressionNoise(entry)) return false;
    if (fillableRoles.has(entry.role) || entry.source === "pdf_widget") {
      return fillableIds.has(entry.id) || isDeterministicFillableCandidate(entry) || isLikelyResidualFillableLabel(entry);
    }
    if (["section-label", "header", "title", "footer"].includes(entry.role)) return false;
    if (entry.source === "di_table_cell") return isDeterministicFillableCandidate(entry) || hasTableBoundaryCue(entry.text || entry.semanticLabel || "") || isTableBoundaryLabel(entry.text || entry.semanticLabel || "");
    if (entry.role === "question") return validQuestionIds.has(entry.id) || isDeterministicFillableCandidate(entry) || isLikelyResidualFillableLabel(entry);
    return pairedCatalogIds.has(entry.id) || isDeterministicFillableCandidate(entry) || isLikelyResidualFillableLabel(entry) || hasTableBoundaryCue(entry.text || entry.semanticLabel || "") || isTableBoundaryLabel(entry.text || entry.semanticLabel || "");
  });
  const retainedIds = new Set(retainedCatalog.map((entry) => entry.id));
  const retainedLabelInputPairs = finalLabelInputPairs.filter((pair) =>
    retainedIds.has(pair.labelBlockId) && retainedIds.has(pair.inputBlockId)
  );
  const retainedQuestionAnswerPairs = questionAnswerPairs.filter((pair) =>
    retainedIds.has(pair.questionFieldId) && retainedIds.has(pair.answerFieldId)
  );
  const checkboxGroups = buildCheckboxGroups(retainedCatalog);
  const rp9ProducerGroups = buildRp9ProducerGroups(retainedCatalog);
  const addressGroups = buildAddressGroups(retainedCatalog);
  const structuralGroups = buildStructuralSemanticGroups(retainedCatalog);
  const semanticGroups: ExtractDocumentGroupedStructures["semanticGroups"] = [
    ...rp9ProducerGroups,
    ...addressGroups,
    ...structuralGroups,
    ...tables.flatMap((table) => table.rowGroupIds.map((id) => ({
      id,
      page: table.page,
      kind: "table-row" as const,
      fieldIds: retainedCatalog
        .filter((entry) => entry.semanticGroupIds?.includes(id))
        .map((entry) => entry.id),
    }))),
    ...checkboxGroups
      .filter((group) => group.checkboxFieldIds.length > 1)
      .map((group) => ({
        id: group.id,
        page: group.page,
        kind: group.labels.some((label) => /^yes$/i.test(label)) &&
          group.labels.some((label) => /^no$/i.test(label))
          ? "yes-no" as const
          : "choice-set" as const,
        fieldIds: group.checkboxFieldIds,
        label: group.labels.join(" / "),
      })),
  ].filter((group) => group.fieldIds.length > 0);
  const blocks = retainedCatalog
    .filter((entry) => fillableIds.has(entry.id) || isDeterministicFillableCandidate(entry))
    .map<ExtractedBlock>((entry) => ({
    id: entry.id,
    page: entry.page,
    type: entry.valueType === "checkbox" ? "checkbox" : entry.valueType === "signature" ? "signature" : "text",
    text: entry.text || entry.semanticLabel || "",
    boundingBox: fillableRoles.has(entry.role)
      ? entry.semanticValueRegion || entry.boundingBox
      : entry.boundingBox,
    confidence: entry.confidence,
    }));
  const fields = retainedCatalog
    .filter((entry) => fillableIds.has(entry.id) || isDeterministicFillableCandidate(entry))
    .map(createField);
  const retainedCatalogIds = new Set(retainedCatalog.map((entry) => entry.id));
  const suppressedSectionHeaderCount = catalog.filter((entry) =>
    ["section-label", "header", "title", "footer"].includes(entry.role) && !retainedCatalogIds.has(entry.id)
  ).length;
  const suppressedDiTextOnlyBlockCount = catalog.filter((entry) =>
    entry.source === "di_table_cell" && entry.text.trim().length > 0 && !retainedCatalogIds.has(entry.id)
  ).length;
  const suppressedOcrNoiseBlockCount = catalog.filter((entry) =>
    entry.source === "di_line" &&
    !["section-label", "header", "title", "footer"].includes(entry.role) &&
    !retainedCatalogIds.has(entry.id)
  ).length;
  return {
    blocks,
    fields,
    fieldCatalog: retainedCatalog,
    groupedStructures: {
      labelInputPairs: retainedLabelInputPairs,
      tables,
      questionAnswerPairs: retainedQuestionAnswerPairs,
      checkboxGroups,
      semanticGroups,
    },
    diagnostics: {
      blankRegionCount: retainedCatalog.filter((entry) => entry.source === "blank_detector").length,
      tableCellCount: retainedCatalog.filter((entry) => entry.source === "di_table_cell").length,
      semanticFieldCount: retainedCatalog.length,
      fillableFieldCount: fields.length,
      currencyBlankCount: fillable.filter((entry) => entry.valueType === "currency").length,
      percentageBlankCount: fillable.filter((entry) => entry.valueType === "percentage").length,
      numericBlankCount: fillable.filter((entry) => entry.valueType === "numeric").length,
      suppressedSectionHeaderCount,
      suppressedDiTextOnlyBlockCount,
      suppressedOcrNoiseBlockCount,
      overlappingGeometryConflictCount,
      validLabelInputPairCount: retainedLabelInputPairs.length,
      propagatedELabelCandidateCount: fillable.filter((entry) => Boolean(entry.labelBoundingBox)).length,
    },
  };
}
