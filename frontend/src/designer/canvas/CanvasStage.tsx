import { Stage, Layer, Image as KonvaImage, Rect, Text } from "react-konva";
import { useDesignerStore } from "../state/useDesignerStore";
import useImage from "use-image";

export default function CanvasStage() {
  const pdfPages = useDesignerStore((s) => s.pdfPages);
  const currentPage = useDesignerStore((s) => s.currentPage);
  const fields = useDesignerStore((s) => s.fields);
  const selectedId = useDesignerStore((s) => s.selectedId);
  const setSelected = useDesignerStore((s) => s.setSelected);
  const updateField = useDesignerStore((s) => s.updateField);
  const zoom = useDesignerStore((s) => s.zoom);

  const [bg] = useImage(pdfPages[currentPage] || "");

  return (
    <Stage
      width={900}
      height={1200}
      scaleX={zoom}
      scaleY={zoom}
      onMouseDown={() => setSelected(null)}
    >
      <Layer>
        {bg && <KonvaImage image={bg} />}

        {fields.map((f) => (
          <Text
            key={f.id}
            x={f.x}
            y={f.y}
            width={f.width}
            height={f.height}
            text={f.value || ""}
            fontSize={18}
            fill={f.id === selectedId ? "blue" : "black"}
            draggable
            onClick={(e) => {
              e.cancelBubble = true;
              setSelected(f.id);
            }}
            onDragEnd={(e) => {
              updateField(f.id, {
                x: e.target.x(),
                y: e.target.y(),
              });
            }}
          />
        ))}
      </Layer>
    </Stage>
  );
}
