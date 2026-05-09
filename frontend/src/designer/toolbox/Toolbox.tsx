import React, { useState } from "react";
import { useDesignerStore } from "../state/useDesignerStore";
import PdfImportModal from "../ai/PdfImportModal";

export default function Toolbox() {
  const addField = useDesignerStore((s) => s.addField);
  const zoomIn = useDesignerStore((s) => s.zoomIn);
  const zoomOut = useDesignerStore((s) => s.zoomOut);
  const zoomReset = useDesignerStore((s) => s.zoomReset);

  const [showPdfModal, setShowPdfModal] = useState(false);

  const addRect = () => {
    addField({
      id: "rect_" + Date.now(),
      type: "rect",
      x: 100,
      y: 100,
      width: 150,
      height: 80,
      fill: "lightblue",
    });
  };

  const addText = () => {
    addField({
      id: "text_" + Date.now(),
      type: "text",
      x: 120,
      y: 120,
      width: 200,
      height: 30,
      text: "New Text",
      fontSize: 20,
      color: "#000000",
    });
  };

  return (
    <>
      <div
        style={{
          width: 150,
          background: "#f3f3f3",
          borderRight: "1px solid #ccc",
          padding: 10,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div style={{ fontWeight: "bold" }}>Fields</div>
        <button onClick={addRect}>Rectangle</button>
        <button onClick={addText}>Text</button>

        <hr />

        <button onClick={() => setShowPdfModal(true)}>Import PDF</button>

        <hr />

        <div style={{ fontWeight: "bold" }}>Canvas</div>
        <button onClick={() => zoomIn()}>Zoom In</button>
        <button onClick={() => zoomOut()}>Zoom Out</button>
        <button onClick={() => zoomReset()}>Reset Zoom</button>
      </div>

      {showPdfModal && (
        <PdfImportModal onClose={() => setShowPdfModal(false)} />
      )}
    </>
  );
}
