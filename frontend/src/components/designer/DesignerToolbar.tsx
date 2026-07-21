import { useEffect, useRef, useState } from "react";
import { useDesignerStore } from "../../state/designerStore";

type DesignerToolbarProps = {
  canUndo: boolean;
  canRedo: boolean;
  canGroup: boolean;
  canUngroup: boolean;
  undo: () => void;
  redo: () => void;
  groupSelected: () => void;
  ungroupSelected: () => void;
  saveDesignerState: () => void;
  loadDesignerStateFromFile: (file: File) => Promise<void>;
  exportDesignerJson: () => void;
  handleGenerateUiSchema: () => void;
  handleGenerateJsonSchema: () => void;
  handleExportAcordXml: () => Promise<void>;
  onOpenAutoMapPdf: () => void;
  canAutoMapPdf: boolean;
  lastSavedAt: string | null;
  pdfPagesCount: number;
  currentPdfPage: number;
  setCurrentPdfPage: (page: number) => void;
  fitPdfWidth: () => void;
  fitPdfPage: () => void;
  hasSelectedPdfSize: boolean;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  showGrid: boolean;
  snapToGrid: boolean;
  setShowGrid: (show: boolean) => void;
  setSnapToGrid: (snap: boolean) => void;
};

const menuStyle: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% + 6px)",
  left: 0,
  minWidth: 210,
  display: "flex",
  flexDirection: "column",
  gap: 6,
  padding: "0.55rem",
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  background: "#ffffff",
  boxShadow: "0 12px 28px rgba(15, 23, 42, 0.12)",
  zIndex: 30,
};

const menuTriggerStyle: React.CSSProperties = {
  border: "none",
  background: "transparent",
  color: "#0f172a",
  fontSize: 13,
  fontWeight: 600,
  padding: "0.35rem 0.5rem",
  borderRadius: 8,
  cursor: "pointer",
};

const menuItemStyle: React.CSSProperties = {
  border: "none",
  background: "#ffffff",
  color: "#0f172a",
  borderRadius: 8,
  textAlign: "left",
  padding: "0.4rem 0.5rem",
  cursor: "pointer",
  fontSize: 13,
};

