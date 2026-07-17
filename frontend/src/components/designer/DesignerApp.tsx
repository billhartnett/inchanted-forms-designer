import { useCallback, useEffect, useRef, useState } from "react";
import type { MappingPersistencePayload } from "../../../../shared/src/types";
import { getDefaultOntologyMetadata } from "../../../../shared/src/acord/ontology";
import { DesignerLayout } from "../../designer/layout/DesignerLayout";
import DesignerCanvas from "./DesignerCanvas";
import DesignerLayersPanel from "./DesignerLayersPanel";
import DesignerPageStrip from "./DesignerPageStrip";
import DesignerRightPanel from "./DesignerRightPanel";
import DesignerToolbar from "./DesignerToolbar";
import { useExtractionStore } from "../../state/extractionStore";
import { useMappingStore } from "../../state/mappingStore";
import {
  generateAcordXml,
  generateJsonSchema,
  generateUiSchema,
} from "../../schema";
import {
  type DesignerSerializableState,
  useDesignerStore,
} from "../../designer/state/useDesignerStore";
import { runExportAcordXml } from "../../api/wave9Integration";

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

export function DesignerApp() {
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
  const toastTimerRef = useRef<number | null>(null);
  const pdfPages = useDesignerStore((s) => s.pdfPages);
  const currentPdfPage = useDesignerStore((s) => s.currentPdfPage);
  const setCurrentPdfPage = useDesignerStore((s) => s.setCurrentPdfPage);
  const showGrid = useDesignerStore((s) => s.showGrid);
  const snapToGrid = useDesignerStore((s) => s.snapToGrid);
  const setShowGrid = useDesignerStore((s) => s.setShowGrid);
  const setSnapToGrid = useDesignerStore((s) => s.setSnapToGrid);
  const draftCanvasFields = useDesignerStore((s) => s.draftCanvasFields);
  const draftSelectedIds = useDesignerStore((s) => s.draftSelectedIds);
  const commitDraftCanvasFields = useDesignerStore((s) => s.commitDraftCanvasFields);
  const commitSelectedDraftCanvasFields = useDesignerStore((s) => s.commitSelectedDraftCanvasFields);
  const rejectSelectedDraftCanvasFields = useDesignerStore((s) => s.rejectSelectedDraftCanvasFields);
  const clearDraftSelection = useDesignerStore((s) => s.clearDraftSelection);
  const setDraftCanvasFields = useDesignerStore((s) => s.setDraftCanvasFields);
  const clearDraftCanvasFields = useDesignerStore((s) => s.clearDraftCanvasFields);
  const deleteSelectedField = useDesignerStore((s) => s.deleteSelectedField);
  const undo = useDesignerStore((s) => s.undo);
  const redo = useDesignerStore((s) => s.redo);
  const canUndo = useDesignerStore((s) => s.canUndo);
  const canRedo = useDesignerStore((s) => s.canRedo);
  const selectedIds = useDesignerStore((s) => s.selectedIds);
  const selectedGroupId = useDesignerStore((s) => s.selectedGroupId);
  const groupSelected = useDesignerStore((s) => s.groupSelected);
  const ungroupSelected = useDesignerStore((s) => s.ungroupSelected);
  const fields = useDesignerStore((s) => s.fields);
  const extractionPages = useExtractionStore((s) => s.pages);
  const extractionDocumentId = useExtractionStore((s) => s.documentId);
  const extractionDecisionGraph = useExtractionStore((s) => s.decisionGraph);
  const suppressedOcrBlockIds = useExtractionStore((s) => s.suppressedOcrBlockIds);
  const mappingDocumentId = useMappingStore((s) => s.documentId);
  const mappingRecords = useMappingStore((s) => s.mappings);
  const mappingDecisionGraph = useMappingStore((s) => s.decisionGraph);
  const mappingOverrides = useMappingStore((s) => s.overrides);
  const associationEdits = useMappingStore((s) => s.associationEdits);
  const schemaArtifacts = useMappingStore((s) => s.schemaArtifacts);
  const registerSchemaArtifact = useMappingStore((s) => s.registerSchemaArtifact);
  const syncDesignerFields = useMappingStore((s) => s.syncDesignerFields);
  const fusionOverrides = useMappingStore((s) => s.fusionOverrides);
  const semanticFusionSnapshot = useMappingStore((s) => s.semanticFusionSnapshot);
  const semanticMemorySnapshot = useMappingStore((s) => s.semanticMemorySnapshot);
  const semanticMemoryDecisions = useMappingStore((s) => s.semanticMemoryDecisions);
  const selectedSemanticMemoryVersion = useMappingStore((s) => s.selectedSemanticMemoryVersion);
  const globalSemanticGraphSnapshot = useMappingStore((s) => s.globalSemanticGraphSnapshot);
  const globalSemanticGraphEdgeOverrides = useMappingStore((s) => s.globalSemanticGraphEdgeOverrides);
  const globalSemanticGraphMergeDecisions = useMappingStore((s) => s.globalSemanticGraphMergeDecisions);
  const selectedGlobalSemanticGraphVersion = useMappingStore((s) => s.selectedGlobalSemanticGraphVersion);
  const carrierAdapterSnapshot = useMappingStore((s) => s.carrierAdapterSnapshot);
  const carrierAdapterOverrides = useMappingStore((s) => s.carrierAdapterOverrides);
  const underwritingRuleSnapshot = useMappingStore((s) => s.underwritingRuleSnapshot);
  const underwritingRuleOverrides = useMappingStore((s) => s.underwritingRuleOverrides);
  const underwritingRuleDecisions = useMappingStore((s) => s.underwritingRuleDecisions);
  const selectedUnderwritingRuleVersion = useMappingStore((s) => s.selectedUnderwritingRuleVersion);
  const riskFactorSnapshot = useMappingStore((s) => s.riskFactorSnapshot);
  const riskFactorOverrides = useMappingStore((s) => s.riskFactorOverrides);
  const riskScoringSnapshot = useMappingStore((s) => s.riskScoringSnapshot);
  const underwritingDecisionSnapshot = useMappingStore((s) => s.underwritingDecisionSnapshot);
  const underwritingDecisionOverrides = useMappingStore((s) => s.underwritingDecisionOverrides);
  const underwritingDecisionDecisions = useMappingStore((s) => s.underwritingDecisionDecisions);
  const underwritingDecisionDrift = useMappingStore((s) => s.underwritingDecisionDrift);
  const selectedUnderwritingDecisionVersion = useMappingStore((s) => s.selectedUnderwritingDecisionVersion);
  const submissionPackage = useMappingStore((s) => s.submissionPackage);
  const submissionOverrides = useMappingStore((s) => s.submissionOverrides);
  const submissionStatus = useMappingStore((s) => s.submissionStatus);
  const carrierSubmissionResponse = useMappingStore((s) => s.carrierSubmissionResponse);
  const submissionDrift = useMappingStore((s) => s.submissionDrift);
  const selectedSubmissionVersion = useMappingStore((s) => s.selectedSubmissionVersion);

  useEffect(() => {
    syncDesignerFields(fields);
  }, [fields, syncDesignerFields]);

  const canGroup = selectedIds.length > 1 && !selectedGroupId;
  const canUngroup = Boolean(selectedGroupId);

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

  const loadDesignerStateFromFile = useCallback(
    async (file: File) => {
      const fileName = file.name || "";
      const lowerName = fileName.toLowerCase();
      const isJsonLike =
        lowerName.endsWith(".json") ||
        file.type === "application/json" ||
        file.type === "text/json";

      if (!isJsonLike) {
        if (lowerName.endsWith(".pdf") || file.type === "application/pdf") {
          showToast("File > Load expects a designer JSON state. Use Tools > Auto-map PDF for PDFs.", "info");
          return;
        }

        showToast("Unsupported file type. Select a designer JSON file.", "error");
        return;
      }

      try {
        const raw = await file.text();
        const parsed = JSON.parse(raw) as unknown;
        const normalized = normalizePersistedPayload(parsed);

        if (!normalized) {
          showToast("Selected file is not a valid designer state", "error");
          return;
        }

        useDesignerStore.getState().loadSerializableState(normalized.designer);
        applyViewState(normalized.view);
        if (normalized.savedAt) {
          setLastSavedAt(normalized.savedAt);
        }
        showToast(`Loaded ${file.name}`, "success");
      } catch (error) {
        console.error("Failed to load designer state from file", error);
        showToast("Failed to read selected state JSON", "error");
      }
    },
    [applyViewState, normalizePersistedPayload, showToast],
  );

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

  const downloadTextFile = useCallback(
    (content: string, fileName: string, mimeType: string) => {
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    },
    [],
  );

  const buildSchemaPayload = useCallback((): MappingPersistencePayload | null => {
    if (Object.keys(mappingRecords).length === 0) {
      return null;
    }

    const documentId = mappingDocumentId || extractionDocumentId;
    return {
      version: 1,
      documentId,
      pages: extractionPages,
      fields,
      mappings: Object.values(mappingRecords),
      decisionGraph: {
        labels: extractionDecisionGraph.labels,
        fields: extractionDecisionGraph.fields,
        mappings: mappingDecisionGraph.mappings,
        confidenceThresholds:
          mappingDecisionGraph.confidenceThresholds ||
          extractionDecisionGraph.confidenceThresholds,
      },
      overrides: mappingOverrides,
      suppressedOcrBlockIds,
      associationEdits,
      schemaArtifacts,
      ontologyAlignment: getDefaultOntologyMetadata(),
      fusionOverrides,
      semanticFusionSnapshot,
      semanticMemorySnapshot,
      semanticMemoryDecisions,
      selectedSemanticMemoryVersion,
      globalSemanticGraphSnapshot,
      globalSemanticGraphEdgeOverrides,
      globalSemanticGraphMergeDecisions,
      selectedGlobalSemanticGraphVersion,
      carrierAdapterSnapshot,
      carrierAdapterOverrides,
      underwritingRuleSnapshot,
      underwritingRuleOverrides,
      underwritingRuleDecisions,
      selectedUnderwritingRuleVersion,
      riskFactorSnapshot,
      riskFactorOverrides,
      riskScoringSnapshot,
      underwritingDecisionSnapshot,
      underwritingDecisionOverrides,
      underwritingDecisionDecisions,
      underwritingDecisionDrift,
      selectedUnderwritingDecisionVersion,
      submissionPackage,
      submissionOverrides,
      submissionStatus,
      carrierSubmissionResponse,
      submissionDrift,
      selectedSubmissionVersion,
    };
  }, [
    associationEdits,
    extractionDecisionGraph,
    extractionDocumentId,
    extractionPages,
    fields,
    mappingDecisionGraph,
    mappingDocumentId,
    mappingOverrides,
    mappingRecords,
    schemaArtifacts,
    fusionOverrides,
    semanticFusionSnapshot,
    semanticMemorySnapshot,
    semanticMemoryDecisions,
    selectedSemanticMemoryVersion,
    globalSemanticGraphSnapshot,
    globalSemanticGraphEdgeOverrides,
    globalSemanticGraphMergeDecisions,
    selectedGlobalSemanticGraphVersion,
    carrierAdapterSnapshot,
    carrierAdapterOverrides,
    underwritingRuleSnapshot,
    underwritingRuleOverrides,
    underwritingRuleDecisions,
    selectedUnderwritingRuleVersion,
    riskFactorSnapshot,
    riskFactorOverrides,
    riskScoringSnapshot,
    underwritingDecisionSnapshot,
    underwritingDecisionOverrides,
    underwritingDecisionDecisions,
    underwritingDecisionDrift,
    selectedUnderwritingDecisionVersion,
    submissionPackage,
    submissionOverrides,
    submissionStatus,
    carrierSubmissionResponse,
    submissionDrift,
    selectedSubmissionVersion,
    suppressedOcrBlockIds,
  ]);

  const handleGenerateUiSchema = useCallback(() => {
    try {
      const payload = buildSchemaPayload();
      if (!payload) {
        showToast("No mapping review state available", "info");
        return;
      }

      const schema = generateUiSchema({
        ...payload,
      });
      const name = payload.documentId || "document";
      const content = JSON.stringify(schema, null, 2);
      downloadTextFile(
        content,
        `${name}.ui-schema.json`,
        "application/json",
      );
      registerSchemaArtifact("ui", content, schema.fields.length, `${name}.ui-schema.json`);
      showToast(`Generated UI schema (${schema.fields.length} fields)`, "success");
    } catch (error) {
      console.error("Failed to generate UI schema", error);
      showToast("UI schema generation failed", "error");
    }
  }, [buildSchemaPayload, downloadTextFile, registerSchemaArtifact, showToast]);

  const handleGenerateJsonSchema = useCallback(() => {
    try {
      const payload = buildSchemaPayload();
      if (!payload) {
        showToast("No mapping review state available", "info");
        return;
      }

      const schema = generateJsonSchema({
        ...payload,
      });
      const name = payload.documentId || "document";
      const content = JSON.stringify(schema, null, 2);
      downloadTextFile(
        content,
        `${name}.schema.json`,
        "application/schema+json",
      );
      registerSchemaArtifact(
        "json",
        content,
        Object.keys(schema.properties).length,
        `${name}.schema.json`,
      );
      showToast(
        `Generated JSON schema (${Object.keys(schema.properties).length} properties)`,
        "success",
      );
    } catch (error) {
      console.error("Failed to generate JSON schema", error);
      showToast("JSON schema generation failed", "error");
    }
  }, [buildSchemaPayload, downloadTextFile, registerSchemaArtifact, showToast]);

  const handleExportAcordXml = useCallback(async () => {
    try {
      const payload = buildSchemaPayload();
      if (!payload) {
        showToast("No mapping review state available", "info");
        return;
      }

      const localXml = generateAcordXml({
        ...payload,
      });

      let xml = localXml.xml;
      let source = "local";

      try {
        const remote = await runExportAcordXml({
          ...payload,
        });
        if (remote) {
          if (typeof remote.xml === "string" && remote.xml) {
            xml = remote.xml;
            source = "backend";
          }
        }
      } catch {
        source = "local";
      }

      const name = payload.documentId || "document";
      downloadTextFile(xml, `${name}.acord.xml`, "application/xml");
      registerSchemaArtifact("xml", xml, localXml.includedMappings, `${name}.acord.xml`);
      showToast(
        `Exported ACORD XML (${localXml.includedMappings} accepted mappings, ${source})`,
        "success",
      );
    } catch (error) {
      console.error("Failed to export ACORD XML", error);
      showToast("ACORD XML export failed", "error");
    }
  }, [buildSchemaPayload, downloadTextFile, registerSchemaArtifact, showToast]);

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

  const currentPdfUrl = pdfPages[currentPdfPage] ?? null;

  return (
    <DesignerLayout
      sidebar={<DesignerLayersPanel />}
      properties={<DesignerRightPanel />}
      topBar={
        <DesignerToolbar
          canUndo={canUndo}
          canRedo={canRedo}
          canGroup={canGroup}
          canUngroup={canUngroup}
          undo={undo}
          redo={redo}
          groupSelected={groupSelected}
          ungroupSelected={ungroupSelected}
          saveDesignerState={saveDesignerState}
          loadDesignerStateFromFile={loadDesignerStateFromFile}
          exportDesignerJson={exportDesignerJson}
          handleGenerateUiSchema={handleGenerateUiSchema}
          handleGenerateJsonSchema={handleGenerateJsonSchema}
          handleExportAcordXml={handleExportAcordXml}
          onOpenAutoMapPdf={() => {
            setPdfModalMode("map-only");
            setShowPdfModal(true);
          }}
          canAutoMapPdf
          lastSavedAt={lastSavedAt}
          pdfPagesCount={pdfPages.length}
          currentPdfPage={currentPdfPage}
          setCurrentPdfPage={setCurrentPdfPage}
          fitPdfWidth={fitPdfWidth}
          fitPdfPage={fitPdfPage}
          hasSelectedPdfSize={Boolean(selectedPdfSize)}
          zoomIn={zoomIn}
          zoomOut={zoomOut}
          resetZoom={resetZoom}
          showGrid={showGrid}
          snapToGrid={snapToGrid}
          setShowGrid={setShowGrid}
          setSnapToGrid={setSnapToGrid}
        />
      }
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          minHeight: 0,
        }}
      >
          {draftCanvasFields.length > 0 && (
            <div
              style={{
                background: "#fef3c7",
                borderBottom: "1px solid #f59e0b",
                padding: "0.4rem 0.75rem",
                display: "flex",
                alignItems: "center",
                gap: 12,
                fontSize: 13,
                color: "#92400e",
                flexShrink: 0,
              }}
            >
              <span style={{ fontWeight: 600 }}>
                {draftCanvasFields.length} mapped • {draftSelectedIds.length} selected — click amber boxes to select/reject/approve
              </span>
              <button
                type="button"
                style={{
                  background: "#ffffff",
                  color: "#92400e",
                  border: "1px solid #f59e0b",
                  borderRadius: 8,
                  padding: "0.3rem 0.7rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  fontSize: 13,
                }}
                onClick={() => setDraftCanvasFields([...draftCanvasFields])}
              >
                Select All
              </button>
              <button
                type="button"
                style={{
                  background: "transparent",
                  border: "1px solid #f59e0b",
                  borderRadius: 8,
                  padding: "0.3rem 0.7rem",
                  cursor: "pointer",
                  fontSize: 13,
                  color: "#92400e",
                }}
                onClick={() => clearDraftSelection()}
              >
                Clear Selection
              </button>
              <button
                type="button"
                style={{
                  background: "#b45309",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: 8,
                  padding: "0.3rem 0.7rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  fontSize: 13,
                }}
                onClick={() => {
                  const count = commitSelectedDraftCanvasFields();
                  showToast(`Approved ${count} selected field${count !== 1 ? "s" : ""}`, "success");
                }}
              >
                Approve Selected
              </button>
              <button
                type="button"
                style={{
                  background: "transparent",
                  border: "1px solid #b45309",
                  borderRadius: 8,
                  padding: "0.3rem 0.7rem",
                  cursor: "pointer",
                  fontSize: 13,
                  color: "#7c2d12",
                }}
                onClick={() => {
                  const count = rejectSelectedDraftCanvasFields();
                  showToast(`Rejected ${count} selected field${count !== 1 ? "s" : ""}`, "info");
                }}
              >
                Reject Selected
              </button>
              <button
                type="button"
                style={{
                  background: "#f59e0b",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: 8,
                  padding: "0.3rem 0.7rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  fontSize: 13,
                }}
                onClick={() => {
                  const count = commitDraftCanvasFields();
                  showToast(`Committed ${count} field${count !== 1 ? "s" : ""} to canvas`, "success");
                }}
              >
                Commit All
              </button>
              <button
                type="button"
                style={{
                  background: "transparent",
                  border: "1px solid #f59e0b",
                  borderRadius: 8,
                  padding: "0.3rem 0.7rem",
                  cursor: "pointer",
                  fontSize: 13,
                  color: "#92400e",
                }}
                onClick={() => {
                  clearDraftCanvasFields();
                  showToast("Draft fields discarded", "info");
                }}
              >
                Discard
              </button>
            </div>
          )}
        <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
          <DesignerCanvas
            canvasSurfaceWidth={canvasSurfaceWidth}
            canvasSurfaceHeight={canvasSurfaceHeight}
            pdfUrl={currentPdfUrl}
            onStageReady={setStage}
            onSelectedPdfSizeChange={handleSelectedPdfSizeChange}
            zoomIn={zoomIn}
            zoomOut={zoomOut}
            resetZoom={resetZoom}
            fitToPage={fitPdfPage}
            toast={toast}
            showPdfModal={showPdfModal}
            pdfModalMode={pdfModalMode}
            onClosePdfModal={() => setShowPdfModal(false)}
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
            onViewportChange={setViewport}
          />
        </div>
        <DesignerPageStrip />
      </div>
    </DesignerLayout>
  );
}

export default DesignerApp;
