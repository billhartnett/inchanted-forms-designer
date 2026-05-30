import Toolbox from "../toolbox/Toolbox";
import CanvasStage from "../canvas/CanvasStage";
import PropertiesPanel from "../properties/PropertiesPanel";

export default function AppLayout() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateRows: "48px 1fr",
        gridTemplateColumns: "1fr",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      {/* Top Menu Bar */}
      <div
        style={{
          gridRow: "1 / 2",
          gridColumn: "1 / 2",
          display: "flex",
          alignItems: "center",
          padding: "0 16px",
          borderBottom: "1px solid #ddd",
          background: "#ffffff",
          fontWeight: 600,
          fontSize: 18,
        }}
      >
        Inchanted Forms Designer
      </div>

      {/* Main 3‑Column Layout */}
      <div
        style={{
          gridRow: "2 / 3",
          gridColumn: "1 / 2",
          display: "grid",
          gridTemplateColumns: "220px 1fr 260px",
          height: "100%",
          overflow: "hidden",
        }}
      >
        {/* LEFT: Toolbox */}
        <div
          style={{
            borderRight: "1px solid #ddd",
            overflowY: "auto",
            background: "#f7f7f7",
          }}
        >
          <Toolbox />
        </div>

        {/* CENTER: Canvas */}
        <div
          style={{
            position: "relative",
            overflow: "auto",
            background: "#f5f5f5",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "flex-start",
              padding: 16,
              minHeight: "100%",
              boxSizing: "border-box",
            }}
          >
            <CanvasStage />
          </div>
        </div>

        {/* RIGHT: Properties Panel */}
        <div
          style={{
            borderLeft: "1px solid #ddd",
            overflowY: "auto",
            padding: 12,
            background: "#fafafa",
          }}
        >
          <PropertiesPanel />
        </div>
      </div>
    </div>
  );
}
