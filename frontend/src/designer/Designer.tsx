import React from "react";
import { CanvasStage } from "../canvas/CanvasStage";
import { Toolbox } from "./toolbox/Toolbox";
import { PropertiesPanel } from "./properties/PropertiesPanel";
import ZoomControls from "./controls/ZoomControls";

export function Designer() {
  const zoomIn = () => {
    const stage = (window as any).__stageRef;
    if (!stage) return;
    const scale = stage.scaleX() * 1.1;
    stage.scale({ x: scale, y: scale });
    stage.batchDraw();
  };

  const zoomOut = () => {
    const stage = (window as any).__stageRef;
    if (!stage) return;
    const scale = stage.scaleX() / 1.1;
    stage.scale({ x: scale, y: scale });
    stage.batchDraw();
  };

  const resetZoom = () => {
    const stage = (window as any).__stageRef;
    if (!stage) return;
    stage.scale({ x: 1, y: 1 });
    stage.position({ x: 0, y: 0 });
    stage.batchDraw();
  };

  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative" }}>
      <CanvasStage />
      <Toolbox />
      <PropertiesPanel />
      <ZoomControls zoomIn={zoomIn} zoomOut={zoomOut} reset={resetZoom} />
    </div>
  );
}
