import React from "react";

interface DesignerLayoutProps {
  sidebar: React.ReactNode;
  properties: React.ReactNode;
  topBar?: React.ReactNode;
  children: React.ReactNode;
}

export function DesignerLayout({
  sidebar,
  properties,
  topBar,
  children,
}: DesignerLayoutProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 64px)",
        overflow: "hidden",
        background: "#f8fafc",
      }}
    >
      {topBar && (
        <div
          style={{
            borderBottom: "1px solid #d9e2ec",
            background: "#ffffff",
            padding: "0.55rem 0.75rem",
            overflowX: "auto",
          }}
        >
          {topBar}
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "260px 1fr 300px",
          minHeight: 0,
          flex: 1,
        }}
      >
        <aside
          style={{
            borderRight: "1px solid #d9e2ec",
            padding: "0.75rem",
            overflowY: "auto",
            background: "#ffffff",
          }}
        >
          {sidebar}
        </aside>

        <main
          style={{
            minWidth: 0,
            minHeight: 0,
            position: "relative",
            overflow: "hidden",
            background: "linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)",
          }}
        >
          {children}
        </main>

        <aside
          style={{
            borderLeft: "1px solid #d9e2ec",
            padding: "0.75rem",
            overflowY: "auto",
            background: "#ffffff",
          }}
        >
          {properties}
        </aside>
      </div>
    </div>
  );
}
