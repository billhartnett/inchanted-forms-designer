import type { ExtractedBlock, Field, FieldMapping, PageExtraction } from "shared/types";

export type ExtractDocumentFieldCatalogRole =
  | "input"
  | "table_cell"
  | "row_label"
  | "column_header"
  | "question"
  | "question_answer_pair"
  | "checkbox_group_member";

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
  boundingBox: ExtractedBlock["boundingBox"];
  source: "di_line" | "di_word" | "di_table_cell" | "selection_mark" | "blank_detector" | "question_pairing";
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

export type ExtractDocumentGroupedStructures = {
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
};

export type ExtractDocumentDiagnostics = {
  blankRegionCount: number;
  tableCellCount: number;
  inferredInputCount: number;
  layoutLmEvaluatedPages: number;
  layoutLmFailures: number;
};

export type ExtractDocumentStructuralDelta = {
  addedBlocks: number;
  removedBlocks: number;
  changedBlocks: number;
  totalBlocks: number;
  checkboxDelta: number;
  signatureDelta: number;
  kvpDelta: number;
  deltaVersion: number;
  baselineDocumentId: string | null;
  extractedAt: string;
};

export type ExtractDocumentMultipartSummary = {
  totalPages: number;
  totalBlocks: number;
  totalMappings: number;
  selectionMarkCount: number;
  checkboxCount: number;
  signatureCount: number;
  kvpCount: number;
  averageConfidence: number;
  language: string;
};

export type ExtractDocumentMultipartSuccessResponse = {
  documentId: string;
  fileName: string;
  extractionMethod: "document-intelligence-wave8";
  extractedAt: string;
  pages: PageExtraction[];
  blocks: ExtractedBlock[];
  fields: Field[];
  fieldCatalog: ExtractDocumentFieldCatalogEntry[];
  groupedStructures: ExtractDocumentGroupedStructures;
  extractionDiagnostics: ExtractDocumentDiagnostics;
  selectionMarks: ExtractedBlock[];
  mappings: FieldMapping[];
  fieldTypes: Record<string, string>;
  pageDimensions: Array<{
    page: number;
    width: number;
    height: number;
    unit: "pixel";
  }>;
  structuralDelta: ExtractDocumentStructuralDelta;
  summary: ExtractDocumentMultipartSummary;
};

export type ExtractDocumentJsonBlocksSuccessResponse = {
  documentId: string;
  extractionMethod: "json-blocks-wave8";
  blocks: ExtractedBlock[];
  mappings: FieldMapping[];
  fieldTypes: Record<string, string>;
  structuralDelta: ExtractDocumentStructuralDelta;
  summary: {
    totalBlocks: number;
    totalMappings: number;
    checkboxCount: number;
  };
};

export type ExtractDocumentPlainTextSuccessResponse = {
  documentId: string;
  extractionMethod: "plain-text-wave8";
  blocks: ExtractedBlock[];
  mappings: FieldMapping[];
  fieldTypes: Record<string, string>;
  structuralDelta: ExtractDocumentStructuralDelta;
  summary: {
    totalBlocks: number;
    totalMappings: number;
  };
};

export type ExtractDocumentErrorResponse = {
  error: string;
  details?: string;
  requiredEnvVars?: string[];
};

export type ExtractDocumentResponseBody =
  | ExtractDocumentMultipartSuccessResponse
  | ExtractDocumentJsonBlocksSuccessResponse
  | ExtractDocumentPlainTextSuccessResponse
  | ExtractDocumentErrorResponse;
