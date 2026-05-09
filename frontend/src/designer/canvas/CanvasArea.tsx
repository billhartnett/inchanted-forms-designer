import { useDrop } from "react-dnd";
import { useState } from "react";

export default function CanvasArea() {
  const [items, setItems] = useState([]);

  const [{ isOver }, dropRef] = useDrop(() => ({
    accept: "COMPONENT",
    drop: (item) => {
      setItems((prev) => [...prev, item]);
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
    }),
  }));

  return (
    <div
      ref={dropRef}
      style={{
        minHeight: "600px",
        background: isOver ? "#f0f8ff" : "white",
        border: "1px dashed #bbb",
        borderRadius: "8px",
        padding: "1rem",
      }}
    >
      <h2>Canvas</h2>

      {items.length === 0 && <p>Drag components here</p>}

      {items.map((item, index) => (
        <CanvasItem key={index} item={item} />
      ))}
    </div>
  );
}

function CanvasItem({ item }) {
  return (
    <div
      style={{
        padding: "10px",
        marginBottom: "10px",
        background: "#fafafa",
        border: "1px solid #ddd",
        borderRadius: "4px",
      }}
    >
      {item.label}
    </div>
  );
}
