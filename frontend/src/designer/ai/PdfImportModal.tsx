import { useState } from "react";
import { pdfToImages } from "../utils/pdfUtils";
import { useDesignerStore } from "../state/useDesignerStore";

export default function PdfImportModal({ onClose }: { onClose: () => void }) {
  const setPdfPages = useDesignerStore((s) => s.setPdfPages);
  const [loading, setLoading] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    const pages = await pdfToImages(file);
    setPdfPages(pages);
    setLoading(false);
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        style={{
          background: "#fff",
          padding: 20,
          borderRadius: 8,
          width: 300,
        }}
      >
        <h3>Import PDF</h3>

        {loading ? (
          <div>Processing PDF…</div>
        ) : (
          <input type="file" accept="application/pdf" onChange={handleFile} />
        )}

        <button onClick={onClose} style={{ marginTop: 10 }}>
          Close
        </button>
      </div>
    </div>
  );
}
