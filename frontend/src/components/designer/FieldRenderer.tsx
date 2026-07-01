import type { Field } from "../../state/designerStore";
import { Group as KonvaGroup, Rect, Text } from "react-konva";

export type FieldRendererProps = {
  field: Field;
};

export function FieldRenderer({ field }: FieldRendererProps) {
  const { width, height, metadata } = field;
  const resolvedLabel =
    metadata?.acordLabel?.trim() || metadata?.acordCode?.trim() || field.type;
  const confidence = metadata?.confidence ?? 0.5;
  
  // Color coding based on confidence
  const strokeColor =
    confidence > 0.8
      ? "#16a34a" // green for high confidence
      : confidence > 0.6
        ? "#ea580c" // orange for medium
        : "#dc2626"; // red for low

  return (
    <KonvaGroup x={0} y={0}>
      {/* Field bounding box */}
      <Rect
        x={0}
        y={0}
        width={Math.max(20, width)}
        height={Math.max(20, height)}
        fill="#ffffff"
        stroke={strokeColor}
        strokeWidth={2}
        cornerRadius={4}
      />
      {/* Field label */}
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
      {/* Confidence badge */}
      <Text
        x={width - 28}
        y={height - 18}
        text={`${(confidence * 100).toFixed(0)}%`}
        fontSize={9}
        fontFamily="Geist Variable"
        fill="#64748b"
        align="right"
      />
    </KonvaGroup>
  );
}

export default FieldRenderer;
