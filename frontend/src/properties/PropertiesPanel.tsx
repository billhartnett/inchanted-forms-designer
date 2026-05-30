import { useDesignerStore } from "../state/useDesignerStore";
import type { Field, RectField, TextField } from "../state/useDesignerStore";

export default function PropertiesPanel() {
  const fields = useDesignerStore((s) => s.fields);
  const selectedId = useDesignerStore((s) => s.selectedId);
  const updateField = useDesignerStore((s) => s.updateField);

  const selected: Field | undefined = fields.find((f) => f.id === selectedId);

  if (!selected) {
    return <div>No field selected</div>;
  }

  const update = (patch: Partial<Field>) => {
    updateField(selected.id, patch);
  };

  const isRect = selected.type === "rect";
  const isText = selected.type === "text";

  const rect = selected as RectField;
  const text = selected as TextField;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <h3 style={{ marginTop: 0 }}>Properties</h3>
      <div>
        <strong>Type:</strong> {selected.type}
      </div>

      <label style={{ display: "block" }}>
        X:
        <input
          type="number"
          value={selected.x}
          onChange={(e) => update({ x: Number(e.target.value) })}
          style={{ width: "100%" }}
        />
      </label>

      <label style={{ display: "block" }}>
        Y:
        <input
          type="number"
          value={selected.y}
          onChange={(e) => update({ y: Number(e.target.value) })}
          style={{ width: "100%" }}
        />
      </label>

      {isRect && (
        <>
          <label style={{ display: "block" }}>
            Width:
            <input
              type="number"
              value={rect.width}
              onChange={(e) =>
                update({ width: Number(e.target.value) } as Partial<Field>)
              }
              style={{ width: "100%" }}
            />
          </label>

          <label style={{ display: "block" }}>
            Height:
            <input
              type="number"
              value={rect.height}
              onChange={(e) =>
                update({ height: Number(e.target.value) } as Partial<Field>)
              }
              style={{ width: "100%" }}
            />
          </label>

          <label style={{ display: "block" }}>
            Fill:
            <input
              type="color"
              value={rect.fill}
              onChange={(e) =>
                update({ fill: e.target.value } as Partial<Field>)
              }
              style={{ width: "100%" }}
            />
          </label>
        </>
      )}

      {isText && (
        <>
          <label style={{ display: "block" }}>
            Text:
            <input
              type="text"
              value={text.text}
              onChange={(e) =>
                update({ text: e.target.value } as Partial<Field>)
              }
              style={{ width: "100%" }}
            />
          </label>

          <label style={{ display: "block" }}>
            Font size:
            <input
              type="number"
              value={text.fontSize}
              onChange={(e) =>
                update({ fontSize: Number(e.target.value) } as Partial<Field>)
              }
              style={{ width: "100%" }}
            />
          </label>

          <label style={{ display: "block" }}>
            Color:
            <input
              type="color"
              value={text.color}
              onChange={(e) =>
                update({ color: e.target.value } as Partial<Field>)
              }
              style={{ width: "100%" }}
            />
          </label>
        </>
      )}
    </div>
  );
}
