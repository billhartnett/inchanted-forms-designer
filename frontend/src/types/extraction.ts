import type { Field } from "../../../shared/src/types";

export interface FieldCatalog {
  [fieldId: string]: {
    type: string;
    role?: string;
    source?: string;
    groupId?: string;
  };
}

export interface TableStructure {
  id: string;
  rowIds: string[];
  columnIds: string[];
}

export interface QuestionAnswerPair {
  id: string;
  questionId: string;
  answerId: string;
}

export interface CheckboxGroup {
  id: string;
  checkboxIds: string[];
}

export interface GroupedStructures {
  tables: TableStructure[];
  questionAnswerPairs: QuestionAnswerPair[];
  checkboxGroups: CheckboxGroup[];
}

export interface ExtractionDiagnostics {
  blankFieldCount: number;
  tableCount: number;
  qaPairCount: number;
  checkboxGroupCount: number;
}

export interface ExtractDocumentResponse {
  fields?: Field[];
  fieldCatalog?: FieldCatalog;
  groupedStructures?: GroupedStructures;
  extractionDiagnostics?: ExtractionDiagnostics;
  [key: string]: unknown;
}
