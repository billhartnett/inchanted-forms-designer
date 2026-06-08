import { useEffect, useMemo, useState } from "react";

import {
  type Field,
  type FieldMetadata,
  type NumericField,
  type DropdownField,
  type MetadataFieldType,
  useDesignerStore,
} from "../state/useDesignerStore";

function num(value: number, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function commonValue<T>(items: T[], pick: (item: T) => string | number) {
  if (items.length === 0) return "";

  const first = pick(items[0]);
  for (let i = 1; i < items.length; i += 1) {
    if (pick(items[i]) !== first) {
      return "";
    }
  }

  return first;
}

function hasFill(field: Field): field is Exclude<Field, { type: "text" }> {
  return field.type !== "text";
}

function parseOptions(value: string) {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

type AcordDictionaryField = {
  acordCode: string;
  label: string;
  description: string;
  dataType: string;
  lob: string;
  version: string;
  keywords: string[];
  relevanceScore?: number;
};

type AcordSuggestion = {
  acordCode: string;
  label: string;
  description?: string;
  confidenceScore: number;
  source: "ai";
};

const API_BASE_URL = (() => {
  const configured = (
    import.meta.env.VITE_API_BASE_URL as string | undefined
  )?.trim();
  if (configured) {
    return configured;
  }

  if (typeof window === "undefined") {
    return "";
  }

  const { hostname, protocol } = window.location;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return `${protocol}//${hostname}:7071`;
  }

  return "";
})();

function apiUrl(path: string): string {
  if (!API_BASE_URL) {
    return path;
  }

  return `${API_BASE_URL}${path}`;
}

function toMetadataFieldType(type: Field["type"]): MetadataFieldType {
  if (type === "rect") {
    return "text";
  }

  return type;
}

function getFieldMetadata(field: Field): FieldMetadata {
  const metadata = field.metadata;

  return {
    acordCode:
      typeof metadata?.acordCode === "string" ? metadata.acordCode : "",
    acordLabel:
      typeof metadata?.acordLabel === "string" ? metadata.acordLabel : "",
    acordDescription:
      typeof metadata?.acordDescription === "string"
        ? metadata.acordDescription
        : "",
    fieldType: toMetadataFieldType(field.type),
    required: Boolean(metadata?.required),
    confidenceScore:
      typeof metadata?.confidenceScore === "number" &&
      Number.isFinite(metadata.confidenceScore)
        ? Math.min(1, Math.max(0, metadata.confidenceScore))
        : 0,
    source:
      metadata?.source === "ai" || metadata?.source === "ocr"
        ? metadata.source
        : "manual",
  };
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    let message = `Request failed: ${response.status}`;
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload?.error) {
        message = payload.error;
      }
    } catch {
      // Ignore non-JSON errors.
    }

    throw new Error(message);
  }

  return (await response.json()) as T;
}

async function searchAcordFields(
  query: string,
  limit = 8,
): Promise<AcordDictionaryField[]> {
  const params = new URLSearchParams({ query, limit: String(limit) });
  const payload = await fetchJson<{ items?: AcordDictionaryField[] }>(
    apiUrl(`/api/acord/search?${params.toString()}`),
  );
  return Array.isArray(payload.items) ? payload.items : [];
}

async function lookupAcordFieldByCode(
  acordCode: string,
): Promise<AcordDictionaryField | null> {
  const code = acordCode.trim();
  if (!code) {
    return null;
  }

  return fetchJson<AcordDictionaryField>(
    apiUrl(`/api/acord/code/${encodeURIComponent(code)}`),
  );
}

async function requestAcordSuggestion(
  text: string,
  context?: string,
): Promise<AcordSuggestion> {
  return fetchJson<AcordSuggestion>(apiUrl("/api/acord/suggest"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text, context }),
  });
}

function getFieldPromptText(field: Field) {
  if (field.type === "text") return field.text || "";
  if (field.type === "checkbox") return field.label || "";
  if (field.type === "radio") return field.label || "";
  if (field.type === "dropdown")
    return field.placeholder || field.selectedOption || "";
  if (field.type === "date") return field.placeholder || field.dateFormat || "";
  if (field.type === "numeric") return field.placeholder || "numeric";
  if (field.type === "signature") return field.placeholder || "signature";
  return "";
}

