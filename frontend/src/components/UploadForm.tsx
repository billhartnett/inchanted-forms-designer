import { useState } from "react";
import { pdfToImages } from "../utils/pdfToImages";

export default function UploadForm({ onExtracted }) {
  const [file, setFile] = useState<File | null>(null);

  async function handleUpload() {
  if (!file) return;

  // Convert PDF → ArrayBuffer → images
  const arrayBuffer = await file.arrayBuffer();
  const images = await pdfToImages(arrayBuffer);

  // Extract text from backend
  const form = new FormData();
  form.append("file", file);

  const res = await fetch("/api/extractText", {
    method: "POST",
    body: form
  });

  const json = await res.json();

  // Pass both to the designer
  onExtracted({ pages: json.pages, images });
}


  return (
    <div style={{ padding: 20 }}>
      <input
        type="file"
        accept="application/pdf"
        onChange={e => setFile(e.target.files?.[0] || null)}
      />
      <button onClick={handleUpload}>Extract Text</button>
    </div>
  );
}
