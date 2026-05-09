import { useState, useRef, useEffect } from "react";
import { Stage, Layer, Rect, Text, Transformer } from "react-konva";
import PropertiesPanel from "./PropertiesPanel";

export default function Canvas() {
  const [components, setComponents] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const shapeRef = useRef<any>(null);
  const transformerRef = useRef<any>(null);

  // Attach transformer to selected component
  useEffect(() => {
    if (selectedId && transformerRef.current && shapeRef.current) {
      transformerRef.current.nodes([shapeRef.current]);
      transformerRef.current.getLayer().batchDraw();
    }
  }, [selectedId]);

  const handleDeselect = (e: any) => {
    if (e.target === e.target.getStage()) {
      setSelectedId(null);
    }
  };

  // Update component in state
  const updateComponent = (id: string, updates: any) => {
    setComponents((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...updates } : c))
    );
  };

  // Start text editing overlay
  const startTextEditing = (comp: any) => {
    const stage = shapeRef.current.getStage();
    const textNode = shapeRef.current;

    const textPosition = textNode.getAbsolutePosition();
    const stageBox = stage.container().getBoundingClientRect();

        const input = document.createElement("input");
    input.value = comp.text;
    input.style.position = "absolute";
    input.style.top = stageBox.top + textPosition.y + "px";
    input.style.left = stageBox.left + textPosition.x + "px";
    input.style.width = comp.width + "px";
    input.style.fontSize = comp.fontSize + "px";
    input.style.border = "1px solid #ccc";
    input.style.padding = "2px";
    input.style.zIndex = "1000";

    document.body.appendChild(input);
    input.focus();

    const finishEditing = () => {
      updateComponent(comp.id, { text: input.value });
      document.body.removeChild(input);
    };

    input.addEventListener("blur", finishEditing);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        finishEditing();
      }
    });
  }; // <-- THIS closes startTextEditing


  return (
    <div style={{ display: "flex", width: "100%" }}>
      {/* Canvas + Toolbox */}
      <div style={{ 
  flex: 1, 
  minWidth: 400, 
  border: "3px solid red" 
}}>

        {/* Toolbox */}
        <div style={{ padding: 10, display: "flex", gap: 10 }}>
          <button
            onClick={() => {
              const id = "comp_" + Date.now();
              setComponents([
                ...components,
                {
                  id,
                  type: "rect",
                  x: 100,
                  y: 100,
                  width: 150,
                  height: 80,
                  fill: "lightblue",
                },
              ]);
              setSelectedId(id);
            }}
          >
            Add Rectangle
          </button>

          <button
            onClick={() => {
              const id = "comp_" + Date.now();
              setComponents([
                ...components,
                {
                  id,
                  type: "text",
                  x: 120,
                  y: 120,
                  text: "New Text",
                  fontSize: 20,
                  width: 200,
                  color: "#000000",
                },
              ]);
              setSelectedId(id);
            }}
          >
            Add Text
          </button>
        </div>

        {/* Stage */}
        <Stage
          width={window.innerWidth - 300}
          height={window.innerHeight - 100}
          onMouseDown={handleDeselect}
          onTouchStart={handleDeselect}
          style={{ background: "#f8f8f8" }}
        >
          <Layer>
            {components.map((comp) => {
              const isSelected = comp.id === selectedId;

              if (comp.type === "rect") {
                return (
                  <Rect
                    key={comp.id}
                    ref={isSelected ? shapeRef : null}
                    id={comp.id}
                    x={comp.x}
                    y={comp.y}
                    width={comp.width}
                    height={comp.height}
                    fill={comp.fill}
                    draggable
                    onClick={() => setSelectedId(comp.id)}
                    onTap={() => setSelectedId(comp.id)}
                    onDragEnd={(e) =>
                      updateComponent(comp.id, {
                        x: e.target.x(),
                        y: e.target.y(),
                      })
                    }
                    onTransformEnd={() => {
                      const node = shapeRef.current;
                      updateComponent(comp.id, {
                        x: node.x(),
                        y: node.y(),
                        width: node.width() * node.scaleX(),
                        height: node.height() * node.scaleY(),
                      });
                      node.scaleX(1);
                      node.scaleY(1);
                    }}
                  />
                );
              }

              if (comp.type === "text") {
                return (
                  <Text
                    key={comp.id}
                    ref={isSelected ? shapeRef : null}
                    id={comp.id}
                    x={comp.x}
                    y={comp.y}
                    text={comp.text}
                    fontSize={comp.fontSize}
                    width={comp.width}
                    fill={comp.color}
                    draggable
                    onClick={() => setSelectedId(comp.id)}
                    onTap={() => setSelectedId(comp.id)}
                    onDblClick={() => {
                      setSelectedId(comp.id);
                      startTextEditing(comp);
                    }}
                    onDragEnd={(e) =>
                      updateComponent(comp.id, {
                        x: e.target.x(),
                        y: e.target.y(),
                      })
                    }
                    onTransformEnd={() => {
                      const node = shapeRef.current;
                      updateComponent(comp.id, {
                        x: node.x(),
                        y: node.y(),
                        width: node.width() * node.scaleX(),
                        fontSize: comp.fontSize * node.scaleY(),
                      });
                      node.scaleX(1);
                      node.scaleY(1);
                    }}
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
                  "top-center",
                  "top-right",
                  "middle-left",
                  "middle-right",
                  "bottom-left",
                  "bottom-center",
                  "bottom-right",
                ]}
              />
            )}
          </Layer>
        </Stage>
      </div>

      {/* Properties Panel */}
      <div
        style={{
          width: 260,
          borderLeft: "1px solid #ddd",
          background: "#fafafa",
        }}
      >
        <PropertiesPanel
          selected={components.find((c) => c.id === selectedId)}
          update={(updates) => updateComponent(selectedId!, updates)}
        />
      </div>
    </div>
  );
}
