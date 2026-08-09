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
  if (/\b(date|dob|birth|effective|expiration|expiry)\b/.test(normalized)) return "date";
  if (/%|\bpercentage\b|\brate\b/.test(normalized)) return "percentage";
  if (/\$|\b(cost|payroll|receipts|premium|amount|deductible)\b/.test(normalized)) return "currency";
  if (/\b(number|count|years|employees|zip|postal|limit|fein|federal employer id)\b/.test(normalized)) return "numeric";
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
  return {
    box: {
      x: box.x + box.width * (start / text.length),
      y: box.y,
      width: Math.max(1, box.width * (blank[0].length / text.length)),
      height: box.height,
    },
    role: isCurrency ? "value-region" : "input",
    valueType,
    semanticLabel,
  };
}

function isNarrowTypedBlank(entry: ExtractDocumentFieldCatalogEntry, box: BoundingBox): boolean {
  return ["numeric", "percentage"].includes(entry.valueType) && box.width >= 12 && box.width <= 40;
}

function hasValidFillableBox(entry: ExtractDocumentFieldCatalogEntry, box: BoundingBox): boolean {
  if (![box.x, box.y, box.width, box.height].every(Number.isFinite)) return false;
  const narrowTypedBlank = isNarrowTypedBlank(entry, box);
  if (entry.role === "checkbox") return box.width > 0 && box.height >= 6 && box.height <= 60;
  if (!narrowTypedBlank && (box.width < 20 || box.height < 6)) return false;
  if (narrowTypedBlank && (box.width < 12 || box.height <= 0)) return false;
  return entry.role === "value-region" || box.height <= 60;
}

function distance(left: BoundingBox, right: BoundingBox): number {
  const leftX = left.x + left.width / 2;
  const leftY = left.y + left.height / 2;
  const rightX = right.x + right.width / 2;
  const rightY = right.y + right.height / 2;
  return Math.abs(leftY - rightY) * 0.8 + Math.abs(leftX - rightX) * 0.2;
}

function intersectionArea(left: BoundingBox, right: BoundingBox): number {
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
    /\b(name|agency|producer|carrier|underwriter|applicant|insured|address|city|state|zip|postal|e-?mail|phone|website|contact|representative|code|number|date|fein|soc sec|payroll|percentage)\b/i.test(normalized);
}

function preferredSemanticLabel(text: string): boolean {
  return /\b(agency|agent|producer|carrier|company|underwriter|applicant|insured|mailing address|address|e-?mail|phone)\b/i.test(text);
}

function largestRemainder(
  box: BoundingBox,
  blocker: BoundingBox,
  role: ExtractDocumentFieldCatalogRole,
): BoundingBox {
  if (intersectionArea(box, blocker) === 0) return box;
  const pieces = [
    { x: box.x, y: box.y, width: blocker.x - box.x, height: box.height },
    { x: blocker.x + blocker.width, y: box.y, width: box.x + box.width - blocker.x - blocker.width, height: box.height },
    { x: box.x, y: box.y, width: box.width, height: blocker.y - box.y },
    { x: box.x, y: blocker.y + blocker.height, width: box.width, height: box.y + box.height - blocker.y - blocker.height },
  ].filter((piece) =>
    piece.width >= (role === "checkbox" ? 1 : 20) &&
    piece.height >= 6 &&
    (role === "value-region" || piece.height <= 60)
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
      groups.push({
        id: `checkbox-group-${groups.length + 1}`,
        page,
        checkboxFieldIds: current.map((entry) => entry.id),
        labels: current.map((entry) => entry.semanticLabel || entry.text),
      });
      current = [];
    };
    for (const entry of sorted) {
      if (current.length && Math.abs(current[current.length - 1].boundingBox.y - entry.boundingBox.y) > 18) flush();
      current.push(entry);
    }
    flush();
  }
  return groups;
}

