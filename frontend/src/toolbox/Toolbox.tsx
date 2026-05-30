import { useState } from "react";
import { useDesignerStore } from "../state/useDesignerStore";
import PdfImportModal from "../ai/PdfImportModal";

export default function Toolbox() {
  const addField = useDesignerStore((s) => s.addField);
  const zoom = useDesignerStore((s) => s.zoom);
  const setZoom = useDesignerStore((s) => s.setZoom);

  const pdfPages = useDesignerStore((s) => s.pdfPages);
  const currentPage = useDesignerStore((s) => s.currentPage);
  const setCurrentPage = useDesignerStore((s) => s.setCurrentPage);

  const [showPdfModal, setShowPdfModal] = useState(false);

  return (
    <>
      <div
        style={{
          padding: 12,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          pointerEvents: "auto",
        }}
      >
        <div style={{ fontWeight: "bold" }}>Fields</div>

        <button
          onClick={() =>
            addField({
              id: "rect_" + Date.now(),
              type: "rect",
              x: 100,
              y: 100,
              width: 150,
              height: 80,
              fill: "lightblue",
            })
          }
        >
          Rectangle
        </button>

        <button
          onClick={() =>
            addField({
              id: "text_" + Date.now(),
              type: "text",
              x: 120,
              y: 120,
              width: 200,
              text: "New Text",
              fontSize: 20,
              color: "#000000",
            })
          }
        >
          Text
        </button>

        <hr />

        <div style={{ fontWeight: "bold" }}>PDF</div>
        <button onClick={() => setShowPdfModal(true)}>Import PDF</button>

        {pdfPages.length > 0 && (
          <>
            <div>
              Page {currentPage + 1} / {pdfPages.length}
            </div>
            <button
              onClick={() => setCurrentPage(currentPage - 1)}
              disabled={currentPage === 0}
            >
              Prev
            </button>
            <button
              onClick={() => setCurrentPage(currentPage + 1)}
              disabled={currentPage === pdfPages.length - 1}
            >
              Next
            </button>
          </>
        )}

        <hr />

        <div style={{ fontWeight: "bold" }}>Canvas</div>
        <button onClick={() => setZoom(zoom + 0.1)}>Zoom In</button>
        <button onClick={() => setZoom(zoom - 0.1)}>Zoom Out</button>
        <button onClick={() => setZoom(1)}>Reset Zoom</button>
      </div>

      {showPdfModal && (
        <PdfImportModal onClose={() => setShowPdfModal(false)} />
      )}
    </>
  );
}
