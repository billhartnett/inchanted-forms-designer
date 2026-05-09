import React from "react";

interface DesignerLayoutProps {
  sidebar: React.ReactNode;
  canvas: React.ReactNode;
  properties: React.ReactNode;
}

export default function DesignerLayout({
  sidebar,
  canvas,
  properties,
}: DesignerLayoutProps) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "260px 1fr 300px",
        height: "calc(100vh - 80px)",
        borderTop: "1px solid #ddd",
      }}
    >
      <aside
        style={{
          borderRight: "1px solid #ddd",
          padding: "1rem",
          overflowY: "auto",
        }}
      >
        {sidebar}
      </aside>

      <main
        style={{
          padding: "1rem",
          background: "#fafafa",
          overflow: "auto",
        }}
      >
        {canvas}
      </main>

      <aside
        style={{
          borderLeft: "1px solid #ddd",
          padding: "1rem",
          overflowY: "auto",
        }}
      >
        {properties}
      </aside>
    </div>
  );
}
