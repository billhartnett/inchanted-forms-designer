import {
  Circle,
  Group as KonvaGroup,
  Image as KonvaImage,
  Layer,
  Line,
  Rect,
  Stage,
  Text,
  Transformer,
} from "react-konva";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import useImage from "use-image";

import {
  type Field,
  type ShapeGroup,
  useDesignerStore,
} from "../designer/state/useDesignerStore";
import { useGuidesStore } from "./useGuidesStore";

const GRID_SIZE = 20;
const SNAP_SCREEN_THRESHOLD = 8;
const SELECTION_OUTLINE = "#0ea5e9";

type Bounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type DragSession = {
  ids: string[];
  startPositions: Record<string, { x: number; y: number }>;
  startBounds: Bounds;
  leaderId: string;
  lastDx: number;
  lastDy: number;
};

type FieldBoxProps = {
  x: number;
  y: number;
  width: number;
  height: number;
  acordCode: string;
  label: string;
};

interface CanvasStageProps {
  width: number;
  height: number;
  onStageReady?: (stage: any | null) => void;
  onSelectedPdfSizeChange?: (
    size: { width: number; height: number } | null,
  ) => void;
}

function PdfPage({
  src,
  onLoaded,
}: {
  src: string;
  onLoaded?: (size: { width: number; height: number }) => void;
}) {
  const [image] = useImage(src);

  useEffect(() => {
    if (!image || !onLoaded) return;
    onLoaded({ width: image.width, height: image.height });
  }, [image, onLoaded]);

  if (!image) return null;

  return <KonvaImage image={image} x={0} y={0} listening={false} />;
}

function getFieldBounds(field: Field): Bounds {
  return {
    x: field.x,
    y: field.y,
    width: field.width,
    height: field.height,
  };
}

