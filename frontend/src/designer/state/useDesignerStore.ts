import { create } from "zustand";
import type {
  CheckboxField,
  DateField,
  DropdownField,
  Field,
  FieldDraft,
  FieldMetadata,
  FieldMetadataSource,
  NumericField,
  RadioField,
  RectField,
  SemanticFieldType,
  SignatureField,
  TextField,
} from "../../../../shared/src/types";

const HISTORY_LIMIT = 150;
export type {
  CheckboxField,
  DateField,
  DropdownField,
  Field,
  FieldDraft,
  FieldMetadata,
  NumericField,
  RadioField,
  RectField,
  SignatureField,
  TextField,
};

export type ShapeGroup = {
  id: string;
  fieldIds: string[];
};

export type DesignerFieldSnapshot = Pick<
  Field,
  "id" | "type" | "x" | "y" | "width" | "height" | "pageIndex" | "metadata"
>;

export type DesignerSerializableState = {
  fields: Field[];
  groups: ShapeGroup[];
  pdfPages: string[];
  currentPdfPage: number;
  selectedIds: string[];
  selectedGroupId: string | null;
};

type DesignerSnapshot = {
  fields: Field[];
  groups: ShapeGroup[];
  selectedIds: string[];
  selectedGroupId: string | null;
  pdfPages: string[];
  currentPdfPage: number;
};

type UpdateOptions = {
  recordHistory?: boolean;
};

interface DesignerState {
  fields: Field[];
  groups: ShapeGroup[];
  draftCanvasFields: Field[];
  draftSelectedIds: string[];
  selectedIds: string[];
  selectedGroupId: string | null;
  pdfPages: string[];
  pdfPageImages: string[];
  currentPdfPage: number;
  showGrid: boolean;
  snapToGrid: boolean;
  fieldSearchQuery: string;
  canvasCursor: { x: number; y: number } | null;
  historyPast: DesignerSnapshot[];
  historyFuture: DesignerSnapshot[];
  historyPending: DesignerSnapshot | null;
  canUndo: boolean;
  canRedo: boolean;

  addField: (field: FieldDraft) => string;
  updateField: (
    id: string,
    patch: Partial<Field>,
    options?: UpdateOptions,
  ) => void;
  updateFields: (
    ids: string[],
    patch: Partial<Field>,
    options?: UpdateOptions,
  ) => void;
  moveFieldsBy: (
    ids: string[],
    dx: number,
    dy: number,
    options?: UpdateOptions,
  ) => void;
  moveFieldLayer: (id: string, direction: "forward" | "backward") => void;
  deleteField: (id: string) => void;
  deleteSelectedField: () => void;
  selectField: (id: string | null, additive?: boolean) => void;
  selectFields: (ids: string[]) => void;
  selectGroup: (groupId: string | null) => void;
  clearSelection: () => void;
  groupSelected: () => void;
  ungroupSelected: () => void;
  setPdfPages: (pages: string[]) => void;
  setCurrentPdfPage: (page: number) => void;
  setShowGrid: (show: boolean) => void;
  setSnapToGrid: (snap: boolean) => void;
  setFieldSearchQuery: (query: string) => void;
  setDraftCanvasFields: (fields: Field[]) => void;
  toggleDraftSelection: (id: string) => void;
  clearDraftSelection: () => void;
  clearDraftCanvasFields: () => void;
  rejectSelectedDraftCanvasFields: () => number;
  commitDraftCanvasFields: () => number;
  commitSelectedDraftCanvasFields: () => number;
  setCanvasCursor: (cursor: { x: number; y: number } | null) => void;
  beginHistoryAction: () => void;
  endHistoryAction: () => void;
  undo: () => void;
  redo: () => void;
  getSerializableState: () => DesignerSerializableState;
  loadSerializableState: (value: DesignerSerializableState) => void;
}

function cloneField(field: Field): Field {
  return { ...field };
}

function cloneGroup(group: ShapeGroup): ShapeGroup {
  return { id: group.id, fieldIds: [...group.fieldIds] };
}

function cloneSnapshot(snapshot: DesignerSnapshot): DesignerSnapshot {
  return {
    fields: snapshot.fields.map(cloneField),
    groups: snapshot.groups.map(cloneGroup),
    selectedIds: [...snapshot.selectedIds],
    selectedGroupId: snapshot.selectedGroupId,
    pdfPages: [...snapshot.pdfPages],
    currentPdfPage: snapshot.currentPdfPage,
  };
}

function snapshotFromState(state: DesignerState): DesignerSnapshot {
  return {
    fields: state.fields.map(cloneField),
    groups: state.groups.map(cloneGroup),
    selectedIds: [...state.selectedIds],
    selectedGroupId: state.selectedGroupId,
    pdfPages: [...state.pdfPages],
    currentPdfPage: state.currentPdfPage,
  };
}

function areSnapshotsEqual(a: DesignerSnapshot, b: DesignerSnapshot): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function pushHistory(
  state: DesignerState,
  before: DesignerSnapshot,
  after: DesignerSnapshot,
) {
  if (areSnapshotsEqual(before, after)) {
    return {
      historyPending: null,
    };
  }

  const past = [...state.historyPast, cloneSnapshot(before)].slice(
    -HISTORY_LIMIT,
  );

  return {
    historyPast: past,
    historyFuture: [],
    historyPending: null,
    canUndo: past.length > 0,
    canRedo: false,
  };
}

function toFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizePageIndex(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.floor(value));
}

function toMetadataFieldType(type: Field["type"]): SemanticFieldType {
  if (type === "rect") {
    return "text";
  }

  return type;
}

function normalizeMetadata(
  metadata: unknown,
  type: Field["type"],
): FieldMetadata {
  const parsed =
    metadata && typeof metadata === "object"
      ? (metadata as Partial<FieldMetadata>)
      : {};

  const confidenceScore = Math.min(
    1,
    Math.max(0, toFiniteNumber(parsed.confidenceScore, 0)),
  );

  const source: FieldMetadataSource =
    parsed.source === "ai" || parsed.source === "ocr"
      ? parsed.source
      : "manual";

  return {
    acordCode: typeof parsed.acordCode === "string" ? parsed.acordCode : "",
    acordLabel: typeof parsed.acordLabel === "string" ? parsed.acordLabel : "",
    acordDescription:
      typeof parsed.acordDescription === "string"
        ? parsed.acordDescription
        : "",
    fieldType: toMetadataFieldType(type),
    required: Boolean(parsed.required),
    confidenceScore,
    source,
    tooltip: typeof parsed.tooltip === "string" ? parsed.tooltip : "",
    locked: Boolean(parsed.locked),
    hidden: Boolean(parsed.hidden),
      extractionBlockId:
        typeof parsed.extractionBlockId === "string" && parsed.extractionBlockId
          ? parsed.extractionBlockId
          : undefined,
  };
}