export function DesignerToolbar({
  canUndo,
  canRedo,
  canGroup,
  canUngroup,
  undo,
  redo,
  groupSelected,
  ungroupSelected,
  saveDesignerState,
  loadDesignerStateFromFile,
  exportDesignerJson,
  handleGenerateUiSchema,
  handleGenerateJsonSchema,
  handleExportAcordXml,
  onOpenAutoMapPdf,
  canAutoMapPdf,
  lastSavedAt,
  pdfPagesCount,
  currentPdfPage,
  setCurrentPdfPage,
  fitPdfWidth,
  fitPdfPage,
  hasSelectedPdfSize,
  zoomIn,
  zoomOut,
  resetZoom,
  showGrid,
  snapToGrid,
  setShowGrid,
  setSnapToGrid,
}: DesignerToolbarProps) {
  const menuRootRef = useRef<HTMLDivElement | null>(null);
  const loadFileInputRef = useRef<HTMLInputElement | null>(null);
  const [showFileMenu, setShowFileMenu] = useState(false);
  const [showToolsMenu, setShowToolsMenu] = useState(false);
  const [showViewMenu, setShowViewMenu] = useState(false);
  const [showDesignMenu, setShowDesignMenu] = useState(false);

  const addField = useDesignerStore((s) => s.addField);
  const selectField = useDesignerStore((s) => s.selectField);
  const selectFields = useDesignerStore((s) => s.selectFields);
  const selectedIds = useDesignerStore((s) => s.selectedIds);
  const fields = useDesignerStore((s) => s.fields);
  const updateField = useDesignerStore((s) => s.updateField);
  const moveFieldLayer = useDesignerStore((s) => s.moveFieldLayer);
  const canvasCursor = useDesignerStore((s) => s.canvasCursor);

  const getSpawnPoint = () => ({
    x: Math.round(canvasCursor?.x ?? 100),
    y: Math.round(canvasCursor?.y ?? 100),
  });

  const selectLastField = () => {
    setTimeout(() => {
      const fields = useDesignerStore.getState().fields;
      if (fields.length > 0) {
        selectField(fields[fields.length - 1].id);
      }
    }, 0);
  };

  const addTextField = () => {
    const spawn = getSpawnPoint();
    addField({
      type: "text",
      x: spawn.x,
      y: spawn.y,
      width: 300,
      height: 30,
      rotation: 0,
      opacity: 1,
      text: "New Text",
      fontSize: 20,
      fontFamily: "Geist Variable",
      textAlign: "left",
      color: "#000000",
      stroke: "#1e293b",
      strokeWidth: 0,
    });
    selectLastField();
  };

  const addCheckboxField = () => {
    const spawn = getSpawnPoint();
    addField({
      type: "checkbox",
      x: spawn.x,
      y: spawn.y,
      width: 180,
      height: 28,
      rotation: 0,
      opacity: 1,
      stroke: "#1e293b",
      strokeWidth: 1,
      fill: "#ffffff",
      checked: false,
      label: "Checkbox",
    });
    selectLastField();
  };

  const addDropdownField = () => {
    const spawn = getSpawnPoint();
    addField({
      type: "dropdown",
      x: spawn.x,
      y: spawn.y,
      width: 240,
      height: 34,
      rotation: 0,
      opacity: 1,
      stroke: "#1e293b",
      strokeWidth: 1,
      fill: "#ffffff",
      options: ["Option 1", "Option 2", "Option 3"],
      selectedOption: "",
      placeholder: "Select option",
      openPreview: false,
    });
    selectLastField();
  };

  const addDateField = () => {
    const spawn = getSpawnPoint();
    addField({
      type: "date",
      x: spawn.x,
      y: spawn.y,
      width: 220,
      height: 34,
      rotation: 0,
      opacity: 1,
      stroke: "#1e293b",
      strokeWidth: 1,
      fill: "#ffffff",
      dateFormat: "MM/DD/YYYY",
      value: "",
      placeholder: "Pick a date",
    });
    selectLastField();
  };

  const addNumericField = () => {
    const spawn = getSpawnPoint();
    addField({
      type: "numeric",
      x: spawn.x,
      y: spawn.y,
      width: 180,
      height: 34,
      rotation: 0,
      opacity: 1,
      stroke: "#1e293b",
      strokeWidth: 1,
      fill: "#ffffff",
      min: 0,
      max: 100,
      step: 1,
      value: null,
      placeholder: "0",
    });
    selectLastField();
  };

  const addSignatureField = () => {
    const spawn = getSpawnPoint();
    addField({
      type: "signature",
      x: spawn.x,
      y: spawn.y,
      width: 260,
      height: 90,
      rotation: 0,
      opacity: 1,
      stroke: "#1e293b",
      strokeWidth: 1,
      fill: "#ffffff",
      placeholder: "Sign here",
      signed: false,
      showStrokePreview: false,
    });
    selectLastField();
  };

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (menuRootRef.current?.contains(target)) return;
      setShowFileMenu(false);
      setShowToolsMenu(false);
      setShowViewMenu(false);
      setShowDesignMenu(false);
    };

    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, []);

  const closeMenus = () => {
    setShowFileMenu(false);
    setShowToolsMenu(false);
    setShowViewMenu(false);
    setShowDesignMenu(false);
  };

  const onItemHover = (event: React.MouseEvent<HTMLElement>, active: boolean) => {
    event.currentTarget.style.background = active ? "#f1f5f9" : "#ffffff";
  };

  const handleLoadFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    await loadDesignerStateFromFile(file);
    event.currentTarget.value = "";
  };

  const duplicateSelection = () => {
    if (selectedIds.length === 0) return;

    const selectedSet = new Set(selectedIds);
    const ordered = fields.filter((field) => selectedSet.has(field.id));
    const nextIds: string[] = [];

    for (const field of ordered) {
      const { id: _ignoredId, ...draft } = field;
      const createdId = addField({
        ...(draft as any),
        x: field.x + 14,
        y: field.y + 14,
      });
      nextIds.push(createdId);
    }

    if (nextIds.length > 0) {
      selectFields(nextIds);
    }
  };

  const toggleSelectionLock = () => {
    if (selectedIds.length === 0) return;
    const selectedSet = new Set(selectedIds);
    const selectedFields = fields.filter((field) => selectedSet.has(field.id));
    const shouldLock = selectedFields.some((field) => !field.metadata?.locked);

    for (const field of selectedFields) {
      updateField(field.id, {
        metadata: {
          ...(field.metadata || {}),
          locked: shouldLock,
        },
      });
    }
  };

  const toggleSelectionHidden = () => {
    if (selectedIds.length === 0) return;
    const selectedSet = new Set(selectedIds);
    const selectedFields = fields.filter((field) => selectedSet.has(field.id));
    const shouldHide = selectedFields.some((field) => !field.metadata?.hidden);

    for (const field of selectedFields) {
      updateField(field.id, {
        metadata: {
          ...(field.metadata || {}),
          hidden: shouldHide,
        },
      });
    }
  };

  const moveSelectionLayer = (direction: "forward" | "backward") => {
    if (selectedIds.length === 0) return;
    const ids = direction === "forward" ? [...selectedIds] : [...selectedIds].reverse();
    for (const id of ids) {
      moveFieldLayer(id, direction);
    }
  };

  return (
    <div
      ref={menuRootRef}
      style={{
        display: "flex",
        flexWrap: "nowrap",
        alignItems: "center",
        gap: 8,
        position: "relative",
      }}
    >
      <div style={{ position: "relative" }}>
        <button
          type="button"
          style={menuTriggerStyle}
          onClick={() => {
            setShowFileMenu((v) => !v);
            setShowToolsMenu(false);
            setShowViewMenu(false);
            setShowDesignMenu(false);
          }}
        >
          File
        </button>
        {showFileMenu && (
          <div style={menuStyle}>
            <button
              type="button"
              style={menuItemStyle}
              onMouseEnter={(e) => onItemHover(e, true)}
              onMouseLeave={(e) => onItemHover(e, false)}
              onClick={() => {
                loadFileInputRef.current?.click();
                closeMenus();
              }}
            >
              Load State JSON
            </button>
            <button
              type="button"
              style={menuItemStyle}
              onMouseEnter={(e) => onItemHover(e, true)}
              onMouseLeave={(e) => onItemHover(e, false)}
              onClick={() => {
                saveDesignerState();
                closeMenus();
              }}
            >
              Save
            </button>
            <button
              type="button"
              style={menuItemStyle}
              onMouseEnter={(e) => onItemHover(e, true)}
              onMouseLeave={(e) => onItemHover(e, false)}
              onClick={() => {
                exportDesignerJson();
                closeMenus();
              }}
            >
              Export JSON
            </button>
            <button
              type="button"
              style={menuItemStyle}
              onMouseEnter={(e) => onItemHover(e, true)}
              onMouseLeave={(e) => onItemHover(e, false)}
              onClick={() => {
                void handleExportAcordXml();
                closeMenus();
              }}
            >
              Export ACORD XML
            </button>
          </div>
        )}
      </div>

      <input
        ref={loadFileInputRef}
        type="file"
        accept=".json"
        style={{ display: "none" }}
        onChange={(event) => {
          void handleLoadFileChange(event);
        }}
      />

      <div style={{ position: "relative" }}>
        <button
          type="button"
          style={menuTriggerStyle}
          onClick={() => {
            setShowToolsMenu((v) => !v);
            setShowFileMenu(false);
            setShowViewMenu(false);
            setShowDesignMenu(false);
          }}
        >
          Tools
        </button>
        {showToolsMenu && (
          <div style={menuStyle}>
            <button
              type="button"
              style={menuItemStyle}
              onMouseEnter={(e) => onItemHover(e, true)}
              onMouseLeave={(e) => onItemHover(e, false)}
              onClick={() => {
                onOpenAutoMapPdf();
                closeMenus();
              }}
              disabled={!canAutoMapPdf}
            >
              Auto-map PDF
            </button>
            <button
              type="button"
              style={menuItemStyle}
              onMouseEnter={(e) => onItemHover(e, true)}
              onMouseLeave={(e) => onItemHover(e, false)}
              onClick={() => {
                handleGenerateUiSchema();
                closeMenus();
              }}
            >
              Generate UI Schema
            </button>
            <button
              type="button"
              style={menuItemStyle}
              onMouseEnter={(e) => onItemHover(e, true)}
              onMouseLeave={(e) => onItemHover(e, false)}
              onClick={() => {
                handleGenerateJsonSchema();
                closeMenus();
              }}
            >
              Generate JSON Schema
            </button>
          </div>
        )}
      </div>

      <div style={{ position: "relative" }}>
        <button
          type="button"
          style={menuTriggerStyle}
          onClick={() => {
            setShowViewMenu((v) => !v);
            setShowFileMenu(false);
            setShowToolsMenu(false);
            setShowDesignMenu(false);
          }}
        >
          View
        </button>
        {showViewMenu && (
          <div style={menuStyle}>
            <button
              type="button"
              style={menuItemStyle}
              onMouseEnter={(e) => onItemHover(e, true)}
              onMouseLeave={(e) => onItemHover(e, false)}
              onClick={() => {
                zoomIn();
                closeMenus();
              }}
            >
              Zoom In
            </button>
            <button
              type="button"
              style={menuItemStyle}
              onMouseEnter={(e) => onItemHover(e, true)}
              onMouseLeave={(e) => onItemHover(e, false)}
              onClick={() => {
                zoomOut();
                closeMenus();
              }}
            >
              Zoom Out
            </button>
            <button
              type="button"
              style={menuItemStyle}
              onMouseEnter={(e) => onItemHover(e, true)}
              onMouseLeave={(e) => onItemHover(e, false)}
              onClick={() => {
                resetZoom();
                closeMenus();
              }}
            >
              Reset Zoom
            </button>
            <button
              type="button"
              style={menuItemStyle}
              onMouseEnter={(e) => onItemHover(e, true)}
              onMouseLeave={(e) => onItemHover(e, false)}
              onClick={() => {
                fitPdfWidth();
                closeMenus();
              }}
              disabled={!hasSelectedPdfSize}
            >
              Fit to Width
            </button>
            <button
              type="button"
              style={menuItemStyle}
              onMouseEnter={(e) => onItemHover(e, true)}
              onMouseLeave={(e) => onItemHover(e, false)}
              onClick={() => {
                fitPdfPage();
                closeMenus();
              }}
              disabled={!hasSelectedPdfSize}
            >
              Fit to Page
            </button>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "0.4rem 0.5rem",
                borderRadius: 8,
                cursor: "pointer",
              }}
              onMouseEnter={(e) => onItemHover(e, true)}
              onMouseLeave={(e) => onItemHover(e, false)}
            >
              <input
                type="checkbox"
                checked={showGrid}
                onChange={(e) => setShowGrid(e.target.checked)}
              />
              Show Grid
            </label>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "0.4rem 0.5rem",
                borderRadius: 8,
                cursor: "pointer",
              }}
              onMouseEnter={(e) => onItemHover(e, true)}
              onMouseLeave={(e) => onItemHover(e, false)}
            >
              <input
                type="checkbox"
                checked={snapToGrid}
                onChange={(e) => setSnapToGrid(e.target.checked)}
              />
              Snap to Grid
            </label>
          </div>
        )}
      </div>

      <div style={{ position: "relative" }}>
        <button
          type="button"
          style={menuTriggerStyle}
          onClick={() => {
            setShowDesignMenu((v) => !v);
            setShowFileMenu(false);
            setShowToolsMenu(false);
            setShowViewMenu(false);
          }}
        >
          Design
        </button>
        {showDesignMenu && (
          <div style={menuStyle}>
            <button
              type="button"
              style={menuItemStyle}
              onMouseEnter={(e) => onItemHover(e, true)}
              onMouseLeave={(e) => onItemHover(e, false)}
              onClick={() => {
                duplicateSelection();
                closeMenus();
              }}
              disabled={selectedIds.length === 0}
            >
              Duplicate Selection
            </button>
            <button
              type="button"
              style={menuItemStyle}
              onMouseEnter={(e) => onItemHover(e, true)}
              onMouseLeave={(e) => onItemHover(e, false)}
              onClick={() => {
                toggleSelectionLock();
                closeMenus();
              }}
              disabled={selectedIds.length === 0}
            >
              Lock or Unlock Selection
            </button>
            <button
              type="button"
              style={menuItemStyle}
              onMouseEnter={(e) => onItemHover(e, true)}
              onMouseLeave={(e) => onItemHover(e, false)}
              onClick={() => {
                toggleSelectionHidden();
                closeMenus();
              }}
              disabled={selectedIds.length === 0}
            >
              Hide or Show Selection
            </button>
            <button
              type="button"
              style={menuItemStyle}
              onMouseEnter={(e) => onItemHover(e, true)}
              onMouseLeave={(e) => onItemHover(e, false)}
              onClick={() => {
                moveSelectionLayer("forward");
                closeMenus();
              }}
              disabled={selectedIds.length === 0}
            >
              Bring Forward
            </button>
            <button
              type="button"
              style={menuItemStyle}
              onMouseEnter={(e) => onItemHover(e, true)}
              onMouseLeave={(e) => onItemHover(e, false)}
              onClick={() => {
                moveSelectionLayer("backward");
                closeMenus();
              }}
              disabled={selectedIds.length === 0}
            >
              Send Backward
            </button>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "0.4rem 0.5rem",
                borderRadius: 8,
                cursor: "pointer",
              }}
              onMouseEnter={(e) => onItemHover(e, true)}
              onMouseLeave={(e) => onItemHover(e, false)}
            >
              <input
                type="checkbox"
                checked={snapToGrid}
                onChange={(e) => setSnapToGrid(e.target.checked)}
              />
              Snap to Grid
            </label>
          </div>
        )}
      </div>

      <button onClick={zoomOut} title="Zoom out">
        Zoom -
      </button>
      <button onClick={zoomIn} title="Zoom in">
        Zoom +
      </button>
      <button onClick={resetZoom} title="Reset zoom">
        Reset Zoom
      </button>
      <button onClick={fitPdfWidth} disabled={!hasSelectedPdfSize} title="Fit document to viewport width">
        Fit Width
      </button>
      <button onClick={fitPdfPage} disabled={!hasSelectedPdfSize} title="Fit full page in viewport">
        Fit Page
      </button>

      <button onClick={undo} disabled={!canUndo} title="Ctrl+Z">
        Undo
      </button>
      <button onClick={redo} disabled={!canRedo} title="Ctrl+Shift+Z or Ctrl+Y">
        Redo
      </button>

      <button onClick={addTextField} title="Create text field">
        Text field
      </button>
      <button onClick={addCheckboxField} title="Create checkbox field">
        Checkbox
      </button>
      <button onClick={addDropdownField} title="Create dropdown field">
        Dropdown
      </button>
      <button onClick={addDateField} title="Create date field">
        Date
      </button>
      <button onClick={addNumericField} title="Create numeric field">
        Numeric
      </button>
      <button onClick={addSignatureField} title="Create signature field">
        Signature
      </button>

      <button onClick={groupSelected} disabled={!canGroup} title="Ctrl+G">
        Group
      </button>
      <button onClick={ungroupSelected} disabled={!canUngroup} title="Ctrl+Shift+G">
        Ungroup
      </button>

      <span style={{ color: "#0f172a", fontSize: 12, marginLeft: 6 }}>
        {lastSavedAt ? `Last saved: ${new Date(lastSavedAt).toLocaleTimeString()}` : "Last saved: never"}
      </span>

      <span style={{ marginLeft: 8, color: "#94a3b8" }}>|</span>
      <span style={{ color: "#0f172a", fontWeight: 600, fontSize: 13 }}>
        {pdfPagesCount > 0
          ? `PDF loaded • page ${currentPdfPage + 1} of ${pdfPagesCount}`
          : "No PDF loaded"}
      </span>
    </div>
  );
}

export default DesignerToolbar;
