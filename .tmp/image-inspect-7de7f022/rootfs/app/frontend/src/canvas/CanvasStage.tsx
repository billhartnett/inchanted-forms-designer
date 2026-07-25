import { Layer, Stage } from "react-konva";
import { type ReactNode, useEffect, useRef, useState } from "react";

interface CanvasStageProps {
  width: number;
  height: number;
  backgroundChildren?: ReactNode;
  overlayChildren?: ReactNode;
  onStageReady?: (stage: any | null) => void;
}

export function CanvasStage({
  width,
  height,
  backgroundChildren,
  overlayChildren,
  onStageReady,
}: CanvasStageProps) {
  const stageRef = useRef<any>(null);
  const [isSpacePanning, setIsSpacePanning] = useState(false);
  const [isMiddlePanning, setIsMiddlePanning] = useState(false);

  useEffect(() => {
    if (!onStageReady) return undefined;
    onStageReady(stageRef.current);
    return () => onStageReady(null);
  }, [onStageReady]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;

      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isEditable =
        tag === "input" ||
        tag === "textarea" ||
        target?.isContentEditable === true;

      if (isEditable) return;

      event.preventDefault();
      setIsSpacePanning(true);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      setIsSpacePanning(false);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  useEffect(() => {
    const onMouseUp = (event: MouseEvent) => {
      if (event.button === 1) {
        setIsMiddlePanning(false);
      }
    };

    window.addEventListener("mouseup", onMouseUp);
    return () => window.removeEventListener("mouseup", onMouseUp);
  }, []);

  return (
    <Stage
      ref={stageRef}
      width={width}
      height={height}
      draggable={isSpacePanning || isMiddlePanning}
      onMouseDown={(event) => {
        if (event.evt.button === 1) {
          setIsMiddlePanning(true);
        }
      }}
      onWheel={(event) => {
        const stage = stageRef.current;
        if (!stage) return;

        event.evt.preventDefault();
        const oldScale = stage.scaleX() || 1;
        const pointer = stage.getPointerPosition();
        if (!pointer) return;

        const zoomFactor = event.evt.deltaY > 0 ? 1 / 1.06 : 1.06;
        const nextScale = Math.min(4, Math.max(0.25, oldScale * zoomFactor));

        const pointTo = {
          x: (pointer.x - stage.x()) / oldScale,
          y: (pointer.y - stage.y()) / oldScale,
        };

        stage.scale({ x: nextScale, y: nextScale });
        stage.position({
          x: pointer.x - pointTo.x * nextScale,
          y: pointer.y - pointTo.y * nextScale,
        });
        stage.batchDraw();
      }}
      style={{
        background: "#fff",
        cursor: isSpacePanning || isMiddlePanning ? "grab" : "default",
      }}
    >
      <Layer listening={false}>{backgroundChildren}</Layer>
      <Layer listening>{overlayChildren}</Layer>
    </Stage>
  );
}