function normalizeField(
  field: FieldDraft,
): Field {
  const id = crypto.randomUUID();
  const pageIndex = normalizePageIndex(
    (field as { pageIndex?: unknown }).pageIndex,
  );

  if (field.type === "rect") {
    return {
      id,
      type: "rect",
      pageIndex,
      x: toFiniteNumber(field.x, 100),
      y: toFiniteNumber(field.y, 100),
      width: Math.max(20, toFiniteNumber(field.width, 300)),
      height: Math.max(20, toFiniteNumber(field.height, 30)),
      rotation: toFiniteNumber(field.rotation, 0),
      opacity: Math.min(1, Math.max(0.05, toFiniteNumber(field.opacity, 1))),
      fill: field.fill || "#4a90e2",
      stroke: field.stroke || "#1e293b",
      strokeWidth: Math.max(0, toFiniteNumber(field.strokeWidth, 1)),
      cornerRadius: Math.max(0, toFiniteNumber(field.cornerRadius, 0)),
      metadata: normalizeMetadata(field.metadata, "rect"),
      groupId: null,
    };
  }

  if (field.type === "checkbox") {
    return {
      id,
      type: "checkbox",
      pageIndex,
      x: toFiniteNumber(field.x, 100),
      y: toFiniteNumber(field.y, 100),
      width: Math.max(24, toFiniteNumber(field.width, 180)),
      height: Math.max(24, toFiniteNumber(field.height, 28)),
      rotation: toFiniteNumber(field.rotation, 0),
      opacity: Math.min(1, Math.max(0.05, toFiniteNumber(field.opacity, 1))),
      stroke: field.stroke || "#1e293b",
      strokeWidth: Math.max(0, toFiniteNumber(field.strokeWidth, 1)),
      fill: field.fill || "#ffffff",
      checked: Boolean(field.checked),
      label: field.label || "Checkbox",
      metadata: normalizeMetadata(field.metadata, "checkbox"),
      groupId: null,
    };
  }

  if (field.type === "radio") {
    return {
      id,
      type: "radio",
      pageIndex,
      x: toFiniteNumber(field.x, 100),
      y: toFiniteNumber(field.y, 100),
      width: Math.max(24, toFiniteNumber(field.width, 180)),
      height: Math.max(24, toFiniteNumber(field.height, 28)),
      rotation: toFiniteNumber(field.rotation, 0),
      opacity: Math.min(1, Math.max(0.05, toFiniteNumber(field.opacity, 1))),
      stroke: field.stroke || "#1e293b",
      strokeWidth: Math.max(0, toFiniteNumber(field.strokeWidth, 1)),
      fill: field.fill || "#ffffff",
      checked: Boolean(field.checked),
      groupName: field.groupName || "radio-group",
      label: field.label || "Radio",
      metadata: normalizeMetadata(field.metadata, "radio"),
      groupId: null,
    };
  }

  if (field.type === "dropdown") {
    const options = Array.isArray(field.options)
      ? field.options.filter((opt) => typeof opt === "string" && opt.trim())
      : ["Option 1", "Option 2"];
    return {
      id,
      type: "dropdown",
      pageIndex,
      x: toFiniteNumber(field.x, 100),
      y: toFiniteNumber(field.y, 100),
      width: Math.max(120, toFiniteNumber(field.width, 240)),
      height: Math.max(28, toFiniteNumber(field.height, 34)),
      rotation: toFiniteNumber(field.rotation, 0),
      opacity: Math.min(1, Math.max(0.05, toFiniteNumber(field.opacity, 1))),
      stroke: field.stroke || "#1e293b",
      strokeWidth: Math.max(0, toFiniteNumber(field.strokeWidth, 1)),
      fill: field.fill || "#ffffff",
      options: options.length ? options : ["Option 1", "Option 2"],
      selectedOption: field.selectedOption || "",
      placeholder: field.placeholder || "Select option",
      openPreview: Boolean(field.openPreview),
      metadata: normalizeMetadata(field.metadata, "dropdown"),
      groupId: null,
    };
  }

  if (field.type === "date") {
    return {
      id,
      type: "date",
      pageIndex,
      x: toFiniteNumber(field.x, 100),
      y: toFiniteNumber(field.y, 100),
      width: Math.max(120, toFiniteNumber(field.width, 220)),
      height: Math.max(28, toFiniteNumber(field.height, 34)),
      rotation: toFiniteNumber(field.rotation, 0),
      opacity: Math.min(1, Math.max(0.05, toFiniteNumber(field.opacity, 1))),
      stroke: field.stroke || "#1e293b",
      strokeWidth: Math.max(0, toFiniteNumber(field.strokeWidth, 1)),
      fill: field.fill || "#ffffff",
      dateFormat: field.dateFormat || "MM/DD/YYYY",
      value: field.value || "",
      placeholder: field.placeholder || "Pick a date",
      metadata: normalizeMetadata(field.metadata, "date"),
      groupId: null,
    };
  }

  if (field.type === "numeric") {
    const min = toFiniteNumber(field.min, 0);
    const max = toFiniteNumber(field.max, 100);
    return {
      id,
      type: "numeric",
      pageIndex,
      x: toFiniteNumber(field.x, 100),
      y: toFiniteNumber(field.y, 100),
      width: Math.max(120, toFiniteNumber(field.width, 180)),
      height: Math.max(28, toFiniteNumber(field.height, 34)),
      rotation: toFiniteNumber(field.rotation, 0),
      opacity: Math.min(1, Math.max(0.05, toFiniteNumber(field.opacity, 1))),
      stroke: field.stroke || "#1e293b",
      strokeWidth: Math.max(0, toFiniteNumber(field.strokeWidth, 1)),
      fill: field.fill || "#ffffff",
      min,
      max: Math.max(min, max),
      step: Math.max(0.001, toFiniteNumber(field.step, 1)),
      value:
        typeof field.value === "number" && Number.isFinite(field.value)
          ? field.value
          : null,
      placeholder: field.placeholder || "0",
      metadata: normalizeMetadata(field.metadata, "numeric"),
      groupId: null,
    };
  }

  if (field.type === "signature") {
    return {
      id,
      type: "signature",
      pageIndex,
      x: toFiniteNumber(field.x, 100),
      y: toFiniteNumber(field.y, 100),
      width: Math.max(180, toFiniteNumber(field.width, 260)),
      height: Math.max(60, toFiniteNumber(field.height, 90)),
      rotation: toFiniteNumber(field.rotation, 0),
      opacity: Math.min(1, Math.max(0.05, toFiniteNumber(field.opacity, 1))),
      stroke: field.stroke || "#1e293b",
      strokeWidth: Math.max(0, toFiniteNumber(field.strokeWidth, 1)),
      fill: field.fill || "#ffffff",
      placeholder: field.placeholder || "Sign here",
      signed: Boolean(field.signed),
      showStrokePreview: Boolean(field.showStrokePreview),
      metadata: normalizeMetadata(field.metadata, "signature"),
      groupId: null,
    };
  }

  return {
    id,
    type: "text",
    pageIndex,
    x: toFiniteNumber(field.x, 100),
    y: toFiniteNumber(field.y, 100),
    width: Math.max(20, toFiniteNumber(field.width, 300)),
    height: Math.max(20, toFiniteNumber(field.height, 30)),
    rotation: toFiniteNumber(field.rotation, 0),
    opacity: Math.min(1, Math.max(0.05, toFiniteNumber(field.opacity, 1))),
    text: field.text || "New Text",
    fontSize: Math.max(8, toFiniteNumber(field.fontSize, 20)),
    fontFamily: field.fontFamily || "Geist Variable",
    textAlign: field.textAlign || "left",
    color: field.color || "#000000",
    fontStyle:
      field.fontStyle === "bold" || field.fontStyle === "italic" || field.fontStyle === "bold italic"
        ? field.fontStyle
        : "normal",
    underline: Boolean((field as Partial<TextField>).underline),
    lineHeight: toFiniteNumber((field as Partial<TextField>).lineHeight, 1.2),
    letterSpacing: toFiniteNumber((field as Partial<TextField>).letterSpacing, 0),
    stroke: field.stroke || "#1e293b",
    strokeWidth: Math.max(0, toFiniteNumber(field.strokeWidth, 0)),
    metadata: normalizeMetadata(field.metadata, "text"),
    groupId: null,
  };
}

function cleanupGroups(groups: ShapeGroup[], validFieldIds: Set<string>) {
  return groups
    .map((group) => ({
      ...group,
      fieldIds: group.fieldIds.filter((id) => validFieldIds.has(id)),
    }))
    .filter((group) => group.fieldIds.length > 1);
}

