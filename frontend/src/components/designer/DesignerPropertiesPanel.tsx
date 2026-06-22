import { useMemo } from "react";
import type { SemanticFieldType } from "../../../../shared/src/types";
import { PropertiesPanel } from "../../designer/properties/PropertiesPanel";
import { useDesignerStore, type Field } from "../../state/designerStore";

function toMetadataFieldType(type: Field["type"]): SemanticFieldType {
  if (type === "rect") {
    return "text";
  }

  return type;
}

function buildDefaultMetadata(field: Field) {
  return {
    acordCode: field.metadata?.acordCode || "",
    acordLabel: field.metadata?.acordLabel || "",
    acordDescription: field.metadata?.acordDescription || "",
    fieldType: toMetadataFieldType(field.type),
    required: Boolean(field.metadata?.required),
    confidenceScore: field.metadata?.confidenceScore ?? 0,
    source: field.metadata?.source || ("manual" as const),
  };
}

export function DesignerPropertiesPanel() {
  const fields = useDesignerStore((s) => s.fields);
  const selectedIds = useDesignerStore((s) => s.selectedIds);
  const selectedGroupId = useDesignerStore((s) => s.selectedGroupId);
  const updateField = useDesignerStore((s) => s.updateField);

  const selectedField = useMemo(() => {
    if (selectedGroupId) return null;
    if (selectedIds.length !== 1) return null;
    return fields.find((field) => field.id === selectedIds[0]) || null;
  }, [fields, selectedGroupId, selectedIds]);

  const updateLabel = (value: string) => {
    if (!selectedField) return;

    if (selectedField.type === "text") {
      updateField(selectedField.id, { text: value } as Partial<Field>);
      return;
    }

    if (selectedField.type === "checkbox" || selectedField.type === "radio") {
      updateField(selectedField.id, { label: value } as Partial<Field>);
      return;
    }

    updateField(selectedField.id, {
      metadata: {
        ...buildDefaultMetadata(selectedField),
        acordLabel: value,
      },
    } as Partial<Field>);
  };

  const updateType = (nextType: Field["type"]) => {
    if (!selectedField) return;
    if (selectedField.type === nextType) return;

    const base = {
      x: selectedField.x,
      y: selectedField.y,
      width: selectedField.width,
      height: selectedField.height,
      rotation: selectedField.rotation,
      opacity: selectedField.opacity,
      stroke: selectedField.stroke,
      strokeWidth: selectedField.strokeWidth,
      metadata: {
        ...buildDefaultMetadata(selectedField),
        fieldType: toMetadataFieldType(nextType),
      },
    };

    if (nextType === "text") {
      updateField(selectedField.id, {
        ...base,
        type: "text",
        text: selectedField.type === "text" ? selectedField.text : "",
        fontSize: 20,
        fontFamily: "Geist Variable",
        textAlign: "left",
        color: "#000000",
      } as Partial<Field>);
      return;
    }

    if (nextType === "checkbox") {
      updateField(selectedField.id, {
        ...base,
        type: "checkbox",
        fill: "#ffffff",
        checked: false,
        label: "Checkbox",
      } as Partial<Field>);
      return;
    }

    if (nextType === "dropdown") {
      updateField(selectedField.id, {
        ...base,
        type: "dropdown",
        fill: "#ffffff",
        options: ["Option 1", "Option 2"],
        selectedOption: "",
        placeholder: "Select option",
        openPreview: false,
      } as Partial<Field>);
      return;
    }

    if (nextType === "date") {
      updateField(selectedField.id, {
        ...base,
        type: "date",
        fill: "#ffffff",
        dateFormat: "MM/DD/YYYY",
        value: "",
        placeholder: "Pick a date",
      } as Partial<Field>);
      return;
    }

    if (nextType === "numeric") {
      updateField(selectedField.id, {
        ...base,
        type: "numeric",
        fill: "#ffffff",
        min: 0,
        max: 100,
        step: 1,
        value: null,
        placeholder: "0",
      } as Partial<Field>);
      return;
    }

    if (nextType === "signature") {
      updateField(selectedField.id, {
        ...base,
        type: "signature",
        fill: "#ffffff",
        placeholder: "Sign here",
        signed: false,
        showStrokePreview: false,
      } as Partial<Field>);
      return;
    }

    updateField(selectedField.id, {
      ...base,
      type: "rect",
      fill: "#4a90e2",
      cornerRadius: 0,
    } as Partial<Field>);
  };

  const updateRequired = (required: boolean) => {
    if (!selectedField) return;
    updateField(selectedField.id, {
      metadata: {
        ...buildDefaultMetadata(selectedField),
        required,
      },
    } as Partial<Field>);
  };

  const updateDefaultValue = (value: string) => {
    if (!selectedField) return;

    if (selectedField.type === "text") {
      updateField(selectedField.id, { text: value } as Partial<Field>);
      return;
    }

    if (selectedField.type === "dropdown") {
      updateField(selectedField.id, { selectedOption: value } as Partial<Field>);
      return;
    }

    if (selectedField.type === "date") {
      updateField(selectedField.id, { value } as Partial<Field>);
      return;
    }

    if (selectedField.type === "numeric") {
      const numeric = value.trim() === "" ? null : Number(value);
      updateField(selectedField.id, {
        value: typeof numeric === "number" && Number.isFinite(numeric) ? numeric : null,
      } as Partial<Field>);
      return;
    }

    if (selectedField.type === "checkbox" || selectedField.type === "radio") {
      const normalized = value.trim().toLowerCase();
      const checked = normalized === "true" || normalized === "1" || normalized === "yes";
      updateField(selectedField.id, { checked } as Partial<Field>);
    }
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {selectedField && (
        <section
          style={{
            border: "1px solid #d9e2ec",
            borderRadius: 12,
            background: "#f8fafc",
            padding: 12,
            display: "grid",
            gap: 8,
          }}
        >
          <h4 style={{ margin: 0, color: "#0f172a" }}>Field Basics</h4>

          <label>
            Label:
            <input
              type="text"
              value={
                selectedField.type === "text"
                  ? selectedField.text
                  : selectedField.type === "checkbox" || selectedField.type === "radio"
                    ? selectedField.label
                    : selectedField.metadata?.acordLabel || ""
              }
              onChange={(e) => updateLabel(e.target.value)}
            />
          </label>

          <label>
            Type:
            <select
              value={selectedField.type}
              onChange={(e) => updateType(e.target.value as Field["type"])}
            >
              <option value="text">text</option>
              <option value="checkbox">checkbox</option>
              <option value="dropdown">dropdown</option>
              <option value="date">date</option>
              <option value="numeric">numeric</option>
              <option value="signature">signature</option>
            </select>
          </label>

          <label>
            Required:
            <input
              type="checkbox"
              checked={Boolean(selectedField.metadata?.required)}
              onChange={(e) => updateRequired(e.target.checked)}
            />
          </label>

          <label>
            Default Value:
            <input
              type="text"
              value={
                selectedField.type === "text"
                  ? selectedField.text
                  : selectedField.type === "dropdown"
                    ? selectedField.selectedOption
                    : selectedField.type === "date"
                      ? selectedField.value
                      : selectedField.type === "numeric"
                        ? selectedField.value?.toString() || ""
                        : selectedField.type === "checkbox" || selectedField.type === "radio"
                          ? String(Boolean(selectedField.checked))
                          : ""
              }
              onChange={(e) => updateDefaultValue(e.target.value)}
            />
          </label>
        </section>
      )}

      <PropertiesPanel selectedField={selectedField} />
    </div>
  );
}

export default DesignerPropertiesPanel;
