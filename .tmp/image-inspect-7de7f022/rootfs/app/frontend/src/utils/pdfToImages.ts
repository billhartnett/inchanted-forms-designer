import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import PdfJsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?worker";

// Correct worker assignment for pdfjs-dist v4 + Vite 8
GlobalWorkerOptions.workerPort = new PdfJsWorker();

export async function pdfToImages(pdfData: ArrayBuffer): Promise<string[]> {
  const loadingTask = getDocument({ data: pdfData });
  const pdf = await loadingTask.promise;

  const images: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);

    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d")!;

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: context, viewport }).promise;

    images.push(canvas.toDataURL("image/png"));
  }

  return images;
}
