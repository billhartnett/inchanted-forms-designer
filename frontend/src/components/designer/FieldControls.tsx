import { Rect, Text } from "react-konva";
import type { Field, ShapeGroup } from "../../designer/state/useDesignerStore";

const FIELD_SELECTION_OUTLINE = "#0ea5e9";

export type FieldControlsProps = {
  field: Field;
  /** Override absolute X position (useful for group-relative coordinates). */
  x?: number;
  /** Override absolute Y position. */
  y?: number;
};

/**
 * Konva overlay for the selected field: dashed selection outline +
 * required/optional indicator chip. Render inside a non-interactive Layer.
 */
export function FieldControls({ field, x, y }: FieldControlsProps) {
  const resolvedX = x ?? field.x;
  const resolvedY = y ?? field.y;
  const required = Boolean(field.metadata?.required);
  return (
    <>
      <Rect
        listening={false}
        x={resolvedX}
        y={resolvedY}
        width={field.width}
        height={field.height}
        stroke={FIELD_SELECTION_OUTLINE}
        strokeWidth={2}
        dash={[6, 4]}
      />
      <Text
        listening={false}
        x={resolvedX}
        y={Math.max(0, resolvedY - 18)}
        text={required ? "Required" : "Optional"}
        fontSize={11}
        fontFamily="Geist Variable"
        fill={required ? "#b91c1c" : "#475569"}
      />
    </>
  );
}

type Pointer = { x: number; y: number } | null;

type UpdateField = (
  id: string,
  updates: Partial<Field>,
  options?: { recordHistory?: boolean },
) => void;

type SelectField = (id: string, additive?: boolean) => void;
type SelectGroup = (id: string | null) => void;

export type Bounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type Point = {
  x: number;
  y: number;
};

export type GetPageCenterArgs = {
  pageSize: { width: number; height: number } | null;
  fallbackWidth: number;
  fallbackHeight: number;
};

export function getPageCenter({
  pageSize,
  fallbackWidth,
  fallbackHeight,
}: GetPageCenterArgs): Point {
  if (pageSize) {
    return {
      x: pageSize.width / 2,
      y: pageSize.height / 2,
    };
  }

  return {
    x: fallbackWidth / 2,
    y: fallbackHeight / 2,
  };
}

export type BuildGridLinesArgs = {
  width: number;
  height: number;
  gridSize: number;
};

export function buildGridLines({
  width,
  height,
  gridSize,
}: BuildGridLinesArgs): Array<{ points: number[] }> {
  const lines: Array<{ points: number[] }> = [];

  for (let x = 0; x < width; x += gridSize) {
    lines.push({ points: [x, 0, x, height] });
  }
  for (let y = 0; y < height; y += gridSize) {
    lines.push({ points: [0, y, width, y] });
  }

  return lines;
}

export function getSelectedPdfPageSrc(
  pdfPages: string[],
  currentPdfPage: number,
): string | null {
  if (pdfPages.length === 0) {
    return null;
  }

  return pdfPages[Math.min(currentPdfPage, pdfPages.length - 1)] ?? null;
}

export type HandlePdfSizeLoadedArgs = {
  size: { width: number; height: number };
  pageSizeRef: { current: { width: number; height: number } | null };
  onSelectedPdfSizeChange?: (size: { width: number; height: number }) => void;
};

export function handlePdfSizeLoaded({
  size,
  pageSizeRef,
  onSelectedPdfSizeChange,
}: HandlePdfSizeLoadedArgs) {
  const prev = pageSizeRef.current;
  if (prev && prev.width === size.width && prev.height === size.height) {
    return;
  }

  pageSizeRef.current = size;
  onSelectedPdfSizeChange?.(size);
}

export type HandleSelectedPdfSourceChangeArgs = {
  selectedPageSrc: string | null;
  pageSizeRef: { current: { width: number; height: number } | null };
  onSelectedPdfSizeChange?: (
    size: { width: number; height: number } | null,
  ) => void;
};

export function handleSelectedPdfSourceChange({
  selectedPageSrc,
  pageSizeRef,
  onSelectedPdfSizeChange,
}: HandleSelectedPdfSourceChangeArgs) {
  if (!selectedPageSrc && onSelectedPdfSizeChange) {
    pageSizeRef.current = null;
    onSelectedPdfSizeChange(null);
  }
}

export function syncStageReadyLifecycle(
  onStageReady: ((stage: any | null) => void) | undefined,
  stage: any | null,
): (() => void) | undefined {
  if (!onStageReady) return undefined;
  onStageReady(stage);
  return () => onStageReady(null);
}

