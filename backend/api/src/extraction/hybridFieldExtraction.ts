import type {
  ArtifactClassification,
  BoundingBox,
  ExtractedBlock,
  Field,
  SemanticFieldType,
} from "shared/types";
import { boundsFromPolygon } from "./bboxNormalization";
import { classifyBlockSemantic } from "./semanticLabelClassifier";

const CANVAS_DPI = 96;
const LAYOUTLM_INFER_URL = process.env.LAYOUTLM_INFER_URL || "http://localhost:8090/infer";

type HybridFieldRole =
  | "input"
  | "table_cell"
  | "row_label"
  | "column_header"
  | "question"
  | "question_answer_pair"
  | "checkbox_group_member";

type HybridValueType =
  | "text"
  | "numeric"
  | "currency"
  | "percentage"
  | "date"
  | "checkbox"
  | "dropdown"
  | "signature"
  | "label";

type HybridCatalogEntry = {
  id: string;
  page: number;
  role: HybridFieldRole;
  valueType: HybridValueType;
  text: string;
  boundingBox: BoundingBox;
  source:
    | "di_line"
    | "di_word"
    | "di_table_cell"
    | "selection_mark"
    | "blank_detector"
    | "question_pairing";
  groupId?: string;
  tableId?: string;
  rowIndex?: number;
  columnIndex?: number;
  pairedQuestionId?: string;
  pairedAnswerId?: string;
  semanticLabel?: string;
  categoryMode?: string;
  layoutLmLabel?: string;
};

type QuestionAnswerPair = {
  id: string;
  page: number;
  questionFieldId: string;
  answerFieldId: string;
};

type CheckboxGroup = {
  id: string;
  page: number;
  checkboxFieldIds: string[];
  labels: string[];
};

type TableSummary = {
  id: string;
  page: number;
  rowCount: number;
  columnCount: number;
  rowGroupIds: string[];
};

type HybridExtractionResult = {
  blocks: ExtractedBlock[];
  fields: Field[];
  fieldCatalog: HybridCatalogEntry[];
  questionAnswerPairs: QuestionAnswerPair[];
  checkboxGroups: CheckboxGroup[];
  tables: TableSummary[];
  diagnostics: {
    blankRegionCount: number;
    tableCellCount: number;
    inferredInputCount: number;
    layoutLmEvaluatedPages: number;
    layoutLmFailures: number;
  };
};

type LayoutLmLabelByPage = Record<number, string>;

type InternalToken = {
  id: string;
  page: number;
  text: string;
  bbox: BoundingBox;
  confidence: number;
  source: "line" | "word" | "selection_mark";
};

type BlankCandidate = {
  id: string;
  page: number;
  bbox: BoundingBox;
  textHint: string;
  source: "underscore" | "empty_table_cell" | "question_adjacent" | "empty_box" | "horizontal_separator";
  tableId?: string;
  rowIndex?: number;
  columnIndex?: number;
};

type TableCellRecord = {
  id: string;
  tableId: string;
  page: number;
  rowIndex: number;
  columnIndex: number;
  content: string;
  bbox: BoundingBox;
  kind: "header" | "row_label" | "value" | "blank";
};

type BuildHybridExtractionArgs = {
  pages: Array<{ pageNumber: number; width?: number; height?: number; unit?: string; lines: any[] }>;
  rawResult?: any;
};

function toFinite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toPixels(value: number, unit: string | undefined): number {
  return unit === "inch" ? value * CANVAS_DPI : value;
}

function toPixelsBox(bbox: BoundingBox, unit: string | undefined): BoundingBox {
  return {
    x: toPixels(bbox.x, unit),
    y: toPixels(bbox.y, unit),
    width: Math.max(1, toPixels(bbox.width, unit)),
    height: Math.max(1, toPixels(bbox.height, unit)),
  };
}

