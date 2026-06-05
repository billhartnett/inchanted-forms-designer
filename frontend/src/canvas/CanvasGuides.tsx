import { useGuidesStore } from "./useGuidesStore";

export function CanvasGuides() {
  const vertical = useGuidesStore((s) => s.vertical);
  const horizontal = useGuidesStore((s) => s.horizontal);

  return (
    <div className="absolute inset-0 pointer-events-none">
      {vertical !== null && (
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: vertical,
            width: 1,
            background: "#ff0077",
          }}
        />
      )}

      {horizontal !== null && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: horizontal,
            height: 1,
            background: "#ff0077",
          }}
        />
      )}
    </div>
  );
}
