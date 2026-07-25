import { useMemo, useState } from "react";
import type { Field, ReviewDecision } from "@shared/types";
import { useExtractionStore } from "../state";
import { FieldPreview } from "./FieldPreview";
import { LabelPreview } from "./LabelPreview";

function centerOfBox(x: number, y: number, width: number, height: number) {
  return {
    cx: x + width / 2,
    cy: y + height / 2,
  };
}

function fieldBoxTone(decision: "pending" | "accepted" | "rejected") {
  if (decision === "accepted") return "#15803d";
  if (decision === "rejected") return "#b91c1c";
  return "#1d4ed8";
}

function labelBoxTone(decision: "pending" | "accepted" | "rejected") {
  if (decision === "accepted") return "#166534";
  if (decision === "rejected") return "#991b1b";
  return "#0f766e";
}

function pageIndexForField(field: Field) {
  return Math.max(0, (field.pageIndex ?? 0));
}

export function ExtractionViewer() {
  const pages = useExtractionStore((state) => state.pages);
  const textBlocks = useExtractionStore((state) => state.textBlocks);
  const normalizedBBoxes = useExtractionStore((state) => state.normalizedBBoxes);
  const labels = useExtractionStore((state) => state.labels);
  const fields = useExtractionStore((state) => state.fields);
  const decisionGraph = useExtractionStore((state) => state.decisionGraph);
    const getLabelDecision = (blockId: string): ReviewDecision =>
      decisionGraph.labels[blockId]?.decision || "pending";
    const getFieldDecision = (fieldId: string): ReviewDecision =>
      decisionGraph.fields[fieldId]?.decision || "pending";

  const suppressedOcrBlockIds = useExtractionStore(
    (state) => state.suppressedOcrBlockIds,
  );
  const highlightedAssociationBlockId = useExtractionStore(
    (state) => state.highlightedAssociationBlockId,
  );
  const acceptLabel = useExtractionStore((state) => state.acceptLabel);
  const rejectLabel = useExtractionStore((state) => state.rejectLabel);
  const acceptField = useExtractionStore((state) => state.acceptField);
  const rejectField = useExtractionStore((state) => state.rejectField);
  const toggleOcrSuppression = useExtractionStore(
    (state) => state.toggleOcrSuppression,
  );
  const setHighlightedAssociation = useExtractionStore(
    (state) => state.setHighlightedAssociation,
  );

  const [selectedPage, setSelectedPage] = useState(1);

  const blockById = useMemo(
    () => new Map(textBlocks.map((block) => [block.id, block])),
    [textBlocks],
  );

  const visibleBlocks = useMemo(
    () =>
      textBlocks.filter(
        (block) =>
          block.page === selectedPage &&
          !suppressedOcrBlockIds.includes(block.id),
      ),
    [selectedPage, suppressedOcrBlockIds, textBlocks],
  );

  const pageLabels = useMemo(
    () => labels.filter((label) => blockById.get(label.blockId)?.page === selectedPage),
    [blockById, labels, selectedPage],
  );

  const pageFields = useMemo(
    () => fields.filter((field) => pageIndexForField(field) + 1 === selectedPage),
    [fields, selectedPage],
  );

  const pageWidth = useMemo(() => {
    const page = pages.find((candidate) => candidate.pageNumber === selectedPage);
    if (page?.width && Number.isFinite(page.width)) {
      return Math.max(240, Math.round(page.width));
    }

    const maxFromBlocks = visibleBlocks.reduce((max, block) => {
      return Math.max(max, block.boundingBox.x + block.boundingBox.width + 40);
    }, 900);

    const maxFromFields = pageFields.reduce((max, field) => {
      return Math.max(max, field.x + field.width + 40);
    }, 900);

    return Math.max(240, Math.round(Math.max(maxFromBlocks, maxFromFields)));
  }, [pageFields, pages, selectedPage, visibleBlocks]);

  const pageHeight = useMemo(() => {
    const page = pages.find((candidate) => candidate.pageNumber === selectedPage);
    if (page?.height && Number.isFinite(page.height)) {
      return Math.max(180, Math.round(page.height));
    }

    const maxFromBlocks = visibleBlocks.reduce((max, block) => {
      return Math.max(max, block.boundingBox.y + block.boundingBox.height + 40);
    }, 1200);

    const maxFromFields = pageFields.reduce((max, field) => {
      return Math.max(max, field.y + field.height + 40);
    }, 1200);

    return Math.max(180, Math.round(Math.max(maxFromBlocks, maxFromFields)));
  }, [pageFields, pages, selectedPage, visibleBlocks]);

  const highlightedField =
    highlightedAssociationBlockId === null
      ? null
      : pageFields.find((field) => field.id === highlightedAssociationBlockId) || null;
  const highlightedLabel =
    highlightedAssociationBlockId === null
      ? null
      : pageLabels.find((label) => label.blockId === highlightedAssociationBlockId) || null;
  const highlightedBlock = highlightedAssociationBlockId
    ? blockById.get(highlightedAssociationBlockId) || null
    : null;

  const labelToFieldMap = useMemo(
    () => new Map(pageLabels.map((label) => [label.blockId, pageFields.find((field) => field.id === label.blockId)])),
    [pageFields, pageLabels],
  );

  const hasArtifacts =
    pages.length > 0 ||
    textBlocks.length > 0 ||
    labels.length > 0 ||
    fields.length > 0 ||
    normalizedBBoxes.length > 0;

  if (!hasArtifacts) {
    return (
      <section>
        <h3>Extraction Viewer</h3>
        <p style={{ fontSize: 12, color: "#475569" }}>
          No extraction artifacts are loaded. Import a document to review OCR labels and typed fields.
        </p>
      </section>
    );
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <h3>Extraction Viewer</h3>
      <p style={{ fontSize: 12, color: "#475569" }}>
        {pages.length} page(s) loaded, {textBlocks.length} OCR block(s), {labels.length} label decision(s), and {fields.length} typed field preview(s) tracked.
      </p>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <label htmlFor="extraction-viewer-page" style={{ fontSize: 12, color: "#334155" }}>
          Review page
        </label>
        <select
          id="extraction-viewer-page"
          value={selectedPage}
          onChange={(event) => setSelectedPage(Number(event.target.value) || 1)}
        >
          {(pages.length ? pages : [{ pageNumber: 1, lines: [] }]).map((page) => (
            <option key={page.pageNumber} value={page.pageNumber}>
              Page {page.pageNumber}
            </option>
          ))}
        </select>
      </div>
      <div
        style={{
          display: "grid",
          gap: 12,
          gridTemplateColumns: "minmax(250px, 1fr) minmax(420px, 2fr) minmax(250px, 1fr)",
        }}
      >
        <aside style={{ display: "grid", gap: 8, alignContent: "start" }}>
          <h4 style={{ margin: 0, fontSize: 14 }}>Labels</h4>
          {pageLabels.map((label) => {
            const block = blockById.get(label.blockId);
            const field = labelToFieldMap.get(label.blockId);
            return (
              <LabelPreview
                key={label.blockId}
                label={label}
                block={block}
                associatedField={field}
                decision={getLabelDecision(label.blockId)}
                suppressed={suppressedOcrBlockIds.includes(label.blockId)}
                highlighted={highlightedAssociationBlockId === label.blockId}
                onAccept={() => acceptLabel(label.blockId)}
                onReject={() => rejectLabel(label.blockId)}
                onToggleSuppression={() => toggleOcrSuppression(label.blockId)}
                onHighlight={() =>
                  setHighlightedAssociation(
                    highlightedAssociationBlockId === label.blockId
                      ? null
                      : label.blockId,
                  )
                }
              />
            );
          })}
          {!pageLabels.length ? (
            <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>
              No labels detected on this page.
            </p>
          ) : null}
        </aside>

        <div
          style={{
            border: "1px solid #cbd5e1",
            borderRadius: 10,
            background: "linear-gradient(160deg, #f8fafc, #eef2ff)",
            padding: 10,
            overflow: "auto",
          }}
        >
          <div
            style={{
              position: "relative",
              width: pageWidth,
              height: pageHeight,
              background: "#ffffff",
              border: "1px solid #e2e8f0",
            }}
          >
            {visibleBlocks.map((block) => (
              <div
                key={`ocr-${block.id}`}
                style={{
                  position: "absolute",
                  left: block.boundingBox.x,
                  top: block.boundingBox.y,
                  width: block.boundingBox.width,
                  height: block.boundingBox.height,
                  border: "1px dashed #94a3b8",
                  background: "rgba(148, 163, 184, 0.1)",
                }}
                title={`OCR ${block.id}: ${block.text}`}
              />
            ))}

            {pageLabels.map((label) => {
              const block = blockById.get(label.blockId);
              if (!block || suppressedOcrBlockIds.includes(label.blockId)) return null;
              const decision = getLabelDecision(label.blockId);
              const tone = labelBoxTone(decision);
              return (
                <div
                  key={`label-${label.blockId}`}
                  style={{
                    position: "absolute",
                    left: block.boundingBox.x,
                    top: block.boundingBox.y,
                    width: block.boundingBox.width,
                    height: block.boundingBox.height,
                    border: `2px solid ${tone}`,
                    boxSizing: "border-box",
                    background:
                      highlightedAssociationBlockId === label.blockId
                        ? "rgba(6, 182, 212, 0.15)"
                        : "rgba(16, 185, 129, 0.08)",
                  }}
                  title={`Label ${label.blockId} (${decision})`}
                />
              );
            })}

            {pageFields.map((field) => {
              const decision = getFieldDecision(field.id);
              const tone = fieldBoxTone(decision);
              return (
                <div
                  key={`field-${field.id}`}
                  style={{
                    position: "absolute",
                    left: field.x,
                    top: field.y,
                    width: field.width,
                    height: field.height,
                    border: `2px solid ${tone}`,
                    boxSizing: "border-box",
                    background:
                      highlightedAssociationBlockId === field.id
                        ? "rgba(59, 130, 246, 0.15)"
                        : "rgba(59, 130, 246, 0.08)",
                  }}
                  title={`Field ${field.type} (${decision})`}
                >
                  <span
                    style={{
                      fontSize: 10,
                      padding: "1px 4px",
                      background: "rgba(255,255,255,0.9)",
                      borderRadius: 4,
                      position: "absolute",
                      left: 2,
                      top: -14,
                      color: "#1e293b",
                    }}
                  >
                    {field.type} • {field.metadata?.source || "ocr"}
                  </span>
                </div>
              );
            })}

            {highlightedBlock && highlightedField ? (
              <svg
                width={pageWidth}
                height={pageHeight}
                style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
              >
                <line
                  x1={centerOfBox(
                    highlightedBlock.boundingBox.x,
                    highlightedBlock.boundingBox.y,
                    highlightedBlock.boundingBox.width,
                    highlightedBlock.boundingBox.height,
                  ).cx}
                  y1={centerOfBox(
                    highlightedBlock.boundingBox.x,
                    highlightedBlock.boundingBox.y,
                    highlightedBlock.boundingBox.width,
                    highlightedBlock.boundingBox.height,
                  ).cy}
                  x2={centerOfBox(
                    highlightedField.x,
                    highlightedField.y,
                    highlightedField.width,
                    highlightedField.height,
                  ).cx}
                  y2={centerOfBox(
                    highlightedField.x,
                    highlightedField.y,
                    highlightedField.width,
                    highlightedField.height,
                  ).cy}
                  stroke="#0ea5e9"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                />
              </svg>
            ) : null}
          </div>
          {highlightedAssociationBlockId && !highlightedLabel ? (
            <p style={{ marginTop: 8, marginBottom: 0, fontSize: 12, color: "#475569" }}>
              Highlighted association: block {highlightedAssociationBlockId}
            </p>
          ) : null}
        </div>

        <aside style={{ display: "grid", gap: 8, alignContent: "start" }}>
          <h4 style={{ margin: 0, fontSize: 14 }}>Typed Fields</h4>
          {pageFields.map((field) => {
            const sourceBlock = blockById.get(field.id);
            const label = pageLabels.find((candidate) => candidate.blockId === field.id);
            return (
              <FieldPreview
                key={field.id}
                field={field}
                decision={getFieldDecision(field.id)}
                associatedLabel={label}
                sourceBlock={sourceBlock}
                highlighted={highlightedAssociationBlockId === field.id}
                onAccept={() => acceptField(field.id)}
                onReject={() => rejectField(field.id)}
                onHighlight={() =>
                  setHighlightedAssociation(
                    highlightedAssociationBlockId === field.id ? null : field.id,
                  )
                }
              />
            );
          })}
          {!pageFields.length ? (
            <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>
              No typed field previews on this page.
            </p>
          ) : null}
        </aside>
      </div>
    </section>
  );
}