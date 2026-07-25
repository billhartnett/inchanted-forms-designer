import { NavLink, Outlet } from "react-router-dom";

const navLinkStyle = ({ isActive }: { isActive: boolean }) => ({
  textDecoration: "none",
  color: isActive ? "#0f172a" : "#334155",
  fontWeight: isActive ? 700 : 500,
  padding: "0.4rem 0.65rem",
  borderRadius: 8,
  background: isActive ? "#e2e8f0" : "transparent",
});

export function AppShell() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        gridTemplateRows: "64px 1fr",
        background:
          "radial-gradient(circle at 15% 10%, #f8fafc 0%, #eef2ff 45%, #ecfeff 100%)",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 1rem",
          borderBottom: "1px solid #cbd5e1",
          background: "rgba(255,255,255,0.82)",
          backdropFilter: "blur(5px)",
        }}
      >
        <div style={{ fontWeight: 700, color: "#0f172a" }}>
          inchanted Forms Designer
        </div>
        <nav style={{ display: "flex", gap: "0.4rem" }}>
          <NavLink to="/" style={navLinkStyle}>
            Home
          </NavLink>
          <NavLink to="/designer" style={navLinkStyle}>
            Designer
          </NavLink>
          <NavLink to="/mapping" style={navLinkStyle}>
            Mapping
          </NavLink>
        </nav>
      </header>

      <main style={{ minHeight: 0 }}>
        <Outlet />
      </main>
    </div>
  );
}
