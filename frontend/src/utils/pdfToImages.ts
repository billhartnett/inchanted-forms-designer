import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import PdfJsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?worker";

// Correct worker assignment for pdfjs-dist v4 + Vite 8
GlobalWorkerOptions.workerPort = new PdfJsWorker();

export type PdfWidgetField = {
  id: string;
  page: number;
  fieldName: string;
  valueType: "text" | "numeric" | "date" | "currency" | "percentage" | "checkbox" | "dropdown" | "signature";
  boundingBox: { x: number; y: number; width: number; height: number };
};

export type PdfDesignerData = {
  images: string[];
  widgets: PdfWidgetField[];
};

function widgetValueType(annotation: any): PdfWidgetField["valueType"] {
  if (annotation.checkBox || annotation.radioButton || annotation.fieldType === "Btn") return "checkbox";
  if (annotation.fieldType === "Ch") return "dropdown";
  if (annotation.fieldType === "Sig") return "signature";
  const name = String(annotation.fieldName || "").toLowerCase();
  if (/date|effective|expiration|birth/.test(name)) return "date";
  if (/percent|percentage|rate/.test(name)) return "percentage";
  if (/currency|premium|payroll|receipts|amount|cost|limit/.test(name)) return "currency";
  if (/phone|fax|postal|zip|count|number/.test(name)) return "numeric";
  return "text";
}

export async function pdfToDesignerData(pdfData: ArrayBuffer): Promise<PdfDesignerData> {
  const loadingTask = getDocument({ data: pdfData });
  const pdf = await loadingTask.promise;

  const images: string[] = [];
  const widgets: PdfWidgetField[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);

    const viewport = page.getViewport({ scale: 2 });
    const fieldViewport = page.getViewport({ scale: 96 / 72 });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d")!;

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: context, viewport }).promise;

    images.push(canvas.toDataURL("image/png"));

    const annotations = await page.getAnnotations({ intent: "display" });
    for (let index = 0; index < annotations.length; index += 1) {
      const annotation = annotations[index] as any;
      if (annotation.subtype !== "Widget" || !Array.isArray(annotation.rect)) continue;
      const [left, top, right, bottom] = fieldViewport.convertToViewportRectangle(annotation.rect);
      const x = Math.min(left, right);
      const y = Math.min(top, bottom);
      const width = Math.abs(right - left);
      const height = Math.abs(bottom - top);
      if (width <= 0 || height <= 0) continue;
      const fieldName = String(annotation.fieldName || `Field ${index + 1}`).trim();
      const stableName = fieldName.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || `field-${index + 1}`;
      widgets.push({
        id: `pdf-widget-p${pageNum}-${index + 1}-${stableName}`,
        page: pageNum,
        fieldName,
        valueType: widgetValueType(annotation),
        boundingBox: { x, y, width, height },
      });
    }
  }

  return { images, widgets };
}

export async function pdfToImages(pdfData: ArrayBuffer): Promise<string[]> {
  return (await pdfToDesignerData(pdfData)).images;
}
