import { useEffect, useMemo, useRef } from "react";
import { Group as KonvaGroup, Line, Transformer } from "react-konva";
import { Rect as KonvaRect, Text as KonvaText } from "react-konva";
import { CanvasStage } from "../../canvas/CanvasStage";
import ZoomControls from "../../designer/controls/ZoomControls";
import PdfImportModal from "../../designer/ai/PdfImportModal";
import { useOntologyFieldIds, useSelectedFields } from "../../state/fieldStore";
import { useDesignerStore, type Field } from "../../state/designerStore";
import { FieldControls } from "./FieldControls";
import FieldRenderer from "./FieldRenderer";
import PdfBackground from "./PdfBackground";
import { resolveOntologySemanticMetadata } from "../../../../shared/src/acord/acord-gating";
import { useMappingStore } from "../../state/mappingStore";
import { useExtractionStore } from "../../state/extractionStore";

const GRID_SIZE = 20;
function deriveOntologyClusterLabel(field: Field, routedClusterFallback?: string): string {
  const acordCode = String(field.metadata?.acordCode || "").trim();
  if (acordCode.length > 0) {
    const metadata = resolveOntologySemanticMetadata(acordCode);
    if (metadata.cluster.trim().length > 0) {
      return metadata.cluster;
    }
  }

  const derived = (
    field.metadata?.semanticLabel?.trim() ||
    field.metadata?.categoryMode?.trim() ||
    "general"
  );

  if (derived === "general" && routedClusterFallback) {
    return routedClusterFallback;
  }

  return derived;
}

function getFieldRawText(field: Field): string {
  if (field.type === "text") return field.text || "";
  if (field.type === "checkbox" || field.type === "radio") return field.label || "";
  if (field.type === "dropdown") return field.selectedOption || field.placeholder || "";
  if (field.type === "date") return field.value || field.placeholder || "";
  if (field.type === "numeric") return field.value?.toString() || field.placeholder || "";
  if (field.type === "signature") return field.placeholder || "Sign here";
  return "";
}

function isInteractiveFieldType(field: Field): boolean {
  return (
    field.type === "checkbox" ||
    field.type === "radio" ||
    field.type === "dropdown" ||
    field.type === "date" ||
    field.type === "numeric" ||
    field.type === "signature"
  );
}

const TABLE_HEADER_PATTERNS = [
  "class",
  "subbed cost",
  "payroll",
  "percentage",
  "value",
  "describe",
  "please explain",
  "other",
  "if yes, please explain",
  "if yes, list state(s)",
  "what is the maximum height",
  "what is the maximum depth",
];

const ROW_LABEL_PATTERNS = [
  "mechanical",
  "carpentry - interior",
  "carpentry – interior",
  "air conditioning/heating",
  "electrical work",
  "retaining walls",
  "pile driving",
  "caissons",
  "boiler installation",
  "gas stations",
  "public utilities",
  "chemical plants",
  "railroads",
  "ports",
  "airports",
];

const QUESTION_LABEL_PATTERNS = [
  "do you",
  "have you",
  "are you",
  "were there",
  "in the past five years",
  "if yes",
  "please explain",
];

