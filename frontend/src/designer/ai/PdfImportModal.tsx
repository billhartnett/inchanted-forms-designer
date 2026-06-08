import { pdfToImages } from "../../utils/pdfToImages";
import { useState, type ChangeEvent } from "react";
import { useDesignerStore } from "../state/useDesignerStore";

type ImportResult = {
  importedPages: number;
  mappedFields: number;
  warning?: string;
};

type PdfImportModalProps = {
  onClose: () => void;
  onImportResult?: (result: ImportResult) => void;
  mode?: "import" | "map-only";
};

type ExtractTextLine = {
  content?: string;
  confidence?: number;
  role?: string;
  boundingBox?:
    | Array<number>
    | Array<{
        x?: number;
        y?: number;
      }>;
};

type ExtractTextPage = {
  pageNumber?: number;
  width?: number;
  height?: number;
  lines?: ExtractTextLine[];
};

type ExtractTextResponse = {
  pages?: ExtractTextPage[];
};

type ExtractedBlock = {
  id: string;
  page: number;
  type: "text" | "checkbox" | "radio" | "signature" | "table" | "kvp";
  text: string;
  boundingBox: { x: number; y: number; width: number; height: number };
  confidence: number;
};

type MapFieldsResponse = {
  mappings?: Array<{
    blockId: string;
    page: number;
    text: string;
    boundingBox: { x: number; y: number; width: number; height: number };
    suggestions: Array<{
      acordCode: string;
      label: string;
      description?: string;
      confidenceScore: number;
      source: "ai" | "dictionary" | "heuristic";
    }>;
    chosen?: {
      acordCode: string;
      label: string;
      description?: string;
      confidenceScore: number;
      source: "ai" | "dictionary" | "heuristic";
    };
  }>;
};

type MapFieldMapping = NonNullable<MapFieldsResponse["mappings"]>[number];

type DraftMappedField = {
  blockId: string;
  blockType: ExtractedBlock["type"];
  pageIndex: number;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  accepted: boolean;
  chosen?: {
    acordCode: string;
    label: string;
    description?: string;
    confidenceScore: number;
    source: "ai" | "dictionary" | "heuristic";
  };
};

type AutoMapSummary = {
  totalBlocks: number;
  keptBlocks: number;
  filteredBlocks: number;
  filteredByReason: Record<string, number>;
  filteredSamples: Array<{ reason: string; text: string }>;
  candidateMappings: number;
  keptMappings: number;
  filteredMappings: number;
};

const API_BASE_URL = (() => {
  const configured = (
    import.meta.env.VITE_API_BASE_URL as string | undefined
  )?.trim();
  if (configured) {
    return configured;
  }

  if (typeof window === "undefined") {
    return "";
  }

  const { hostname, protocol } = window.location;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return `${protocol}//${hostname}:7071`;
  }

  return "";
})();

function apiUrl(path: string): string {
  if (!API_BASE_URL) {
    return path;
  }

  return `${API_BASE_URL}${path}`;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    let message = `Request failed: ${response.status}`;
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload?.error) {
        message = payload.error;
      }
    } catch {
      // Ignore non-JSON errors.
    }

    throw new Error(message);
  }

  return (await response.json()) as T;
}

function toPointArray(
  polygon: ExtractTextLine["boundingBox"],
): Array<{ x: number; y: number }> {
  if (!Array.isArray(polygon) || polygon.length === 0) {
    return [];
  }

  if (typeof polygon[0] === "number") {
    const numeric = polygon as number[];
    const points: Array<{ x: number; y: number }> = [];
    for (let i = 0; i + 1 < numeric.length; i += 2) {
      points.push({
        x: Number(numeric[i]) || 0,
        y: Number(numeric[i + 1]) || 0,
      });
    }
    return points;
  }

  return (polygon as Array<{ x?: number; y?: number }>).map((point) => ({
    x: Number(point?.x) || 0,
    y: Number(point?.y) || 0,
  }));
}