export async function buildHybridFieldExtraction(args: {
  pages: PageExtraction[];
  rawResult?: any;
}): Promise<HybridExtractionResult> {
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
      const semanticValueRegion = inlineBlank?.box;
      const labelEntry: ExtractDocumentFieldCatalogEntry = {
        id: `semantic-p${page.pageNumber}-l${index + 1}`,
        page: page.pageNumber,
        role: lineRole,
        valueType: "label",
        text,
        boundingBox: box,
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
        const inputId = `input-${tableId}-r${rowIndex + 1}-c${columnIndex + 1}`;
        catalog.push({
          id: inputId,
          page,
          role: inlineBlank.role,
          valueType: inlineBlank.valueType,
          text: inlineBlank.semanticLabel,
          boundingBox: inlineBlank.box,
          semanticValueRegion: inlineBlank.box,
          source: "blank_detector",
          confidence: finite(cell?.confidence, 0.85),
          semanticLabel: inlineBlank.semanticLabel,
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
        .filter((entry) => isFillableLabel(entry.text) && (
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
        if (label.role !== "question") label.role = "label";
        label.groupId = pairId;
        label.semanticValueRegion = undefined;
        pairedLabelIds.add(label.id);
        if (adjacentBlankCell) consumedCellIndexes.add(adjacentBlankCell.cellIndex);
        catalog.push({
          id: inputId,
          page,
          role: fillableRoleForRegion(label.text, label.boundingBox, inputBox),
          valueType: inferValueType(label.text),
          text: label.semanticLabel || label.text,
          boundingBox: inputBox,
          semanticValueRegion: inputBox,
          source: "blank_detector",
          confidence: Math.min(label.confidence, finite(cell?.confidence, 0.85)),
          semanticLabel: label.semanticLabel || label.text,
          groupId: pairId,
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
      const inputBox = adjacentWhitespaceRegion(label, pageEntries, geometry);
      if (!inputBox) continue;
      const pairId = `label-input-${labelInputPairs.length + 1}`;
      const inputId = `input-${label.id}`;
      if (label.role !== "question") label.role = "label";
      label.groupId = pairId;
      catalog.push({
        id: inputId,
        page: label.page,
        role: fillableRoleForRegion(label.text, label.boundingBox, inputBox),
        valueType: inferValueType(label.text),
        text: label.semanticLabel || label.text,
        boundingBox: inputBox,
        semanticValueRegion: inputBox,
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
    entry.semanticLabel = [header?.text, rowLabel?.text]
      .filter(Boolean)
      .join(" - ") || entry.text || "Table value";
    entry.valueType = inferValueType(entry.semanticLabel);
  }
  for (const entry of catalog.filter((candidate) => candidate.role === "column_header")) {
    entry.semanticLabel = entry.text ||
      `${entry.tableId || "Table"} column ${(entry.columnIndex ?? 0) + 1} header`;
  }

  const rawPages = Array.isArray(args.rawResult?.pages) ? args.rawResult.pages : [];
  for (const rawPage of rawPages) {
    const page = Math.max(1, Number(rawPage?.pageNumber || 1));
    const unit = pageGeometry.get(page)?.unit || rawPage?.unit;
    const marks = Array.isArray(rawPage?.selectionMarks) ? rawPage.selectionMarks : [];
    for (let index = 0; index < marks.length; index += 1) {
      const mark = marks[index];
      const box = toPixelBox(boundsFromPolygon(mark?.polygon || mark?.boundingPolygon), unit);
      const nearestLabel = catalog
        .filter((entry) => entry.page === page && entry.role !== "checkbox")
        .map((entry) => ({ entry, score: distance(entry.boundingBox, box) }))
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
    "table-cell",
    "value-region",
  ]);
  const pairedInputIds = new Set(labelInputPairs.map((pair) => pair.inputBlockId));
  const hasValidFillableGeometry = (entry: ExtractDocumentFieldCatalogEntry): boolean => {
    const box = entry.semanticValueRegion;
    return Boolean(box && hasValidFillableBox(entry, box));
  };
  const promotionCandidates = catalog.filter(
    (entry) => fillableRoles.has(entry.role) && hasValidFillableGeometry(entry),
  );
  const fillable: ExtractDocumentFieldCatalogEntry[] = [];
  for (const entry of [...promotionCandidates].sort((left, right) => {
    const pairPriority = Number(pairedInputIds.has(right.id)) - Number(pairedInputIds.has(left.id));
    if (pairPriority !== 0) return pairPriority;
    const leftSemantic = Number(preferredSemanticLabel(left.semanticLabel || left.text));
    const rightSemantic = Number(preferredSemanticLabel(right.semanticLabel || right.text));
    if (leftSemantic !== rightSemantic) return rightSemantic - leftSemantic;
    const leftArea = left.semanticValueRegion!.width * left.semanticValueRegion!.height;
    const rightArea = right.semanticValueRegion!.width * right.semanticValueRegion!.height;
    return leftArea - rightArea;
  })) {
    let box = entry.semanticValueRegion!;
    const blockers = fillable.filter((candidate) =>
      candidate.page === entry.page && intersectionArea(box, candidate.semanticValueRegion!) > 0
    );
    if (blockers.length > 0 && !pairedInputIds.has(entry.id)) continue;
    for (const other of blockers) {
      box = largestRemainder(box, other.semanticValueRegion!, entry.role);
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

  const pairedCatalogIds = new Set(labelInputPairs.flatMap((pair) => [pair.labelBlockId, pair.inputBlockId]));
  const suppressibleRoles = new Set<ExtractDocumentFieldCatalogRole>([
    "ocr-text",
    "label",
    "section-label",
    "header",
    "footer",
  ]);
  const retainedCatalog = catalog.filter((entry) => {
    const hasGeometry = hasValidFillableGeometry(entry);
    const paired = pairedCatalogIds.has(entry.id);
    if (entry.source === "di_table_cell" && !hasGeometry) return false;
    const overlapsRealField = fillable.some((candidate) =>
      candidate.page === entry.page && intersectionArea(entry.boundingBox, candidate.boundingBox) > 0
    );
    if (entry.source === "di_line" && suppressibleRoles.has(entry.role) && overlapsRealField) return false;
    if (!suppressibleRoles.has(entry.role) || hasGeometry || paired || entry.semanticValueRegion) return true;
    const shortUnpunctuatedNoise = entry.text.length < 40 &&
      !entry.text.includes(":") &&
      !/[?¿]/.test(entry.text) &&
      !isCheckboxMarker(entry.text) &&
      !isAdjacentToFillableRegion(entry, fillable);
    return !shortUnpunctuatedNoise;
  });
  const retainedIds = new Set(retainedCatalog.map((entry) => entry.id));
  const retainedLabelInputPairs = labelInputPairs.filter((pair) =>
    retainedIds.has(pair.labelBlockId) && retainedIds.has(pair.inputBlockId)
  );
  const retainedQuestionAnswerPairs = questionAnswerPairs.filter((pair) =>
    retainedIds.has(pair.questionFieldId) && retainedIds.has(pair.answerFieldId)
  );
  const blocks = retainedCatalog.map<ExtractedBlock>((entry) => ({
    id: entry.id,
    page: entry.page,
    type: entry.valueType === "checkbox" ? "checkbox" : entry.valueType === "signature" ? "signature" : "text",
    text: entry.text || entry.semanticLabel || "",
    boundingBox: fillableRoles.has(entry.role)
      ? entry.semanticValueRegion || entry.boundingBox
      : entry.boundingBox,
    confidence: entry.confidence,
  }));
  const fields = fillable.map(createField);
  return {
    blocks,
    fields,
    fieldCatalog: retainedCatalog,
    groupedStructures: {
      labelInputPairs: retainedLabelInputPairs,
      tables,
      questionAnswerPairs: retainedQuestionAnswerPairs,
      checkboxGroups: buildCheckboxGroups(retainedCatalog),
    },
    diagnostics: {
      blankRegionCount: retainedCatalog.filter((entry) => entry.source === "blank_detector").length,
      tableCellCount: retainedCatalog.filter((entry) => entry.source === "di_table_cell").length,
      semanticFieldCount: retainedCatalog.length,
      fillableFieldCount: fields.length,
    },
  };
}
