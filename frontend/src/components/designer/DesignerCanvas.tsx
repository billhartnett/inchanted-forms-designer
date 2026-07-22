import { useEffect, useMemo, useRef } from "react";
import { Group as KonvaGroup, Line, Transformer } from "react-konva";
import { Rect as KonvaRect, Text as KonvaText } from "react-konva";
import { CanvasStage } from "../../canvas/CanvasStage";
import ZoomControls from "../../designer/controls/ZoomControls";
import PdfImportModal from "../../designer/ai/PdfImportModal";
import { useSelectedFields } from "../../state/fieldStore";
import { useDesignerStore, type Field } from "../../state/designerStore";
import { FieldControls } from "./FieldControls";
import FieldRenderer from "./FieldRenderer";
import PdfBackground from "./PdfBackground";

const GRID_SIZE = 20;

type StageLike = {
  scaleX: () => number;
  scale: (value: { x: number; y: number }) => void;
  position: (value: { x: number; y: number }) => void;
  x: () => number;
  y: () => number;
  batchDraw: () => void;
};

type DesignerToast = {
  message: string;
  tone: "success" | "error" | "info";
};

type DesignerCanvasProps = {
  canvasSurfaceWidth: number;
  canvasSurfaceHeight: number;
  pdfUrl: string | null;
  onStageReady: (stage: StageLike | null) => void;
  onSelectedPdfSizeChange: (size: { width: number; height: number } | null) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  fitToPage: () => void;
  toast: DesignerToast | null;
  showPdfModal: boolean;
  pdfModalMode: "import" | "map-only";
  onClosePdfModal: () => void;
  onImportResult: (result: {
    warning?: string;
    importedPages: number;
    mappedFields: number;
  }) => void;
  onViewportChange: (viewport: { width: number; height: number }) => void;
};

