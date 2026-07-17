import type { Field } from "../../state/designerStore";
import { Group as KonvaGroup, Rect, Text, Circle } from "react-konva";

export type FieldRendererProps = {
  field: Field;
  showSemanticLabels?: boolean;
};

export function FieldRenderer({ field, showSemanticLabels = true }: FieldRendererProps) {
  const { width, height, metadata } = field;
  const resolvedLabel =
    metadata?.acordLabel?.trim() ||
    metadata?.semanticLabel?.trim() ||
    metadata?.acordCode?.trim() ||
    (field.type === "checkbox" || field.type === "radio" ? (field as any).label : "") ||
    (field.type === "text" ? (field as any).text : "") ||
    field.type;
  const semanticLabel = metadata?.semanticLabel?.trim();
  const confidence = metadata?.confidenceScore ?? 0.5;
  const categoryMode = metadata?.categoryMode;
  const checkboxState = metadata?.checkboxState;
  const signatureState = metadata?.signatureState;
  const kvpData = metadata?.kvpData;
  const textField = field.type === "text" ? (field as any) : null;

  // Color coding: confidence (main) + categoryMode (secondary)
  let strokeColor = "#64748b"; // default gray
  if (categoryMode === "strict") {
    strokeColor = "#7c3aed"; // violet for strict mode
  } else if (confidence > 0.8) {
    strokeColor = "#16a34a"; // green for high confidence
  } else if (confidence > 0.6) {
    strokeColor = "#ea580c"; // orange for medium
  } else {
    strokeColor = "#dc2626"; // red for low
  }

  // Fill based on field type
  let fillColor = "#ffffff";
  if (checkboxState?.isCheckbox) {
    fillColor = checkboxState.checked ? "#e0e7ff" : "#ffffff";
  } else if (signatureState?.isSignature) {
    fillColor = signatureState.signed ? "#fef3c7" : "#ffffff";
  } else if (kvpData) {
    fillColor = "#f0f9ff"; // light blue for KVP
  }

  const checkboxLabel =
    metadata?.acordLabel?.trim() ||
    metadata?.semanticLabel?.trim() ||
    (field.type === "checkbox" ? (field as any).label : undefined);

  return (
    <KonvaGroup x={0} y={0}>
      {/* Field bounding box */}
      <Rect
        x={0}
        y={0}
        width={Math.max(20, width)}
        height={Math.max(20, height)}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={2}
        cornerRadius={4}
      />

      {/* Semantic label overlay (if enabled) */}
      {showSemanticLabels && semanticLabel && (
        <Text
          x={4}
          y={2}
          text={`⚙ ${semanticLabel}`}
          fontSize={10}
          fontFamily="Geist Variable"
          fill="#6366f1"
          opacity={0.8}
        />
      )}

      {/* Checkbox rendering */}
      {field.type === "checkbox" && (
        <>
          <Rect
            x={2}
            y={2}
            width={Math.max(14, Math.min(18, width - 4))}
            height={Math.max(14, Math.min(18, height - 4))}
            fill="#ffffff"
            stroke="#0f172a"
            strokeWidth={1}
            cornerRadius={2}
          />
          {(checkboxState?.checked || (field as any).checked) && (
            <Text
              x={4}
              y={1}
              text="✓"
              fontSize={12}
              fontFamily="Geist Variable"
              fill="#0f766e"
            />
          )}
          {checkboxLabel && (
            <Text
              x={24}
              y={4}
              width={Math.max(0, width - 26)}
              text={checkboxLabel}
              fontSize={11}
              fontFamily="Geist Variable"
              fill="#0f172a"
              ellipsis
            />
          )}
        </>
      )}

      {/* Signature indicator */}
      {signatureState?.isSignature && (
        <Text
          x={width - 16}
          y={6}
          text="✎"
          fontSize={12}
          fontFamily="Geist Variable"
          fill={signatureState.signed ? "#f59e0b" : "#9ca3af"}
        />
      )}

      {/* Field label or KVP content */}
      {field.type !== "checkbox" && (
        <Text
          x={8}
          y={kvpData ? 4 : 6}
          width={Math.max(0, width - 32)}
          height={Math.max(0, height - 12)}
          text={
            kvpData
              ? `${kvpData.key}: ${kvpData.value}`
              : resolvedLabel
          }
          fontSize={12}
          fontFamily="Geist Variable"
          fontStyle={textField?.fontStyle || "normal"}
          lineHeight={textField?.lineHeight || 1.2}
          letterSpacing={textField?.letterSpacing || 0}
          textDecoration={textField?.underline ? "underline" : undefined}
          fill="#0f172a"
          verticalAlign={kvpData ? "top" : "middle"}
          ellipsis
        />
      )}

      {/* Category mode badge */}
      {categoryMode && (
        <Text
          x={width - 40}
          y={height - 16}
          text={categoryMode === "strict" ? "STRICT" : categoryMode}
          fontSize={8}
          fontFamily="Geist Variable"
          fill="#7c3aed"
          opacity={0.7}
          align="right"
        />
      )}

      {/* Confidence badge */}
      <Text
        x={4}
        y={height - 16}
        text={`${(confidence * 100).toFixed(0)}%`}
        fontSize={9}
        fontFamily="Geist Variable"
        fill="#64748b"
      />
    </KonvaGroup>
  );
}

export default FieldRenderer;
