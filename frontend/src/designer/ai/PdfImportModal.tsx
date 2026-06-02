import { pdfToImages } from "../utils/pdfToImages";
import { useDesignerStore } from "../state/useDesignerStore";

export default function PdfImportModal({ onClose }: { onClose: () => void }) {
  const setPdfPages = useDesignerStore((s) => s.setPdfPages);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const pages = await pdfToImages(file);
      console.log("Imported PDF pages:", pages.length);
      setPdfPages(pages);
      onClose();
    } catch (err) {
      console.error("PDF import error:", err);
    }
  }

  return (
    <div style={{ padding: 12 }}>
      <input type="file" accept="application/pdf" onChange={handleFile} />
      <button onClick={onClose}>Close</button>
    </div>
  );
}
