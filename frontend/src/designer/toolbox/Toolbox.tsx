import { useDesignerStore } from "../state/useDesignerStore";

interface ToolboxProps {
  onImportPdf?: () => void;
}

export function Toolbox({ onImportPdf }: ToolboxProps) {
  const addField = useDesignerStore((s) => s.addField);
  const selectField = useDesignerStore((s) => s.selectField);
  const canvasCursor = useDesignerStore((s) => s.canvasCursor);

  const getSpawnPoint = () => ({
    x: Math.round(canvasCursor?.x ?? 100),
    y: Math.round(canvasCursor?.y ?? 100),
  });

  const addRect = () => {
    const spawn = getSpawnPoint();
    const field = {
      type: "rect" as const,
      x: spawn.x,
      y: spawn.y,
      width: 300,
      height: 30,
      rotation: 0,
      opacity: 1,
      fill: "#4a90e2",
      stroke: "#1e293b",
      strokeWidth: 1,
      cornerRadius: 0,
    };

    addField(field);
    // select the last added field
    setTimeout(() => {
      const fields = useDesignerStore.getState().fields;
      selectField(fields[fields.length - 1].id);
    }, 0);
  };

  const addText = () => {
    const spawn = getSpawnPoint();
    const field = {
      type: "text" as const,
      x: spawn.x,
      y: spawn.y,
      width: 300,
      height: 30,
      rotation: 0,
      opacity: 1,
      text: "New Text",
      fontSize: 20,
      fontFamily: "Geist Variable",
      textAlign: "left" as const,
      color: "#000000",
      stroke: "#1e293b",
      strokeWidth: 0,
    };

    addField(field);
    setTimeout(() => {
      const fields = useDesignerStore.getState().fields;
      selectField(fields[fields.length - 1].id);
    }, 0);
  };

  const addCheckbox = () => {
    const spawn = getSpawnPoint();
    addField({
      type: "checkbox",
      x: spawn.x,
      y: spawn.y,
      width: 180,
      height: 28,
      rotation: 0,
      opacity: 1,
      stroke: "#1e293b",
      strokeWidth: 1,
      fill: "#ffffff",
      checked: false,
      label: "Checkbox",
    });
  };

  const addRadio = () => {
    const spawn = getSpawnPoint();
    addField({
      type: "radio",
      x: spawn.x,
      y: spawn.y,
      width: 180,
      height: 28,
      rotation: 0,
      opacity: 1,
      stroke: "#1e293b",
      strokeWidth: 1,
      fill: "#ffffff",
      checked: false,
      groupName: "radio-group",
      label: "Radio",
    });
  };

  const addDropdown = () => {
    const spawn = getSpawnPoint();
    addField({
      type: "dropdown",
      x: spawn.x,
      y: spawn.y,
      width: 240,
      height: 34,
      rotation: 0,
      opacity: 1,
      stroke: "#1e293b",
      strokeWidth: 1,
      fill: "#ffffff",
      options: ["Option 1", "Option 2", "Option 3"],
      selectedOption: "",
      placeholder: "Select option",
      openPreview: false,
    });
  };

  const addDate = () => {
    const spawn = getSpawnPoint();
    addField({
      type: "date",
      x: spawn.x,
      y: spawn.y,
      width: 220,
      height: 34,
      rotation: 0,
      opacity: 1,
      stroke: "#1e293b",
      strokeWidth: 1,
      fill: "#ffffff",
      dateFormat: "MM/DD/YYYY",
      value: "",
      placeholder: "Pick a date",
    });
  };

  const addNumeric = () => {
    const spawn = getSpawnPoint();
    addField({
      type: "numeric",
      x: spawn.x,
      y: spawn.y,
      width: 180,
      height: 34,
      rotation: 0,
      opacity: 1,
      stroke: "#1e293b",
      strokeWidth: 1,
      fill: "#ffffff",
      min: 0,
      max: 100,
      step: 1,
      value: null,
      placeholder: "0",
    });
  };

  const addSignature = () => {
    const spawn = getSpawnPoint();
    addField({
      type: "signature",
      x: spawn.x,
      y: spawn.y,
      width: 260,
      height: 90,
      rotation: 0,
      opacity: 1,
      stroke: "#1e293b",
      strokeWidth: 1,
      fill: "#ffffff",
      placeholder: "Sign here",
      signed: false,
      showStrokePreview: false,
    });
  };

  return (
    <div
      style={{
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <h3 style={{ margin: 0, color: "#0f172a" }}>Toolbox</h3>

      <button onClick={onImportPdf} style={{ padding: "0.55rem 0.7rem" }}>
        Import PDF
      </button>
      <button onClick={addRect}>Add Rectangle</button>
      <button onClick={addText}>Add Text</button>
      <button onClick={addCheckbox}>Add Checkbox</button>
      <button onClick={addRadio}>Add Radio</button>
      <button onClick={addDropdown}>Add Dropdown</button>
      <button onClick={addDate}>Add Date</button>
      <button onClick={addNumeric}>Add Numeric</button>
      <button onClick={addSignature}>Add Signature</button>
    </div>
  );
}