function normalizeText(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function makeId(prefix: string, page: number, index: number): string {
  return `${prefix}-p${page}-${index}`;
}

function overlaps(a: BoundingBox, b: BoundingBox): boolean {
  const ax2 = a.x + Math.max(1, a.width);
  const ay2 = a.y + Math.max(1, a.height);
  const bx2 = b.x + Math.max(1, b.width);
  const by2 = b.y + Math.max(1, b.height);
  return ax2 >= b.x && a.x <= bx2 && ay2 >= b.y && a.y <= by2;
}

function distanceX(a: BoundingBox, b: BoundingBox): number {
  const ac = a.x + a.width / 2;
  const bc = b.x + b.width / 2;
  return Math.abs(ac - bc);
}

function distanceY(a: BoundingBox, b: BoundingBox): number {
  const ac = a.y + a.height / 2;
  const bc = b.y + b.height / 2;
  return Math.abs(ac - bc);
}

function inferValueType(context: string): HybridValueType {
  const text = normalizeText(context);
  if (/\b(date|dob|birth|effective|expiration|expiry)\b/.test(text) || /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/.test(text)) {
    return "date";
  }
  if (/\%|\bpercentage\b|\brate\b/.test(text)) {
    return "percentage";
  }
  if (/\$|\bcost\b|\bpayroll\b|\breceipts\b|\bpremium\b|\bamount\b|\bdeductible\b/.test(text)) {
    return "currency";
  }
  if (/\b(number|numeric|count|years|employees|zip|postal|limit)\b/.test(text)) {
    return "numeric";
  }
  if (/\b(select one|choose|options?)\b/.test(text)) {
    return "dropdown";
  }
  return "text";
}

function toFieldType(valueType: HybridValueType): SemanticFieldType {
  if (valueType === "currency" || valueType === "percentage" || valueType === "numeric") {
    return "numeric";
  }
  if (valueType === "date") return "date";
  if (valueType === "dropdown") return "dropdown";
  if (valueType === "checkbox") return "checkbox";
  if (valueType === "signature") return "signature";
  return "text";
}

function createFieldFromCatalog(entry: HybridCatalogEntry): Field {
  const semantic = classifyBlockSemantic({
    id: entry.id,
    page: entry.page,
    type: "text",
    text: entry.text,
    boundingBox: entry.boundingBox,
    confidence: 0.85,
  });

  const artifactClassification: ArtifactClassification =
    entry.role === "input" || entry.role === "table_cell" || entry.role === "checkbox_group_member"
      ? "field_value"
      : "field_label";

  const metadataBase = {
    acordCode: "",
    acordLabel: "",
    acordDescription: "",
    fieldType: toFieldType(entry.valueType),
    required: false,
    confidenceScore: 0.85,
    source: "ocr" as const,
    extractionBlockId: entry.id,
    semanticLabel: entry.semanticLabel || semantic.semanticLabel,
    categoryMode: entry.categoryMode || semantic.categoryMode,
    artifactClassification,
    tooltip: `${entry.role}:${entry.valueType}`,
  };

  if (toFieldType(entry.valueType) === "numeric") {
    return {
      id: entry.id,
      type: "numeric",
      pageIndex: Math.max(0, entry.page - 1),
      x: entry.boundingBox.x,
      y: entry.boundingBox.y,
      width: entry.boundingBox.width,
      height: entry.boundingBox.height,
      rotation: 0,
      opacity: 1,
      stroke: "#1e293b",
      strokeWidth: 1,
      fill: "#ffffff",
      min: 0,
      max: 100000000,
      step: entry.valueType === "percentage" ? 0.01 : 1,
      value: null,
      placeholder: entry.valueType === "percentage" ? "0%" : entry.valueType === "currency" ? "$0" : "0",
      groupId: entry.groupId || null,
      metadata: metadataBase,
    };
  }

  if (toFieldType(entry.valueType) === "date") {
    return {
      id: entry.id,
      type: "date",
      pageIndex: Math.max(0, entry.page - 1),
      x: entry.boundingBox.x,
      y: entry.boundingBox.y,
      width: entry.boundingBox.width,
      height: entry.boundingBox.height,
      rotation: 0,
      opacity: 1,
      stroke: "#1e293b",
      strokeWidth: 1,
      fill: "#ffffff",
      dateFormat: "MM/DD/YYYY",
      value: "",
      placeholder: "Pick a date",
      groupId: entry.groupId || null,
      metadata: metadataBase,
    };
  }

  if (toFieldType(entry.valueType) === "dropdown") {
    return {
      id: entry.id,
      type: "dropdown",
      pageIndex: Math.max(0, entry.page - 1),
      x: entry.boundingBox.x,
      y: entry.boundingBox.y,
      width: entry.boundingBox.width,
      height: entry.boundingBox.height,
      rotation: 0,
      opacity: 1,
      stroke: "#1e293b",
      strokeWidth: 1,
      fill: "#ffffff",
      options: ["Option 1", "Option 2", "Option 3"],
      selectedOption: "",
      placeholder: "Select option",
      openPreview: false,
      groupId: entry.groupId || null,
      metadata: metadataBase,
    };
  }

  if (toFieldType(entry.valueType) === "checkbox") {
    return {
      id: entry.id,
      type: "checkbox",
      pageIndex: Math.max(0, entry.page - 1),
      x: entry.boundingBox.x,
      y: entry.boundingBox.y,
      width: entry.boundingBox.width,
      height: entry.boundingBox.height,
      rotation: 0,
      opacity: 1,
      stroke: "#1e293b",
      strokeWidth: 1,
      fill: "#ffffff",
      checked: /selected/i.test(entry.text),
      label: entry.text,
      groupId: entry.groupId || null,
      metadata: metadataBase,
    };
  }

  return {
    id: entry.id,
    type: "text",
    pageIndex: Math.max(0, entry.page - 1),
    x: entry.boundingBox.x,
    y: entry.boundingBox.y,
    width: entry.boundingBox.width,
    height: entry.boundingBox.height,
    rotation: 0,
    opacity: 1,
    text: entry.text,
    fontSize: 14,
    fontFamily: "Geist Variable",
    textAlign: "left",
    color: "#0f172a",
    stroke: "#1e293b",
    strokeWidth: 0,
    groupId: entry.groupId || null,
    metadata: metadataBase,
  };
}

function extractInternalTokens(
  pages: BuildHybridExtractionArgs["pages"],
  rawResult: any,
): { tokens: InternalToken[]; blocks: ExtractedBlock[]; pageSizeByPage: Map<number, { width: number; height: number }> } {
  const tokens: InternalToken[] = [];
  const blocks: ExtractedBlock[] = [];
  const pageSizeByPage = new Map<number, { width: number; height: number }>();

  for (const page of pages || []) {
    const pageNumber = Math.max(1, Number(page.pageNumber || 1));
    const unit = typeof page.unit === "string" ? page.unit : undefined;
    const width = toPixels(toFinite(page.width, 816), unit);
    const height = toPixels(toFinite(page.height, 1056), unit);
    pageSizeByPage.set(pageNumber, { width, height });

    const lines = Array.isArray(page.lines) ? page.lines : [];
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const text = String(line?.content || "");
      const rawBbox = line?.boundingBox || { x: 0, y: i * 20 + 20, width: 100, height: 20 };
      const bbox = toPixelsBox(rawBbox, unit);
      const id = makeId("line", pageNumber, i + 1);
      const confidence = toFinite(line?.confidence, 0.85);
      tokens.push({ id, page: pageNumber, text, bbox, confidence, source: "line" });
      blocks.push({ id, page: pageNumber, type: /selection_mark_/i.test(text) ? "checkbox" : "text", text, boundingBox: bbox, confidence });
    }
  }

  const rawPages = Array.isArray(rawResult?.pages) ? rawResult.pages : [];
  for (const rawPage of rawPages) {
    const pageNumber = Math.max(1, Number(rawPage?.pageNumber || 1));
    const unit = typeof rawPage?.unit === "string" ? rawPage.unit : undefined;
    const words = Array.isArray(rawPage?.words) ? rawPage.words : [];
    for (let i = 0; i < words.length; i += 1) {
      const word = words[i];
      const text = String(word?.content || "");
      if (!text) continue;
      const bbox = toPixelsBox(boundsFromPolygon(word?.polygon || word?.boundingPolygon), unit);
      const id = makeId("word", pageNumber, i + 1);
      const confidence = toFinite(word?.confidence, 0.82);
      tokens.push({ id, page: pageNumber, text, bbox, confidence, source: "word" });
      blocks.push({ id, page: pageNumber, type: "text", text, boundingBox: bbox, confidence });
    }

    const selectionMarks = Array.isArray(rawPage?.selectionMarks) ? rawPage.selectionMarks : [];
    for (let i = 0; i < selectionMarks.length; i += 1) {
      const mark = selectionMarks[i];
      const state = String(mark?.state || "unselected").toLowerCase();
      const text = `selection_mark_${state}_${i + 1}`;
      const bbox = toPixelsBox(boundsFromPolygon(mark?.polygon || mark?.boundingPolygon), unit);
      const id = makeId("mark", pageNumber, i + 1);
      const confidence = toFinite(mark?.confidence, 0.9);
      tokens.push({ id, page: pageNumber, text, bbox, confidence, source: "selection_mark" });
      blocks.push({ id, page: pageNumber, type: "checkbox", text, boundingBox: bbox, confidence });
    }
  }

  return { tokens, blocks, pageSizeByPage };
}

