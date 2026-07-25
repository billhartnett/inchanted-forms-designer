import type { ExtractedBlock, Field, LabelDetection, ReviewDecision } from "@shared/types";

type LabelPreviewProps = {
  label: LabelDetection;
  block?: ExtractedBlock;
  associatedField?: Field;
  decision: ReviewDecision;
  suppressed: boolean;
  highlighted: boolean;
  onAccept: () => void;
  onReject: () => void;
  onToggleSuppression: () => void;
  onHighlight: () => void;
};

function toneForDecision(decision: ReviewDecision) {
  if (decision === "accepted") return "#166534";
  if (decision === "rejected") return "#991b1b";
  return "#475569";
}

export function LabelPreview({
  label,
  block,
  associatedField,
  decision,
  suppressed,
  highlighted,
  onAccept,
  onReject,
  onToggleSuppression,
  onHighlight,
}: LabelPreviewProps) {
  const source = associatedField?.metadata?.source || "ocr";
  const confidence = associatedField?.metadata?.confidenceScore;

  return (
    <div
      style={{
        fontSize: 12,
        color: "#0f172a",
        border: highlighted ? "1px solid #0369a1" : "1px solid #cbd5e1",
        borderRadius: 8,
        padding: 10,
        background: suppressed ? "#f8fafc" : "#ffffff",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <strong>{block?.text || label.normalizedText}</strong>
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
      <div style={{ marginTop: 4, color: "#475569" }}>
        Source: {source} • Label candidate: {label.isLabel ? "yes" : "no"}
        {typeof confidence === "number" ? ` • Confidence ${confidence.toFixed(2)}` : ""}
      </div>
      <div style={{ marginTop: 4, color: "#64748b" }}>
        Block: {label.blockId}
        {block
          ? ` • Box ${Math.round(block.boundingBox.x)},${Math.round(block.boundingBox.y)} ${Math.round(block.boundingBox.width)}x${Math.round(block.boundingBox.height)}`
          : ""}
      </div>
      {label.rejectedReason ? (
        <div style={{ marginTop: 4, color: "#991b1b" }}>
          Rejection reason: {label.rejectedReason}
        </div>
      ) : null}
      {label.cues.length ? (
        <div style={{ marginTop: 4, color: "#334155" }}>
          Cues: {label.cues.join(", ")}
        </div>
      ) : null}
      <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={onAccept} style={{ fontSize: 12 }}>
          Accept label
        </button>
        <button type="button" onClick={onReject} style={{ fontSize: 12 }}>
          Reject label
        </button>
        <button type="button" onClick={onToggleSuppression} style={{ fontSize: 12 }}>
          {suppressed ? "Show OCR" : "Suppress OCR"}
        </button>
        <button type="button" onClick={onHighlight} style={{ fontSize: 12 }}>
          Highlight link
        </button>
      </div>
    </div>
  );
}