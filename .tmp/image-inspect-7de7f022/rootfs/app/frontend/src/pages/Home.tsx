import { Link } from "react-router-dom";
import type { CSSProperties } from "react";

const buttonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
  padding: "0.8rem 1rem",
  borderRadius: 10,
  color: "#ffffff",
  background: "#1d4ed8",
  fontWeight: 700,
  minWidth: 180,
};

export default function Home() {
  return (
    <section
      style={{
        minHeight: "100%",
        display: "grid",
        placeItems: "center",
        padding: "2rem",
      }}
    >
      <div
        style={{
          width: "min(820px, 100%)",
          border: "1px solid #cbd5e1",
          borderRadius: 16,
          padding: "2rem",
          background: "rgba(255,255,255,0.9)",
          boxShadow: "0 20px 45px rgba(15, 23, 42, 0.08)",
        }}
      >
        <h1 style={{ marginTop: 0, marginBottom: "0.5rem", color: "#0f172a" }}>
          ACORD Form Designer Workspace
        </h1>
        <p style={{ margin: 0, color: "#334155" }}>
          Build mapped form experiences, import source PDFs, and design field
          layouts with a structured canvas workflow.
        </p>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.75rem",
            marginTop: "1.5rem",
          }}
        >
          <Link to="/designer" style={buttonStyle}>
            Open Designer
          </Link>
          <Link to="/mapping" style={{ ...buttonStyle, background: "#0f766e" }}>
            Open Mapping
          </Link>
        </div>
      </div>
    </section>
  );
}