function extractTableCells(rawResult: any): { cells: TableCellRecord[]; blankCandidates: BlankCandidate[]; tables: TableSummary[] } {
  const rawTables = Array.isArray(rawResult?.tables) ? rawResult.tables : [];
  const cells: TableCellRecord[] = [];
  const blankCandidates: BlankCandidate[] = [];
  const tables: TableSummary[] = [];

  for (let tableIndex = 0; tableIndex < rawTables.length; tableIndex += 1) {
    const table = rawTables[tableIndex];
    const tableId = `table-${tableIndex + 1}`;
    const rowCount = Math.max(0, Number(table?.rowCount || 0));
    const columnCount = Math.max(0, Number(table?.columnCount || 0));
    const rowGroups: string[] = [];

    const rawCells = Array.isArray(table?.cells) ? table.cells : [];
    for (let cellIndex = 0; cellIndex < rawCells.length; cellIndex += 1) {
      const cell = rawCells[cellIndex];
      const page = Math.max(1, Number(cell?.boundingRegions?.[0]?.pageNumber || table?.boundingRegions?.[0]?.pageNumber || 1));
      const polygon =
        cell?.boundingRegions?.[0]?.polygon ||
        table?.boundingRegions?.[0]?.polygon ||
        [];
      const bbox = boundsFromPolygon(polygon);
      const content = String(cell?.content || "").trim();
      const rowIndex = Math.max(0, Number(cell?.rowIndex || 0));
      const columnIndex = Math.max(0, Number(cell?.columnIndex || 0));

      const isHeader = rowIndex === 0;
      const isBlank = content.length === 0;
      const kind: TableCellRecord["kind"] = isHeader
        ? "header"
        : columnIndex === 0 && !isBlank
        ? "row_label"
        : isBlank
        ? "blank"
        : "value";

      const id = `${tableId}-r${rowIndex + 1}-c${columnIndex + 1}`;
      cells.push({
        id,
        tableId,
        page,
        rowIndex,
        columnIndex,
        content,
        bbox,
        kind,
      });

      if (isBlank) {
        blankCandidates.push({
          id: `${id}-blank`,
          page,
          bbox,
          textHint: "",
          source: "empty_table_cell",
          tableId,
          rowIndex,
          columnIndex,
        });
      }

      if (rowIndex > 0 && !rowGroups.includes(`${tableId}-row-${rowIndex + 1}`)) {
        rowGroups.push(`${tableId}-row-${rowIndex + 1}`);
      }
    }

    tables.push({
      id: tableId,
      page: Math.max(1, Number(table?.boundingRegions?.[0]?.pageNumber || 1)),
      rowCount,
      columnCount,
      rowGroupIds: rowGroups,
    });
  }

  return { cells, blankCandidates, tables };
}

