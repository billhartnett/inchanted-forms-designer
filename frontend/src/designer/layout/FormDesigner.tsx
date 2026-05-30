import Toolbox from "../toolbox/Toolbox";
import CanvasStage from "../canvas/CanvasStage";
import PropertiesPanel from "../properties/PropertiesPanel";
import PageSidebar from "./PageSidebar";

export default function FormDesigner() {
  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        width: "100vw",
        fontFamily: "sans-serif",
      }}
    >
      <Toolbox />

      <PageSidebar />

      <div
        style={{
          flex: 1,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          background: "#e5e5e5",
          padding: 10,
        }}
      >
        <div
          style={{
            background: "#fff",
            border: "1px solid #ccc",
            boxShadow: "0 0 4px rgba(0,0,0,0.1)",
            width: "800px",
            height: "600px",
            display: "flex",
          }}
        >
          <CanvasStage />
        </div>
      </div>

      <PropertiesPanel />
    </div>
  );
}