function boundsFromPolygon(
  polygon: ExtractTextLine["boundingBox"],
  scaleX: number,
  scaleY: number,
) {
  const points = toPointArray(polygon);
  if (points.length === 0) {
    return { x: 32, y: 32, width: 1, height: 1 };
  }

  const xs = points.map((p) => p.x * scaleX);
  const ys = points.map((p) => p.y * scaleY);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    x: Math.max(0, minX),
    y: Math.max(0, minY),
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

function hasAlphabetic(text: string) {
  return /[a-z]/i.test(text);
}

function normalizeOcrText(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasFieldCueToken(text: string) {
  const normalized = normalizeOcrText(text);
  if (!normalized) return false;

  return /(name|address|city|state|zip|postal|phone|email|dob|birth|date|policy|insured|applicant|license|years|employees|number of)/.test(
    normalized,
  );
}

function isLikelyInstructionOrQuestion(text: string) {
  const normalized = normalizeOcrText(text);
  if (!normalized) return false;

  if (/[?]$/.test(text.trim())) return true;

  if (
    /^(if yes|if no|please explain|describe|list |include |to be submitted)/.test(
      normalized,
    )
  ) {
    return true;
  }

  return /(supplemental application|submitted with acord|claims during the last|operations in detail)/.test(
    normalized,
  );
}

function isLikelyHeaderLogoText(text: string) {
  const normalized = normalizeOcrText(text);
  if (!normalized) return false;

  const hasOrgWords =
    /(insurance company|agency|services|corporation|inc|llc|www|phone|fax)/.test(
      normalized,
    );
  const hasPhoneLike = /(\d{3}[\s\-\)]*\d{3}[\s\-]\d{4})/.test(text);
  return hasOrgWords || hasPhoneLike;
}

function isLikelySectionTitle(text: string) {
  const normalized = normalizeOcrText(text);
  if (!normalized) return false;

  const tokens = normalized.split(" ").filter(Boolean);
  if (tokens.length < 3) return false;

  const hasTitleWords =
    /(application|supplemental|coverage|insurance|contractors)/.test(
      normalized,
    );

  const uppercaseOnly = text
    .replace(/[^A-Za-z]/g, "")
    .split("")
    .every((char) => char === char.toUpperCase());

  return hasTitleWords || uppercaseOnly;
}

function isLikelyTabularSchemaText(text: string) {
  const normalized = normalizeOcrText(text);
  if (!normalized) return false;

  if (/^\d+\.$/.test(normalized) || /^[a-z]\.$/.test(normalized)) {
    return true;
  }

  if (/\byes\b.*\bno\b|\bno\b.*\byes\b/.test(normalized)) {
    return true;
  }

  return /(type of work performed|receipts|location|start date|end date|full time employees|part time employees|day laborers|kind of license|license no|year license issued|date of corporate filing)/.test(
    normalized,
  );
}

function isAllCapsShortLabel(text: string) {
  const normalized = text.trim().replace(/[^A-Za-z\s]/g, "");
  if (!normalized) return false;

  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || tokens.length > 3) return false;

  const allCaps = tokens.every((token) => /^[A-Z]+$/.test(token));
  const shortWordCount = tokens.every((token) => token.length <= 6);

  return allCaps && shortWordCount;
}

