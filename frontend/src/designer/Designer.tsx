import React from "react";

import { CanvasStage } from "../canvas/CanvasStage";
import { CanvasGrid } from "../canvas/CanvasGrid";
import { CanvasGuides } from "../canvas/CanvasGuides";

import { Toolbox } from "./toolbox/Toolbox";
import { PropertiesPanel } from "./properties/PropertiesPanel";
import { ZoomControls } from "./controls/ZoomControls";

import { DesignerLayout } from "./layout/DesignerLayout";

export function Designer() {
  return (
    <DesignerLayout sidebar={<Toolbox />} properties={<PropertiesPanel />}>
      <div style={{ position: "relative", width: "100%", height: "100%" }}>
        <CanvasGrid />
        <CanvasGuides />
        <CanvasStage />
        <ZoomControls />
      </div>
    </DesignerLayout>
  );
}
