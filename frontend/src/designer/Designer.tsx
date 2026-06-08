import { useCallback, useEffect, useRef, useState } from "react";
import { CanvasStage } from "../canvas/CanvasStage";
import { Toolbox } from "./toolbox/Toolbox";
import { PropertiesPanel } from "./properties/PropertiesPanel";
import ZoomControls from "./controls/ZoomControls";
import { DesignerLayout } from "./layout/DesignerLayout";
import PdfImportModal from "./ai/PdfImportModal";
import {
  type DesignerSerializableState,
  useDesignerStore,
} from "./state/useDesignerStore";

const DESIGNER_STORAGE_KEY = "designerState";

type PersistedDesignerState = {
  version: 1;
  savedAt: string;
  designer: DesignerSerializableState;
  view: {
    scale: number;
    x: number;
    y: number;
  };
};

type DesignerToast = {
  message: string;
  tone: "success" | "error" | "info";
};

type StageLike = {
  scaleX: () => number;
  scale: (value: { x: number; y: number }) => void;
  position: (value: { x: number; y: number }) => void;
  x: () => number;
  y: () => number;
  batchDraw: () => void;
};

export function Designer() {
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);
  const [stage, setStage] = useState<StageLike | null>(null);
  const [selectedPdfSize, setSelectedPdfSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [pdfModalMode, setPdfModalMode] = useState<"import" | "map-only">(
    "import",
  );
  const [viewport, setViewport] = useState({ width: 900, height: 700 });
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [toast, setToast] = useState<DesignerToast | null>(null);
  const [pendingView, setPendingView] = useState<{
    scale: number;
    x: number;
    y: number;
  } | null>(null);
  const [isCompactToolbar, setIsCompactToolbar] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const toastTimerRef = useRef<number | null>(null);
  const pdfPages = useDesignerStore((s) => s.pdfPages);
  const currentPdfPage = useDesignerStore((s) => s.currentPdfPage);
  const setCurrentPdfPage = useDesignerStore((s) => s.setCurrentPdfPage);
  const deleteSelectedField = useDesignerStore((s) => s.deleteSelectedField);
  const undo = useDesignerStore((s) => s.undo);
  const redo = useDesignerStore((s) => s.redo);
  const canUndo = useDesignerStore((s) => s.canUndo);
  const canRedo = useDesignerStore((s) => s.canRedo);
  const selectedIds = useDesignerStore((s) => s.selectedIds);
  const selectedGroupId = useDesignerStore((s) => s.selectedGroupId);
  const groupSelected = useDesignerStore((s) => s.groupSelected);
  const ungroupSelected = useDesignerStore((s) => s.ungroupSelected);

  const canGroup = selectedIds.length > 1 && !selectedGroupId;
  const canUngroup = Boolean(selectedGroupId);

  useEffect(() => {
    const syncCompactMode = () => {
      setIsCompactToolbar(window.innerWidth < 1360);
    };

    syncCompactMode();
    window.addEventListener("resize", syncCompactMode);
    return () => window.removeEventListener("resize", syncCompactMode);
  }, []);

  useEffect(() => {
    if (!isCompactToolbar) {
      setShowMoreMenu(false);
    }
  }, [isCompactToolbar]);

  useEffect(() => {
    if (!showMoreMenu) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (moreMenuRef.current?.contains(target)) return;
      setShowMoreMenu(false);
    };

    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [showMoreMenu]);

  const showToast = useCallback((message: string, tone: DesignerToast["tone"]) => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }

    setToast({ message, tone });
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 2200);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const normalizePersistedPayload = useCallback((raw: unknown) => {
    if (!raw || typeof raw !== "object") {
      return null;
    }

    const parsed = raw as Record<string, unknown>;

    // Current shape: { version, savedAt, designer, view }
    if (parsed.designer && typeof parsed.designer === "object") {
      const viewObj =
        parsed.view && typeof parsed.view === "object"
          ? (parsed.view as Record<string, unknown>)
          : null;

      return {
        designer: parsed.designer as DesignerSerializableState,
        savedAt:
          typeof parsed.savedAt === "string" && parsed.savedAt
            ? parsed.savedAt
            : null,
        view: {
          scale:
            typeof viewObj?.scale === "number" && Number.isFinite(viewObj.scale)
              ? viewObj.scale
              : 1,
          x:
            typeof viewObj?.x === "number" && Number.isFinite(viewObj.x)
              ? viewObj.x
              : 0,
          y:
            typeof viewObj?.y === "number" && Number.isFinite(viewObj.y)
              ? viewObj.y
              : 0,
        },
      };
    }

    // Legacy shape: direct serialized designer state in root.
    if (Array.isArray(parsed.fields) && Array.isArray(parsed.groups)) {
      return {
        designer: parsed as unknown as DesignerSerializableState,
        savedAt: null,
        view: { scale: 1, x: 0, y: 0 },
      };
    }

    return null;
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DESIGNER_STORAGE_KEY);
      if (!raw) return;
      const normalized = normalizePersistedPayload(JSON.parse(raw));
      if (normalized?.savedAt) {
        setLastSavedAt(normalized.savedAt);
      }
    } catch {
      // Ignore malformed persisted payload on initial render.
    }
  }, [normalizePersistedPayload]);

  const applyViewState = useCallback(
    (view: { scale: number; x: number; y: number }) => {
      if (!stage) {
        setPendingView(view);
        return;
      }

      const scale = Math.min(4, Math.max(0.25, view.scale || 1));
      stage.scale({ x: scale, y: scale });
      stage.position({ x: view.x || 0, y: view.y || 0 });
      stage.batchDraw();
    },
    [stage],
  );

  useEffect(() => {
    if (!stage || !pendingView) return;
    applyViewState(pendingView);
    setPendingView(null);
  }, [applyViewState, pendingView, stage]);

  const getPersistedState = useCallback((): PersistedDesignerState => {
    const storeState = useDesignerStore.getState().getSerializableState();
    return {
      version: 1,
      savedAt: new Date().toISOString(),
      designer: storeState,
      view: {
        scale: stage?.scaleX() ?? 1,
        x: stage?.x() ?? 0,
        y: stage?.y() ?? 0,
      },
    };
  }, [stage]);

  const saveDesignerState = useCallback(() => {
    try {
      const payload = getPersistedState();
      localStorage.setItem(DESIGNER_STORAGE_KEY, JSON.stringify(payload));
      setLastSavedAt(payload.savedAt);
      showToast("Saved to local storage", "success");
    } catch (error) {
      console.error("Failed to save designer state", error);
      showToast("Save failed", "error");
    }
  }, [getPersistedState, showToast]);

  const loadDesignerState = useCallback(() => {
    try {
      const raw = localStorage.getItem(DESIGNER_STORAGE_KEY);
      if (!raw) {
        showToast("No saved state found", "info");
        return;
      }

      const parsed = JSON.parse(raw) as unknown;
      const normalized = normalizePersistedPayload(parsed);

      if (!normalized) {
        showToast("Saved state format is invalid", "error");
        return;
      }

      useDesignerStore.getState().loadSerializableState(normalized.designer);
      applyViewState(normalized.view);
      if (normalized.savedAt) {
        setLastSavedAt(normalized.savedAt);
      }
      showToast("Loaded saved state", "success");
    } catch (error) {
      console.error("Failed to load designer state", error);
      showToast("Load failed", "error");
    }
  }, [applyViewState, normalizePersistedPayload, showToast]);

  const exportDesignerJson = useCallback(() => {
    try {
      const payload = getPersistedState();
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `designer-state-${Date.now()}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast("Exported JSON file", "success");
    } catch (error) {
      console.error("Failed to export designer state", error);
      showToast("Export failed", "error");
    }
  }, [getPersistedState, showToast]);

  const handleSelectedPdfSizeChange = useCallback(
    (size: { width: number; height: number } | null) => {
      setSelectedPdfSize((prev) => {
        if (!prev && !size) return prev;
        if (!prev || !size) return size;
        if (prev.width === size.width && prev.height === size.height) {
          return prev;
        }

        return size;
      });
    },
    [],
  );

  useEffect(() => {
    const handleDesignerShortcuts = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isEditable =
        tag === "input" ||
        tag === "textarea" ||
        target?.isContentEditable === true;

      const key = event.key.toLowerCase();
      const hasModifier = event.ctrlKey || event.metaKey;
      const isUndo = hasModifier && !event.shiftKey && key === "z";
      const isRedo = hasModifier && ((event.shiftKey && key === "z") || key === "y");
      const isGroup = hasModifier && !event.shiftKey && key === "g";
      const isUngroup = hasModifier && event.shiftKey && key === "g";

      if (!isEditable && isUndo) {
        event.preventDefault();
        undo();
        return;
      }

      if (!isEditable && isRedo) {
        event.preventDefault();
        redo();
        return;
      }

      if (!isEditable && isGroup) {
        event.preventDefault();
        groupSelected();
        return;
      }

      if (!isEditable && isUngroup) {
        event.preventDefault();
        ungroupSelected();
        return;
      }

      if (isEditable) return;

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteSelectedField();
      }
    };

    window.addEventListener("keydown", handleDesignerShortcuts);
    return () => window.removeEventListener("keydown", handleDesignerShortcuts);
  }, [deleteSelectedField, groupSelected, redo, undo, ungroupSelected]);

  useEffect(() => {
    const host = canvasHostRef.current;
    if (!host) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      const width = Math.max(1, Math.floor(entry.contentRect.width));
      const height = Math.max(1, Math.floor(entry.contentRect.height));
      setViewport({ width, height });
    });

    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const applyZoomFactor = (factor: number) => {
    if (!stage) return;

    const oldScale = stage.scaleX();
    const targetScale = Math.min(4, Math.max(0.25, oldScale * factor));
    const center = { x: viewport.width / 2, y: viewport.height / 2 };

    const pointTo = {
      x: (center.x - stage.x()) / oldScale,
      y: (center.y - stage.y()) / oldScale,
    };

    stage.scale({ x: targetScale, y: targetScale });
    stage.position({
      x: center.x - pointTo.x * targetScale,
      y: center.y - pointTo.y * targetScale,
    });
    stage.batchDraw();
  };

  const zoomIn = () => {
    applyZoomFactor(1.1);
  };

  const zoomOut = () => {
    applyZoomFactor(1 / 1.1);
  };

  const resetZoom = () => {
    if (!stage) return;
    stage.scale({ x: 1, y: 1 });
    stage.position({ x: 0, y: 0 });
    stage.batchDraw();
  };

  const fitPdfWidth = () => {
    if (!stage || !selectedPdfSize) return;

    const scale = Math.min(4, Math.max(0.25, viewport.width / selectedPdfSize.width));
    const targetX = 0;
    const targetY = Math.max(
      0,
      (viewport.height - selectedPdfSize.height * scale) / 2,
    );

    stage.scale({ x: scale, y: scale });
    stage.position({ x: targetX, y: targetY });
    stage.batchDraw();
  };

  const fitPdfPage = () => {
    if (!stage || !selectedPdfSize) return;

    const scaleX = viewport.width / selectedPdfSize.width;
    const scaleY = viewport.height / selectedPdfSize.height;
    const scale = Math.min(4, Math.max(0.25, Math.min(scaleX, scaleY)));
    const targetX = (viewport.width - selectedPdfSize.width * scale) / 2;
    const targetY = (viewport.height - selectedPdfSize.height * scale) / 2;

    stage.scale({ x: scale, y: scale });
    stage.position({ x: targetX, y: targetY });
    stage.batchDraw();
  };

  const canvasSurfaceWidth = Math.max(
    viewport.width,
    Math.ceil((selectedPdfSize?.width ?? viewport.width) + 64),
  );
  const canvasSurfaceHeight = Math.max(
    viewport.height,
    Math.ceil((selectedPdfSize?.height ?? viewport.height) + 64),
  );

  return (
    <DesignerLayout
      sidebar={
        <Toolbox
          onImportPdf={() => {
            setPdfModalMode("import");
            setShowPdfModal(true);
          }}
        />
      }
      properties={<PropertiesPanel />}
      topBar={
        <div
          style={{
            display: "flex",
            flexWrap: "nowrap",
            alignItems: "center",
            gap: 8,
            position: "relative",
          }}
        >
          <button onClick={undo} disabled={!canUndo} title="Ctrl+Z">
            Undo
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            title="Ctrl+Shift+Z or Ctrl+Y"
          >
            Redo
          </button>
          <button onClick={groupSelected} disabled={!canGroup} title="Ctrl+G">
            Group
          </button>
          <button
            onClick={ungroupSelected}
            disabled={!canUngroup}
            title="Ctrl+Shift+G"
          >
            Ungroup
          </button>
          <button onClick={saveDesignerState} title="Save to localStorage">
            Save
          </button>
          <button
            onClick={() => {
              setPdfModalMode("map-only");
              setShowPdfModal(true);
            }}
            disabled={pdfPages.length === 0}
            title={
              pdfPages.length === 0
                ? "Import a PDF first"
                : "Run ACORD auto-mapping from a PDF"
            }
          >
            Auto-map PDF
          </button>

          {!isCompactToolbar && (
            <>
              <button onClick={loadDesignerState} title="Load from localStorage">
                Load
              </button>
              <button
                onClick={exportDesignerJson}
                title="Download current JSON"
              >
                Export JSON
              </button>
            </>
          )}

          {isCompactToolbar && (
            <div ref={moreMenuRef} style={{ position: "relative" }}>
              <button onClick={() => setShowMoreMenu((open) => !open)}>
                More
              </button>
              {showMoreMenu && (
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 6px)",
                    right: 0,
                    minWidth: 220,
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    padding: "0.55rem",
                    borderRadius: 10,
                    border: "1px solid #cbd5e1",
                    background: "#ffffff",
                    boxShadow: "0 12px 28px rgba(15, 23, 42, 0.12)",
                    zIndex: 30,
                  }}
                >
                  <button
                    onClick={() => {
                      loadDesignerState();
                      setShowMoreMenu(false);
                    }}
                    title="Load from localStorage"
                  >
                    Load
                  </button>
                  <button
                    onClick={() => {
                      exportDesignerJson();
                      setShowMoreMenu(false);
                    }}
                    title="Download current JSON"
                  >
                    Export JSON
                  </button>
                  <span
                    style={{
                      marginTop: 4,
                      marginBottom: 2,
                      color: "#64748b",
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: "uppercase",
                    }}
                  >
                    PDF
                  </span>
                  <button
                    onClick={() => {
                      setCurrentPdfPage(currentPdfPage - 1);
                      setShowMoreMenu(false);
                    }}
                    disabled={currentPdfPage <= 0 || pdfPages.length === 0}
                  >
                    Prev Page
                  </button>
                  <button
                    onClick={() => {
                      setCurrentPdfPage(currentPdfPage + 1);
                      setShowMoreMenu(false);
                    }}
                    disabled={
                      pdfPages.length === 0 ||
                      currentPdfPage >= pdfPages.length - 1
                    }
                  >
                    Next Page
                  </button>
                  <button
                    onClick={() => {
                      fitPdfWidth();
                      setShowMoreMenu(false);
                    }}
                    disabled={!selectedPdfSize}
                  >
                    Fit Width
                  </button>
                  <button
                    onClick={() => {
                      fitPdfPage();
                      setShowMoreMenu(false);
                    }}
                    disabled={!selectedPdfSize}
                  >
                    Fit Page
                  </button>
                </div>
              )}
            </div>
          )}

          <span style={{ color: "#0f172a", fontSize: 12, marginLeft: 6 }}>
            {lastSavedAt
              ? `Last saved: ${new Date(lastSavedAt).toLocaleTimeString()}`
              : "Last saved: never"}
          </span>

          {!isCompactToolbar && (
            <>
              <span style={{ marginLeft: 8, color: "#94a3b8" }}>|</span>

              <span
                style={{ color: "#0f172a", fontWeight: 600, fontSize: 13 }}
              >
                {pdfPages.length > 0
                  ? `PDF loaded • page ${currentPdfPage + 1} of ${pdfPages.length}`
                  : "No PDF loaded"}
              </span>

              {pdfPages.length > 0 && (
                <>
                  <button
                    onClick={() => setCurrentPdfPage(currentPdfPage - 1)}
                    disabled={currentPdfPage <= 0}
                  >
                    Prev
                  </button>
                  <button
                    onClick={() => setCurrentPdfPage(currentPdfPage + 1)}
                    disabled={currentPdfPage >= pdfPages.length - 1}
                  >
                    Next
                  </button>
                  <button onClick={fitPdfWidth} disabled={!selectedPdfSize}>
                    Fit Width
                  </button>
                  <button onClick={fitPdfPage} disabled={!selectedPdfSize}>
                    Fit Page
                  </button>
                </>
              )}
            </>
          )}
          {isCompactToolbar && pdfPages.length > 0 && (
            <span style={{ color: "#0f172a", fontWeight: 600, fontSize: 12 }}>
              Page {currentPdfPage + 1} / {pdfPages.length}
            </span>
          )}
        </div>
      }
    >
      <div
        ref={canvasHostRef}
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
            onStageReady={setStage}
            onSelectedPdfSizeChange={handleSelectedPdfSizeChange}
          />
        </div>

        <ZoomControls zoomIn={zoomIn} zoomOut={zoomOut} reset={resetZoom} />

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
                onClose={() => setShowPdfModal(false)}
                onImportResult={(result) => {
                  if (result.warning) {
                    showToast(result.warning, "info");
                    return;
                  }

                  if (result.mappedFields > 0) {
                    showToast(
                      `Imported ${result.importedPages} page(s) and mapped ${result.mappedFields} field(s)`,
                      "success",
                    );
                    return;
                  }

                  showToast(
                    `Imported ${result.importedPages} page(s). No mappable OCR text found.`,
                    "info",
                  );
                }}
              />
            </div>
          </div>
        )}
      </div>
    </DesignerLayout>
  );
}