function sanitizeLoadedField(field: Field): Field {
  if (!field || typeof field !== "object") {
    return normalizeField({
      type: "rect",
      x: 100,
      y: 100,
      width: 300,
      height: 30,
      rotation: 0,
      opacity: 1,
      fill: "#4a90e2",
      stroke: "#1e293b",
      strokeWidth: 1,
      cornerRadius: 0,
      groupId: null,
    });
  }

  const pageIndex = normalizePageIndex(
    (field as { pageIndex?: unknown }).pageIndex,
  );

  if (field.type === "rect") {
    return {
      id: field.id || crypto.randomUUID(),
      type: "rect",
      pageIndex,
      x: toFiniteNumber(field.x, 100),
      y: toFiniteNumber(field.y, 100),
      width: Math.max(20, toFiniteNumber(field.width, 300)),
      height: Math.max(20, toFiniteNumber(field.height, 30)),
      rotation: toFiniteNumber(field.rotation, 0),
      opacity: Math.min(1, Math.max(0.05, toFiniteNumber(field.opacity, 1))),
      fill: field.fill || "#4a90e2",
      stroke: field.stroke || "#1e293b",
      strokeWidth: Math.max(0, toFiniteNumber(field.strokeWidth, 1)),
      cornerRadius: Math.max(0, toFiniteNumber(field.cornerRadius, 0)),
      metadata: normalizeMetadata(field.metadata, "rect"),
      groupId: field.groupId || null,
    };
  }

  if (field.type === "checkbox") {
    const normalized = normalizeField({
      type: "checkbox",
      x: toFiniteNumber(field.x, 100),
      y: toFiniteNumber(field.y, 100),
      width: toFiniteNumber(field.width, 180),
      height: toFiniteNumber(field.height, 28),
      rotation: toFiniteNumber(field.rotation, 0),
      opacity: toFiniteNumber(field.opacity, 1),
      stroke: field.stroke || "#1e293b",
      strokeWidth: toFiniteNumber(field.strokeWidth, 1),
      fill: field.fill || "#ffffff",
      checked: Boolean(field.checked),
      label: field.label || "Checkbox",
      metadata: normalizeMetadata(field.metadata, "checkbox"),
      groupId: field.groupId || null,
    });

    return {
      ...normalized,
      id: field.id || crypto.randomUUID(),
      pageIndex,
      groupId: field.groupId || null,
      metadata: normalizeMetadata(field.metadata, "checkbox"),
    };
  }

  if (field.type === "radio") {
    const normalized = normalizeField({
      type: "radio",
      x: toFiniteNumber(field.x, 100),
      y: toFiniteNumber(field.y, 100),
      width: toFiniteNumber(field.width, 180),
      height: toFiniteNumber(field.height, 28),
      rotation: toFiniteNumber(field.rotation, 0),
      opacity: toFiniteNumber(field.opacity, 1),
      stroke: field.stroke || "#1e293b",
      strokeWidth: toFiniteNumber(field.strokeWidth, 1),
      fill: field.fill || "#ffffff",
      checked: Boolean(field.checked),
      groupName: field.groupName || "radio-group",
      label: field.label || "Radio",
      metadata: normalizeMetadata(field.metadata, "radio"),
      groupId: field.groupId || null,
    });

    return {
      ...normalized,
      id: field.id || crypto.randomUUID(),
      pageIndex,
      groupId: field.groupId || null,
      metadata: normalizeMetadata(field.metadata, "radio"),
    };
  }

  if (field.type === "dropdown") {
    const normalized = normalizeField({
      type: "dropdown",
      x: toFiniteNumber(field.x, 100),
      y: toFiniteNumber(field.y, 100),
      width: toFiniteNumber(field.width, 240),
      height: toFiniteNumber(field.height, 34),
      rotation: toFiniteNumber(field.rotation, 0),
      opacity: toFiniteNumber(field.opacity, 1),
      stroke: field.stroke || "#1e293b",
      strokeWidth: toFiniteNumber(field.strokeWidth, 1),
      fill: field.fill || "#ffffff",
      options: Array.isArray(field.options) ? field.options : ["Option 1"],
      selectedOption: field.selectedOption || "",
      placeholder: field.placeholder || "Select option",
      openPreview: Boolean(field.openPreview),
      metadata: normalizeMetadata(field.metadata, "dropdown"),
      groupId: field.groupId || null,
    });

    return {
      ...normalized,
      id: field.id || crypto.randomUUID(),
      pageIndex,
      groupId: field.groupId || null,
      metadata: normalizeMetadata(field.metadata, "dropdown"),
    };
  }

  if (field.type === "date") {
    const normalized = normalizeField({
      type: "date",
      x: toFiniteNumber(field.x, 100),
      y: toFiniteNumber(field.y, 100),
      width: toFiniteNumber(field.width, 220),
      height: toFiniteNumber(field.height, 34),
      rotation: toFiniteNumber(field.rotation, 0),
      opacity: toFiniteNumber(field.opacity, 1),
      stroke: field.stroke || "#1e293b",
      strokeWidth: toFiniteNumber(field.strokeWidth, 1),
      fill: field.fill || "#ffffff",
      dateFormat: field.dateFormat || "MM/DD/YYYY",
      value: field.value || "",
      placeholder: field.placeholder || "Pick a date",
      metadata: normalizeMetadata(field.metadata, "date"),
      groupId: field.groupId || null,
    });

    return {
      ...normalized,
      id: field.id || crypto.randomUUID(),
      pageIndex,
      groupId: field.groupId || null,
      metadata: normalizeMetadata(field.metadata, "date"),
    };
  }

  if (field.type === "numeric") {
    const normalized = normalizeField({
      type: "numeric",
      x: toFiniteNumber(field.x, 100),
      y: toFiniteNumber(field.y, 100),
      width: toFiniteNumber(field.width, 180),
      height: toFiniteNumber(field.height, 34),
      rotation: toFiniteNumber(field.rotation, 0),
      opacity: toFiniteNumber(field.opacity, 1),
      stroke: field.stroke || "#1e293b",
      strokeWidth: toFiniteNumber(field.strokeWidth, 1),
      fill: field.fill || "#ffffff",
      min: toFiniteNumber(field.min, 0),
      max: toFiniteNumber(field.max, 100),
      step: toFiniteNumber(field.step, 1),
      value:
        typeof field.value === "number" && Number.isFinite(field.value)
          ? field.value
          : null,
      placeholder: field.placeholder || "0",
      metadata: normalizeMetadata(field.metadata, "numeric"),
      groupId: field.groupId || null,
    });

    return {
      ...normalized,
      id: field.id || crypto.randomUUID(),
      pageIndex,
      groupId: field.groupId || null,
      metadata: normalizeMetadata(field.metadata, "numeric"),
    };
  }

  if (field.type === "signature") {
    const normalized = normalizeField({
      type: "signature",
      x: toFiniteNumber(field.x, 100),
      y: toFiniteNumber(field.y, 100),
      width: toFiniteNumber(field.width, 260),
      height: toFiniteNumber(field.height, 90),
      rotation: toFiniteNumber(field.rotation, 0),
      opacity: toFiniteNumber(field.opacity, 1),
      stroke: field.stroke || "#1e293b",
      strokeWidth: toFiniteNumber(field.strokeWidth, 1),
      fill: field.fill || "#ffffff",
      placeholder: field.placeholder || "Sign here",
      signed: Boolean(field.signed),
      showStrokePreview: Boolean(field.showStrokePreview),
      metadata: normalizeMetadata(field.metadata, "signature"),
      groupId: field.groupId || null,
    });

    return {
      ...normalized,
      id: field.id || crypto.randomUUID(),
      pageIndex,
      groupId: field.groupId || null,
      metadata: normalizeMetadata(field.metadata, "signature"),
    };
  }

  return {
    id: field.id || crypto.randomUUID(),
    type: "text",
    pageIndex,
    x: toFiniteNumber(field.x, 100),
    y: toFiniteNumber(field.y, 100),
    width: Math.max(20, toFiniteNumber(field.width, 300)),
    height: Math.max(20, toFiniteNumber(field.height, 30)),
    rotation: toFiniteNumber(field.rotation, 0),
    opacity: Math.min(1, Math.max(0.05, toFiniteNumber(field.opacity, 1))),
    text: field.text || "New Text",
    fontSize: Math.max(8, toFiniteNumber(field.fontSize, 20)),
    fontFamily: field.fontFamily || "Geist Variable",
    textAlign: field.textAlign || "left",
    color: field.color || "#000000",
    stroke: field.stroke || "#1e293b",
    strokeWidth: Math.max(0, toFiniteNumber(field.strokeWidth, 0)),
    metadata: normalizeMetadata(field.metadata, "text"),
    groupId: field.groupId || null,
  };
}

