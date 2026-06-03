import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker?worker";

/**
 * Convert a PDF file (as ArrayBuffer) into an array of image data URLs.
 */
export async function pdfToImages(pdfData: ArrayBuffer): Promise<string[]> {
  // IMPORTANT:
  // Do NOT set GlobalWorkerOptions.workerSrc when using Vite + ?worker.
  // Vite automatically wires the worker correctly.
  GlobalWorkerOptions.workerSrc = undefined as any;

  const loadingTask = getDocument({ data: pdfData, worker: pdfjsWorker });
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
