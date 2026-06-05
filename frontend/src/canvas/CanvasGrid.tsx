import { useCanvasStore } from "./useCanvasStore";

export function CanvasGrid() {
  const zoom = useCanvasStore((s) => s.zoom);

  // Base grid size (40px) scaled by zoom
  const size = 40 * zoom;

  const background = `
    linear-gradient(to right, #e5e5e5 1px, transparent 1px),
    linear-gradient(to bottom, #e5e5e5 1px, transparent 1px)
  `;

  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{
        background,
        backgroundSize: `${size}px ${size}px`,
      }}
    />
  );
}