function containsPhrase(text: string, phrases: string[]): boolean {
  return phrases.some((phrase) => text.includes(phrase));
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function getPageIndex(field: Field): number {
  return typeof field.pageIndex === "number" && Number.isFinite(field.pageIndex) ? Math.max(0, Math.floor(field.pageIndex)) : 0;
}

function isTableHeaderText(text: string): boolean {
  const normalized = normalizeText(text);
  return TABLE_HEADER_PATTERNS.some((item) => normalized === normalizeText(item));
}

function isRowLabelText(text: string): boolean {
  const normalized = normalizeText(text);
  return ROW_LABEL_PATTERNS.some((item) => normalized.includes(normalizeText(item)));
}

function isQuestionLabelText(text: string): boolean {
  const normalized = normalizeText(text);
  return QUESTION_LABEL_PATTERNS.some((item) => normalized.includes(normalizeText(item)));
}

function buildHeaderRowsByPage(fields: Field[]): Map<number, number[]> {
  const candidatesByPage = new Map<number, number[]>();

  for (const field of fields) {
    if (isInteractiveFieldType(field)) continue;
    const rawText = getFieldRawText(field);
    if (!isTableHeaderText(rawText)) continue;
    const pageIndex = getPageIndex(field);
    const list = candidatesByPage.get(pageIndex) || [];
    list.push(field.y);
    candidatesByPage.set(pageIndex, list);
  }

  const rowsByPage = new Map<number, number[]>();
  for (const [pageIndex, yValues] of candidatesByPage.entries()) {
    const sorted = [...yValues].sort((a, b) => a - b);
    const clustered: Array<{ y: number; count: number }> = [];
    for (const y of sorted) {
      const cluster = clustered.find((item) => Math.abs(item.y - y) <= 14);
      if (cluster) {
        cluster.y = (cluster.y * cluster.count + y) / (cluster.count + 1);
        cluster.count += 1;
      } else {
        clustered.push({ y, count: 1 });
      }
    }

    rowsByPage.set(
      pageIndex,
      clustered.filter((item) => item.count >= 2).map((item) => item.y),
    );
  }

  return rowsByPage;
}

function isLikelyNonFieldArtifact(field: Field): boolean {
  if (isInteractiveFieldType(field)) {
    return false;
  }

  const classification = field.metadata?.artifactClassification;
  if (classification === "non_field_artifact") {
    return true;
  }

  const rawText = normalizeText(getFieldRawText(field));
  if (/^(yes|no)$/i.test(rawText)) {
    return true;
  }

  const combinedText = [
    field.metadata?.semanticLabel || "",
    field.metadata?.acordLabel || "",
    field.metadata?.acordDescription || "",
    field.metadata?.categoryMode || "",
    rawText,
  ]
    .join(" ")
    .toLowerCase();

  if (isQuestionLabelText(rawText)) {
    return true;
  }

  if (/\b[a-z]{2,6}\s*\d{3,5}\s+\d{2}\s+\d{2}\b/i.test(rawText)) {
    return true;
  }

  return /\b(logo|copyright|all rights reserved|confidential|proprietary|disclaimer|sample|specimen|header|footer|section title|section\s+\d+|table of contents|instructions?|for office use only|application|applicant information|general contractor\/artisan contractor|to be attached to acord applications|page\s+\d+\s+of\s+\d+|markel|evanston)\b/i.test(
    combinedText,
  );
}

function inferClusterFromText(searchText: string): string {
  const haystack = searchText.toLowerCase();
  const clusterKeywords: Array<{ label: string; keywords: string[] }> = [
    { label: "Contact Information", keywords: ["contact", "name", "insured", "producer", "broker", "agent", "phone", "email", "address"] },
    { label: "Business Details", keywords: ["business", "company", "entity", "legal", "industry", "fein", "tax", "years in business", "corporation"] },
    { label: "Locations", keywords: ["location", "premises", "site", "address", "office", "branch", "facility", "building"] },
    { label: "Operations", keywords: ["operations", "operation", "services", "products", "work", "exposure", "hazard", "description"] },
    { label: "Coverage Questions", keywords: ["coverage", "limit", "deductible", "policy", "quote", "premium", "endorsement", "requested"] },
    { label: "Loss History", keywords: ["loss", "claim", "accident", "incident", "date of loss", "history", "settlement"] },
    { label: "Prior Insurance", keywords: ["prior insurance", "previous insurance", "carrier", "renewal", "expiration", "policy number"] },
    { label: "Additional Interests", keywords: ["additional interest", "mortgagee", "lender", "loss payee", "certificate", "holder"] },
  ];

  for (const bucket of clusterKeywords) {
    if (bucket.keywords.some((keyword) => haystack.includes(keyword))) {
      return bucket.label;
    }
  }

  return "Miscellaneous";
}

function parseActionFilter(query: string): { ids: Set<string>; mode: "cluster" | "grouping" | "instance" | null } {
  const marker = "@ids:";
  const markerIndex = query.indexOf(marker);
  if (markerIndex === -1) {
    return { ids: new Set<string>(), mode: null };
  }

  const prefix = query.slice(0, markerIndex).trim().toLowerCase();
  const idsRaw = query.slice(markerIndex + marker.length).trim();
  const ids = new Set(idsRaw.split(",").map((item) => item.trim()).filter((item) => item.length > 0));

  let mode: "cluster" | "grouping" | "instance" | null = null;
  if (prefix.startsWith("cluster:")) mode = "cluster";
  if (prefix.startsWith("grouping:")) mode = "grouping";
  if (prefix.startsWith("instance:")) mode = "instance";

  return { ids, mode };
}

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
  const textBlocks = useExtractionStore((s) => s.textBlocks);
  const routedClusters = useMappingStore((s) => s.routedClusters);
  const ontologyFieldIds = useOntologyFieldIds();
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
  const actionFilter = useMemo(() => parseActionFilter(fieldSearchQuery), [fieldSearchQuery]);
  const headerRowsByPage = useMemo(() => buildHeaderRowsByPage(fields), [fields]);
  const pageDimensionsByIndex = useMemo(() => {
    const byIndex = new Map<number, { width: number; height: number }>();
    pdfPages.forEach((page: any, index: number) => {
      const width = Number((page && (page.width ?? page.viewport?.width)) || 0);
      const height = Number((page && (page.height ?? page.viewport?.height)) || 0);
      byIndex.set(index, {
        width: Number.isFinite(width) && width > 0 ? width : canvasSurfaceWidth,
        height: Number.isFinite(height) && height > 0 ? height : canvasSurfaceHeight,
      });
    });
    return byIndex;
  }, [canvasSurfaceHeight, canvasSurfaceWidth, pdfPages]);
  const isMappingMode = useMemo(
    () =>
      ontologyFieldIds.size > 0 ||
      fields.some(
        (field) =>
          typeof field.metadata?.artifactClassification === "string" ||
          typeof field.metadata?.extractionBlockId === "string",
      ),
    [fields, ontologyFieldIds],
  );

  const visibleFields = fields.filter((field) => {
    if (field.metadata?.hidden) return false;
    if (ontologyFieldIds.size > 0 && !ontologyFieldIds.has(field.id)) return false;

    if (isMappingMode) {
      if (isLikelyNonFieldArtifact(field)) {
        return false;
      }

      if (!isInteractiveFieldType(field)) {
        const rawText = normalizeText(getFieldRawText(field));
        const pageIndex = getPageIndex(field);
        const pageDimensions = pageDimensionsByIndex.get(pageIndex) || {
          width: canvasSurfaceWidth,
          height: canvasSurfaceHeight,
        };
        const pageHeight = Math.max(1, pageDimensions.height);
        const pageWidth = Math.max(1, pageDimensions.width);
        const bottom = field.y + Math.max(1, field.height);
        const headerRows = headerRowsByPage.get(pageIndex) || [];
        const inHeaderRow = headerRows.some((y) => Math.abs(y - field.y) <= 16);
        const inLeftColumn = field.x <= pageWidth * 0.35;
        const inFooterZone = bottom >= pageHeight * 0.9;

        if (isTableHeaderText(rawText) && inHeaderRow) {
          return false;
        }

        if (isRowLabelText(rawText) && inLeftColumn) {
          return false;
        }

        if (inFooterZone) {
          return false;
        }

        if (/^(yes|no)$/i.test(rawText)) {
          return false;
        }
      }
    }

    if (actionFilter.ids.size > 0) {
      return actionFilter.ids.has(field.id);
    }

    if (pdfPages.length === 0) return true;
    if (field.pageIndex === null || field.pageIndex === undefined) return true;
    if (field.pageIndex !== currentPdfPage) return false;

    if (!normalizedSearchQuery) return true;

    const searchableText = [
      field.metadata?.acordCode || "",
      field.metadata?.acordLabel || "",
      field.metadata?.semanticLabel || "",
      field.metadata?.categoryMode || "",
      field.type,
      field.type === "text" ? field.text || "" : "",
      field.type === "checkbox" || field.type === "radio" ? field.label || "" : "",
      field.type === "dropdown" ? field.placeholder || "" : "",
      field.type === "date" ? field.placeholder || field.value || "" : "",
      field.type === "numeric" ? field.placeholder || "" : "",
      field.type === "signature" ? field.placeholder || "" : "",
    ]
      .join(" ")
      .toLowerCase();

    if (normalizedSearchQuery.startsWith("cluster:") || normalizedSearchQuery.startsWith("grouping:")) {
      const semanticLabel = field.metadata?.semanticLabel || "";
      const acordLabel = field.metadata?.acordLabel || "";
      const cluster = inferClusterFromText([getFieldRawText(field), semanticLabel, acordLabel].join(" "));
      const wanted = normalizedSearchQuery.split(":")[1]?.split("@ids:")[0]?.trim() || "";
      return cluster.toLowerCase() === wanted;
    }

    return searchableText.includes(normalizedSearchQuery);
  });

  const visibleDraftFields = draftCanvasFields.filter((field) => {
    if (pdfPages.length === 0) return true;
    if (field.pageIndex === null || field.pageIndex === undefined) return true;
    return field.pageIndex === currentPdfPage;
  });

  const visibleTextBlocks = textBlocks.filter((block) => {
    if (pdfPages.length === 0) return true;
    return Math.max(0, (block.page || 1) - 1) === currentPdfPage;
  });

  const visibleSemanticClusters = useMemo(() => {
    const topRoutedCluster = Object.entries(routedClusters || {})
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0];

    const byGroup = new Map<
      string,
      {
        x: number;
        y: number;
        maxX: number;
        maxY: number;
        label: string;
      }
    >();

    for (const field of visibleFields) {
      if (!field.groupId) continue;
      const label = deriveOntologyClusterLabel(field, topRoutedCluster);
      const x = field.x;
      const y = field.y;
      const maxX = field.x + Math.max(1, field.width);
      const maxY = field.y + Math.max(1, field.height);
      const existing = byGroup.get(field.groupId);
      if (!existing) {
        byGroup.set(field.groupId, { x, y, maxX, maxY, label });
        continue;
      }
      existing.x = Math.min(existing.x, x);
      existing.y = Math.min(existing.y, y);
      existing.maxX = Math.max(existing.maxX, maxX);
      existing.maxY = Math.max(existing.maxY, maxY);
      if (existing.label === "general" && label !== "general") {
        existing.label = label;
      }
    }

    return Array.from(byGroup.entries()).map(([key, box]) => ({
      key,
      label: box.label,
      x: box.x - 6,
      y: box.y - 18,
      width: Math.max(24, box.maxX - box.x + 12),
      height: Math.max(24, box.maxY - box.y + 26),
    }));
  }, [routedClusters, visibleFields]);

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

  // Update transformer when selected fields change
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
      // Multiple selections: don't use transformer for now
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
            visibleTextBlocks.length > 0 || visibleFields.length > 0 || selectedFields.length > 0 || visibleDraftFields.length > 0 ? (
              <>
                {visibleTextBlocks.map((block) => (
                  <KonvaGroup key={`ocr-${block.id}`} listening={false}>
                    <KonvaRect
                      x={block.boundingBox.x}
                      y={block.boundingBox.y}
                      width={block.boundingBox.width}
                      height={block.boundingBox.height}
                      fill="rgba(226, 232, 240, 0.12)"
                      stroke={"#cbd5e1"}
                      strokeWidth={1}
                      cornerRadius={2}
                    />
                    <KonvaText
                      x={block.boundingBox.x + 3}
                      y={block.boundingBox.y + 2}
                      text={block.text}
                      fontSize={10}
                      fontFamily="Geist Variable"
                      fill="#334155"
                      width={Math.max(16, block.boundingBox.width - 6)}
                    />
                  </KonvaGroup>
                ))}
                {visibleSemanticClusters.map((group) => (
                  <KonvaGroup key={`semantic-group-${group.key}`} listening={false}>
                    <KonvaRect
                      x={group.x}
                      y={group.y}
                      width={group.width}
                      height={group.height}
                      stroke="#7dd3fc"
                      strokeWidth={1}
                      dash={[5, 4]}
                      fill="rgba(125, 211, 252, 0.04)"
                      cornerRadius={4}
                    />
                    <KonvaText
                      x={group.x + 6}
                      y={group.y + 2}
                      text={group.label}
                      fontSize={10}
                      fontFamily="Geist Variable"
                      fill="#0369a1"
                    />
                  </KonvaGroup>
                ))}
                {visibleFields.map((field: Field) => (
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
                    draggable={!field.metadata?.locked && (ontologyFieldIds.size === 0 || ontologyFieldIds.has(field.id))}
                    listening
                    onMouseEnter={() => {
                      if (ontologyFieldIds.size > 0 && !ontologyFieldIds.has(field.id)) {
                        return;
                      }
                    }}
                    onClick={(event) => {
                      if (ontologyFieldIds.size > 0 && !ontologyFieldIds.has(field.id)) {
                        event.cancelBubble = true;
                        return;
                      }
                      event.cancelBubble = true;
                      selectField(field.id, Boolean(event.evt.shiftKey));
                    }}
                    onTap={(event) => {
                      if (ontologyFieldIds.size > 0 && !ontologyFieldIds.has(field.id)) {
                        event.cancelBubble = true;
                        return;
                      }
                      event.cancelBubble = true;
                      selectField(field.id, Boolean(event.evt.shiftKey));
                    }}
                    onDragEnd={(event) => {
                      if (field.metadata?.locked || (ontologyFieldIds.size > 0 && !ontologyFieldIds.has(field.id))) {
                        return;
                      }
                      // Update field position after drag
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
                  const stageRef = document.querySelector("canvas")?.parentElement?.querySelector("[role='presentation']");
                  return (
                    <FieldControls key={f.id} field={f} />
                  );
                })}
                {/* Transformer for resize/rotate handles */}
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
                    
                    // Reset scale to 1 so the shape reports correct position
                    node.scaleX(1);
                    node.scaleY(1);
                    
                    const updateField = useDesignerStore.getState().updateField;
                    const selectedField = selectedFields[0];
                    
                    if (updateField && selectedField) {
                      updateField(selectedField.id, {
                        x: node.x(),
                        y: node.y(),
                        width: Math.max(20, node.width() * scaleX),
                        height: Math.max(20, node.height() * scaleY),
                        rotation: node.rotation(),
                      }, { recordHistory: true });
                      
                      // Force re-render of node with new dimensions
                      node.width(Math.max(20, node.width() * scaleX));
                      node.height(Math.max(20, node.height() * scaleY));
                    }
                  }}
                />
              
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