function detectBlankCandidatesFromTokens(tokens: InternalToken[]): BlankCandidate[] {
  const candidates: BlankCandidate[] = [];
  let candidateIndex = 0;

  for (const token of tokens) {
    const text = String(token.text || "");
    if (!text.trim()) continue;

    const underscoreMatch = text.match(/[_]{3,}|[-]{4,}|[.]{5,}/);
    if (underscoreMatch) {
      const start = Math.max(0, text.indexOf(underscoreMatch[0]));
      const ratioStart = text.length > 0 ? start / text.length : 0;
      const ratioWidth = text.length > 0 ? underscoreMatch[0].length / text.length : 1;
      candidates.push({
        id: `blank-underscore-${++candidateIndex}`,
        page: token.page,
        bbox: {
          x: token.bbox.x + token.bbox.width * ratioStart,
          y: token.bbox.y,
          width: Math.max(24, token.bbox.width * ratioWidth),
          height: token.bbox.height,
        },
        textHint: text,
        source: "underscore",
      });
      continue;
    }

    if (/^\s*[_\-.\s]{4,}\s*$/.test(text)) {
      candidates.push({
        id: `blank-line-${++candidateIndex}`,
        page: token.page,
        bbox: token.bbox,
        textHint: text,
        source: "horizontal_separator",
      });
    }
  }

  return candidates;
}

