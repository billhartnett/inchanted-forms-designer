import { useState, type ChangeEvent } from "react";
import type { Field } from "../../../../shared/src/types";
import { runExtractDocument } from "../../api/wave9Integration";
import { useExtractionStore } from "../../state";
import { pdfToImages } from "../../utils/pdfToImages";
import type { ExtractDocumentResponse } from "../../types/extraction";
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

const EMPTY_GROUPED_STRUCTURES = {
  tables: [],
  questionAnswerPairs: [],
  checkboxGroups: [],
};

const EMPTY_EXTRACTION_DIAGNOSTICS = {
  blankFieldCount: 0,
  tableCount: 0,
  qaPairCount: 0,
  checkboxGroupCount: 0,
};

export default function PdfImportModal({
  onClose,
  onImportResult,
  mode = "import",
}: PdfImportModalProps) {
  const setPdfPages = useDesignerStore((s) => s.setPdfPages);
  const setDesignerFieldCatalog = useDesignerStore((s) => s.setFieldCatalog);
  const setDesignerGroupedStructures = useDesignerStore((s) => s.setGroupedStructures);
  const setDesignerExtractionDiagnostics = useDesignerStore((s) => s.setExtractionDiagnostics);

  const setExtractionFieldCatalog = useExtractionStore((s) => s.setFieldCatalog);
  const setExtractionGroupedStructures = useExtractionStore((s) => s.setGroupedStructures);
  const setExtractionDiagnostics = useExtractionStore((s) => s.setExtractionDiagnostics);
  const clearExtractionArtifacts = useExtractionStore((s) => s.clearExtraction);

  const [isAutoMapping, setIsAutoMapping] = useState(true);
  const [maxMappedFields, setMaxMappedFields] = useState(250);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const extractionStore = {
    setFields: (fields: Field[]) => {
      useExtractionStore.setState({ fields });
    },
    setFieldCatalog: setExtractionFieldCatalog,
    setGroupedStructures: setExtractionGroupedStructures,
    setExtractionDiagnostics,
  };

  const designerStore = {
    setFields: (fields: Field[]) => {
      useDesignerStore.setState({ fields });
    },
    setFieldCatalog: setDesignerFieldCatalog,
    setGroupedStructures: setDesignerGroupedStructures,
    setExtractionDiagnostics: setDesignerExtractionDiagnostics,
  };

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    setIsImporting(true);

    try {
      clearExtractionArtifacts();

      const buffer = await file.arrayBuffer();
      const pages = await pdfToImages(buffer);
      setPdfPages(pages);

      const shouldExtract = mode === "map-only" || isAutoMapping;
      if (!shouldExtract) {
        onImportResult?.({
          importedPages: pages.length,
          mappedFields: 0,
        });
        onClose();
        return;
      }

      const response = (await runExtractDocument(file)) as ExtractDocumentResponse;
      const {
        fields,
        fieldCatalog,
        groupedStructures,
        extractionDiagnostics,
      } = response;

      const safeFields = Array.isArray(fields)
        ? fields.slice(0, Math.max(1, Math.floor(maxMappedFields)))
        : [];
      const safeFieldCatalog = fieldCatalog || {};
      const safeGroupedStructures = groupedStructures || EMPTY_GROUPED_STRUCTURES;
      const safeExtractionDiagnostics =
        extractionDiagnostics || EMPTY_EXTRACTION_DIAGNOSTICS;

      extractionStore.setFields(safeFields);
      extractionStore.setFieldCatalog(safeFieldCatalog);
      extractionStore.setGroupedStructures(safeGroupedStructures);
      extractionStore.setExtractionDiagnostics(safeExtractionDiagnostics);

      designerStore.setFields(safeFields);
      designerStore.setFieldCatalog(safeFieldCatalog);
      designerStore.setGroupedStructures(safeGroupedStructures);
      designerStore.setExtractionDiagnostics(safeExtractionDiagnostics);

      onImportResult?.({
        importedPages: pages.length,
        mappedFields: safeFields.length,
        warning:
          safeFields.length === 0
            ? "Document extraction completed but no fields were returned."
            : undefined,
      });

      onClose();
    } catch (importError) {
      setError(
        importError instanceof Error
          ? importError.message
          : "Failed to import PDF",
      );
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 12 }}>
      <h3 style={{ margin: 0, color: "#0f172a" }}>Import PDF Background</h3>
      <p style={{ margin: 0, color: "#334155" }}>
        {mode === "map-only"
          ? "Select the source PDF to extract and apply fields to the loaded pages."
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
          Extract and apply fields after import
        </label>
      )}

      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        Field Cap:
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
                : 250,
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
            ? "Extracting fields from document..."
            : "Importing PDF and extracting fields..."}
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