import type { BoundingBox, ExtractedBlock, Field, FieldMapping, PageExtraction } from "shared/types";

export type ExtractDocumentFieldCatalogRole =
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
  | "section-label"
  | "ocr-text"
  | "header"
  | "title"
  | "footer"
  | "description";

export type ExtractDocumentFieldCatalogValueType =
  | "text"
  | "numeric"
  | "currency"
  | "percentage"
  | "date"
  | "checkbox"
  | "dropdown"
  | "signature"
  | "label";

export type ExtractDocumentFieldCatalogEntry = {
  id: string;
  page: number;
  role: ExtractDocumentFieldCatalogRole;
  valueType: ExtractDocumentFieldCatalogValueType;
  text: string;
  boundingBox: BoundingBox;
  semanticValueRegion?: BoundingBox;
  source: "di_line" | "di_table_cell" | "selection_mark" | "blank_detector" | "pdf_widget";
  confidence: number;
  groupId?: string;
  semanticGroupIds?: string[];
  tableId?: string;
  rowIndex?: number;
  columnIndex?: number;
  pairedQuestionId?: string;
  pairedAnswerId?: string;
  semanticLabel?: string;
  labelBoundingBox?: BoundingBox;
  categoryMode?: string;
};

export type ExtractDocumentGroupedStructures = {
  labelInputPairs: Array<{
    id: string;
    page: number;
    labelBlockId: string;
    inputBlockId: string;
  }>;
  tables: Array<{
    id: string;
    page: number;
    rowCount: number;
    columnCount: number;
    rowGroupIds: string[];
  }>;
  questionAnswerPairs: Array<{
    id: string;
    page: number;
    questionFieldId: string;
    answerFieldId: string;
  }>;
  checkboxGroups: Array<{
    id: string;
    page: number;
    checkboxFieldIds: string[];
    labels: string[];
  }>;
  semanticGroups: Array<{
    id: string;
    page: number;
    kind: "table-row" | "choice-set" | "yes-no" | "address-block" | "semantic";
    fieldIds: string[];
    label?: string;
  }>;
};

export type ExtractDocumentDiagnostics = {
  blankRegionCount: number;
  tableCellCount: number;
  semanticFieldCount: number;
  fillableFieldCount: number;
  currencyBlankCount: number;
  percentageBlankCount: number;
  numericBlankCount: number;
  suppressedSectionHeaderCount: number;
  suppressedDiTextOnlyBlockCount: number;
  suppressedOcrNoiseBlockCount: number;
  overlappingGeometryConflictCount: number;
  validLabelInputPairCount: number;
  propagatedELabelCandidateCount: number;
};

export type ExtractDocumentBboxNormalization = {
  coordinateSpace: "pixel";
  origin: "top-left";
  dpi: number;
  pageDimensions: Array<{ page: number; width: number; height: number }>;
};

export type ExtractDocumentMultipartSuccessResponse = {
  documentId: string;
  fileName: string;
  extractionMethod: "wave9-hybrid";
  extractedAt: string;
  pages: PageExtraction[];
  blocks: ExtractedBlock[];
  fields: Field[];
  fieldCatalog: ExtractDocumentFieldCatalogEntry[];
  groupedStructures: ExtractDocumentGroupedStructures;
  extractionDiagnostics: ExtractDocumentDiagnostics;
  bboxNormalization: ExtractDocumentBboxNormalization;
  selectionMarks: ExtractedBlock[];
  mappings: FieldMapping[];
  fieldTypes: Record<string, string>;
  pageDimensions: Array<{ page: number; width: number; height: number; unit: "pixel" }>;
  structuralDelta: Record<string, unknown>;
  summary: Record<string, unknown>;
};