function collectContextText(tokens: InternalToken[], page: number, bbox: BoundingBox): string {
  const neighbors = tokens
    .filter((token) => token.page === page)
    .map((token) => ({
      token,
      score: distanceY(token.bbox, bbox) * 0.8 + distanceX(token.bbox, bbox) * 0.2,
    }))
    .sort((left, right) => left.score - right.score)
    .slice(0, 8)
    .map((entry) => entry.token.text)
    .join(" ");

  return neighbors;
}

function detectQuestionTokens(tokens: InternalToken[]): InternalToken[] {
  return tokens.filter((token) => {
    const text = normalizeText(token.text);
    return /\?$/.test(text) || /^(do you|have you|are you|were there|if yes|please explain|describe)/.test(text);
  });
}

function pairQuestionsToInputs(
  questions: InternalToken[],
  catalog: HybridCatalogEntry[],
): QuestionAnswerPair[] {
  const pairs: QuestionAnswerPair[] = [];
  let index = 0;

  const inputs = catalog.filter((entry) => entry.role === "input" || entry.role === "table_cell");
  for (const question of questions) {
    const nearest = inputs
      .filter((entry) => entry.page === question.page)
      .map((entry) => ({
        entry,
        score:
          distanceY(question.bbox, entry.boundingBox) * 0.8 +
          distanceX(question.bbox, entry.boundingBox) * 0.2,
      }))
      .sort((left, right) => left.score - right.score)[0];

    if (!nearest) continue;

    pairs.push({
      id: `qa-pair-${++index}`,
      page: question.page,
      questionFieldId: question.id,
      answerFieldId: nearest.entry.id,
    });
  }

  return pairs;
}

function buildCheckboxGroups(catalog: HybridCatalogEntry[]): CheckboxGroup[] {
  const checkboxEntries = catalog.filter((entry) => entry.valueType === "checkbox");
  const groups: CheckboxGroup[] = [];
  let groupIndex = 0;

  const pageBuckets = new Map<number, HybridCatalogEntry[]>();
  for (const checkbox of checkboxEntries) {
    const list = pageBuckets.get(checkbox.page) || [];
    list.push(checkbox);
    pageBuckets.set(checkbox.page, list);
  }

  for (const [page, entries] of pageBuckets.entries()) {
    const sorted = [...entries].sort((a, b) => a.boundingBox.y - b.boundingBox.y || a.boundingBox.x - b.boundingBox.x);
    let current: HybridCatalogEntry[] = [];

    for (const entry of sorted) {
      if (current.length === 0) {
        current.push(entry);
        continue;
      }

      const last = current[current.length - 1];
      if (Math.abs(last.boundingBox.y - entry.boundingBox.y) <= 18) {
        current.push(entry);
      } else {
        groups.push({
          id: `checkbox-group-${++groupIndex}`,
          page,
          checkboxFieldIds: current.map((item) => item.id),
          labels: current.map((item) => item.text),
        });
        current = [entry];
      }
    }

    if (current.length > 0) {
      groups.push({
        id: `checkbox-group-${++groupIndex}`,
        page,
        checkboxFieldIds: current.map((item) => item.id),
        labels: current.map((item) => item.text),
      });
    }
  }

  return groups;
}