export type HandleSpacePanKeyDownArgs = {
  event: KeyboardEvent;
  setIsSpacePanning: (value: boolean) => void;
  setMarquee: (
    value:
      | { start: { x: number; y: number }; current: { x: number; y: number } }
      | null
      | ((prev: any) => any),
  ) => void;
};

export function handleSpacePanKeyDown({
  event,
  setIsSpacePanning,
  setMarquee,
}: HandleSpacePanKeyDownArgs) {
  if (event.code !== "Space") return;

  const target = event.target as HTMLElement | null;
  const tag = target?.tagName?.toLowerCase();
  const isEditable =
    tag === "input" ||
    tag === "textarea" ||
    target?.isContentEditable === true;

  if (isEditable) return;

  event.preventDefault();
  setIsSpacePanning(true);
  setMarquee(null);
}

export function handleSpacePanKeyUp(
  event: KeyboardEvent,
  setIsSpacePanning: (value: boolean) => void,
) {
  if (event.code !== "Space") return;
  setIsSpacePanning(false);
}

export function handleMiddleMouseWindowUp(
  event: MouseEvent,
  setIsMiddlePanning: (value: boolean) => void,
) {
  if (event.button === 1) {
    setIsMiddlePanning(false);
  }
}

export type RegisterSpacePanWindowListenersArgs = {
  onKeyDown: (event: KeyboardEvent) => void;
  onKeyUp: (event: KeyboardEvent) => void;
  target?: Window;
};

export function registerSpacePanWindowListeners({
  onKeyDown,
  onKeyUp,
  target,
}: RegisterSpacePanWindowListenersArgs): () => void {
  const host = target ?? window;
  host.addEventListener("keydown", onKeyDown);
  host.addEventListener("keyup", onKeyUp);

  return () => {
    host.removeEventListener("keydown", onKeyDown);
    host.removeEventListener("keyup", onKeyUp);
  };
}

export type RegisterMiddleMouseWindowUpListenerArgs = {
  onMouseUp: (event: MouseEvent) => void;
  target?: Window;
};

export function registerMiddleMouseWindowUpListener({
  onMouseUp,
  target,
}: RegisterMiddleMouseWindowUpListenerArgs): () => void {
  const host = target ?? window;
  host.addEventListener("mouseup", onMouseUp);
  return () => host.removeEventListener("mouseup", onMouseUp);
}

export function getFieldBounds(field: Field): Bounds {
  return {
    x: field.x,
    y: field.y,
    width: field.width,
    height: field.height,
  };
}

export function buildFieldMap(fields: Field[]): Map<string, Field> {
  const map = new Map<string, Field>();
  for (const field of fields) {
    map.set(field.id, field);
  }
  return map;
}

export function buildSelectedIdSet(selectedIds: string[]): Set<string> {
  return new Set(selectedIds);
}

export function getUngroupedFields(
  fields: Field[],
  groupedFieldIdSet: Set<string>,
): Field[] {
  return fields.filter((field) => !groupedFieldIdSet.has(field.id));
}

export function clampFieldOpacity(opacity: number | undefined): number {
  return Math.min(1, Math.max(0.05, opacity ?? 1));
}

