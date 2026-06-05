import { useDesignerStore } from "../state/useDesignerStore";

export function Toolbox() {
  const addField = useDesignerStore((s) => s.addField);
  const selectField = useDesignerStore((s) => s.selectField);

  const addRect = () => {
    const field = {
      type: "rect" as const,
      x: 100,
      y: 100,
      width: 120,
      height: 80,
      fill: "#4a90e2",
    };

    addField(field);
    // select the last added field
    setTimeout(() => {
      const fields = useDesignerStore.getState().fields;
      selectField(fields[fields.length - 1].id);
    }, 0);
  };

  const addText = () => {
    const field = {
      type: "text" as const,
      x: 100,
      y: 100,
      text: "New Text",
      fontSize: 20,
      color: "#000000",
    };

    addField(field);
    setTimeout(() => {
      const fields = useDesignerStore.getState().fields;
      selectField(fields[fields.length - 1].id);
    }, 0);
  };

  return (
    <div
      style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}
    >
      <button onClick={addRect}>Add Rectangle</button>
      <button onClick={addText}>Add Text</button>
    </div>
  );
}
