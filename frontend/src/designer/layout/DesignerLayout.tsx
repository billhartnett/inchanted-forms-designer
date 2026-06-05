import React from "react";

interface DesignerLayoutProps {
  sidebar: React.ReactNode;
  properties: React.ReactNode;
  children: React.ReactNode;
}

export function DesignerLayout({
  sidebar,
  properties,
  children,
}: DesignerLayoutProps) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "260px 1fr 300px",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      {/* LEFT SIDEBAR */}
      <aside
        style={{
          borderRight: "1px solid #ddd",
          padding: "1rem",
          overflowY: "auto",
        }}
      >
        {sidebar}
      </aside>

      {/* CENTER CANVAS */}
      <main
        style={{
          padding: "1rem",
          background: "#fafafa",
          overflow: "auto",
        }}
      >
        {children}
      </main>

      {/* RIGHT PROPERTIES PANEL */}
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
