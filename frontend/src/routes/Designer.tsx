import { useEffect, useState } from "react";
import { Stage, Layer, Rect, Text } from "react-konva";

export default function Designer() {
  const [pages, setPages] = useState([]);
  const [selected, setSelected] = useState(null);

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      {/* Canvas */}
      <div style={{ flex: 1, background: "#f0f0f0" }}>
        <Stage width={1200} height={1600}>
          <Layer>
            {pages.flatMap((page, pageIndex) =>
              page.lines.map((line, i) => (
                <Rect
                  key={`${pageIndex}-${i}`}
                  x={line.boundingBox[0].x}
                  y={line.boundingBox[0].y}
                  width={line.boundingBox[1].x - line.boundingBox[0].x}
                  height={line.boundingBox[3].y - line.boundingBox[0].y}
                  fill={selected === line ? "rgba(0,0,255,0.2)" : "rgba(0,0,0,0.1)"}
                  stroke="blue"
                  onClick={() => setSelected(line)}
                />
              ))
            )}
          </Layer>
        </Stage>
      </div>

      {/* Sidebar */}
      <div style={{ width: 350, padding: 20, background: "#fff", borderLeft: "1px solid #ccc" }}>
        <h3>Field Details</h3>
        {selected ? (
          <>
            <p><strong>Text:</strong> {selected.content}</p>
            <button onClick={() => fetchSuggestions(selected)}>Suggest ACORD Labels</button>
          </>
        ) : (
          <p>Select a field on the form</p>
        )}
      </div>
    </div>
  );
}