export function DesignerCanvas({
  canvasSurfaceWidth,
  canvasSurfaceHeight,
  pdfUrl,
  onStageReady,
  onSelectedPdfSizeChange,
  zoomIn,
  zoomOut,
  resetZoom,
  fitToPage,
  toast,
  showPdfModal,
  pdfModalMode,
  onClosePdfModal,
  onImportResult,
  onViewportChange,
}: DesignerCanvasProps) {
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const transformerRef = useRef<any>(null);
  const fieldGroupRefs = useRef<Map<string, any>>(new Map());

  const fields = useDesignerStore((s) => s.fields);
  const pdfPages = useDesignerStore((s) => s.pdfPages);
  const currentPdfPage = useDesignerStore((s) => s.currentPdfPage);
  const fieldSearchQuery = useDesignerStore((s) => s.fieldSearchQuery);
  const showGrid = useDesignerStore((s) => s.showGrid);
  const draftCanvasFields = useDesignerStore((s) => s.draftCanvasFields);
  const draftSelectedIds = useDesignerStore((s) => s.draftSelectedIds);
  const toggleDraftSelection = useDesignerStore((s) => s.toggleDraftSelection);
  const selectField = useDesignerStore((s) => s.selectField);
  const selectedFields = useSelectedFields();

  const normalizedSearchQuery = fieldSearchQuery.trim().toLowerCase();

  const fieldIds = useMemo(() => fields.map((field) => field.id), [fields]);
  const fieldMap = useMemo(
    () =>
      fields.reduce<Record<string, Field>>((acc, field) => {
        acc[field.id] = field;
        return acc;
      }, {}),
    [fields],
  );

  const isRealField = (field: Field): boolean => {
    const candidate = field as unknown as {
      id?: unknown;
      pageIndex?: unknown;
      x?: unknown;
      y?: unknown;
      width?: unknown;
      height?: unknown;
    };

    const hasFiniteBounds =
      typeof candidate.x === "number" &&
      Number.isFinite(candidate.x) &&
      typeof candidate.y === "number" &&
      Number.isFinite(candidate.y) &&
      typeof candidate.width === "number" &&
      Number.isFinite(candidate.width) &&
      candidate.width > 0 &&
      typeof candidate.height === "number" &&
      Number.isFinite(candidate.height) &&
      candidate.height > 0;

    return (
      Boolean(candidate) &&
      typeof candidate.id === "string" &&
      candidate.id.trim().length > 0 &&
      typeof candidate.pageIndex === "number" &&
      Number.isFinite(candidate.pageIndex) &&
      hasFiniteBounds
    );
  };

  const filteredVisibleFields = useMemo(
    () =>
      fieldIds
        .map((id) => fieldMap[id])
        .filter((field): field is Field => Boolean(field))
        .filter((field) => {
          if (field.metadata?.hidden) return false;
          if (pdfPages.length > 0) {
            if (field.pageIndex !== null && field.pageIndex !== undefined && field.pageIndex !== currentPdfPage) {
              return false;
            }
          }

          if (!normalizedSearchQuery) return true;

          const searchableText = [
            field.metadata?.acordCode || "",
            field.metadata?.acordLabel || "",
            field.metadata?.semanticLabel || "",
            field.metadata?.categoryMode || "",
            "text" in field ? field.text || "" : "",
            "label" in field ? field.label || "" : "",
            "placeholder" in field ? field.placeholder || "" : "",
            "value" in field ? String(field.value ?? "") : "",
          ]
            .join(" ")
            .toLowerCase();

          return searchableText.includes(normalizedSearchQuery);
        })
        .filter(isRealField),
    [fieldIds, fieldMap, pdfPages.length, currentPdfPage, normalizedSearchQuery],
  );

  const renderedVisibleFields = filteredVisibleFields;

  const visibleDraftFields = draftCanvasFields.filter((field) => {
    if (pdfPages.length === 0) return true;
    if (field.pageIndex === null || field.pageIndex === undefined) return true;
    return field.pageIndex === currentPdfPage;
  });

  const gridLines = useMemo(() => {
    const lines: Array<{ key: string; points: number[] }> = [];

    for (let x = 0; x <= canvasSurfaceWidth; x += GRID_SIZE) {
      lines.push({
        key: `grid-v-${x}`,
        points: [x, 0, x, canvasSurfaceHeight],
      });
    }

    for (let y = 0; y <= canvasSurfaceHeight; y += GRID_SIZE) {
      lines.push({
        key: `grid-h-${y}`,
        points: [0, y, canvasSurfaceWidth, y],
      });
    }

    return lines;
  }, [canvasSurfaceHeight, canvasSurfaceWidth]);

  useEffect(() => {
    const host = canvasHostRef.current;
    if (!host) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      const width = Math.max(1, Math.floor(entry.contentRect.width));
      const height = Math.max(1, Math.floor(entry.contentRect.height));
      onViewportChange({ width, height });
    });

    observer.observe(host);
    return () => observer.disconnect();
  }, [onViewportChange]);

  useEffect(() => {
    if (!pdfUrl) {
      onSelectedPdfSizeChange(null);
    }
  }, [pdfUrl, onSelectedPdfSizeChange]);

  useEffect(() => {
    if (!transformerRef.current) return;

    const nodeList = selectedFields
      .filter((field) => !field.metadata?.locked)
      .map((field) => fieldGroupRefs.current.get(field.id))
      .filter((node) => !!node);

    if (nodeList.length === 0) {
      transformerRef.current.nodes([]);
    } else if (nodeList.length === 1) {
      transformerRef.current.nodes(nodeList);
    } else {
      transformerRef.current.nodes([]);
    }

    transformerRef.current.getLayer()?.batchDraw();
  }, [selectedFields]);

  return (
    <div
      ref={canvasHostRef}
      onWheel={(event) => {
        if (!event.ctrlKey) {
          return;
        }

        event.preventDefault();
        if (event.deltaY < 0) {
          zoomIn();
        } else {
          zoomOut();
        }
      }}
      style={{
        position: "absolute",
        inset: 0,
        overflow: "auto",
      }}
    >
      <div
        style={{
          position: "relative",
          width: canvasSurfaceWidth,
          height: canvasSurfaceHeight,
        }}
      >
        <CanvasStage
          width={canvasSurfaceWidth}
          height={canvasSurfaceHeight}
          onStageReady={onStageReady}
          backgroundChildren={
            <>
              {pdfUrl ? (
                <PdfBackground
                  src={pdfUrl}
                  onLoaded={(size) => onSelectedPdfSizeChange(size)}
                />
              ) : null}
              {showGrid
                ? gridLines.map((line) => (
                    <Line
                      key={line.key}
                      points={line.points}
                      stroke="#e2e8f0"
                      strokeWidth={1}
                      opacity={0.7}
                      listening={false}
                    />
                  ))
                : null}
            </>
          }
          overlayChildren={
            renderedVisibleFields.length > 0 || selectedFields.length > 0 || visibleDraftFields.length > 0 ? (
              <>
                {renderedVisibleFields.map((field: Field) => (
                  <KonvaGroup
                    key={`visual-${field.id}`}
                    ref={(node) => {
                      if (node) fieldGroupRefs.current.set(field.id, node);
                      else fieldGroupRefs.current.delete(field.id);
                    }}
                    x={field.x}
                    y={field.y}
                    rotation={field.rotation ?? 0}
                    opacity={field.opacity ?? 1}
                    draggable={!field.metadata?.locked}
                    listening
                    onClick={(event) => {
                      event.cancelBubble = true;
                      selectField(field.id, Boolean(event.evt.shiftKey));
                    }}
                    onTap={(event) => {
                      event.cancelBubble = true;
                      selectField(field.id, Boolean(event.evt.shiftKey));
                    }}
                    onDragEnd={(event) => {
                      if (field.metadata?.locked) {
                        return;
                      }
                      const updateField = useDesignerStore.getState().updateField;
                      if (updateField) {
                        updateField(field.id, {
                          x: event.target.x(),
                          y: event.target.y(),
                        }, { recordHistory: true });
                      }
                    }}
                  >
                    <FieldRenderer field={field} />
                  </KonvaGroup>
                ))}
                {pdfModalMode !== "map-only" && (
                  <>
                    {visibleDraftFields.map((draft) => {
                      const isSelected = draftSelectedIds.includes(draft.id);
                      return (
                        <KonvaGroup
                          key={`draft-${draft.id}`}
                          x={draft.x}
                          y={draft.y}
                          listening
                          onClick={(event) => {
                            event.cancelBubble = true;
                            toggleDraftSelection(draft.id);
                          }}
                          onTap={(event) => {
                            event.cancelBubble = true;
                            toggleDraftSelection(draft.id);
                          }}
                        >
                          <KonvaRect
                            x={0}
                            y={0}
                            width={Math.max(24, draft.width)}
                            height={Math.max(18, draft.height)}
                            fill={isSelected ? "rgba(251, 191, 36, 0.24)" : "rgba(251, 191, 36, 0.12)"}
                            stroke={isSelected ? "#d97706" : "#f59e0b"}
                            strokeWidth={2}
                            dash={[6, 4]}
                            cornerRadius={3}
                          />
                          <KonvaText
                            x={4}
                            y={3}
                            width={Math.max(0, draft.width - 8)}
                            height={Math.max(0, draft.height - 6)}
                            text={
                              draft.metadata?.acordLabel?.trim() ||
                              draft.metadata?.acordCode?.trim() ||
                              draft.type
                            }
                            fontSize={11}
                            fontFamily="Geist Variable"
                            fill={isSelected ? "#7c2d12" : "#b45309"}
                            verticalAlign="middle"
                            ellipsis
                          />
                        </KonvaGroup>
                      );
                    })}
                    {selectedFields.map((f) => {
                      return <FieldControls key={f.id} field={f} />;
                    })}
                    <Transformer
                      ref={transformerRef}
                      rotateEnabled
                      enabledAnchors={["top-left", "top-center", "top-right", "middle-left", "middle-right", "bottom-left", "bottom-center", "bottom-right"]}
                      boundBoxStrokeWidth={2}
                      anchorStroke="#0ea5e9"
                      anchorFill="#ffffff"
                      anchorSize={8}
                      borderStroke="#0ea5e9"
                      borderStrokeWidth={2}
                      rotateAnchorOffset={30}
                      onTransformEnd={(e) => {
                        const node = e.target;
                        const scaleX = node.scaleX();
                        const scaleY = node.scaleY();

                        if (selectedFields[0]?.metadata?.locked) {
                          node.scaleX(1);
                          node.scaleY(1);
                          return;
                        }

                        node.scaleX(1);
                        node.scaleY(1);

                        const updateField = useDesignerStore.getState().updateField;
                        const selectedField = selectedFields[0];

                        if (updateField && selectedField) {
                          updateField(
                            selectedField.id,
                            {
                              x: node.x(),
                              y: node.y(),
                              width: Math.max(20, node.width() * scaleX),
                              height: Math.max(20, node.height() * scaleY),
                              rotation: node.rotation(),
                            },
                            { recordHistory: true },
                          );

                          node.width(Math.max(20, node.width() * scaleX));
                          node.height(Math.max(20, node.height() * scaleY));
                        }
                      }}
                    />
                  </>
                )}
              </>
            ) : undefined
          }
        />
      </div>

      <ZoomControls zoomIn={zoomIn} zoomOut={zoomOut} reset={resetZoom} fitToPage={fitToPage} />

      {toast && (
        <div
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            zIndex: 20,
            padding: "0.55rem 0.75rem",
            borderRadius: 10,
            border: "1px solid",
            borderColor:
              toast.tone === "success"
                ? "#16a34a"
                : toast.tone === "error"
                  ? "#dc2626"
                  : "#0ea5e9",
            background:
              toast.tone === "success"
                ? "rgba(22, 163, 74, 0.12)"
                : toast.tone === "error"
                  ? "rgba(220, 38, 38, 0.12)"
                  : "rgba(14, 165, 233, 0.12)",
            color: "#0f172a",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {toast.message}
        </div>
      )}

      {showPdfModal && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(15, 23, 42, 0.45)",
            display: "grid",
            placeItems: "center",
            zIndex: 15,
          }}
        >
          <div
            style={{
              width: "min(560px, calc(100% - 2rem))",
              background: "#ffffff",
              borderRadius: 12,
              padding: "1rem",
              boxShadow: "0 16px 50px rgba(0, 0, 0, 0.2)",
            }}
          >
            <PdfImportModal
              mode={pdfModalMode}
              onClose={onClosePdfModal}
              onImportResult={onImportResult}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default DesignerCanvas;