function inferBlockType(text: string): ExtractedBlock["type"] {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  if (/\u2610|\u2611|\u2612|\[\s?\]|\(\s?\)/.test(trimmed)) {
    return "checkbox";
  }

  if (/signature|sign here|signed by|authorized signature/i.test(lower)) {
    return "signature";
  }

  if (/^[a-z0-9\s\-\/\.,#&]+:\s*.+$/i.test(trimmed)) {
    return "kvp";
  }

  return "text";
}

function isValueLikeField(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return false;

  if (trimmed.endsWith(":")) return false;

  return (
    /\d/.test(trimmed) ||
    /\b(yes|no|n\/a|male|female)\b/i.test(trimmed) ||
    /^[A-Za-z][A-Za-z\s'\-]+$/.test(trimmed)
  );
}

function blockPriority(block: ExtractedBlock): number {
  if (block.type === "kvp") return 100;
  if (block.type === "checkbox" || block.type === "radio") return 90;
  if (block.type === "signature") return 80;
  if (isValueLikeField(block.text)) return 70;
  return 10;
}

function getRejectionReason(
  block: ExtractedBlock,
  pageSize?: { width: number; height: number },
): string | null {
  const text = block.text.trim();
  const headerThresholdY = pageSize ? pageSize.height * 0.16 : 180;
  const inHeaderZone = block.boundingBox.y <= headerThresholdY;
  const hasFieldCue = hasFieldCueToken(text);

  if (text.length < 3) return "text_too_short";
  if (!hasAlphabetic(text)) return "no_alpha_chars";
  if (block.confidence < 0.5) return "low_confidence";
  if (block.boundingBox.width < 20) return "narrow_noise";
  if (isAllCapsShortLabel(text)) return "label_all_caps_short";

  if (inHeaderZone && isLikelyHeaderLogoText(text) && !hasFieldCue) {
    return "header_logo_text";
  }

  if (inHeaderZone && isLikelySectionTitle(text) && !hasFieldCue) {
    return "header_section_title";
  }

  if (isLikelyInstructionOrQuestion(text) && !hasFieldCue) {
    return "instruction_or_question";
  }

  if (isLikelySectionTitle(text) && !hasFieldCue) {
    return "section_title";
  }

  if (isLikelyTabularSchemaText(text) && !hasFieldCue) {
    return "table_schema_text";
  }

  return null;
}

function readImageSize(
  dataUrl: string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () =>
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () =>
      reject(new Error("Failed to read PDF image dimensions"));
    image.src = dataUrl;
  });
}

function toMetadataSource(source: "ai" | "dictionary" | "heuristic") {
  return source === "ai" ? "ai" : "ocr";
}

function shouldAcceptMapping(mapping: DraftMappedField): boolean {
  const chosen = mapping.chosen;
  if (!chosen) {
    return mapping.blockType === "kvp" || mapping.blockType === "checkbox";
  }

  if (chosen.confidenceScore < 0.45) {
    return false;
  }

  if (chosen.source === "heuristic" && chosen.confidenceScore < 0.5) {
    return false;
  }

  return (
    Boolean(chosen.acordCode) ||
    mapping.blockType === "kvp" ||
    mapping.blockType === "checkbox"
  );
}

