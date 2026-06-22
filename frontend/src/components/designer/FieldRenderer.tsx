import type { Field } from "../../state/designerStore";
import { Group as KonvaGroup, Rect, Text } from "react-konva";

export type FieldRendererProps = {
  field: Field;
};

export function FieldRenderer({ field }: FieldRendererProps) {
  const { width, height, metadata } = field;
  const resolvedLabel =
    metadata?.acordLabel?.trim() || metadata?.acordCode?.trim() || field.type;
  return (
    <KonvaGroup x={0} y={0}>
      <Rect
        x={0}
        y={0}
        width={Math.max(20, width)}
        height={Math.max(20, height)}
        fill="#ffffff"
        stroke="#1e293b"
        strokeWidth={1}
        cornerRadius={4}
      />
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
    </KonvaGroup>
  );
}

export default FieldRenderer;
