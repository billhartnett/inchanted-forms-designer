import type { ExtractedBlock, Field, LabelDetection, ReviewDecision } from "@shared/types";

type FieldPreviewProps = {
  field: Field;
  decision: ReviewDecision;
  associatedLabel?: LabelDetection;
  sourceBlock?: ExtractedBlock;
  highlighted: boolean;
  onAccept: () => void;
  onReject: () => void;
  onHighlight: () => void;
};

function renderTypedPreview(field: Field) {
  if (field.type === "text") return `Text: ${field.text}`;
  if (field.type === "checkbox") return `Checkbox: ${field.checked ? "checked" : "unchecked"}`;
  if (field.type === "radio") return `Radio: ${field.label || field.groupName}`;
  if (field.type === "date") return `Date: ${field.value || field.placeholder}`;
  if (field.type === "numeric") return `Numeric: ${field.value ?? field.placeholder}`;
  if (field.type === "dropdown") return `Dropdown: ${field.selectedOption || field.placeholder}`;
  if (field.type === "signature") return `Signature: ${field.signed ? "signed" : field.placeholder}`;
  return "Geometry field";
}

function toneForDecision(decision: ReviewDecision) {
  if (decision === "accepted") return "#166534";
  if (decision === "rejected") return "#991b1b";
  return "#475569";
}

export function FieldPreview({
  field,
  decision,
  associatedLabel,
  sourceBlock,
  highlighted,
  onAccept,
  onReject,
  onHighlight,
}: FieldPreviewProps) {
  const metadata = field.metadata;

  return (
    <div
      style={{
        fontSize: 12,
        color: "#0f172a",
        border: highlighted ? "1px solid #0369a1" : "1px solid #cbd5e1",
        borderRadius: 8,
        padding: 10,
        background: "#ffffff",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <strong style={{ textTransform: "capitalize" }}>{field.type}</strong>
        <span
          style={{
            color: toneForDecision(decision),
            fontWeight: 600,
            textTransform: "capitalize",
          }}
        >
          {decision}
        </span>
      </div>
      <div
        style={{
          marginTop: 6,
          padding: 8,
          borderRadius: 6,
          border: "1px dashed #94a3b8",
          color: "#1e293b",
          background: "#f8fafc",
        }}
      >
        {renderTypedPreview(field)}
      </div>
      <div style={{ marginTop: 6, color: "#475569" }}>
        Source: {metadata?.source || "ocr"}
        {typeof metadata?.confidenceScore === "number"
          ? ` • Confidence ${metadata.confidenceScore.toFixed(2)}`
          : ""}
      </div>
      <div style={{ marginTop: 4, color: "#64748b" }}>
        Box {Math.round(field.x)},{Math.round(field.y)} {Math.round(field.width)}x{Math.round(field.height)}
      </div>
      {metadata?.acordLabel || metadata?.acordCode ? (
        <div style={{ marginTop: 4, color: "#334155" }}>
          ACORD: {metadata.acordLabel || "(no label)"}
          {metadata.acordCode ? ` (${metadata.acordCode})` : ""}
        </div>
      ) : null}
      {associatedLabel ? (
        <div style={{ marginTop: 4, color: "#334155" }}>
          Linked label block: {associatedLabel.blockId}
        </div>
      ) : null}
      {sourceBlock ? (
        <div style={{ marginTop: 4, color: "#334155" }}>
          OCR text: {sourceBlock.text}
        </div>
      ) : null}
      <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={onAccept} style={{ fontSize: 12 }}>
          Accept field
        </button>
        <button type="button" onClick={onReject} style={{ fontSize: 12 }}>
          Reject field
        </button>
        <button type="button" onClick={onHighlight} style={{ fontSize: 12 }}>
          Highlight link
        </button>
      </div>
    </div>
  );
}