async function classifyPageWithLayoutLm(
  page: number,
  tokens: InternalToken[],
): Promise<string | undefined> {
  const ocrTokens = tokens
    .filter((token) => token.page === page)
    .slice(0, 192)
    .map((token) => token.text.trim())
    .filter((text) => text.length > 0);

  if (ocrTokens.length === 0) {
    return undefined;
  }

  const boxes = tokens
    .filter((token) => token.page === page)
    .slice(0, 192)
    .map((token) => [
      Math.round(token.bbox.x),
      Math.round(token.bbox.y),
      Math.round(token.bbox.x + token.bbox.width),
      Math.round(token.bbox.y + token.bbox.height),
    ]);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch(LAYOUTLM_INFER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        image_base64: "",
        ocr_tokens: ocrTokens,
        ocr_boxes: boxes,
        top_n: 1,
      }),
    });

    if (!response.ok) {
      return undefined;
    }

    const payload = (await response.json()) as any;
    const top = payload?.top_n_predictions?.[0]?.eLabelName;
    return typeof top === "string" && top.trim().length > 0 ? top.trim() : undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

export async function buildHybridFieldExtraction(
  args: BuildHybridExtractionArgs,
): Promise<HybridExtractionResult> {
  const { tokens, blocks, pageSizeByPage } = extractInternalTokens(args.pages, args.rawResult);
  const tableExtraction = extractTableCells(args.rawResult);
  const blankFromTokens = detectBlankCandidatesFromTokens(tokens);

  const allBlankCandidates: BlankCandidate[] = [
    ...tableExtraction.blankCandidates,
    ...blankFromTokens,
  ];

  const catalog: HybridCatalogEntry[] = [];

  for (const cell of tableExtraction.cells) {
    const pageSize = pageSizeByPage.get(cell.page) || { width: 816, height: 1056 };
    const isRowLabel =
      cell.kind === "row_label" && cell.bbox.x <= pageSize.width * 0.25;

    const role: HybridFieldRole =
      cell.kind === "header"
        ? "column_header"
        : isRowLabel
        ? "row_label"
        : "table_cell";

    const context = [
      cell.content,
      tableExtraction.cells
        .filter((other) =>
          other.tableId === cell.tableId &&
          other.rowIndex === 0 &&
          other.columnIndex === cell.columnIndex,
        )
        .map((other) => other.content)
        .join(" "),
    ].join(" ");

    const inferredType =
      role === "row_label" || role === "column_header"
        ? "label"
        : inferValueType(context);

    catalog.push({
      id: cell.id,
      page: cell.page,
      role,
      valueType: inferredType,
      text: cell.content,
      boundingBox: cell.bbox,
      source: "di_table_cell",
      groupId: cell.rowIndex > 0 ? `${cell.tableId}-row-${cell.rowIndex + 1}` : undefined,
      tableId: cell.tableId,
      rowIndex: cell.rowIndex,
      columnIndex: cell.columnIndex,
    });
  }

  for (let i = 0; i < allBlankCandidates.length; i += 1) {
    const blank = allBlankCandidates[i];
    const contextText = collectContextText(tokens, blank.page, blank.bbox);
    const inferredType = inferValueType(`${blank.textHint} ${contextText}`);

    const headerContext = blank.tableId
      ? tableExtraction.cells
          .filter(
            (cell) =>
              cell.tableId === blank.tableId &&
              cell.rowIndex === 0 &&
              cell.columnIndex === blank.columnIndex,
          )
          .map((cell) => cell.content)
          .join(" ")
      : "";

    const finalType = inferValueType(`${contextText} ${headerContext}`) || inferredType;

    catalog.push({
      id: `blank-field-${blank.page}-${i + 1}`,
      page: blank.page,
      role: blank.tableId ? "table_cell" : "input",
      valueType: finalType,
      text: "",
      boundingBox: blank.bbox,
      source: "blank_detector",
      groupId:
        typeof blank.rowIndex === "number" && blank.tableId
          ? `${blank.tableId}-row-${blank.rowIndex + 1}`
          : undefined,
      tableId: blank.tableId,
      rowIndex: blank.rowIndex,
      columnIndex: blank.columnIndex,
    });
  }

  const questionTokens = detectQuestionTokens(tokens);
  for (const question of questionTokens) {
    catalog.push({
      id: question.id,
      page: question.page,
      role: "question",
      valueType: "label",
      text: question.text,
      boundingBox: question.bbox,
      source: "question_pairing",
    });
  }

  const markTokens = tokens.filter((token) => token.source === "selection_mark");
  for (let i = 0; i < markTokens.length; i += 1) {
    const mark = markTokens[i];
    const nearbyLabels = tokens
      .filter((token) => token.page === mark.page && token.source !== "selection_mark")
      .map((token) => ({
        token,
        score: distanceY(token.bbox, mark.bbox) * 0.7 + distanceX(token.bbox, mark.bbox) * 0.3,
      }))
      .sort((left, right) => left.score - right.score)
      .slice(0, 2)
      .map((entry) => entry.token.text)
      .join(" ")
      .trim();

    catalog.push({
      id: `checkbox-field-${mark.page}-${i + 1}`,
      page: mark.page,
      role: "checkbox_group_member",
      valueType: "checkbox",
      text: nearbyLabels || mark.text,
      boundingBox: mark.bbox,
      source: "selection_mark",
    });
  }

  const dedupedCatalog: HybridCatalogEntry[] = [];
  const seen = new Set<string>();
  for (const entry of catalog) {
    const key = [
      entry.page,
      entry.role,
      entry.valueType,
      Math.round(entry.boundingBox.x),
      Math.round(entry.boundingBox.y),
      Math.round(entry.boundingBox.width),
      Math.round(entry.boundingBox.height),
      normalizeText(entry.text),
    ].join(":");
    if (seen.has(key)) continue;
    seen.add(key);
    dedupedCatalog.push(entry);
  }

  const layoutLmLabelByPage: LayoutLmLabelByPage = {};
  let layoutLmEvaluatedPages = 0;
  let layoutLmFailures = 0;
  const pages = Array.from(new Set(dedupedCatalog.map((entry) => entry.page))).sort((a, b) => a - b);
  for (const page of pages) {
    try {
      const label = await classifyPageWithLayoutLm(page, tokens);
      if (label) {
        layoutLmLabelByPage[page] = label;
      }
      layoutLmEvaluatedPages += 1;
    } catch {
      layoutLmFailures += 1;
    }
  }

  for (const entry of dedupedCatalog) {
    if (layoutLmLabelByPage[entry.page]) {
      entry.layoutLmLabel = layoutLmLabelByPage[entry.page];
    }
  }

  const questionAnswerPairs = pairQuestionsToInputs(questionTokens, dedupedCatalog);
  for (const pair of questionAnswerPairs) {
    const question = dedupedCatalog.find((item) => item.id === pair.questionFieldId);
    const answer = dedupedCatalog.find((item) => item.id === pair.answerFieldId);
    if (question) {
      question.pairedAnswerId = pair.answerFieldId;
    }
    if (answer) {
      answer.pairedQuestionId = pair.questionFieldId;
      answer.role = "question_answer_pair";
    }
  }

  const checkboxGroups = buildCheckboxGroups(dedupedCatalog);
  const fields = dedupedCatalog.map((entry) => createFieldFromCatalog(entry));

  return {
    blocks,
    fields,
    fieldCatalog: dedupedCatalog,
    questionAnswerPairs,
    checkboxGroups,
    tables: tableExtraction.tables,
    diagnostics: {
      blankRegionCount: allBlankCandidates.length,
      tableCellCount: tableExtraction.cells.length,
      inferredInputCount: dedupedCatalog.filter((entry) => entry.role === "input" || entry.role === "table_cell").length,
      layoutLmEvaluatedPages,
      layoutLmFailures,
    },
  };
}
