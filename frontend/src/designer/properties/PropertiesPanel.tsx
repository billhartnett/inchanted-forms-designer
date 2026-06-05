import React from "react";
import { useDesignerStore } from "../state/useDesignerStore";

export function PropertiesPanel() {
  const fields = useDesignerStore((s) => s.fields);
  const selectedId = useDesignerStore((s) => s.selectedId);
  const updateField = useDesignerStore((s) => s.updateField);

  const selected = fields.find((f) => f.id === selectedId);

  if (!selected) {
    return (
      <div style={{ padding: 12 }}>
        <h3 style={{ marginTop: 0 }}>Properties</h3>
        <div>No field selected</div>
      </div>
    );
  }

  const update = (patch: any) => {
    updateField(selected.id, patch);
  };

  return (
    <div
      style={{ padding: 12, display: "flex", flexDirection: "column", gap: 12 }}
    >
      <h3 style={{ marginTop: 0 }}>Properties</h3>

      <label>
        X:
        <input
          type="number"
          value={selected.x}
          onChange={(e) => update({ x: Number(e.target.value) })}
        />
      </label>

      <label>
        Y:
        <input
          type="number"
          value={selected.y}
          onChange={(e) => update({ y: Number(e.target.value) })}
        />
      </label>

      {"width" in selected && (
        <>
          <label>
            Width:
            <input
              type="number"
              value={selected.width}
              onChange={(e) => update({ width: Number(e.target.value) })}
            />
          </label>

          <label>
            Height:
            <input
              type="number"
              value={selected.height}
              onChange={(e) => update({ height: Number(e.target.value) })}
            />
          </label>

          <label>
            Fill:
            <input
              type="color"
              value={selected.fill}
              onChange={(e) => update({ fill: e.target.value })}
            />
          </label>
        </>
      )}

      {"text" in selected && (
        <>
          <label>
            Text:
            <input
              type="text"
              value={selected.text}
              onChange={(e) => update({ text: e.target.value })}
            />
          </label>

          <label>
            Font Size:
            <input
              type="number"
              value={selected.fontSize}
              onChange={(e) => update({ fontSize: Number(e.target.value) })}
            />
          </label>

          <label>
            Color:
            <input
              type="color"
              value={selected.color}
              onChange={(e) => update({ color: e.target.value })}
            />
          </label>
        </>
      )}
    </div>
  );
}
