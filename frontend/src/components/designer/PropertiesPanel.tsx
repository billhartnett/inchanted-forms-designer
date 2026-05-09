import { useDesignerStore } from "../state/useDesignerStore";

export default function PropertiesPanel() {
  const fields = useDesignerStore((s) => s.fields);
  const selectedId = useDesignerStore((s) => s.selectedId);
  const updateField = useDesignerStore((s) => s.updateField);

  const field = fields.find((f) => f.id === selectedId);

  if (!field) {
    return (
      <div
        style={{
          width: 260,
          borderLeft: "1px solid #ccc",
          padding: 10,
          background: "#f9f9f9",
        }}
      >
        <div style={{ fontWeight: "bold" }}>Properties</div>
        <div style={{ fontSize: 12, color: "#666" }}>
          Select a field to edit its properties.
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        width: 260,
        borderLeft: "1px solid #ccc",
        padding: 10,
        background: "#f9f9f9",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ fontWeight: "bold" }}>Properties</div>

      <label>
        X:
        <input
          type="number"
          value={field.x}
          onChange={(e) =>
            updateField(field.id, { x: Number(e.target.value) })
          }
        />
      </label>

      <label>
        Y:
        <input
          type="number"
          value={field.y}
          onChange={(e) =>
            updateField(field.id, { y: Number(e.target.value) })
          }
        />
      </label>

      <label>
        Width:
        <input
          type="number"
          value={field.width}
          onChange={(e) =>
            updateField(field.id, { width: Number(e.target.value) })
          }
        />
      </label>

      <label>
        Height:
        <input
          type="number"
          value={field.height}
          onChange={(e) =>
            updateField(field.id, { height: Number(e.target.value) })
          }
        />
      </label>

      {field.type === "text" && (
        <>
          <label>
            Text:
            <input
              type="text"
              value={field.text}
              onChange={(e) =>
                updateField(field.id, { text: e.target.value })
              }
            />
          </label>

          <label>
            Font Size:
            <input
              type="number"
              value={field.fontSize}
              onChange={(e) =>
                updateField(field.id, {
                  fontSize: Number(e.target.value),
                })
              }
            />
          </label>

          <label>
            Color:
            <input
              type="color"
              value={field.color}
              onChange={(e) =>
                updateField(field.id, { color: e.target.value })
              }
            />
          </label>
        </>
      )}
    </div>
  );
}