export function PropertiesPanel() {
  const fields = useDesignerStore((s) => s.fields);
  const selectedIds = useDesignerStore((s) => s.selectedIds);
  const selectedGroupId = useDesignerStore((s) => s.selectedGroupId);
  const updateField = useDesignerStore((s) => s.updateField);
  const updateFields = useDesignerStore((s) => s.updateFields);
  const moveFieldsBy = useDesignerStore((s) => s.moveFieldsBy);
  const deleteSelectedField = useDesignerStore((s) => s.deleteSelectedField);
  const [acordQuery, setAcordQuery] = useState("");
  const [matchingAcordFields, setMatchingAcordFields] = useState<
    AcordDictionaryField[]
  >([]);
  const [suggestion, setSuggestion] = useState<AcordSuggestion | null>(null);
  const [isSearchingAcord, setIsSearchingAcord] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [acordError, setAcordError] = useState<string | null>(null);

  const selected = useMemo(
    () => fields.filter((field) => selectedIds.includes(field.id)),
    [fields, selectedIds],
  );

  const selectedSingle = useMemo(
    () => (selected.length === 1 && !selectedGroupId ? selected[0] : null),
    [selected, selectedGroupId],
  );

  useEffect(() => {
    setSuggestion(null);
    setAcordQuery("");
    setMatchingAcordFields([]);
    setAcordError(null);
  }, [selectedSingle?.id]);

  useEffect(() => {
    const query = acordQuery.trim();
    if (!query) {
      setMatchingAcordFields([]);
      setAcordError(null);
      return;
    }

    let isActive = true;
    setIsSearchingAcord(true);

    searchAcordFields(query, 8)
      .then((items) => {
        if (!isActive) return;
        setMatchingAcordFields(items);
        setAcordError(null);
      })
      .catch((error) => {
        if (!isActive) return;
        setMatchingAcordFields([]);
        setAcordError(error instanceof Error ? error.message : "Search failed");
      })
      .finally(() => {
        if (!isActive) return;
        setIsSearchingAcord(false);
      });

    return () => {
      isActive = false;
    };
  }, [acordQuery]);

  if (selected.length === 0) {
    return (
      <div style={{ padding: 12 }}>
        <h3 style={{ marginTop: 0 }}>Properties</h3>
        <div>No field selected</div>
      </div>
    );
  }

  const renderSharedSingle = (
    single: Field,
    update: (patch: Partial<Field>) => void,
  ) => (
    <>
      <label>
        X:
        <input
          type="number"
          value={num(single.x)}
          onChange={(e) => update({ x: Number(e.target.value) })}
        />
      </label>

      <label>
        Y:
        <input
          type="number"
          value={num(single.y)}
          onChange={(e) => update({ y: Number(e.target.value) })}
        />
      </label>

      <label>
        Width:
        <input
          type="number"
          value={num(single.width, 20)}
          onChange={(e) =>
            update({ width: Math.max(20, Number(e.target.value)) })
          }
        />
      </label>

      <label>
        Height:
        <input
          type="number"
          value={num(single.height, 20)}
          onChange={(e) =>
            update({ height: Math.max(20, Number(e.target.value)) })
          }
        />
      </label>

      <label>
        Rotation:
        <input
          type="number"
          value={num(single.rotation)}
          onChange={(e) => update({ rotation: Number(e.target.value) })}
        />
      </label>

      <label>
        Opacity:
        <input
          type="number"
          min={0.05}
          max={1}
          step={0.05}
          value={num(single.opacity, 1)}
          onChange={(e) =>
            update({
              opacity: Math.min(1, Math.max(0.05, Number(e.target.value))),
            })
          }
        />
      </label>

      <label>
        Stroke Color:
        <input
          type="color"
          value={single.stroke || "#1e293b"}
          onChange={(e) => update({ stroke: e.target.value })}
        />
      </label>

      <label>
        Stroke Width:
        <input
          type="number"
          min={0}
          value={num(single.strokeWidth, 1)}
          onChange={(e) =>
            update({ strokeWidth: Math.max(0, Number(e.target.value)) })
          }
        />
      </label>

      {hasFill(single) && (
        <label>
          Fill:
          <input
            type="color"
            value={single.fill || "#ffffff"}
            onChange={(e) => update({ fill: e.target.value } as Partial<Field>)}
          />
        </label>
      )}
    </>
  );

  if (selectedSingle) {
    const single = selectedSingle;
    const metadata = getFieldMetadata(single);

    const update = (patch: Partial<Field>) => {
      updateField(single.id, patch);
    };

    const updateMetadata = (patch: Partial<FieldMetadata>) => {
      update({
        metadata: {
          ...metadata,
          ...patch,
          fieldType: toMetadataFieldType(single.type),
        },
      });
    };

    const handleSuggest = async () => {
      setIsSuggesting(true);
      setAcordError(null);
      try {
        const text = getFieldPromptText(single) || single.type;
        const context = `${metadata.acordCode} ${metadata.acordLabel}`.trim();

        const next = await requestAcordSuggestion(
          text,
          context.length ? context : undefined,
        );

        let description = "";
        try {
          const details = await lookupAcordFieldByCode(next.acordCode);
          description = details?.description || "";
        } catch {
          // Keep suggestion without description when lookup is unavailable.
        }

        setSuggestion({
          ...next,
          description,
        });
        setAcordError(null);
      } catch (error) {
        setSuggestion(null);
        setAcordError(
          error instanceof Error ? error.message : "Suggestion failed",
        );
      } finally {
        setIsSuggesting(false);
      }
    };

    const applyDictionaryField = (item: AcordDictionaryField) => {
      updateMetadata({
        acordCode: item.acordCode,
        acordLabel: item.label,
        acordDescription: item.description,
        source: "manual",
        confidenceScore: Math.max(metadata.confidenceScore, 0.9),
      });
      setAcordQuery(item.label);
    };

    const handleLookupFromCode = async (rawCode: string) => {
      const code = rawCode.trim();
      if (!code) return;

      try {
        const found = await lookupAcordFieldByCode(code);
        if (!found) return;

        updateMetadata({
          acordCode: found.acordCode,
          acordLabel: found.label,
          acordDescription: found.description,
          source: "manual",
          confidenceScore: Math.max(metadata.confidenceScore, 0.95),
        });
        setAcordError(null);
      } catch (error) {
        setAcordError(error instanceof Error ? error.message : "Lookup failed");
      }
    };

    return (
      <div
        style={{
          padding: 12,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <h3 style={{ marginTop: 0 }}>Properties</h3>

        {renderSharedSingle(single, update)}

        {single.type === "rect" && (
          <label>
            Corner Radius:
            <input
              type="number"
              min={0}
              value={num(single.cornerRadius, 0)}
              onChange={(e) =>
                update({ cornerRadius: Math.max(0, Number(e.target.value)) })
              }
            />
          </label>
        )}

        {single.type === "text" && (
          <>
            <label>
              Text:
              <input
                type="text"
                value={single.text || ""}
                onChange={(e) => update({ text: e.target.value })}
              />
            </label>
            <label>
              Font Size:
              <input
                type="number"
                min={8}
                value={num(single.fontSize, 20)}
                onChange={(e) =>
                  update({ fontSize: Math.max(8, Number(e.target.value)) })
                }
              />
            </label>
            <label>
              Font Family:
              <input
                type="text"
                value={single.fontFamily || "Geist Variable"}
                onChange={(e) => update({ fontFamily: e.target.value })}
              />
            </label>
            <label>
              Text Alignment:
              <select
                value={single.textAlign || "left"}
                onChange={(e) =>
                  update({
                    textAlign: e.target.value as "left" | "center" | "right",
                  })
                }
              >
                <option value="left">left</option>
                <option value="center">center</option>
                <option value="right">right</option>
              </select>
            </label>
            <label>
              Text Color:
              <input
                type="color"
                value={single.color || "#000000"}
                onChange={(e) => update({ color: e.target.value })}
              />
            </label>
          </>
        )}

        {single.type === "checkbox" && (
          <label>
            Checked (preview):
            <input
              type="checkbox"
              checked={Boolean(single.checked)}
              onChange={(e) =>
                update({ checked: e.target.checked } as Partial<Field>)
              }
            />
          </label>
        )}

        {single.type === "radio" && (
          <>
            <label>
              Group Name:
              <input
                type="text"
                value={single.groupName}
                onChange={(e) =>
                  update({ groupName: e.target.value } as Partial<Field>)
                }
              />
            </label>
            <label>
              Checked (preview):
              <input
                type="checkbox"
                checked={Boolean(single.checked)}
                onChange={(e) =>
                  update({ checked: e.target.checked } as Partial<Field>)
                }
              />
            </label>
          </>
        )}

        {single.type === "dropdown" && (
          <>
            <label>
              Selected Option:
              <select
                value={single.selectedOption || ""}
                onChange={(e) =>
                  update({
                    selectedOption: e.target.value,
                  } as Partial<DropdownField>)
                }
              >
                <option value="">None</option>
                {single.options.map((option, index) => (
                  <option key={`${option}-${index}`} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Options (comma or newline):
              <textarea
                rows={4}
                value={single.options.join("\n")}
                onChange={(e) =>
                  update({
                    options: parseOptions(e.target.value),
                  } as Partial<DropdownField>)
                }
              />
            </label>
            <label>
              Placeholder:
              <input
                type="text"
                value={single.placeholder}
                onChange={(e) =>
                  update({
                    placeholder: e.target.value,
                  } as Partial<DropdownField>)
                }
              />
            </label>
            <label>
              Open Preview:
              <input
                type="checkbox"
                checked={Boolean(single.openPreview)}
                onChange={(e) =>
                  update({
                    openPreview: e.target.checked,
                  } as Partial<DropdownField>)
                }
              />
            </label>
          </>
        )}

        {single.type === "date" && (
          <label>
            Date Format:
            <input
              type="text"
              value={single.dateFormat}
              onChange={(e) =>
                update({ dateFormat: e.target.value } as Partial<Field>)
              }
            />
          </label>
        )}

        {single.type === "numeric" && (
          <>
            <label>
              Min:
              <input
                type="number"
                value={num(single.min, 0)}
                onChange={(e) =>
                  update({
                    min: Number(e.target.value),
                  } as Partial<NumericField>)
                }
              />
            </label>
            <label>
              Max:
              <input
                type="number"
                value={num(single.max, 100)}
                onChange={(e) =>
                  update({
                    max: Number(e.target.value),
                  } as Partial<NumericField>)
                }
              />
            </label>
            <label>
              Step:
              <input
                type="number"
                min={0.001}
                value={num(single.step, 1)}
                onChange={(e) =>
                  update({
                    step: Math.max(0.001, Number(e.target.value)),
                  } as Partial<NumericField>)
                }
              />
            </label>
          </>
        )}

        {single.type === "signature" && (
          <>
            <label>
              Placeholder Text:
              <input
                type="text"
                value={single.placeholder}
                onChange={(e) =>
                  update({ placeholder: e.target.value } as Partial<Field>)
                }
              />
            </label>
            <label>
              Stroke Preview Mode:
              <input
                type="checkbox"
                checked={Boolean(single.showStrokePreview)}
                onChange={(e) =>
                  update({
                    showStrokePreview: e.target.checked,
                  } as Partial<Field>)
                }
              />
            </label>
          </>
        )}

        <div
          style={{
            border: "1px solid #dbe4f0",
            borderRadius: 8,
            padding: 10,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            background: "#f8fbff",
          }}
        >
          <h4 style={{ margin: 0, color: "#0f172a" }}>ACORD Mapping</h4>

          <label>
            Field Type:
            <input type="text" value={metadata.fieldType} readOnly />
          </label>

          <label>
            ACORD Code:
            <input
              type="text"
              value={metadata.acordCode}
              onChange={(e) =>
                updateMetadata({
                  acordCode: e.target.value,
                  source: "manual",
                })
              }
              onBlur={(e) => {
                void handleLookupFromCode(e.target.value);
              }}
            />
          </label>

          <label>
            ACORD Label:
            <input
              type="text"
              value={metadata.acordLabel}
              onChange={(e) =>
                updateMetadata({
                  acordLabel: e.target.value,
                  source: "manual",
                })
              }
            />
          </label>

          <label>
            Description:
            <textarea
              rows={3}
              value={metadata.acordDescription}
              onChange={(e) =>
                updateMetadata({
                  acordDescription: e.target.value,
                })
              }
            />
          </label>

          <label>
            Confidence Score:
            <input
              type="number"
              min={0}
              max={1}
              step={0.01}
              value={metadata.confidenceScore}
              onChange={(e) =>
                updateMetadata({
                  confidenceScore: Math.min(
                    1,
                    Math.max(0, Number(e.target.value) || 0),
                  ),
                  source: "manual",
                })
              }
            />
          </label>

          <label>
            Required:
            <input
              type="checkbox"
              checked={metadata.required}
              onChange={(e) =>
                updateMetadata({
                  required: e.target.checked,
                })
              }
            />
          </label>

          <label>
            Source:
            <input type="text" value={metadata.source} readOnly />
          </label>

          <label>
            Search ACORD Fields:
            <input
              type="text"
              value={acordQuery}
              placeholder="Search by code, label, or keyword"
              onChange={(e) => setAcordQuery(e.target.value)}
            />
          </label>

          {matchingAcordFields.length > 0 && (
            <div
              style={{
                border: "1px solid #c7d4e5",
                borderRadius: 6,
                maxHeight: 180,
                overflowY: "auto",
                background: "#ffffff",
              }}
            >
              {matchingAcordFields.map((entry) => (
                <button
                  key={entry.acordCode}
                  onClick={() => applyDictionaryField(entry)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    border: "none",
                    borderBottom: "1px solid #e2e8f0",
                    background: "transparent",
                    padding: "8px 10px",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontWeight: 600, color: "#0f172a" }}>
                    {entry.acordCode} - {entry.label}
                  </div>
                  <div style={{ fontSize: 12, color: "#475569" }}>
                    {entry.description}
                  </div>
                </button>
              ))}
            </div>
          )}

          {isSearchingAcord && (
            <div style={{ color: "#475569", fontSize: 12 }}>Searching...</div>
          )}

          {acordError && (
            <div style={{ color: "#b91c1c", fontSize: 12 }}>{acordError}</div>
          )}

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={handleSuggest} disabled={isSuggesting}>
              {isSuggesting ? "Suggesting..." : "Suggest ACORD Label"}
            </button>
            {suggestion && (
              <button onClick={() => setSuggestion(null)}>Reject</button>
            )}
          </div>

          {suggestion && (
            <div
              style={{
                border: "1px solid #c7d4e5",
                borderRadius: 6,
                padding: 8,
                background: "#ffffff",
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <div style={{ fontWeight: 600 }}>Suggested Mapping</div>
              <div>Code: {suggestion.acordCode}</div>
              <div>Label: {suggestion.label}</div>
              <div>Confidence: {suggestion.confidenceScore.toFixed(2)}</div>
              {suggestion.description && (
                <div style={{ color: "#475569" }}>{suggestion.description}</div>
              )}
              <button
                onClick={() => {
                  updateMetadata({
                    acordCode: suggestion.acordCode,
                    acordLabel: suggestion.label,
                    acordDescription:
                      suggestion.description || metadata.acordDescription,
                    confidenceScore: suggestion.confidenceScore,
                    source: suggestion.source,
                  });
                  setSuggestion(null);
                }}
              >
                Accept Suggestion
              </button>
            </div>
          )}
        </div>

        <button
          onClick={deleteSelectedField}
          style={{
            marginTop: 8,
            background: "#dc2626",
            color: "#ffffff",
            borderColor: "#dc2626",
          }}
        >
          Delete
        </button>
      </div>
    );
  }

  const first = selected[0];
  const fillIds = selected.filter(hasFill).map((item) => item.id);

  const xValue = num(first.x);
  const yValue = num(first.y);
  const widthValue = commonValue(
    selected,
    (item) => Math.round(item.width * 1000) / 1000,
  );
  const heightValue = commonValue(
    selected,
    (item) => Math.round(item.height * 1000) / 1000,
  );
  const rotationValue = commonValue(
    selected,
    (item) => Math.round(item.rotation * 1000) / 1000,
  );
  const opacityValue = commonValue(
    selected,
    (item) => Math.round(item.opacity * 1000) / 1000,
  );
  const strokeColor = commonValue(selected, (item) => item.stroke || "#1e293b");
  const fillColor =
    fillIds.length > 0
      ? commonValue(selected.filter(hasFill), (item) => item.fill || "#ffffff")
      : "";

  const applyDelta = (axis: "x" | "y", nextValue: number) => {
    const base = axis === "x" ? first.x : first.y;
    const delta = nextValue - base;
    moveFieldsBy(
      selected.map((item) => item.id),
      axis === "x" ? delta : 0,
      axis === "y" ? delta : 0,
      { recordHistory: true },
    );
  };

  return (
    <div
      style={{ padding: 12, display: "flex", flexDirection: "column", gap: 12 }}
    >
      <h3 style={{ marginTop: 0 }}>Properties</h3>
      <div style={{ color: "#0f172a", fontWeight: 600 }}>
        Multiple shapes selected ({selected.length})
      </div>
      <div style={{ color: "#475569", fontSize: 12 }}>
        ACORD Mapping is edited on single-field selection.
      </div>

      <label>
        X:
        <input
          type="number"
          value={xValue}
          onChange={(e) => applyDelta("x", Number(e.target.value))}
        />
      </label>

      <label>
        Y:
        <input
          type="number"
          value={yValue}
          onChange={(e) => applyDelta("y", Number(e.target.value))}
        />
      </label>

      <label>
        Width:
        <input
          type="number"
          value={widthValue}
          placeholder="mixed"
          onChange={(e) =>
            updateFields(
              selected.map((item) => item.id),
              {
                width: Math.max(20, Number(e.target.value)),
              },
            )
          }
        />
      </label>

      <label>
        Height:
        <input
          type="number"
          value={heightValue}
          placeholder="mixed"
          onChange={(e) =>
            updateFields(
              selected.map((item) => item.id),
              {
                height: Math.max(20, Number(e.target.value)),
              },
            )
          }
        />
      </label>

      <label>
        Rotation:
        <input
          type="number"
          value={rotationValue}
          placeholder="mixed"
          onChange={(e) =>
            updateFields(
              selected.map((item) => item.id),
              {
                rotation: Number(e.target.value),
              },
            )
          }
        />
      </label>

      <label>
        Opacity:
        <input
          type="number"
          min={0.05}
          max={1}
          step={0.05}
          value={opacityValue}
          placeholder="mixed"
          onChange={(e) =>
            updateFields(
              selected.map((item) => item.id),
              {
                opacity: Math.min(1, Math.max(0.05, Number(e.target.value))),
              },
            )
          }
        />
      </label>

      <label>
        Stroke Color:
        <input
          type="color"
          value={
            typeof strokeColor === "string" && strokeColor
              ? strokeColor
              : "#1e293b"
          }
          onChange={(e) =>
            updateFields(
              selected.map((item) => item.id),
              {
                stroke: e.target.value,
              },
            )
          }
        />
      </label>

      {fillIds.length > 0 && (
        <label>
          Fill:
          <input
            type="color"
            value={
              typeof fillColor === "string" && fillColor ? fillColor : "#ffffff"
            }
            onChange={(e) =>
              updateFields(fillIds, { fill: e.target.value } as Partial<Field>)
            }
          />
        </label>
      )}

      <button
        onClick={deleteSelectedField}
        style={{
          marginTop: 8,
          background: "#dc2626",
          color: "#ffffff",
          borderColor: "#dc2626",
        }}
      >
        Delete Selected
      </button>
    </div>
  );
}