export default function PdfImportModal({
  onClose,
  onImportResult,
  mode = "import",
}: PdfImportModalProps) {
  const setPdfPages = useDesignerStore((s) => s.setPdfPages);
  const pdfPages = useDesignerStore((s) => s.pdfPages);
  const addField = useDesignerStore((s) => s.addField);
  const [isAutoMapping, setIsAutoMapping] = useState(true);
  const [isReviewMode, setIsReviewMode] = useState(mode === "map-only");
  const [maxMappedFields, setMaxMappedFields] = useState(120);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftMappings, setDraftMappings] = useState<DraftMappedField[]>([]);
  const [importedPages, setImportedPages] = useState(0);
  const [autoMapSummary, setAutoMapSummary] = useState<AutoMapSummary | null>(
    null,
  );

  async function runAutoMapping(
    file: File,
    pageImages: string[],
    limit: number,
  ): Promise<DraftMappedField[]> {
    const imageSizes = await Promise.all(pageImages.map(readImageSize));
    const formData = new FormData();
    formData.append("file", file);

    const extractPayload = await fetchJson<ExtractTextResponse>(
      apiUrl("/api/extractText"),
      {
        method: "POST",
        body: formData,
      },
    );

    const pages = Array.isArray(extractPayload.pages)
      ? extractPayload.pages
      : [];
    const pageSizeByPage = new Map<number, { width: number; height: number }>();
    const blocks: ExtractedBlock[] = [];

    for (const page of pages) {
      const pageIndex = Math.max(0, (page.pageNumber || 1) - 1);
      const imageSize = imageSizes[pageIndex];
      const sourcePageWidth = Number(page.width) || imageSize?.width || 1;
      const sourcePageHeight = Number(page.height) || imageSize?.height || 1;
      pageSizeByPage.set(pageIndex + 1, {
        width: imageSize?.width || sourcePageWidth,
        height: imageSize?.height || sourcePageHeight,
      });
      const scaleX = imageSize?.width ? imageSize.width / sourcePageWidth : 1;
      const scaleY = imageSize?.height
        ? imageSize.height / sourcePageHeight
        : 1;

      const lines = Array.isArray(page.lines) ? page.lines : [];
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        const text = (line.content || "").trim();
        if (!text) continue;

        blocks.push({
          id: `p${pageIndex + 1}-l${i + 1}`,
          page: pageIndex + 1,
          type: inferBlockType(text),
          text,
          boundingBox: boundsFromPolygon(line.boundingBox, scaleX, scaleY),
          confidence:
            typeof line.confidence === "number" &&
            Number.isFinite(line.confidence)
              ? Math.max(0, Math.min(1, line.confidence))
              : 0.9,
        });
      }
    }

    if (blocks.length === 0) {
      setAutoMapSummary({
        totalBlocks: 0,
        keptBlocks: 0,
        filteredBlocks: 0,
        filteredByReason: {},
        filteredSamples: [],
        candidateMappings: 0,
        keptMappings: 0,
        filteredMappings: 0,
      });
      return [];
    }

    const filteredOut: Array<{ id: string; reason: string }> = [];
    const keptBlocks = blocks.filter((block) => {
      const reason = getRejectionReason(block, pageSizeByPage.get(block.page));
      if (reason) {
        filteredOut.push({ id: block.id, reason });
        return false;
      }
      return true;
    });

    keptBlocks.sort((a, b) => blockPriority(b) - blockPriority(a));

    const ocrSummary = {
      totalBlocks: blocks.length,
      keptBlocks: keptBlocks.length,
      filteredBlocks: filteredOut.length,
      filteredByReason: filteredOut.reduce<Record<string, number>>(
        (acc, item) => {
          acc[item.reason] = (acc[item.reason] || 0) + 1;
          return acc;
        },
        {},
      ),
    };

    console.info("[auto-map] OCR block filter summary", ocrSummary);

    if (keptBlocks.length === 0) {
      setAutoMapSummary({
        ...ocrSummary,
        filteredSamples: filteredOut.slice(0, 12).map((item) => {
          const block = blocks.find((candidate) => candidate.id === item.id);
          return {
            reason: item.reason,
            text: block?.text || item.id,
          };
        }),
        candidateMappings: 0,
        keptMappings: 0,
        filteredMappings: 0,
      });
      return [];
    }

    const mapPayload = await fetchJson<MapFieldsResponse>(
      apiUrl("/api/mapFields"),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          documentId: file.name,
          blocks: keptBlocks,
          context: "PDF import OCR mapping",
        }),
      },
    );

    const mappings = Array.isArray(mapPayload.mappings)
      ? mapPayload.mappings
      : [];
    const sourceBlockById = new Map(
      keptBlocks.map((block) => [block.id, block]),
    );

    const mappingCandidates = mappings
      .map((mapping) => {
        const sourceBlock = sourceBlockById.get(mapping.blockId);
        const text = (mapping.text || "").trim();
        if (!sourceBlock || !text) {
          return null;
        }

        const syntheticBlock: ExtractedBlock = {
          ...sourceBlock,
          text,
          boundingBox: {
            x: mapping.boundingBox.x,
            y: mapping.boundingBox.y,
            width: mapping.boundingBox.width,
            height: mapping.boundingBox.height,
          },
        };

        const rejection = getRejectionReason(
          syntheticBlock,
          pageSizeByPage.get(syntheticBlock.page),
        );
        if (rejection) {
          return null;
        }

        return {
          mapping,
          priority: blockPriority(sourceBlock),
        };
      })
      .filter((item): item is { mapping: MapFieldMapping; priority: number } =>
        Boolean(item),
      )
      .sort((a, b) => b.priority - a.priority);

    const safeMappings = mappingCandidates
      .slice(0, Math.max(1, limit))
      .map((item) => item.mapping);

    const mappingSummary = {
      candidateMappings: mappings.length,
      keptMappings: safeMappings.length,
      filteredMappings: mappings.length - safeMappings.length,
    };

    console.info("[auto-map] Mapping output summary", mappingSummary);

    setAutoMapSummary({
      ...ocrSummary,
      filteredSamples: filteredOut.slice(0, 12).map((item) => {
        const block = blocks.find((candidate) => candidate.id === item.id);
        return {
          reason: item.reason,
          text: block?.text || item.id,
        };
      }),
      ...mappingSummary,
    });

    return safeMappings.map((mapping) => {
      const chosen = mapping.chosen || mapping.suggestions?.[0];
      const sourceBlock = sourceBlockById.get(mapping.blockId);
      const blockType = sourceBlock?.type || "text";
      const draft: DraftMappedField = {
        blockId: mapping.blockId,
        blockType,
        pageIndex: Math.max(0, (mapping.page || 1) - 1),
        text: mapping.text,
        x: mapping.boundingBox.x,
        y: mapping.boundingBox.y,
        width: mapping.boundingBox.width,
        height: mapping.boundingBox.height,
        chosen,
        accepted: false,
      };

      return {
        ...draft,
        accepted: shouldAcceptMapping(draft),
      };
    });
  }

  function applyMappedFields(mappings: DraftMappedField[]) {
    const acceptedMappings = mappings.filter((mapping) => mapping.accepted);

    for (const mapping of acceptedMappings) {
      const chosen = mapping.chosen;
      addField({
        type: "text",
        pageIndex: mapping.pageIndex,
        x: mapping.x,
        y: mapping.y,
        width: mapping.width,
        height: mapping.height,
        rotation: 0,
        opacity: 1,
        text: mapping.text,
        fontSize: 14,
        fontFamily: "Geist Variable",
        textAlign: "left",
        color: "#0f172a",
        stroke: "#1e293b",
        strokeWidth: 0,
        metadata: {
          acordCode: chosen?.acordCode || "",
          acordLabel: chosen?.label || "",
          acordDescription: chosen?.description || "",
          fieldType: "text",
          required: false,
          confidenceScore: chosen?.confidenceScore ?? 0,
          source: chosen ? toMetadataSource(chosen.source) : "ocr",
        },
      });
    }

    return acceptedMappings.length;
  }

  const pageCounts = draftMappings.reduce<Record<number, number>>(
    (acc, item) => {
      const page = item.pageIndex + 1;
      acc[page] = (acc[page] || 0) + 1;
      return acc;
    },
    {},
  );

  const pageCountText = Object.entries(pageCounts)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([page, count]) => `P${page}: ${count}`)
    .join(" • ");

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setDraftMappings([]);
    setImportedPages(0);
    setAutoMapSummary(null);
    setIsImporting(true);

    try {
      let pages: string[] = [];

      if (mode === "import") {
        const buffer = await file.arrayBuffer();
        pages = await pdfToImages(buffer);
        setPdfPages(pages);
      } else {
        pages = [...pdfPages];
      }

      setImportedPages(pages.length);

      if (mode === "map-only" && pages.length === 0) {
        setError(
          "No PDF is loaded. Import a PDF first, then run Auto-map PDF.",
        );
        return;
      }

      let mappedFields: DraftMappedField[] = [];
      let warning: string | undefined;

      if (mode === "map-only" || isAutoMapping) {
        try {
          mappedFields = await runAutoMapping(file, pages, maxMappedFields);
        } catch (mapError) {
          warning =
            mapError instanceof Error
              ? `OCR extraction failed: ${mapError.message}. Start backend /api/extractText and retry.`
              : "OCR extraction failed. Start backend /api/extractText and retry.";
        }
      }

      if ((mode !== "map-only" && !isAutoMapping) || warning) {
        onImportResult?.({
          importedPages: pages.length,
          mappedFields: 0,
          warning,
        });
        onClose();
        return;
      }

      if (mode === "map-only" && isReviewMode) {
        if (mappedFields.length === 0) {
          onImportResult?.({
            importedPages: pages.length,
            mappedFields: 0,
            warning: "OCR completed but no mappable text was returned.",
          });
          onClose();
          return;
        }

        setDraftMappings(mappedFields);
        return;
      }

      const appliedCount = applyMappedFields(mappedFields);
      onImportResult?.({
        importedPages: pages.length,
        mappedFields: appliedCount,
      });
      onClose();
    } catch (err) {
      console.error("PDF import error:", err);
      setError(err instanceof Error ? err.message : "Failed to import PDF");
    } finally {
      setIsImporting(false);
    }
  }

  function handleApplyReviewedMappings() {
    const appliedCount = applyMappedFields(draftMappings);
    onImportResult?.({
      importedPages,
      mappedFields: appliedCount,
    });
    setDraftMappings([]);
    onClose();
  }

  const acceptedDraftCount = draftMappings.filter(
    (item) => item.accepted,
  ).length;

  function toggleDraftAccepted(blockId: string, nextAccepted: boolean) {
    setDraftMappings((current) =>
      current.map((item) =>
        item.blockId === blockId ? { ...item, accepted: nextAccepted } : item,
      ),
    );
  }

  function handleDiscardReviewedMappings() {
    onImportResult?.({
      importedPages,
      mappedFields: 0,
      warning: "PDF imported. Reviewed mappings were discarded.",
    });
    setDraftMappings([]);
    onClose();
  }

  return (
    <div
      style={{ padding: 12, display: "flex", flexDirection: "column", gap: 12 }}
    >
      <h3 style={{ margin: 0, color: "#0f172a" }}>Import PDF Background</h3>
      <p style={{ margin: 0, color: "#334155" }}>
        {mode === "map-only"
          ? "Select the same source PDF to run ACORD auto-mapping and add mapped fields to the loaded pages."
          : "Upload a PDF and each page will render as a canvas background layer."}
      </p>
      {mode !== "map-only" && (
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={isAutoMapping}
            onChange={(e) => setIsAutoMapping(e.target.checked)}
            disabled={isImporting}
          />
          Auto-map ACORD fields from OCR text after import
        </label>
      )}
      {mode === "map-only" && (
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={isReviewMode}
            onChange={(e) => setIsReviewMode(e.target.checked)}
            disabled={isImporting}
          />
          Review mappings before adding fields to canvas
        </label>
      )}
      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        Mapping Field Cap:
        <input
          type="number"
          min={1}
          max={500}
          step={1}
          value={maxMappedFields}
          disabled={isImporting}
          onChange={(e) => {
            const next = Number(e.target.value);
            setMaxMappedFields(
              Number.isFinite(next)
                ? Math.max(1, Math.min(500, Math.floor(next)))
                : 120,
            );
          }}
        />
      </label>
      <input
        type="file"
        accept="application/pdf"
        onChange={handleFile}
        disabled={isImporting}
      />
      {isImporting && (
        <div style={{ color: "#334155", fontSize: 13 }}>
          {mode === "map-only"
            ? "Running ACORD auto-mapping..."
            : "Importing PDF and generating ACORD mappings..."}
        </div>
      )}

      {autoMapSummary && !isImporting && (
        <div
          style={{
            border: "1px solid #cbd5e1",
            borderRadius: 10,
            padding: 10,
            background: "#f8fafc",
            display: "flex",
            flexDirection: "column",
            gap: 6,
            fontSize: 12,
            color: "#334155",
          }}
        >
          <div style={{ fontWeight: 600, color: "#0f172a" }}>
            OCR Filter Summary
          </div>
          <div>
            OCR blocks: kept {autoMapSummary.keptBlocks} of{" "}
            {autoMapSummary.totalBlocks} (filtered{" "}
            {autoMapSummary.filteredBlocks})
          </div>
          <div>
            Mappings: kept {autoMapSummary.keptMappings} of{" "}
            {autoMapSummary.candidateMappings} (filtered{" "}
            {autoMapSummary.filteredMappings})
          </div>
          {Object.keys(autoMapSummary.filteredByReason).length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ color: "#475569" }}>Suppression reasons</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {Object.entries(autoMapSummary.filteredByReason)
                  .sort((a, b) => b[1] - a[1])
                  .map(([reason, count]) => (
                    <span
                      key={reason}
                      style={{
                        background: "#e2e8f0",
                        color: "#0f172a",
                        borderRadius: 999,
                        padding: "2px 8px",
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    >
                      {reason} ({count})
                    </span>
                  ))}
              </div>
              {autoMapSummary.filteredSamples.length > 0 && (
                <div
                  style={{
                    border: "1px solid #e2e8f0",
                    borderRadius: 8,
                    background: "#ffffff",
                    maxHeight: 96,
                    overflowY: "auto",
                    padding: 6,
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                  }}
                >
                  {autoMapSummary.filteredSamples.map((sample, index) => (
                    <div
                      key={`${sample.reason}-${index}`}
                      style={{ fontSize: 11, color: "#334155" }}
                    >
                      <strong>{sample.reason}:</strong> {sample.text}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {draftMappings.length > 0 && (
        <div
          style={{
            border: "1px solid #cbd5e1",
            borderRadius: 10,
            padding: 10,
            background: "#f8fafc",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div style={{ fontWeight: 600, color: "#0f172a" }}>
            Review Mappings ({draftMappings.length})
          </div>
          <div style={{ fontSize: 12, color: "#475569" }}>
            {pageCountText || "Single page"}
          </div>
          <div style={{ fontSize: 12, color: "#334155" }}>
            Accepted for shape creation: {acceptedDraftCount} /{" "}
            {draftMappings.length}
          </div>
          <div
            style={{
              maxHeight: 180,
              overflowY: "auto",
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              background: "#ffffff",
            }}
          >
            {draftMappings.slice(0, 25).map((item, index) => (
              <div
                key={`${item.pageIndex}-${item.text}-${index}`}
                style={{
                  padding: "8px 10px",
                  borderBottom: "1px solid #f1f5f9",
                  fontSize: 12,
                  display: "flex",
                  gap: 8,
                  alignItems: "flex-start",
                }}
              >
                <label
                  style={{ display: "flex", gap: 6, alignItems: "center" }}
                >
                  <input
                    type="checkbox"
                    checked={item.accepted}
                    onChange={(e) =>
                      toggleDraftAccepted(item.blockId, e.target.checked)
                    }
                  />
                  <span style={{ color: "#0f172a" }}>Use</span>
                </label>
                <div>
                  <div style={{ fontWeight: 600, color: "#0f172a" }}>
                    P{item.pageIndex + 1}:{" "}
                    {item.chosen?.acordCode || "(unmapped)"}
                  </div>
                  <div style={{ color: "#0f172a" }}>
                    {item.chosen?.label || "No mapped ACORD label"}
                  </div>
                  <div style={{ color: "#334155" }}>{item.text}</div>
                  <div style={{ color: "#64748b" }}>
                    Source type: {item.blockType}
                  </div>
                  {item.chosen && (
                    <div style={{ color: "#64748b" }}>
                      Confidence:{" "}
                      {Math.round(item.chosen.confidenceScore * 100)}% • Source:{" "}
                      {item.chosen.source}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleApplyReviewedMappings}>
              Apply To Canvas
            </button>
            <button onClick={handleDiscardReviewedMappings}>Discard</button>
          </div>
        </div>
      )}

      {error && <div style={{ color: "#b91c1c", fontSize: 13 }}>{error}</div>}
      <div>
        <button onClick={onClose} disabled={isImporting}>
          Close
        </button>
      </div>
    </div>
  );
}