function unionBounds(bounds: Bounds[]): Bounds {
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

function intersects(a: Bounds, b: Bounds) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function groupBounds(
  group: ShapeGroup,
  fieldsById: Map<string, Field>,
): Bounds {
  const children = group.fieldIds
    .map((id) => fieldsById.get(id))
    .filter((f): f is Field => Boolean(f))
    .map(getFieldBounds);
  return unionBounds(children);
}

function isFieldVisibleOnPage(
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

function isMappedField(field: Field): field is Field {
  const metadata = field.metadata;
  if (!metadata) return false;
  if (!metadata.acordCode?.trim()) return false;
  if ((metadata.confidenceScore ?? 0) < 0.45) return false;

  const text = field.type === "text" ? field.text : "";
  if (text.trim().length > 60) return false;
  if (isLikelyTitleText(text)) return false;

  return true;
}

function FieldBox({ x, y, width, height, acordCode, label }: FieldBoxProps) {
  const resolvedLabel = label.trim() || acordCode;
  return (
    <KonvaGroup x={x} y={y}>
      <Rect
        x={0}
        y={0}
        width={Math.max(20, width)}
        height={Math.max(20, height)}
        fill="#ffffff"
        stroke="#1e293b"
        strokeWidth={1}
        cornerRadius={4}
      />
      <Text
        x={8}
        y={6}
        width={Math.max(0, width - 16)}
        height={Math.max(0, height - 12)}
        text={resolvedLabel}
        fontSize={12}
        fontFamily="Geist Variable"
        fill="#0f172a"
        verticalAlign="middle"
        ellipsis
      />
    </KonvaGroup>
  );
}

export function CanvasStage({
  width,
  height,
  onStageReady,
  onSelectedPdfSizeChange,
}: CanvasStageProps) {
  const stageRef = useRef<any>(null);
  const transformerRef = useRef<any>(null);
  const pageSizeRef = useRef<{ width: number; height: number } | null>(null);
  const dragSessionRef = useRef<DragSession | null>(null);

  const [marquee, setMarquee] = useState<{
    start: { x: number; y: number };
    current: { x: number; y: number };
  } | null>(null);
  const [isSpacePanning, setIsSpacePanning] = useState(false);
  const [isMiddlePanning, setIsMiddlePanning] = useState(false);
  const [isCanvasFocused, setIsCanvasFocused] = useState(false);

  const fields = useDesignerStore((s) => s.fields);
  const groups = useDesignerStore((s) => s.groups);
  const selectedIds = useDesignerStore((s) => s.selectedIds);
  const selectedGroupId = useDesignerStore((s) => s.selectedGroupId);
  const pdfPages = useDesignerStore((s) => s.pdfPages);
  const currentPdfPage = useDesignerStore((s) => s.currentPdfPage);
  const updateField = useDesignerStore((s) => s.updateField);
  const updateFields = useDesignerStore((s) => s.updateFields);
  const moveFieldsBy = useDesignerStore((s) => s.moveFieldsBy);
  const selectField = useDesignerStore((s) => s.selectField);
  const selectFields = useDesignerStore((s) => s.selectFields);
  const selectGroup = useDesignerStore((s) => s.selectGroup);
  const clearSelection = useDesignerStore((s) => s.clearSelection);
  const setCanvasCursor = useDesignerStore((s) => s.setCanvasCursor);
  const beginHistoryAction = useDesignerStore((s) => s.beginHistoryAction);
  const endHistoryAction = useDesignerStore((s) => s.endHistoryAction);

  const { vertical, horizontal, setVertical, setHorizontal, clearGuides } =
    useGuidesStore();

  const zoomRef = useRef(1);
  const offsetRef = useRef({ x: 0, y: 0 });

  const fieldsById = useMemo(() => {
    const map = new Map<string, Field>();
    for (const field of fields) {
      map.set(field.id, field);
    }
    return map;
  }, [fields]);

  const visibleFields = useMemo(
    () =>
      fields.filter((field) =>
        isFieldVisibleOnPage(field, pdfPages.length > 0, currentPdfPage),
      ),
    [fields, pdfPages.length, currentPdfPage],
  );

  const visibleFieldsById = useMemo(() => {
    const map = new Map<string, Field>();
    for (const field of visibleFields) {
      map.set(field.id, field);
    }
    return map;
  }, [visibleFields]);

  const mappedFields = useMemo(
    () => visibleFields.filter((field) => isMappedField(field)),
    [visibleFields],
  );

  const mappedFieldsById = useMemo(() => {
    const map = new Map<string, Field>();
    for (const field of mappedFields) {
      map.set(field.id, field);
    }
    return map;
  }, [mappedFields]);

  const groupedFieldIdSet = useMemo(() => {
    const set = new Set<string>();
    for (const group of groups) {
      for (const id of group.fieldIds) {
        set.add(id);
      }
    }
    return set;
  }, [groups]);

  const ungroupedFields = useMemo(
    () => visibleFields.filter((field) => !groupedFieldIdSet.has(field.id)),
    [visibleFields, groupedFieldIdSet],
  );

  const ungroupedMappedFields = useMemo(
    () => mappedFields.filter((field) => !groupedFieldIdSet.has(field.id)),
    [mappedFields, groupedFieldIdSet],
  );

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  useEffect(() => {
    const visibleIdSet = new Set(visibleFields.map((field) => field.id));
    const filteredSelected = selectedIds.filter((id) => visibleIdSet.has(id));

    if (filteredSelected.length !== selectedIds.length) {
      selectFields(filteredSelected);
      if (filteredSelected.length === 0) {
        selectGroup(null);
      }
    }
  }, [visibleFields, selectedIds, selectFields, selectGroup]);

  const gridLines = useMemo(() => {
    const lines: { points: number[] }[] = [];

    for (let x = 0; x < width; x += GRID_SIZE) {
      lines.push({ points: [x, 0, x, height] });
    }
    for (let y = 0; y < height; y += GRID_SIZE) {
      lines.push({ points: [0, y, width, y] });
    }
    return lines;
  }, [height, width]);

  const selectedPageSrc =
    pdfPages.length > 0
      ? pdfPages[Math.min(currentPdfPage, pdfPages.length - 1)]
      : null;

  const getPointerOnCanvas = () => {
    if (!stageRef.current) return null;

    const pointer = stageRef.current.getPointerPosition();
    if (!pointer) return null;

    const scale = stageRef.current.scaleX() || 1;
    const stageX = stageRef.current.x();
    const stageY = stageRef.current.y();

    return {
      x: (pointer.x - stageX) / scale,
      y: (pointer.y - stageY) / scale,
    };
  };

  useEffect(() => {
    if (!selectedPageSrc && onSelectedPdfSizeChange) {
      pageSizeRef.current = null;
      onSelectedPdfSizeChange(null);
    }
  }, [onSelectedPdfSizeChange, selectedPageSrc]);

  useEffect(() => {
    if (!onStageReady) return;
    onStageReady(stageRef.current);

    return () => onStageReady(null);
  }, [onStageReady]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
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
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      setIsSpacePanning(false);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  useEffect(() => {
    const onMouseUp = (event: MouseEvent) => {
      if (event.button === 1) {
        setIsMiddlePanning(false);
      }
    };

    window.addEventListener("mouseup", onMouseUp);
    return () => window.removeEventListener("mouseup", onMouseUp);
  }, []);

  useEffect(() => {
    if (!transformerRef.current || !stageRef.current) return;

    if (selectedGroupId) {
      const groupNode = stageRef.current.findOne(`#group-${selectedGroupId}`);
      transformerRef.current.nodes(groupNode ? [groupNode] : []);
      transformerRef.current.getLayer()?.batchDraw();
      return;
    }

    const selectedNodes = selectedIds
      .map((id) => stageRef.current.findOne(`#${id}`))
      .filter(Boolean);

    transformerRef.current.nodes(selectedNodes);
    transformerRef.current.getLayer()?.batchDraw();
  }, [selectedGroupId, selectedIds]);

  const snap = (value: number) => Math.round(value / GRID_SIZE) * GRID_SIZE;

  const getPageCenter = () => {
    if (pageSizeRef.current) {
      return {
        x: pageSizeRef.current.width / 2,
        y: pageSizeRef.current.height / 2,
      };
    }

    return { x: width / 2, y: height / 2 };
  };

  const computeSnapAxis = (
    rawPosition: number,
    size: number,
    targets: number[],
    threshold: number,
  ) => {
    let bestDelta: number | null = null;
    let guide: number | null = null;

    const sourcePoints = [
      rawPosition,
      rawPosition + size / 2,
      rawPosition + size,
    ];

    const consider = (delta: number, snapGuide: number) => {
      const absDelta = Math.abs(delta);
      if (absDelta > threshold) return;
      if (bestDelta === null || absDelta < Math.abs(bestDelta)) {
        bestDelta = delta;
        guide = snapGuide;
      }
    };

    const grid = snap(rawPosition);
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
  };

  const getStaticSnapTargets = (movingIds: Set<string>) => {
    const xTargets: number[] = [];
    const yTargets: number[] = [];

    const pageCenter = getPageCenter();
    xTargets.push(pageCenter.x);
    yTargets.push(pageCenter.y);

    for (const field of visibleFields) {
      if (movingIds.has(field.id)) continue;
      xTargets.push(field.x, field.x + field.width / 2, field.x + field.width);
      yTargets.push(
        field.y,
        field.y + field.height / 2,
        field.y + field.height,
      );
    }

    return { xTargets, yTargets };
  };

  const handleWheel = (e: any) => {
    e.evt.preventDefault();

    const scaleBy = 1.05;
    const oldScale = stageRef.current.scaleX();
    const stagePos = { x: stageRef.current.x(), y: stageRef.current.y() };
    const pointer = stageRef.current.getPointerPosition();
    if (!pointer) return;

    const mousePointTo = {
      x: (pointer.x - stagePos.x) / oldScale,
      y: (pointer.y - stagePos.y) / oldScale,
    };

    const unclampedScale =
      e.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy;
    const newScale = Math.min(4, Math.max(0.25, unclampedScale));

    zoomRef.current = newScale;

    const newPos = {
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    };

    offsetRef.current = newPos;

    stageRef.current.scale({ x: newScale, y: newScale });
    stageRef.current.position(newPos);
    stageRef.current.batchDraw();
  };

  const handleStageDragMove = (e: any) => {
    offsetRef.current = e.target.position();
  };

  const updateCursorPosition = () => {
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
  };

  const handleStageMouseEnter = () => {
    setIsCanvasFocused(true);
    updateCursorPosition();
  };

  const handleStageMouseLeave = () => {
    setIsCanvasFocused(false);
    setMarquee(null);
  };

  const startDragSession = (leaderId: string, ids: string[]) => {
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
  };

  const applyDragSession = (leaderNode: any) => {
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

    const scale = stageRef.current?.scaleX() || 1;
    const threshold = SNAP_SCREEN_THRESHOLD / scale;
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
  };

  const endDragSession = () => {
    if (!dragSessionRef.current) return;
    endHistoryAction();
    dragSessionRef.current = null;
    clearGuides();
  };

  const handleFieldClick = (id: string, e: any) => {
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
        updateField(id, { openPreview: !field.openPreview } as Partial<Field>, {
          recordHistory: false,
        });
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
  };

  const handleGroupClick = (groupId: string, e: any) => {
    e.cancelBubble = true;
    selectGroup(groupId);
  };

  const handleFieldDragStart = (id: string, e: any) => {
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
  };

  const handleFieldDragMove = (e: any) => {
    applyDragSession(e.target);
  };

  const handleGroupDragStart = (group: ShapeGroup, e: any) => {
    e.cancelBubble = true;
    selectGroup(group.id);
    startDragSession(group.fieldIds[0], group.fieldIds);
  };

  const handleGroupDragMove = (group: ShapeGroup, e: any) => {
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

    const scale = stageRef.current?.scaleX() || 1;
    const threshold = SNAP_SCREEN_THRESHOLD / scale;
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
  };

  const handleGroupTransformStart = (group: ShapeGroup, e: any) => {
    e.cancelBubble = true;
    selectGroup(group.id);
    beginHistoryAction();
  };

  const handleGroupTransformEnd = (group: ShapeGroup, e: any) => {
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
  };

  const handleTransform = (field: Field, node: any) => {
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
  };

  const handleStageMouseDown = (e: any) => {
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
  };

  const handleStageMouseUp = (e: any) => {
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
  };

  const handlePdfLoaded = useCallback(
    (size: { width: number; height: number }) => {
      const prev = pageSizeRef.current;
      if (prev && prev.width === size.width && prev.height === size.height) {
        return;
      }

      pageSizeRef.current = size;
      onSelectedPdfSizeChange?.(size);
    },
    [onSelectedPdfSizeChange],
  );

  const canResizeSingle = !selectedGroupId && selectedIds.length === 1;
  const canResizeGroup = Boolean(selectedGroupId);

  const renderMetadataBadge = (field: Field, x: number, y: number) => {
    const metadata = field.metadata;
    if (!metadata) return null;

    const code = metadata.acordCode?.trim();
    const label = metadata.acordLabel?.trim();
    if (!code && !label) return null;

    const badgeText = code || label;
    const confidence = Math.round(
      Math.min(1, Math.max(0, metadata.confidenceScore || 0)) * 100,
    );

    let sourceBg = "rgba(14, 165, 233, 0.92)";
    if (metadata.source === "ai") {
      sourceBg = "rgba(16, 185, 129, 0.92)";
    } else if (metadata.source === "ocr") {
      sourceBg = "rgba(245, 158, 11, 0.94)";
    }

    const badgeWidth = Math.min(
      field.width,
      Math.max(120, badgeText.length * 7 + 58),
    );
    const badgeX = x;
    const badgeY = Math.max(-24, y - 24);

    return (
      <>
        <Rect
          listening={false}
          x={badgeX}
          y={badgeY}
          width={badgeWidth}
          height={18}
          fill={sourceBg}
          cornerRadius={5}
        />
        <Text
          listening={false}
          x={badgeX + 6}
          y={badgeY + 4}
          width={Math.max(0, badgeWidth - 42)}
          height={12}
          text={badgeText}
          fontSize={10}
          fontFamily="Geist Variable"
          fill="#ffffff"
          ellipsis
        />
        <Text
          listening={false}
          x={badgeX + badgeWidth - 34}
          y={badgeY + 4}
          width={28}
          height={12}
          align="right"
          text={`${confidence}%`}
          fontSize={10}
          fontFamily="Geist Variable"
          fill="#ffffff"
        />
      </>
    );
  };

  const renderFieldVisual = (field: Field, x: number, y: number) => {
    if (field.type === "rect") {
      return (
        <Rect
          x={x}
          y={y}
          width={field.width}
          height={field.height}
          fill={field.fill}
          stroke={field.stroke || "#1e293b"}
          strokeWidth={Math.max(0, field.strokeWidth ?? 1)}
          cornerRadius={Math.max(0, field.cornerRadius ?? 0)}
        />
      );
    }

    if (field.type === "text") {
      return (
        <Text
          x={x}
          y={y}
          width={field.width}
          height={field.height}
          text={field.text || ""}
          fontSize={field.fontSize}
          fontFamily={field.fontFamily || "Geist Variable"}
          align={field.textAlign || "left"}
          fill={field.color || "#000000"}
          stroke={field.stroke || "#1e293b"}
          strokeWidth={Math.max(0, field.strokeWidth ?? 0)}
          padding={8}
        />
      );
    }

    if (field.type === "checkbox") {
      const boxSize = Math.min(field.height - 6, 20);
      return (
        <>
          <Rect
            x={x}
            y={y + (field.height - boxSize) / 2}
            width={boxSize}
            height={boxSize}
            fill={field.fill || "#ffffff"}
            stroke={field.stroke || "#1e293b"}
            strokeWidth={Math.max(1, field.strokeWidth)}
            cornerRadius={3}
          />
          {field.checked && (
            <Line
              points={[
                x + 4,
                y + field.height / 2,
                x + boxSize / 2,
                y + boxSize + 1,
                x + boxSize - 3,
                y + 4,
              ]}
              stroke="#0f172a"
              strokeWidth={2}
              lineCap="round"
              lineJoin="round"
            />
          )}
          <Text
            x={x + boxSize + 8}
            y={y + 3}
            width={Math.max(0, field.width - boxSize - 8)}
            height={field.height - 6}
            text={field.label || "Checkbox"}
            fontSize={14}
            fill="#0f172a"
            verticalAlign="middle"
          />
        </>
      );
    }

    if (field.type === "radio") {
      const size = Math.min(field.height - 6, 20);
      const radius = size / 2;
      const centerX = x + radius;
      const centerY = y + field.height / 2;
      return (
        <>
          <Circle
            x={centerX}
            y={centerY}
            radius={radius}
            fill={field.fill || "#ffffff"}
            stroke={field.stroke || "#1e293b"}
            strokeWidth={Math.max(1, field.strokeWidth)}
          />
          {field.checked && (
            <Circle
              x={centerX}
              y={centerY}
              radius={radius * 0.45}
              fill="#0f172a"
            />
          )}
          <Text
            x={x + size + 8}
            y={y + 3}
            width={Math.max(0, field.width - size - 8)}
            height={field.height - 6}
            text={field.label || "Radio"}
            fontSize={14}
            fill="#0f172a"
            verticalAlign="middle"
          />
        </>
      );
    }

    if (field.type === "dropdown") {
      return (
        <>
          <Rect
            x={x}
            y={y}
            width={field.width}
            height={field.height}
            fill={field.fill || "#ffffff"}
            stroke={field.stroke || "#1e293b"}
            strokeWidth={Math.max(1, field.strokeWidth)}
            cornerRadius={6}
          />
          <Text
            x={x + 10}
            y={y + 7}
            width={Math.max(0, field.width - 26)}
            height={Math.max(0, field.height - 10)}
            text={field.selectedOption || field.placeholder || "Select option"}
            fontSize={13}
            fill={field.selectedOption ? "#0f172a" : "#64748b"}
            verticalAlign="middle"
          />
          <Text
            x={x + field.width - 16}
            y={y + 6}
            width={10}
            height={Math.max(0, field.height - 8)}
            text="v"
            fontSize={12}
            fill="#64748b"
            align="center"
            verticalAlign="middle"
          />
          {field.openPreview && (
            <>
              <Rect
                x={x}
                y={y + field.height + 4}
                width={field.width}
                height={Math.max(34, field.options.length * 28)}
                fill="#ffffff"
                stroke={field.stroke || "#1e293b"}
                strokeWidth={Math.max(1, field.strokeWidth)}
                cornerRadius={6}
                shadowColor="rgba(15, 23, 42, 0.15)"
                shadowBlur={8}
                shadowOffsetY={3}
              />
              {field.options.slice(0, 6).map((option, index) => (
                <Text
                  key={`${field.id}-opt-${option}-${index}`}
                  x={x + 10}
                  y={y + field.height + 10 + index * 26}
                  width={Math.max(0, field.width - 20)}
                  height={22}
                  text={option}
                  fontSize={13}
                  fill="#0f172a"
                />
              ))}
            </>
          )}
        </>
      );
    }

    if (field.type === "date") {
      return (
        <>
          <Rect
            x={x}
            y={y}
            width={field.width}
            height={field.height}
            fill={field.fill || "#ffffff"}
            stroke={field.stroke || "#1e293b"}
            strokeWidth={Math.max(1, field.strokeWidth)}
            cornerRadius={6}
          />
          <Text
            x={x + 10}
            y={y + 7}
            width={Math.max(0, field.width - 34)}
            height={Math.max(0, field.height - 10)}
            text={
              field.value ||
              `${field.placeholder || "Pick a date"} (${field.dateFormat})`
            }
            fontSize={13}
            fill={field.value ? "#0f172a" : "#64748b"}
            verticalAlign="middle"
          />
          <Text
            x={x + field.width - 20}
            y={y + 7}
            width={12}
            height={Math.max(0, field.height - 10)}
            text="[]"
            fontSize={10}
            fill="#64748b"
            align="center"
            verticalAlign="middle"
          />
        </>
      );
    }

    if (field.type === "numeric") {
      return (
        <>
          <Rect
            x={x}
            y={y}
            width={field.width}
            height={field.height}
            fill={field.fill || "#ffffff"}
            stroke={field.stroke || "#1e293b"}
            strokeWidth={Math.max(1, field.strokeWidth)}
            cornerRadius={6}
          />
          <Text
            x={x + 10}
            y={y + 7}
            width={Math.max(0, field.width - 44)}
            height={Math.max(0, field.height - 10)}
            text={
              field.value !== null
                ? String(field.value)
                : field.placeholder || "0"
            }
            fontSize={13}
            fill={field.value !== null ? "#0f172a" : "#64748b"}
            verticalAlign="middle"
          />
          <Text
            x={x + field.width - 26}
            y={y + 5}
            width={18}
            height={12}
            text="+"
            fontSize={11}
            align="center"
            fill="#64748b"
          />
          <Text
            x={x + field.width - 26}
            y={y + field.height - 16}
            width={18}
            height={12}
            text="-"
            fontSize={11}
            align="center"
            fill="#64748b"
          />
        </>
      );
    }

    return (
      <>
        <Rect
          x={x}
          y={y}
          width={field.width}
          height={field.height}
          fill={field.fill || "#ffffff"}
          stroke={field.stroke || "#1e293b"}
          strokeWidth={Math.max(1, field.strokeWidth)}
          dash={[8, 5]}
          cornerRadius={8}
        />
        <Text
          x={x + 10}
          y={y + field.height / 2 - 10}
          width={Math.max(0, field.width - 20)}
          text={field.placeholder || "Sign here"}
          fontSize={14}
          fontStyle="italic"
          align="center"
          fill="#64748b"
        />
        {field.showStrokePreview && (
          <Line
            points={[
              x + 20,
              y + field.height * 0.62,
              x + field.width * 0.28,
              y + field.height * 0.48,
              x + field.width * 0.43,
              y + field.height * 0.7,
              x + field.width * 0.6,
              y + field.height * 0.36,
              x + field.width * 0.8,
              y + field.height * 0.56,
            ]}
            stroke="#0f172a"
            strokeWidth={2}
            tension={0.35}
            lineCap="round"
            lineJoin="round"
          />
        )}
      </>
    );
  };

  return (
    <Stage
      ref={stageRef}
      width={width}
      height={height}
      draggable={(isSpacePanning || isMiddlePanning) && !marquee}
      onDragMove={handleStageDragMove}
      onWheel={handleWheel}
      onMouseDown={handleStageMouseDown}
      onMouseMove={updateCursorPosition}
      onMouseEnter={handleStageMouseEnter}
      onMouseLeave={handleStageMouseLeave}
      onMouseUp={handleStageMouseUp}
      style={{
        background: "#fff",
        cursor: isSpacePanning || isMiddlePanning ? "grab" : "default",
      }}
    >
      <Layer listening={false}>
        {gridLines.map((line, i) => (
          <Line key={i} points={line.points} stroke="#eee" strokeWidth={1} />
        ))}
      </Layer>

      <Layer listening={false}>
        {selectedPageSrc && (
          <PdfPage src={selectedPageSrc} onLoaded={handlePdfLoaded} />
        )}
      </Layer>

      <Layer listening={false}>
        {vertical !== null && (
          <Line
            points={[vertical, -10000, vertical, 10000]}
            stroke="#4a90e2"
            strokeWidth={1}
            dash={[4, 4]}
          />
        )}
        {horizontal !== null && (
          <Line
            points={[-10000, horizontal, 10000, horizontal]}
            stroke="#4a90e2"
            strokeWidth={1}
            dash={[4, 4]}
          />
        )}
      </Layer>

      <Layer>
        {groups.map((group) => {
          const bounds = groupBounds(group, mappedFieldsById);
          const children = group.fieldIds
            .map((id) => mappedFieldsById.get(id))
            .filter((f): f is Field => Boolean(f));

          if (children.length === 0) return null;

          return (
            <KonvaGroup
              key={group.id}
              id={`group-${group.id}`}
              x={bounds.x}
              y={bounds.y}
              draggable
              onClick={(e) => handleGroupClick(group.id, e)}
              onTap={(e) => handleGroupClick(group.id, e)}
              onDragStart={(e) => handleGroupDragStart(group, e)}
              onDragMove={(e) => handleGroupDragMove(group, e)}
              onDragEnd={endDragSession}
              onTransformStart={(e) => handleGroupTransformStart(group, e)}
              onTransformEnd={(e) => handleGroupTransformEnd(group, e)}
            >
              {children.map((f) => {
                const localX = f.x - bounds.x;
                const localY = f.y - bounds.y;
                const isSelected = selectedSet.has(f.id);

                return (
                  <Fragment key={f.id}>
                    <KonvaGroup
                      x={localX}
                      y={localY}
                      rotation={f.rotation ?? 0}
                      opacity={Math.min(1, Math.max(0.05, f.opacity ?? 1))}
                    >
                      <FieldBox
                        x={0}
                        y={0}
                        width={f.width}
                        height={f.height}
                        acordCode={f.metadata?.acordCode || ""}
                        label={f.metadata?.acordLabel || ""}
                      />
                    </KonvaGroup>
                    {isSelected && (
                      <Rect
                        listening={false}
                        x={localX}
                        y={localY}
                        width={f.width}
                        height={f.height}
                        stroke={SELECTION_OUTLINE}
                        strokeWidth={2}
                        dash={[6, 4]}
                      />
                    )}
                  </Fragment>
                );
              })}
            </KonvaGroup>
          );
        })}

        {ungroupedMappedFields.map((f) => {
          if (
            !Number.isFinite(f.x) ||
            !Number.isFinite(f.y) ||
            !Number.isFinite(f.width) ||
            !Number.isFinite(f.height)
          ) {
            return null;
          }

          const isSelected = selectedSet.has(f.id);
          return (
            <Fragment key={f.id}>
              <KonvaGroup
                id={f.id}
                x={f.x}
                y={f.y}
                rotation={f.rotation ?? 0}
                opacity={Math.min(1, Math.max(0.05, f.opacity ?? 1))}
                draggable
                onClick={(e) => handleFieldClick(f.id, e)}
                onTap={(e) => handleFieldClick(f.id, e)}
                onDragStart={(e) => handleFieldDragStart(f.id, e)}
                onDragMove={handleFieldDragMove}
                onDragEnd={endDragSession}
                onTransformEnd={(e) => handleTransform(f, e.target)}
              >
                <FieldBox
                  x={0}
                  y={0}
                  width={f.width}
                  height={f.height}
                  acordCode={f.metadata?.acordCode || ""}
                  label={f.metadata?.acordLabel || ""}
                />
              </KonvaGroup>
              {isSelected && (
                <Rect
                  listening={false}
                  x={f.x}
                  y={f.y}
                  width={f.width}
                  height={f.height}
                  stroke={SELECTION_OUTLINE}
                  strokeWidth={2}
                  dash={[6, 4]}
                />
              )}
            </Fragment>
          );
        })}

        <Transformer
          ref={transformerRef}
          rotateEnabled={false}
          resizeEnabled={canResizeSingle || canResizeGroup}
          keepRatio={false}
        />
      </Layer>

      <Layer listening={false}>
        {marquee && (
          <Rect
            x={Math.min(marquee.start.x, marquee.current.x)}
            y={Math.min(marquee.start.y, marquee.current.y)}
            width={Math.abs(marquee.current.x - marquee.start.x)}
            height={Math.abs(marquee.current.y - marquee.start.y)}
            fill="rgba(74, 144, 226, 0.15)"
            stroke="#4a90e2"
            dash={[4, 4]}
          />
        )}

        {isCanvasFocused && (
          <>
            <Rect
              x={12}
              y={height - 40}
              width={252}
              height={28}
              fill="rgba(15, 23, 42, 0.74)"
              cornerRadius={8}
            />
            <Text
              x={20}
              y={height - 33}
              text="Drag to select  •  Space+drag or middle-drag to pan"
              fontSize={12}
              fontFamily="Geist Variable"
              fill="#f8fafc"
            />
          </>
        )}
      </Layer>
    </Stage>
  );
}