export function unionBounds(bounds: Bounds[]): Bounds {
  if (bounds.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  let minX = bounds[0].x;
  let minY = bounds[0].y;
  let maxX = bounds[0].x + bounds[0].width;
  let maxY = bounds[0].y + bounds[0].height;

  for (let i = 1; i < bounds.length; i += 1) {
    const b = bounds[i];
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }

  return {
    x: minX,
    y: minY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
  };
}

export function intersects(a: Bounds, b: Bounds) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

export function groupBounds(
  group: ShapeGroup,
  fieldsById: Map<string, Field>,
): Bounds {
  const children = group.fieldIds
    .map((id) => fieldsById.get(id))
    .filter((f): f is Field => Boolean(f))
    .map(getFieldBounds);
  return unionBounds(children);
}

export function isFieldVisibleOnPage(
  field: Field,
  hasPdfPages: boolean,
  currentPdfPage: number,
) {
  if (!hasPdfPages) return true;
  if (field.pageIndex === null || field.pageIndex === undefined) return true;
  return field.pageIndex === currentPdfPage;
}

function isLikelyTitleText(text: string): boolean {
  const value = text.trim();
  if (!value) return false;

  if (
    /^(instructions?|important|notice|summary|coverage|declarations)\b/i.test(
      value,
    )
  ) {
    return true;
  }

  if (/^(section|part|schedule|form)\b/i.test(value)) {
    return true;
  }

  return value.length <= 36 && value === value.toUpperCase();
}

export function isMappedField(field: Field): field is Field {
  const metadata = field.metadata;
  if (!metadata) return false;
  if (!metadata.acordCode?.trim()) return false;
  if ((metadata.confidenceScore ?? 0) < 0.45) return false;

  const text = field.type === "text" ? field.text : "";
  if (text.trim().length > 60) return false;
  if (isLikelyTitleText(text)) return false;

  return true;
}

export function getVisibleFields(
  fields: Field[],
  hasPdfPages: boolean,
  currentPdfPage: number,
): Field[] {
  return fields.filter((field) =>
    isFieldVisibleOnPage(field, hasPdfPages, currentPdfPage),
  );
}

export function getMappedFields(fields: Field[]): Field[] {
  return fields.filter((field) => isMappedField(field));
}

export function buildGroupedFieldIdSet(groups: ShapeGroup[]): Set<string> {
  const set = new Set<string>();
  for (const group of groups) {
    for (const id of group.fieldIds) {
      set.add(id);
    }
  }
  return set;
}

export type FilterSelectionToVisibleArgs = {
  selectedIds: string[];
  visibleFields: Field[];
};

export function filterSelectionToVisible({
  selectedIds,
  visibleFields,
}: FilterSelectionToVisibleArgs): string[] {
  const visibleIdSet = new Set(visibleFields.map((field) => field.id));
  return selectedIds.filter((id) => visibleIdSet.has(id));
}

export type SyncTransformerSelectionArgs = {
  transformer: any;
  stage: any;
  selectedGroupId: string | null;
  selectedIds: string[];
};

export function syncTransformerSelection({
  transformer,
  stage,
  selectedGroupId,
  selectedIds,
}: SyncTransformerSelectionArgs) {
  if (selectedGroupId) {
    const groupNode = stage.findOne(`#group-${selectedGroupId}`);
    transformer.nodes(groupNode ? [groupNode] : []);
    transformer.getLayer()?.batchDraw();
    return;
  }

  const selectedNodes = selectedIds
    .map((id) => stage.findOne(`#${id}`))
    .filter(Boolean);

  transformer.nodes(selectedNodes);
  transformer.getLayer()?.batchDraw();
}

export type TransformerResizeState = {
  canResizeSingle: boolean;
  canResizeGroup: boolean;
};

export function getTransformerResizeState(
  selectedGroupId: string | null,
  selectedIds: string[],
): TransformerResizeState {
  return {
    canResizeSingle: !selectedGroupId && selectedIds.length === 1,
    canResizeGroup: Boolean(selectedGroupId),
  };
}

export function getPointerOnCanvas(getStage: () => any | null): Pointer {
  const stage = getStage();
  if (!stage) return null;

  const pointer = stage.getPointerPosition();
  if (!pointer) return null;

  const scale = stage.scaleX() || 1;
  const stageX = stage.x();
  const stageY = stage.y();

  return {
    x: (pointer.x - stageX) / scale,
    y: (pointer.y - stageY) / scale,
  };
}

export type DragSessionState = {
  ids: string[];
  startPositions: Record<string, { x: number; y: number }>;
  startBounds: Bounds;
  leaderId: string;
  lastDx: number;
  lastDy: number;
};

type MarqueeState = {
  start: { x: number; y: number };
  current: { x: number; y: number };
};

export type HandleFieldClickArgs = {
  id: string;
  e: any;
  fieldsById: Map<string, Field>;
  getPointerOnCanvas: () => Pointer;
  updateField: UpdateField;
  selectedGroupId: string | null;
  selectField: SelectField;
};

export function handleFieldClick({
  id,
  e,
  fieldsById,
  getPointerOnCanvas,
  updateField,
  selectedGroupId,
  selectField,
}: HandleFieldClickArgs) {
  e.cancelBubble = true;

  const field = fieldsById.get(id);
  if (field?.type === "dropdown") {
    const stagePoint = getPointerOnCanvas();
    if (stagePoint) {
      const localX = stagePoint.x - field.x;
      const localY = stagePoint.y - field.y;
      const previewTop = field.height + 4;
      const previewHeight = Math.max(34, field.options.length * 28);
      const visibleOptions = field.options.slice(0, 6);

      if (
        field.openPreview &&
        localX >= 0 &&
        localX <= field.width &&
        localY >= previewTop &&
        localY <= previewTop + previewHeight
      ) {
        const optionIndex = Math.floor((localY - previewTop) / 28);
        const selectedOption = visibleOptions[optionIndex];
        if (selectedOption) {
          updateField(id, {
            selectedOption,
            openPreview: false,
          } as Partial<Field>);
        }
      } else {
        updateField(
          id,
          { openPreview: !field.openPreview } as Partial<Field>,
          {
            recordHistory: false,
          },
        );
      }
    } else {
      updateField(
        id,
        { openPreview: !field.openPreview } as Partial<Field>,
        {
          recordHistory: false,
        },
      );
    }
  }

  if (field?.type === "numeric") {
    const stagePoint = getPointerOnCanvas();
    if (stagePoint) {
      const localX = stagePoint.x - field.x;
      const localY = stagePoint.y - field.y;
      const spinnerAreaX = field.width - 28;
      if (localX >= spinnerAreaX && localX <= field.width) {
        const current = field.value ?? field.min;
        const nextValue =
          localY < field.height / 2
            ? Math.min(field.max, current + field.step)
            : Math.max(field.min, current - field.step);
        updateField(id, { value: nextValue } as Partial<Field>);
      }
    }
  }

  if (selectedGroupId) {
    selectField(id, false);
    return;
  }

  selectField(id, Boolean(e.evt?.shiftKey));
}

export type HandleFieldTransformArgs = {
  field: Field;
  node: any;
  beginHistoryAction: () => void;
  endHistoryAction: () => void;
  updateField: UpdateField;
  snap: (value: number) => number;
};

export function handleFieldTransform({
  field,
  node,
  beginHistoryAction,
  endHistoryAction,
  updateField,
  snap,
}: HandleFieldTransformArgs) {
  beginHistoryAction();

  const scaleX = Math.max(0.1, Math.abs(node.scaleX()));
  const scaleY = Math.max(0.1, Math.abs(node.scaleY()));

  const newWidth = Math.max(20, field.width * scaleX);
  const newHeight = Math.max(20, field.height * scaleY);

  updateField(field.id, {
    x: snap(node.x()),
    y: snap(node.y()),
    width: snap(newWidth),
    height: snap(newHeight),
  });

  node.scaleX(1);
  node.scaleY(1);
  endHistoryAction();
}

export type HandleDragSessionStartArgs = {
  leaderId: string;
  ids: string[];
  fieldsById: Map<string, Field>;
  getFieldBounds: (field: Field) => Bounds;
  unionBounds: (bounds: Bounds[]) => Bounds;
  beginHistoryAction: () => void;
  dragSessionRef: { current: DragSessionState | null };
};

export function handleDragSessionStart({
  leaderId,
  ids,
  fieldsById,
  getFieldBounds,
  unionBounds,
  beginHistoryAction,
  dragSessionRef,
}: HandleDragSessionStartArgs) {
  const sessionIds = [...new Set(ids)];
  if (sessionIds.length === 0) return;

  const sessionFields = sessionIds
    .map((id) => fieldsById.get(id))
    .filter((field): field is Field => Boolean(field));

  if (sessionFields.length === 0) return;

  const startPositions: Record<string, { x: number; y: number }> = {};
  for (const field of sessionFields) {
    startPositions[field.id] = { x: field.x, y: field.y };
  }

  dragSessionRef.current = {
    ids: sessionFields.map((field) => field.id),
    startPositions,
    startBounds: unionBounds(sessionFields.map(getFieldBounds)),
    leaderId,
    lastDx: 0,
    lastDy: 0,
  };

  beginHistoryAction();
}

export type HandleDragSessionEndArgs = {
  dragSessionRef: { current: DragSessionState | null };
  endHistoryAction: () => void;
  clearGuides: () => void;
};

export function handleDragSessionEnd({
  dragSessionRef,
  endHistoryAction,
  clearGuides,
}: HandleDragSessionEndArgs) {
  if (!dragSessionRef.current) return;
  endHistoryAction();
  dragSessionRef.current = null;
  clearGuides();
}

export type HandleApplyDragSessionArgs = {
  leaderNode: any;
  dragSessionRef: { current: DragSessionState | null };
  getStageScale: () => number;
  snapScreenThreshold: number;
  getStaticSnapTargets: (
    movingIds: Set<string>,
  ) => { xTargets: number[]; yTargets: number[] };
  computeSnapAxis: (
    rawPosition: number,
    size: number,
    targets: number[],
    threshold: number,
  ) => { position: number; guide: number | null };
  moveFieldsBy: (
    ids: string[],
    dx: number,
    dy: number,
    options?: { recordHistory?: boolean },
  ) => void;
  setVertical: (value: number | null) => void;
  setHorizontal: (value: number | null) => void;
};

export function handleApplyDragSession({
  leaderNode,
  dragSessionRef,
  getStageScale,
  snapScreenThreshold,
  getStaticSnapTargets,
  computeSnapAxis,
  moveFieldsBy,
  setVertical,
  setHorizontal,
}: HandleApplyDragSessionArgs) {
  const session = dragSessionRef.current;
  if (!session) return;

  const leaderStart = session.startPositions[session.leaderId];
  if (!leaderStart) return;

  const rawDx = leaderNode.x() - leaderStart.x;
  const rawDy = leaderNode.y() - leaderStart.y;

  const rawBounds = {
    x: session.startBounds.x + rawDx,
    y: session.startBounds.y + rawDy,
    width: session.startBounds.width,
    height: session.startBounds.height,
  };

  const threshold = snapScreenThreshold / getStageScale();
  const movingIds = new Set(session.ids);
  const { xTargets, yTargets } = getStaticSnapTargets(movingIds);

  const xSnap = computeSnapAxis(
    rawBounds.x,
    rawBounds.width,
    xTargets,
    threshold,
  );
  const ySnap = computeSnapAxis(
    rawBounds.y,
    rawBounds.height,
    yTargets,
    threshold,
  );

  const desiredDx = xSnap.position - session.startBounds.x;
  const desiredDy = ySnap.position - session.startBounds.y;

  const deltaDx = desiredDx - session.lastDx;
  const deltaDy = desiredDy - session.lastDy;

  if (deltaDx !== 0 || deltaDy !== 0) {
    moveFieldsBy(session.ids, deltaDx, deltaDy, { recordHistory: false });
    session.lastDx = desiredDx;
    session.lastDy = desiredDy;
  }

  setVertical(xSnap.guide);
  setHorizontal(ySnap.guide);

  leaderNode.position({
    x: leaderStart.x + desiredDx,
    y: leaderStart.y + desiredDy,
  });
}

export type HandleFieldDragStartArgs = {
  id: string;
  e: any;
  selectedGroupId: string | null;
  selectedSet: Set<string>;
  selectedIds: string[];
  selectField: SelectField;
  startDragSession: (leaderId: string, ids: string[]) => void;
};

export function handleFieldDragStart({
  id,
  e,
  selectedGroupId,
  selectedSet,
  selectedIds,
  selectField,
  startDragSession,
}: HandleFieldDragStartArgs) {
  e.cancelBubble = true;

  if (selectedGroupId) {
    return;
  }

  if (!selectedSet.has(id)) {
    selectField(id, false);
    startDragSession(id, [id]);
    return;
  }

  const ids = selectedIds.length > 1 ? selectedIds : [id];
  startDragSession(id, ids);
}

export type HandleFieldDragMoveArgs = {
  e: any;
  applyDragSession: (leaderNode: any) => void;
};

export function handleFieldDragMove({
  e,
  applyDragSession,
}: HandleFieldDragMoveArgs) {
  applyDragSession(e.target);
}

export type HandleGroupClickArgs = {
  groupId: string;
  e: any;
  selectGroup: SelectGroup;
};

export function handleGroupClick({
  groupId,
  e,
  selectGroup,
}: HandleGroupClickArgs) {
  e.cancelBubble = true;
  selectGroup(groupId);
}

export function isFieldSelected(
  id: string,
  selectedSet: Set<string>,
): boolean {
  return selectedSet.has(id);
}

export function snapToGrid(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}

export type ComputeSnapAxisArgs = {
  rawPosition: number;
  size: number;
  targets: number[];
  threshold: number;
  gridSize: number;
};

export function computeSnapAxis({
  rawPosition,
  size,
  targets,
  threshold,
  gridSize,
}: ComputeSnapAxisArgs): { position: number; guide: number | null } {
  let bestDelta: number | null = null;
  let guide: number | null = null;

  const sourcePoints = [rawPosition, rawPosition + size / 2, rawPosition + size];

  const consider = (delta: number, snapGuide: number) => {
    const absDelta = Math.abs(delta);
    if (absDelta > threshold) return;
    if (bestDelta === null || absDelta < Math.abs(bestDelta)) {
      bestDelta = delta;
      guide = snapGuide;
    }
  };

  const grid = snapToGrid(rawPosition, gridSize);
  consider(grid - rawPosition, grid);

  for (const sourcePoint of sourcePoints) {
    for (const target of targets) {
      consider(target - sourcePoint, target);
    }
  }

  if (bestDelta === null) {
    return { position: rawPosition, guide: null };
  }

  return { position: rawPosition + bestDelta, guide };
}

export function computeSnapAxisWithGrid(
  rawPosition: number,
  size: number,
  targets: number[],
  threshold: number,
  gridSize: number,
): { position: number; guide: number | null } {
  return computeSnapAxis({
    rawPosition,
    size,
    targets,
    threshold,
    gridSize,
  });
}

export type BuildStaticSnapTargetsArgs = {
  movingIds: Set<string>;
  visibleFields: Field[];
  pageCenter: Point;
};

export function buildStaticSnapTargets({
  movingIds,
  visibleFields,
  pageCenter,
}: BuildStaticSnapTargetsArgs): { xTargets: number[]; yTargets: number[] } {
  const xTargets: number[] = [pageCenter.x];
  const yTargets: number[] = [pageCenter.y];

  for (const field of visibleFields) {
    if (movingIds.has(field.id)) continue;
    xTargets.push(field.x, field.x + field.width / 2, field.x + field.width);
    yTargets.push(field.y, field.y + field.height / 2, field.y + field.height);
  }

  return { xTargets, yTargets };
}

export type GetStaticSnapTargetsForCanvasArgs = {
  movingIds: Set<string>;
  visibleFields: Field[];
  pageSize: { width: number; height: number } | null;
  fallbackWidth: number;
  fallbackHeight: number;
};

export function getStaticSnapTargetsForCanvas({
  movingIds,
  visibleFields,
  pageSize,
  fallbackWidth,
  fallbackHeight,
}: GetStaticSnapTargetsForCanvasArgs): {
  xTargets: number[];
  yTargets: number[];
} {
  return buildStaticSnapTargets({
    movingIds,
    visibleFields,
    pageCenter: getPageCenter({
      pageSize,
      fallbackWidth,
      fallbackHeight,
    }),
  });
}

export type HandleGroupDragStartArgs = {
  group: ShapeGroup;
  e: any;
  selectGroup: SelectGroup;
  startDragSession: (leaderId: string, ids: string[]) => void;
};

export function handleGroupDragStart({
  group,
  e,
  selectGroup,
  startDragSession,
}: HandleGroupDragStartArgs) {
  e.cancelBubble = true;
  selectGroup(group.id);
  startDragSession(group.fieldIds[0], group.fieldIds);
}

export type HandleGroupDragMoveArgs = {
  group: ShapeGroup;
  e: any;
  dragSessionRef: { current: DragSessionState | null };
  fieldsById: Map<string, Field>;
  groupBounds: (group: ShapeGroup, fieldsById: Map<string, Field>) => Bounds;
  getStageScale: () => number;
  snapScreenThreshold: number;
  getStaticSnapTargets: (
    movingIds: Set<string>,
  ) => { xTargets: number[]; yTargets: number[] };
  computeSnapAxis: (
    rawPosition: number,
    size: number,
    targets: number[],
    threshold: number,
  ) => { position: number; guide: number | null };
  moveFieldsBy: (
    ids: string[],
    dx: number,
    dy: number,
    options?: { recordHistory?: boolean },
  ) => void;
  setVertical: (value: number | null) => void;
  setHorizontal: (value: number | null) => void;
};

export function handleGroupDragMove({
  group,
  e,
  dragSessionRef,
  fieldsById,
  groupBounds,
  getStageScale,
  snapScreenThreshold,
  getStaticSnapTargets,
  computeSnapAxis,
  moveFieldsBy,
  setVertical,
  setHorizontal,
}: HandleGroupDragMoveArgs) {
  const node = e.target;
  const session = dragSessionRef.current;
  if (!session) return;

  const groupStartBounds = groupBounds(group, fieldsById);
  const leaderStart = {
    x: groupStartBounds.x,
    y: groupStartBounds.y,
  };

  const rawDx = node.x() - leaderStart.x;
  const rawDy = node.y() - leaderStart.y;

  const rawBounds = {
    x: session.startBounds.x + rawDx,
    y: session.startBounds.y + rawDy,
    width: session.startBounds.width,
    height: session.startBounds.height,
  };

  const threshold = snapScreenThreshold / getStageScale();
  const movingIds = new Set(session.ids);
  const { xTargets, yTargets } = getStaticSnapTargets(movingIds);

  const xSnap = computeSnapAxis(
    rawBounds.x,
    rawBounds.width,
    xTargets,
    threshold,
  );
  const ySnap = computeSnapAxis(
    rawBounds.y,
    rawBounds.height,
    yTargets,
    threshold,
  );

  const desiredDx = xSnap.position - session.startBounds.x;
  const desiredDy = ySnap.position - session.startBounds.y;

  const deltaDx = desiredDx - session.lastDx;
  const deltaDy = desiredDy - session.lastDy;

  if (deltaDx !== 0 || deltaDy !== 0) {
    moveFieldsBy(session.ids, deltaDx, deltaDy, { recordHistory: false });
    session.lastDx = desiredDx;
    session.lastDy = desiredDy;
  }

  setVertical(xSnap.guide);
  setHorizontal(ySnap.guide);

  node.position({
    x: leaderStart.x + desiredDx,
    y: leaderStart.y + desiredDy,
  });
}

export type HandleGroupTransformStartArgs = {
  group: ShapeGroup;
  e: any;
  selectGroup: SelectGroup;
  beginHistoryAction: () => void;
};

export function handleGroupTransformStart({
  group,
  e,
  selectGroup,
  beginHistoryAction,
}: HandleGroupTransformStartArgs) {
  e.cancelBubble = true;
  selectGroup(group.id);
  beginHistoryAction();
}

export type HandleGroupTransformEndArgs = {
  group: ShapeGroup;
  e: any;
  fieldsById: Map<string, Field>;
  groupBounds: (group: ShapeGroup, fieldsById: Map<string, Field>) => Bounds;
  updateField: UpdateField;
  endHistoryAction: () => void;
};

export function handleGroupTransformEnd({
  group,
  e,
  fieldsById,
  groupBounds,
  updateField,
  endHistoryAction,
}: HandleGroupTransformEndArgs) {
  const node = e.target;
  const bounds = groupBounds(group, fieldsById);
  const scaleX = Math.max(0.1, Math.abs(node.scaleX()));
  const scaleY = Math.max(0.1, Math.abs(node.scaleY()));
  const nextX = node.x();
  const nextY = node.y();

  for (const childId of group.fieldIds) {
    const child = fieldsById.get(childId);
    if (!child) continue;

    const relativeX = child.x - bounds.x;
    const relativeY = child.y - bounds.y;

    updateField(
      child.id,
      {
        x: nextX + relativeX * scaleX,
        y: nextY + relativeY * scaleY,
        width: Math.max(20, child.width * scaleX),
        height: Math.max(20, child.height * scaleY),
      },
      { recordHistory: false },
    );
  }

  node.scaleX(1);
  node.scaleY(1);
  node.position({ x: nextX, y: nextY });
  endHistoryAction();
}

export type HandleStageMouseDownArgs = {
  e: any;
  isSpacePanning: boolean;
  isMiddlePanning: boolean;
  setIsMiddlePanning: (value: boolean) => void;
  setMarquee: (
    value:
      | MarqueeState
      | null
      | ((prev: MarqueeState | null) => MarqueeState | null),
  ) => void;
  visibleFields: Field[];
  updateFields: (
    ids: string[],
    updates: Partial<Field>,
    options?: { recordHistory?: boolean },
  ) => void;
  getPointerOnCanvas: () => { x: number; y: number } | null;
  clearSelection: () => void;
  clearGuides: () => void;
};

export function handleStageMouseDown({
  e,
  isSpacePanning,
  isMiddlePanning,
  setIsMiddlePanning,
  setMarquee,
  visibleFields,
  updateFields,
  getPointerOnCanvas,
  clearSelection,
  clearGuides,
}: HandleStageMouseDownArgs) {
  if (e.evt?.button === 1) {
    e.evt.preventDefault();
    setIsMiddlePanning(true);
    setMarquee(null);
    return;
  }

  if (e.target !== e.target.getStage()) {
    return;
  }

  const openDropdownIds = visibleFields
    .filter((field) => field.type === "dropdown" && field.openPreview)
    .map((field) => field.id);

  if (openDropdownIds.length > 0) {
    updateFields(openDropdownIds, { openPreview: false } as Partial<Field>, {
      recordHistory: false,
    });
  }

  const pointer = getPointerOnCanvas();
  if (!pointer) return;

  if (isSpacePanning || isMiddlePanning) {
    return;
  }

  setMarquee({ start: pointer, current: pointer });

  if (e.evt.shiftKey) {
    return;
  }

  clearSelection();
  clearGuides();
}

export type HandleStageMouseUpArgs = {
  e: any;
  setIsMiddlePanning: (value: boolean) => void;
  marquee: MarqueeState | null;
  setMarquee: (
    value:
      | MarqueeState
      | null
      | ((prev: MarqueeState | null) => MarqueeState | null),
  ) => void;
  groups: ShapeGroup[];
  mappedFieldsById: Map<string, Field>;
  groupBounds: (group: ShapeGroup, fieldsById: Map<string, Field>) => Bounds;
  intersects: (a: Bounds, b: Bounds) => boolean;
  selectGroup: (id: string | null) => void;
  ungroupedMappedFields: Field[];
  getFieldBounds: (field: Field) => Bounds;
  selectedIds: string[];
  selectFields: (ids: string[]) => void;
};

export function handleStageMouseUp({
  e,
  setIsMiddlePanning,
  marquee,
  setMarquee,
  groups,
  mappedFieldsById,
  groupBounds,
  intersects,
  selectGroup,
  ungroupedMappedFields,
  getFieldBounds,
  selectedIds,
  selectFields,
}: HandleStageMouseUpArgs) {
  if (e.evt?.button === 1) {
    setIsMiddlePanning(false);
    return;
  }

  if (!marquee) return;

  const x = Math.min(marquee.start.x, marquee.current.x);
  const y = Math.min(marquee.start.y, marquee.current.y);
  const widthRect = Math.abs(marquee.current.x - marquee.start.x);
  const heightRect = Math.abs(marquee.current.y - marquee.start.y);

  setMarquee(null);

  if (widthRect < 3 || heightRect < 3) {
    return;
  }

  const marqueeBounds = { x, y, width: widthRect, height: heightRect };

  const hitGroup = groups.find((group) => {
    const bounds = groupBounds(group, mappedFieldsById);
    if (bounds.width <= 0 || bounds.height <= 0) {
      return false;
    }
    return intersects(marqueeBounds, bounds);
  });

  if (hitGroup) {
    selectGroup(hitGroup.id);
    return;
  }

  const hitFields = ungroupedMappedFields
    .filter((field) => intersects(marqueeBounds, getFieldBounds(field)))
    .map((field) => field.id);

  if (e.evt.shiftKey && hitFields.length > 0) {
    const merged = [...new Set([...selectedIds, ...hitFields])];
    selectFields(merged);
    return;
  }

  selectFields(hitFields);
}

type CanvasPointer = { x: number; y: number } | null;

export type HandleStageCursorMoveArgs = {
  getPointerOnCanvas: () => CanvasPointer;
  setCanvasCursor: (pointer: { x: number; y: number }) => void;
  marquee: MarqueeState | null;
  setMarquee: (
    value:
      | MarqueeState
      | null
      | ((prev: MarqueeState | null) => MarqueeState | null),
  ) => void;
};

export function handleStageCursorMove({
  getPointerOnCanvas,
  setCanvasCursor,
  marquee,
  setMarquee,
}: HandleStageCursorMoveArgs) {
  const pointer = getPointerOnCanvas();
  if (!pointer) return;
  setCanvasCursor(pointer);

  if (!marquee) return;
  setMarquee((prev) =>
    prev
      ? {
          ...prev,
          current: pointer,
        }
      : prev,
  );
}

export type HandleStageMouseEnterArgs = {
  setIsCanvasFocused: (value: boolean) => void;
  getPointerOnCanvas: () => CanvasPointer;
  setCanvasCursor: (pointer: { x: number; y: number }) => void;
  marquee: MarqueeState | null;
  setMarquee: (
    value:
      | MarqueeState
      | null
      | ((prev: MarqueeState | null) => MarqueeState | null),
  ) => void;
};

export function handleStageMouseEnter({
  setIsCanvasFocused,
  getPointerOnCanvas,
  setCanvasCursor,
  marquee,
  setMarquee,
}: HandleStageMouseEnterArgs) {
  setIsCanvasFocused(true);
  handleStageCursorMove({
    getPointerOnCanvas,
    setCanvasCursor,
    marquee,
    setMarquee,
  });
}

export type HandleStageMouseLeaveArgs = {
  setIsCanvasFocused: (value: boolean) => void;
  setMarquee: (
    value:
      | MarqueeState
      | null
      | ((prev: MarqueeState | null) => MarqueeState | null),
  ) => void;
};

export function handleStageMouseLeave({
  setIsCanvasFocused,
  setMarquee,
}: HandleStageMouseLeaveArgs) {
  setIsCanvasFocused(false);
  setMarquee(null);
}

export type HandleStageWheelArgs = {
  e: any;
  getStage: () => any | null;
  scaleBy?: number;
  minScale?: number;
  maxScale?: number;
};

export function handleStageWheel({
  e,
  getStage,
  scaleBy = 1.05,
  minScale = 0.25,
  maxScale = 4,
}: HandleStageWheelArgs) {
  e.evt.preventDefault();

  const stage = getStage();
  if (!stage) return;

  const oldScale = stage.scaleX();
  const stagePos = { x: stage.x(), y: stage.y() };
  const pointer = stage.getPointerPosition();
  if (!pointer) return;

  const mousePointTo = {
    x: (pointer.x - stagePos.x) / oldScale,
    y: (pointer.y - stagePos.y) / oldScale,
  };

  const unclampedScale =
    e.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy;
  const newScale = Math.min(maxScale, Math.max(minScale, unclampedScale));

  const newPos = {
    x: pointer.x - mousePointTo.x * newScale,
    y: pointer.y - mousePointTo.y * newScale,
  };

  stage.scale({ x: newScale, y: newScale });
  stage.position(newPos);
  stage.batchDraw();
}
