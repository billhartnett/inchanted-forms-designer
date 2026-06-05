import React from "react";

function ZoomControls({
  zoomIn,
  zoomOut,
  reset,
}: {
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: 20,
        right: 20,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        background: "white",
        padding: 8,
        borderRadius: 6,
        boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
        zIndex: 10,
      }}
    >
      <button onClick={zoomIn}>+</button>
      <button onClick={zoomOut}>−</button>
      <button onClick={reset}>Reset</button>
    </div>
  );
}

export default ZoomControls;
