import { Stage, Layer, Rect, Text, Transformer, Line } from "react-konva";
import { useRef, useEffect, useMemo } from "react";

import { useDesignerStore } from "../designer/state/useDesignerStore";
import { useGuidesStore } from "./useGuidesStore";

const GRID_SIZE = 20;

export function CanvasStage() {
  const stageRef = useRef<any>(null);
  const transformerRef = useRef<any>(null);

  // Designer store
  const fields = useDesignerStore((s) => s.fields);
  const selectedId = useDesignerStore((s) => s.selectedId);
  const updateField = useDesignerStore((s) => s.updateField);
  const selectField = useDesignerStore((s) => s.selectField);

  // Guides
  const { vertical, horizontal, setVertical, setHorizontal, clearGuides } =
    useGuidesStore();

  // Zoom + pan (local)
  const zoomRef = useRef(1);
  const offsetRef = useRef({ x: 0, y: 0 });

  // Grid lines
  const gridLines = useMemo(() => {
    const lines: { points: number[] }[] = [];
    const width = window.innerWidth;
    const height = window.innerHeight;

    for (let x = 0; x < width; x += GRID_SIZE) {
      lines.push({ points: [x, 0, x, height] });
    }
    for (let y = 0; y < height; y += GRID_SIZE) {
      lines.push({ points: [0, y, width, y] });
    }
    return lines;
  }, []);

  // Attach transformer to selected node
  useEffect(() => {
    if (!transformerRef.current || !stageRef.current || !selectedId) return;

    const selectedNode = stageRef.current.findOne(`#${selectedId}`);
    if (selectedNode) {
      transformerRef.current.nodes([selectedNode]);
      transformerRef.current.getLayer().batchDraw();
    }
  }, [selectedId]);

  // Zoom handler
  const handleWheel = (e: any) => {
    e.evt.preventDefault();

    const scaleBy = 1.05;
    const oldScale = zoomRef.current;
    const pointer = stageRef.current.getPointerPosition();

    const mousePointTo = {
      x: (pointer.x - offsetRef.current.x) / oldScale,
      y: (pointer.y - offsetRef.current.y) / oldScale,
    };

    const newScale = e.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy;

    zoomRef.current = newScale;

    const newPos = {
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    };

    offsetRef.current = newPos;

    stageRef.current.scale({ x: newScale, y: newScale });
    stageRef.current.position(newPos);
    stageRef.current.batchDraw();
  };

  // Pan canvas
  const handleDragMove = (e: any) => {
    offsetRef.current = e.target.position();
  };

  // Deselect when clicking empty space
  const handleDeselect = (e: any) => {
    if (e.target === e.target.getStage()) {
      selectField(null);
      clearGuides();
    }
  };

  // Snap helper
  const snap = (value: number) => Math.round(value / GRID_SIZE) * GRID_SIZE;

  // Dragging shapes with snapping + guides
  const handleDrag = (id: string, e: any) => {
    const node = e.target;
    const snappedX = snap(node.x());
    const snappedY = snap(node.y());

    updateField(id, {
      x: snappedX,
      y: snappedY,
    });

    setVertical(snappedX);
    setHorizontal(snappedY);
  };

  // Resize shapes with snapping
  const handleTransform = (id: string, node: any) => {
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();

    const newWidth = Math.max(20, node.width() * scaleX);
    const newHeight = Math.max(20, node.height() * scaleY);

    updateField(id, {
      x: snap(node.x()),
      y: snap(node.y()),
      width: snap(newWidth),
      height: snap(newHeight),
    });

    node.scaleX(1);
    node.scaleY(1);
  };

  return (
    <Stage
      ref={stageRef}
      width={window.innerWidth}
      height={window.innerHeight}
      draggable
      onDragMove={handleDragMove}
      onWheel={handleWheel}
      onMouseDown={handleDeselect}
      style={{ background: "#fff" }}
    >
      {/* GRID LAYER */}
      <Layer listening={false}>
        {gridLines.map((line, i) => (
          <Line key={i} points={line.points} stroke="#eee" strokeWidth={1} />
        ))}
      </Layer>

      {/* GUIDES LAYER */}
      <Layer listening={false}>
        {vertical !== null && (
          <Line
            points={[vertical, 0, vertical, window.innerHeight]}
            stroke="#4a90e2"
            strokeWidth={1}
            dash={[4, 4]}
          />
        )}
        {horizontal !== null && (
          <Line
            points={[0, horizontal, window.innerWidth, horizontal]}
            stroke="#4a90e2"
            strokeWidth={1}
            dash={[4, 4]}
          />
        )}
      </Layer>

      {/* MAIN FIELDS LAYER */}
      <Layer>
        {fields.map((f) => {
          if (f.type === "rect") {
            return (
              <Rect
                key={f.id}
                id={f.id}
                x={f.x}
                y={f.y}
                width={f.width}
                height={f.height}
                fill={f.fill}
                draggable
                onClick={() => selectField(f.id)}
                onTap={() => selectField(f.id)}
                onDragMove={(e) => handleDrag(f.id, e)}
                onTransformEnd={(e) => handleTransform(f.id, e.target)}
              />
            );
          }

          if (f.type === "text") {
            return (
              <Text
                key={f.id}
                id={f.id}
                x={f.x}
                y={f.y}
                text={f.text}
                fontSize={f.fontSize}
                fill={f.color}
                draggable
                onClick={() => selectField(f.id)}
                onTap={() => selectField(f.id)}
                onDragMove={(e) => handleDrag(f.id, e)}
              />
            );
          }

          return null;
        })}

        <Transformer ref={transformerRef} rotateEnabled={false} />
      </Layer>
    </Stage>
  );
}
