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
    semanticLabel: field.metadata?.semanticLabel || "",
    checkboxState: field.metadata?.checkboxState,
    signatureState: field.metadata?.signatureState,
    kvpData: field.metadata?.kvpData,
    categoryMode: field.metadata?.categoryMode,
    acordCandidates: field.metadata?.acordCandidates,
    structuralDelta: field.metadata?.structuralDelta,
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
        metadata: {
          ...buildDefaultMetadata(selectedField),
          fieldType: "checkbox",
          checkboxState: { isCheckbox: true, checked: false },
        },
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
        metadata: {
          ...buildDefaultMetadata(selectedField),
          fieldType: "signature",
          signatureState: { isSignature: true, signed: false },
        },
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

  const updateSemanticLabel = (value: string) => {
    if (!selectedField) return;
    updateField(selectedField.id, {
      metadata: {
        ...buildDefaultMetadata(selectedField),
        semanticLabel: value,
      },
    } as Partial<Field>);
  };

  const updateCategoryMode = (value: string) => {
    if (!selectedField) return;
    updateField(selectedField.id, {
      metadata: {
        ...buildDefaultMetadata(selectedField),
        categoryMode: value || undefined,
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
        <>
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

          {selectedField.metadata && (
            <section
              style={{
                border: "1px solid #d9e2ec",
                borderRadius: 12,
                background: "#f0fdf4",
                padding: 12,
                display: "grid",
                gap: 8,
              }}
            >
              <h4 style={{ margin: 0, color: "#15803d" }}>Wave 8 Semantic Metadata</h4>

              <label>
                Semantic Label:
                <input
                  type="text"
                  value={selectedField.metadata.semanticLabel || ""}
                  onChange={(e) => updateSemanticLabel(e.target.value)}
                  placeholder="e.g., InsuredName, PolicyNumber"
                />
              </label>

              <label>
                ACORD Code:
                <input
                  type="text"
                  value={selectedField.metadata.acordCode || ""}
                  disabled
                  style={{ opacity: 0.6 }}
                />
              </label>

              <label>
                Field Type:
                <input
                  type="text"
                  value={selectedField.metadata.fieldType || ""}
                  disabled
                  style={{ opacity: 0.6 }}
                />
              </label>

              <label>
                Confidence Score:
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={(selectedField.metadata.confidenceScore ?? 0) * 100}
                    disabled
                    style={{ flex: 1 }}
                  />
                  <span style={{ fontSize: 12, fontWeight: 600 }}>
                    {((selectedField.metadata.confidenceScore ?? 0) * 100).toFixed(1)}%
                  </span>
                </div>
              </label>

              <label>
                Category Mode:
                <select
                  value={selectedField.metadata.categoryMode || ""}
                  onChange={(e) => updateCategoryMode(e.target.value)}
                >
                  <option value="">None</option>
                  <option value="strict">Strict</option>
                  <option value="permissive">Permissive</option>
                </select>
              </label>

              {selectedField.metadata.acordCandidates && selectedField.metadata.acordCandidates.length > 0 && (
                <div style={{ paddingTop: 8, borderTop: "1px solid #86efac" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#166534", marginBottom: 6 }}>
                    ACORD Candidates
                  </div>
                  <div style={{ display: "grid", gap: 4 }}>
                    {selectedField.metadata.acordCandidates.map((cand, idx) => (
                      <div
                        key={idx}
                        style={{
                          fontSize: 11,
                          padding: 6,
                          background: "#ffffff",
                          border: "1px solid #86efac",
                          borderRadius: 4,
                        }}
                      >
                        <div style={{ fontWeight: 600 }}>
                          {cand.acordCode} ({(cand.confidenceScore * 100).toFixed(0)}%)
                        </div>
                        <div style={{ fontSize: 10, color: "#666" }}>{cand.label}</div>
                        {cand.source && (
                          <div style={{ fontSize: 9, color: "#999" }}>Source: {cand.source}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedField.metadata.structuralDelta && (
                <div style={{ paddingTop: 8, borderTop: "1px solid #86efac" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#166534", marginBottom: 6 }}>
                    Structural Delta
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      padding: 6,
                      background: "#ffffff",
                      border: "1px solid #86efac",
                      borderRadius: 4,
                      fontFamily: "monospace",
                    }}
                  >
                    <div>Version: {selectedField.metadata.structuralDelta.deltaVersion}</div>
                    {selectedField.metadata.structuralDelta.changeType && (
                      <div>Type: {selectedField.metadata.structuralDelta.changeType}</div>
                    )}
                    {selectedField.metadata.structuralDelta.baselineDocumentId && (
                      <div>Baseline: {selectedField.metadata.structuralDelta.baselineDocumentId}</div>
                    )}
                  </div>
                </div>
              )}
            </section>
          )}
        </>
      )}

      <PropertiesPanel selectedField={selectedField} />
    </div>
  );
}

export default DesignerPropertiesPanel;
