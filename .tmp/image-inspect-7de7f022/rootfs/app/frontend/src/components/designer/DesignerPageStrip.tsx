import { useMemo } from "react";
import { useDesignerStore } from "../../state/designerStore";

export function DesignerPageStrip() {
  const pdfPageImages = useDesignerStore((s) => s.pdfPageImages);
  const currentPdfPage = useDesignerStore((s) => s.currentPdfPage);
  const setCurrentPdfPage = useDesignerStore((s) => s.setCurrentPdfPage);
  const fields = useDesignerStore((s) => s.fields);

  const fieldsByPage = useMemo(() => {
    const counts = new Map<number, number>();
    for (const field of fields) {
      const pageIndex = field.pageIndex ?? 0;
      counts.set(pageIndex, (counts.get(pageIndex) || 0) + 1);
    }
    return counts;
  }, [fields]);

  if (pdfPageImages.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        borderTop: "1px solid #d9e2ec",
        background: "#ffffff",
        padding: "0.5rem 0.75rem",
        overflowX: "auto",
        overflowY: "hidden",
      }}
    >
      <div style={{ display: "inline-flex", gap: 10 }}>
        {pdfPageImages.map((src, index) => {
          const isSelected = index === currentPdfPage;
          const fieldCount = fieldsByPage.get(index) || 0;
          const errorCount = 0;

          return (
            <button
              key={`thumb-${index}`}
              type="button"
              onClick={() => setCurrentPdfPage(index)}
              style={{
                width: 140,
                borderRadius: 10,
                border: `2px solid ${isSelected ? "#2563eb" : "#dbe4ee"}`,
                background: isSelected ? "#eff6ff" : "#f8fafc",
                padding: 6,
                textAlign: "left",
                display: "grid",
                gap: 6,
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  position: "relative",
                  height: 84,
                  overflow: "hidden",
                  borderRadius: 6,
                }}
              >
                <img
                  src={src}
                  alt={`Page ${index + 1}`}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    display: "block",
                  }}
                />
                <span
                  style={{
                    position: "absolute",
                    top: 6,
                    left: 6,
                    fontSize: 11,
                    fontWeight: 700,
                    background: "rgba(15, 23, 42, 0.8)",
                    color: "#ffffff",
                    padding: "2px 6px",
                    borderRadius: 999,
                  }}
                >
                  {index + 1}
                </span>
              </div>
              <div style={{ display: "flex", gap: 6, fontSize: 11 }}>
                <span
                  style={{
                    padding: "2px 6px",
                    borderRadius: 999,
                    background: "#e0f2fe",
                    color: "#0c4a6e",
                  }}
                >
                  F:{fieldCount}
                </span>
                <span
                  style={{
                    padding: "2px 6px",
                    borderRadius: 999,
                    background: "#fee2e2",
                    color: "#991b1b",
                  }}
                >
                  E:{errorCount}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default DesignerPageStrip;