function sanitizeSerializableState(value: DesignerSerializableState) {
  const fields = Array.isArray(value.fields)
    ? value.fields.map(sanitizeLoadedField)
    : [];
  const validFieldIds = new Set(fields.map((field) => field.id));

  const groups = cleanupGroups(
    Array.isArray(value.groups) ? value.groups : [],
    validFieldIds,
  );

  const selectedIds = Array.isArray(value.selectedIds)
    ? value.selectedIds.filter((id) => validFieldIds.has(id))
    : [];

  const selectedGroupId =
    value.selectedGroupId &&
    groups.some((group) => group.id === value.selectedGroupId)
      ? value.selectedGroupId
      : null;

  const pdfPages = Array.isArray(value.pdfPages) ? [...value.pdfPages] : [];
  const currentPdfPage =
    pdfPages.length > 0
      ? Math.min(
          pdfPages.length - 1,
          Math.max(0, Math.floor(toFiniteNumber(value.currentPdfPage, 0))),
        )
      : 0;

  return {
    fields,
    groups,
    selectedIds,
    selectedGroupId,
    pdfPages,
    currentPdfPage,
  };
}

export const useDesignerStore = create<DesignerState>((set, get) => ({
  fields: [],
  groups: [],
  selectedIds: [],
  selectedGroupId: null,
  pdfPages: [],
  pdfPageImages: [],
  currentPdfPage: 0,
  draftCanvasFields: [],
  draftSelectedIds: [],
  showGrid: true,
  snapToGrid: true,
  fieldSearchQuery: "",
  canvasCursor: null,
  historyPast: [],
  historyFuture: [],
  historyPending: null,
  canUndo: false,
  canRedo: false,

  addField: (field) => {
    const normalized = normalizeField(field);
    set((state) => {
      const before = snapshotFromState(state);
      const nextFields = [...state.fields, normalized];
      const after = cloneSnapshot({
        fields: nextFields,
        groups: state.groups,
        selectedIds: [normalized.id],
        selectedGroupId: null,
        pdfPages: state.pdfPages,
        currentPdfPage: state.currentPdfPage,
      });

      return {
        fields: nextFields,
        selectedIds: [normalized.id],
        selectedGroupId: null,
        ...pushHistory(state, before, after),
      };
    });

    return normalized.id;
  },

  updateField: (id, patch, options) =>
    set((state) => {
      let changed = false;
      const nextFields = state.fields.map((f) => {
        if (f.id !== id) {
          return f;
        }

        changed = true;
        return { ...f, ...patch } as Field;
      });

      if (!changed) {
        return state;
      }

      if (options?.recordHistory === false) {
        return { fields: nextFields };
      }

      const before = snapshotFromState(state);
      const after = cloneSnapshot({
        fields: nextFields,
        groups: state.groups,
        selectedIds: state.selectedIds,
        selectedGroupId: state.selectedGroupId,
        pdfPages: state.pdfPages,
        currentPdfPage: state.currentPdfPage,
      });

      return {
        fields: nextFields,
        ...pushHistory(state, before, after),
      };
    }),
  updateFields: (ids, patch, options) =>
    set((state) => {
      if (ids.length === 0) {
        return state;
      }

      const idSet = new Set(ids);
      let changed = false;
      const nextFields = state.fields.map((f) => {
        if (!idSet.has(f.id)) {
          return f;
        }

        changed = true;
        return { ...f, ...patch } as Field;
      });

      if (!changed) {
        return state;
      }

      if (options?.recordHistory === false) {
        return { fields: nextFields };
      }

      const before = snapshotFromState(state);
      const after = cloneSnapshot({
        fields: nextFields,
        groups: state.groups,
        selectedIds: state.selectedIds,
        selectedGroupId: state.selectedGroupId,
        pdfPages: state.pdfPages,
        currentPdfPage: state.currentPdfPage,
      });

      return {
        fields: nextFields,
        ...pushHistory(state, before, after),
      };
    }),

  moveFieldLayer: (id, direction) =>
    set((state) => {
      const index = state.fields.findIndex((field) => field.id === id);
      if (index === -1) {
        return state;
      }

      const targetIndex = direction === "forward" ? index + 1 : index - 1;
      if (targetIndex < 0 || targetIndex >= state.fields.length) {
        return state;
      }

      const nextFields = [...state.fields];
      const [moved] = nextFields.splice(index, 1);
      nextFields.splice(targetIndex, 0, moved);

      const before = snapshotFromState(state);
      const after = cloneSnapshot({
        fields: nextFields,
        groups: state.groups,
        selectedIds: state.selectedIds,
        selectedGroupId: state.selectedGroupId,
        pdfPages: state.pdfPages,
        currentPdfPage: state.currentPdfPage,
      });

      return {
        fields: nextFields,
        ...pushHistory(state, before, after),
      };
    }),

  moveFieldsBy: (ids, dx, dy, options) =>
    set((state) => {
      if (!Number.isFinite(dx) || !Number.isFinite(dy) || ids.length === 0) {
        return state;
      }

      const idSet = new Set(ids);
      let changed = false;
      const nextFields = state.fields.map((field) => {
        if (!idSet.has(field.id)) {
          return field;
        }

        changed = true;
        return {
          ...field,
          x: field.x + dx,
          y: field.y + dy,
        };
      });

      if (!changed) {
        return state;
      }

      if (options?.recordHistory === false) {
        return { fields: nextFields };
      }

      const before = snapshotFromState(state);
      const after = cloneSnapshot({
        fields: nextFields,
        groups: state.groups,
        selectedIds: state.selectedIds,
        selectedGroupId: state.selectedGroupId,
        pdfPages: state.pdfPages,
        currentPdfPage: state.currentPdfPage,
      });

      return {
        fields: nextFields,
        ...pushHistory(state, before, after),
      };
    }),

  deleteSelectedField: () =>
    set((state) => {
      if (state.selectedIds.length === 0) {
        return state;
      }

      const before = snapshotFromState(state);
      const selectedSet = new Set(state.selectedIds);
      const nextFields = state.fields.filter((field) => !selectedSet.has(field.id));
      const validFieldIds = new Set(nextFields.map((field) => field.id));
      const nextGroups = cleanupGroups(state.groups, validFieldIds);

      const after = cloneSnapshot({
        fields: nextFields,
        groups: nextGroups,
        selectedIds: [],
        selectedGroupId: null,
        pdfPages: state.pdfPages,
        currentPdfPage: state.currentPdfPage,
      });

      return {
        fields: nextFields,
        groups: nextGroups,
        selectedIds: [],
        selectedGroupId: null,
        ...pushHistory(state, before, after),
      };
    }),

  selectField: (id, additive = false) =>
    set((state) => {
      if (!id) {
        return {
          selectedIds: [],
          selectedGroupId: null,
        };
      }

      if (!additive) {
        return {
          selectedIds: [id],
          selectedGroupId: null,
        };
      }

      const hasId = state.selectedIds.includes(id);
      const nextSelectedIds = hasId
        ? state.selectedIds.filter((selectedId) => selectedId !== id)
        : [...state.selectedIds, id];

      return {
        selectedIds: nextSelectedIds,
        selectedGroupId: null,
      };
    }),

  selectFields: (ids) =>
    set(() => ({
      selectedIds: [...new Set(ids)],
      selectedGroupId: null,
    })),

  selectGroup: (groupId) =>
    set((state) => {
      if (!groupId) {
        return {
          selectedIds: [],
          selectedGroupId: null,
        };
      }

      const group = state.groups.find((g) => g.id === groupId);
      if (!group) {
        return state;
      }

      return {
        selectedIds: [...group.fieldIds],
        selectedGroupId: group.id,
      };
    }),

  clearSelection: () =>
    set({
      selectedIds: [],
      selectedGroupId: null,
    }),

  groupSelected: () =>
    set((state) => {
      const selectedSet = new Set(state.selectedIds);
      const selectedFields = state.fields.filter(
        (field) => selectedSet.has(field.id) && !field.groupId,
      );

      if (selectedFields.length < 2) {
        return state;
      }

      const before = snapshotFromState(state);
      const groupId = crypto.randomUUID();
      const groupedIds = selectedFields.map((field) => field.id);
      const groupedIdSet = new Set(groupedIds);

      const nextFields = state.fields.map((field) => {
        if (!groupedIdSet.has(field.id)) {
          return field;
        }

        return {
          ...field,
          groupId,
        };
      });

      const nextGroups = [
        ...state.groups,
        { id: groupId, fieldIds: groupedIds },
      ];

      const after = cloneSnapshot({
        fields: nextFields,
        groups: nextGroups,
        selectedIds: groupedIds,
        selectedGroupId: groupId,
        pdfPages: state.pdfPages,
        currentPdfPage: state.currentPdfPage,
      });

      return {
        fields: nextFields,
        groups: nextGroups,
        selectedIds: groupedIds,
        selectedGroupId: groupId,
        ...pushHistory(state, before, after),
      };
    }),

  ungroupSelected: () =>
    set((state) => {
      if (!state.selectedGroupId) {
        return state;
      }

      const group = state.groups.find(
        (candidate) => candidate.id === state.selectedGroupId,
      );
      if (!group) {
        return state;
      }

      const before = snapshotFromState(state);
      const childIdSet = new Set(group.fieldIds);
      const nextFields = state.fields.map((field) => {
        if (!childIdSet.has(field.id)) {
          return field;
        }

        return {
          ...field,
          groupId: null,
        };
      });

      const nextGroups = state.groups.filter(
        (candidate) => candidate.id !== group.id,
      );

      const after = cloneSnapshot({
        fields: nextFields,
        groups: nextGroups,
        selectedIds: [...group.fieldIds],
        selectedGroupId: null,
        pdfPages: state.pdfPages,
        currentPdfPage: state.currentPdfPage,
      });

      return {
        fields: nextFields,
        groups: nextGroups,
        selectedIds: [...group.fieldIds],
        selectedGroupId: null,
        ...pushHistory(state, before, after),
      };
    }),

  setPdfPages: (pages) =>
    set((state) => {
      const before = snapshotFromState(state);
      const after = cloneSnapshot({
        fields: state.fields,
        groups: state.groups,
        selectedIds: state.selectedIds,
        selectedGroupId: state.selectedGroupId,
        pdfPages: pages,
        currentPdfPage: 0,
      });

      return {
        pdfPages: [...pages],
        pdfPageImages: [...pages],
        currentPdfPage: 0,
        ...pushHistory(state, before, after),
      };
    }),

  setCurrentPdfPage: (page) =>
    set((state) => {
      if (!state.pdfPages.length) {
        return state;
      }

      const clamped = Math.min(
        state.pdfPages.length - 1,
        Math.max(0, Math.floor(page)),
      );

      if (clamped === state.currentPdfPage) {
        return state;
      }

      const before = snapshotFromState(state);
      const after = cloneSnapshot({
        fields: state.fields,
        groups: state.groups,
        selectedIds: state.selectedIds,
        selectedGroupId: state.selectedGroupId,
        pdfPages: state.pdfPages,
        currentPdfPage: clamped,
      });

      return {
        currentPdfPage: clamped,
        ...pushHistory(state, before, after),
      };
    }),

  setShowGrid: (show) => set({ showGrid: Boolean(show) }),

  setSnapToGrid: (snap) => set({ snapToGrid: Boolean(snap) }),

  setFieldSearchQuery: (query) => set({ fieldSearchQuery: String(query || "") }),

  setDraftCanvasFields: (fields) =>
    set({ draftCanvasFields: fields, draftSelectedIds: fields.map((f) => f.id) }),

  toggleDraftSelection: (id) =>
    set((state) => {
      const exists = state.draftSelectedIds.includes(id);
      return {
        draftSelectedIds: exists
          ? state.draftSelectedIds.filter((item) => item !== id)
          : [...state.draftSelectedIds, id],
      };
    }),

  clearDraftSelection: () => set({ draftSelectedIds: [] }),

  clearDraftCanvasFields: () => set({ draftCanvasFields: [], draftSelectedIds: [] }),

  rejectSelectedDraftCanvasFields: () => {
    const { draftCanvasFields, draftSelectedIds } = useDesignerStore.getState();
    if (draftSelectedIds.length === 0) return 0;
    const selected = new Set(draftSelectedIds);
    const beforeCount = draftCanvasFields.length;
    const kept = draftCanvasFields.filter((f) => !selected.has(f.id));
    useDesignerStore.setState({
      draftCanvasFields: kept,
      draftSelectedIds: kept.map((f) => f.id),
    });
    return beforeCount - kept.length;
  },

  commitDraftCanvasFields: () => {
    const drafts = useDesignerStore.getState().draftCanvasFields;
    if (drafts.length === 0) return 0;
    useDesignerStore.setState((state) => {
      const before = snapshotFromState(state);
      const nextFields = [...state.fields, ...drafts];
      const after = cloneSnapshot({
        fields: nextFields,
        groups: state.groups,
        selectedIds: drafts.length > 0 ? [drafts[0].id] : state.selectedIds,
        selectedGroupId: null,
        pdfPages: state.pdfPages,
        currentPdfPage: state.currentPdfPage,
      });
      return {
        fields: nextFields,
        draftCanvasFields: [],
        draftSelectedIds: [],
        selectedIds: drafts.length > 0 ? [drafts[0].id] : state.selectedIds,
        ...pushHistory(state, before, after),
      };
    });
    return drafts.length;
  },

  commitSelectedDraftCanvasFields: () => {
    const { draftCanvasFields, draftSelectedIds } = useDesignerStore.getState();
    if (draftCanvasFields.length === 0 || draftSelectedIds.length === 0) return 0;

    const selected = new Set(draftSelectedIds);
    const toCommit = draftCanvasFields.filter((f) => selected.has(f.id));
    const remainingDrafts = draftCanvasFields.filter((f) => !selected.has(f.id));
    if (toCommit.length === 0) return 0;

    useDesignerStore.setState((state) => {
      const before = snapshotFromState(state);
      const nextFields = [...state.fields, ...toCommit];
      const after = cloneSnapshot({
        fields: nextFields,
        groups: state.groups,
        selectedIds: [toCommit[0].id],
        selectedGroupId: null,
        pdfPages: state.pdfPages,
        currentPdfPage: state.currentPdfPage,
      });
      return {
        fields: nextFields,
        draftCanvasFields: remainingDrafts,
        draftSelectedIds: remainingDrafts.map((f) => f.id),
        selectedIds: [toCommit[0].id],
        ...pushHistory(state, before, after),
      };
    });
    return toCommit.length;
  },

  setCanvasCursor: (cursor) => set({ canvasCursor: cursor }),

  beginHistoryAction: () =>
    set((state) => {
      if (state.historyPending) {
        return state;
      }

      return {
        historyPending: snapshotFromState(state),
      };
    }),

  endHistoryAction: () =>
    set((state) => {
      if (!state.historyPending) {
        return state;
      }

      const before = state.historyPending;
      const after = snapshotFromState(state);

      return {
        ...pushHistory(state, before, after),
      };
    }),

  undo: () =>
    set((state) => {
      if (state.historyPast.length === 0) {
        return state;
      }

      const previous = state.historyPast[state.historyPast.length - 1];
      const current = snapshotFromState(state);
      const nextPast = state.historyPast.slice(0, -1);
      const nextFuture = [cloneSnapshot(current), ...state.historyFuture].slice(
        0,
        HISTORY_LIMIT,
      );
      const restored = cloneSnapshot(previous);

      return {
        ...restored,
        historyPast: nextPast,
        historyFuture: nextFuture,
        historyPending: null,
        canUndo: nextPast.length > 0,
        canRedo: nextFuture.length > 0,
      };
    }),

  redo: () =>
    set((state) => {
      if (state.historyFuture.length === 0) {
        return state;
      }

      const next = state.historyFuture[0];
      const current = snapshotFromState(state);
      const nextFuture = state.historyFuture.slice(1);
      const nextPast = [...state.historyPast, cloneSnapshot(current)].slice(
        -HISTORY_LIMIT,
      );
      const restored = cloneSnapshot(next);

      return {
        ...restored,
        historyPast: nextPast,
        historyFuture: nextFuture,
        historyPending: null,
        canUndo: nextPast.length > 0,
        canRedo: nextFuture.length > 0,
      };
    }),

  getSerializableState: (): DesignerSerializableState => {
    const state = get();
    return {
      fields: state.fields.map(cloneField),
      groups: state.groups.map(cloneGroup),
      pdfPages: [...state.pdfPages],
      currentPdfPage: state.currentPdfPage,
      selectedIds: [...state.selectedIds],
      selectedGroupId: state.selectedGroupId,
    };
  },

  loadSerializableState: (value) =>
    set(() => {
      const next = sanitizeSerializableState(value);
      return {
        fields: next.fields,
        groups: next.groups,
        selectedIds: next.selectedIds,
        selectedGroupId: next.selectedGroupId,
        pdfPages: next.pdfPages,
        pdfPageImages: next.pdfPages,
        currentPdfPage: next.currentPdfPage,
        historyPast: [],
        historyFuture: [],
        historyPending: null,
        canUndo: false,
        canRedo: false,
      };
    }),
}));
