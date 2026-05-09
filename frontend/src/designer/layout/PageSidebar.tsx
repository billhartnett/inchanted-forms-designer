import { useDesignerStore } from "../state/useDesignerStore";

export default function PageSidebar() {
  const pdfPages = useDesignerStore((s) => s.pdfPages);
  const currentPage = useDesignerStore((s) => s.currentPage);
  const setCurrentPage = useDesignerStore((s) => s.setCurrentPage);

  if (pdfPages.length === 0) return null;

  return (
    <div
      style={{
        width: 120,
        borderRight: "1px solid #ccc",
        background: "#f7f7f7",
        padding: 10,
        overflowY: "auto",
      }}
    >
      <div style={{ fontWeight: "bold", marginBottom: 10 }}>Pages</div>

      {pdfPages.map((_, i) => (
        <div
          key={i}
          onClick={() => setCurrentPage(i)}
          style={{
            padding: 8,
            marginBottom: 6,
            cursor: "pointer",
            background: i === currentPage ? "#d0e0ff" : "#fff",
            border: "1px solid #ccc",
            borderRadius: 4,
            textAlign: "center",
          }}
        >
          Page {i + 1}
        </div>
      ))}
    </div>
  );
}
