import {
  Stage,
  Layer,
  Rect,
  Text,
  Transformer,
  Image as KonvaImage,
} from "react-konva";
import { useDesignerStore } from "../state/useDesignerStore";
import { useRef, useEffect, useState } from "react";
import useImage from "use-image";

export default function CanvasStage() {
  // ⭐ DEBUG: Confirm component is actually rendering
  console.log("CanvasStage mounted");

  const fields = useDesignerStore((s) => s.fields);
  const selectedId = useDesignerStore((s) => s.selectedId);
  const setSelected = useDesignerStore((s) => s.setSelected);
  const updateField = useDesignerStore((s) => s.updateField);
  const zoom = useDesignerStore((s) => s.zoom);

  const pdfPages = useDesignerStore((s) => s.pdfPages);
  const currentPage = useDesignerStore((s) => s.currentPage);

  const hasPage = pdfPages.length > 0;

  // ⭐ DEBUG: Show exactly what URL we are trying to load
  console.log(
    "PDF page URL:",
    hasPage ? pdfPages[currentPage] : "NO PAGE LOADED"
  );

  const [bg] = useImage(hasPage ? pdfPages[currentPage] : undefined);

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);

  // Measure container width
  useEffect(() => {
    const update = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth);
      }
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Compute scaling based on PDF image size
  let fitScale = 1;
  let stageWidth = 800;
  let stageHeight = 600;

  if (bg) {
    fitScale = containerWidth / bg.width;
    stageWidth = bg.width * fitScale;
    stageHeight = bg.height * fitScale;
  }

  const finalScale = fitScale * zoom;

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
    <div ref={containerRef} style={{ width: "100%" }}>
      <Stage
        width={stageWidth}
        height={stageHeight}
        scaleX={finalScale}
        scaleY={finalScale}
        onMouseDown={handleDeselect}
        style={{
          background: "#f0f0f0",
          boxShadow: "0 0 4px rgba(0,0,0,0.15)",
        }}
      >
        <Layer>
          {/* PDF background */}
          {bg && (
            <KonvaImage
              image={bg}
              x={0}
              y={0}
              width={bg.width}
              height={bg.height}
              listening={false}
            />
          )}

          {/* Fields */}
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

          {/* Transformer */}
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
    </div>
  );
}
