import { Stage, Layer, Rect, Text, Transformer } from "react-konva";
import { useDesignerStore } from "../state/useDesignerStore";
import { useRef, useEffect } from "react";

export default function CanvasStage() {
  const fields = useDesignerStore((s) => s.fields);
  const selectedId = useDesignerStore((s) => s.selectedId);
  const setSelected = useDesignerStore((s) => s.setSelected);
  const updateField = useDesignerStore((s) => s.updateField);
  const zoom = useDesignerStore((s) => s.zoom);

  const shapeRef = useRef<any>(null);
  const transformerRef = useRef<any>(null);

  useEffect(() => {
    if (!selectedId) return;
    const node = shapeRef.current;
    const tr = transformerRef.current;
    if (node && tr) {
      tr.nodes([node]);
      tr.getLayer().batchDraw();
    }
  }, [selectedId]);

  const handleDeselect = (e: any) => {
    if (e.target === e.target.getStage()) {
      setSelected(null);
    }
  };

  return (
    <Stage
      width={800}
      height={600}
      scaleX={zoom}
      scaleY={zoom}
      onMouseDown={handleDeselect}
      style={{ background: "#fafafa" }}
    >
      <Layer>
        {fields.map((f) => {
          const isSelected = f.id === selectedId;

          if (f.type === "rect") {
            return (
              <Rect
                key={f.id}
                ref={isSelected ? shapeRef : null}
                x={f.x}
                y={f.y}
                width={f.width}
                height={f.height}
                fill={f.fill}
                draggable
                onClick={() => setSelected(f.id)}
                onDragEnd={(e) =>
                  updateField(f.id, {
                    x: e.target.x(),
                    y: e.target.y(),
                  })
                }
                onTransformEnd={(e) => {
                  const node = e.target;
                  const scaleX = node.scaleX();
                  const scaleY = node.scaleY();
                  node.scaleX(1);
                  node.scaleY(1);
                  updateField(f.id, {
                    x: node.x(),
                    y: node.y(),
                    width: Math.max(20, node.width() * scaleX),
                    height: Math.max(20, node.height() * scaleY),
                  });
                }}
              />
            );
          }

          if (f.type === "text") {
            return (
              <Text
                key={f.id}
                ref={isSelected ? shapeRef : null}
                x={f.x}
                y={f.y}
                width={f.width}
                text={f.text}
                fontSize={f.fontSize}
                fill={f.color}
                draggable
                onClick={() => setSelected(f.id)}
                onDragEnd={(e) =>
                  updateField(f.id, {
                    x: e.target.x(),
                    y: e.target.y(),
                  })
                }
              />
            );
          }

          return null;
        })}

        {selectedId && (
          <Transformer
            ref={transformerRef}
            rotateEnabled={true}
            enabledAnchors={[
              "top-left",
              "top-right",
              "bottom-left",
              "bottom-right",
            ]}
          />
        )}
      </Layer>
    </Stage>
  );
}
