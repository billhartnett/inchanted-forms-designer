import { useMemo } from "react";
import { useDesignerStore } from "../../state/designerStore";

function getConfidenceScore(field: { metadata?: { confidenceScore?: number } }) {
  const score = field.metadata?.confidenceScore;
  if (typeof score !== "number" || !Number.isFinite(score)) {
    return 0;
  }

  return Math.max(0, Math.min(1, score));
}

function getConfidenceBand(score: number) {
  if (score >= 0.8) {
    return { label: "High", color: "#166534", background: "#dcfce7" };
  }
  if (score >= 0.55) {
    return { label: "Medium", color: "#92400e", background: "#fef3c7" };
  }

  return { label: "Low", color: "#991b1b", background: "#fee2e2" };
}

function renderConfidenceBadge(score: number) {
  const band = getConfidenceBand(score);
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        color: band.color,
        background: band.background,
        borderRadius: 999,
        padding: "0.15rem 0.4rem",
        border: `1px solid ${band.color}22`,
      }}
    >
      {band.label} {Math.round(score * 100)}%
    </span>
  );
}

export function DesignerLayersPanel() {
  const pdfPages = useDesignerStore((s) => s.pdfPages);
  const currentPdfPage = useDesignerStore((s) => s.currentPdfPage);
  const setCurrentPdfPage = useDesignerStore((s) => s.setCurrentPdfPage);
  const fields = useDesignerStore((s) => s.fields);
  const groups = useDesignerStore((s) => s.groups);
  const selectedIds = useDesignerStore((s) => s.selectedIds);
  const selectedGroupId = useDesignerStore((s) => s.selectedGroupId);
  const selectField = useDesignerStore((s) => s.selectField);
  const selectGroup = useDesignerStore((s) => s.selectGroup);

  const fieldById = useMemo(() => {
    const map = new Map<string, (typeof fields)[number]>();
    for (const field of fields) {
      map.set(field.id, field);
    }
    return map;
  }, [fields]);

  const ungroupedFields = fields.filter((field) => !field.groupId);
  const needsReviewFields = fields
    .filter((field) => {
      const hasMappedCode = Boolean(field.metadata?.acordCode?.trim());
      const score = getConfidenceScore(field);
      return !hasMappedCode || score < 0.55;
    })
    .sort((a, b) => getConfidenceScore(a) - getConfidenceScore(b));

  const focusField = (id: string) => {
    const field = fieldById.get(id);
    if (!field) {
      return;
    }

    if (
      typeof field.pageIndex === "number" &&
      Number.isFinite(field.pageIndex) &&
      field.pageIndex >= 0 &&
      pdfPages.length > 0
    ) {
      setCurrentPdfPage(Math.floor(field.pageIndex));
    }

    selectField(id, false);
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <section
        style={{
          border: "1px solid #d9e2ec",
          borderRadius: 12,
          background: "#f8fafc",
          padding: 10,
          display: "grid",
          gap: 8,
        }}
      >
        <h4 style={{ margin: 0, color: "#0f172a" }}>
          Needs Review ({needsReviewFields.length})
        </h4>
        {needsReviewFields.length === 0 ? (
          <div style={{ fontSize: 12, color: "#166534" }}>
            No low-confidence or unassigned fields.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 6, maxHeight: 220, overflowY: "auto" }}>
            {needsReviewFields.map((field) => {
              const isSelected = selectedIds.includes(field.id);
              const score = getConfidenceScore(field);
              const label =
                field.metadata?.acordLabel?.trim() ||
                field.metadata?.acordCode?.trim() ||
                "Unassigned";

              return (
                <button
                  key={`review-${field.id}`}
                  type="button"
                  onClick={() => focusField(field.id)}
                  style={{
                    textAlign: "left",
                    padding: "0.4rem 0.5rem",
                    borderRadius: 8,
                    border: `1px solid ${isSelected ? "#93c5fd" : "#cbd5e1"}`,
                    background: isSelected ? "#eff6ff" : "#ffffff",
                    color: "#0f172a",
                    fontSize: 12,
                    display: "grid",
                    gap: 3,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span>{label}</span>
                    {renderConfidenceBadge(score)}
                  </div>
                  <div style={{ color: "#64748b", fontSize: 11 }}>
                    {field.type} • {field.id.slice(0, 6)}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section
        style={{
          border: "1px solid #d9e2ec",
          borderRadius: 12,
          background: "#f8fafc",
          padding: 10,
          display: "grid",
          gap: 8,
        }}
      >
        <h4 style={{ margin: 0, color: "#0f172a" }}>Pages</h4>
        {pdfPages.length === 0 ? (
          <div style={{ fontSize: 12, color: "#64748b" }}>No PDF pages loaded.</div>
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            {pdfPages.map((_, index) => {
              const isActive = currentPdfPage === index;
              return (
                <button
                  key={`page-${index}`}
                  type="button"
                  onClick={() => setCurrentPdfPage(index)}
                  style={{
                    textAlign: "left",
                    padding: "0.35rem 0.5rem",
                    borderRadius: 8,
                    border: `1px solid ${isActive ? "#93c5fd" : "#cbd5e1"}`,
                    background: isActive ? "#eff6ff" : "#ffffff",
                    color: "#0f172a",
                    fontSize: 12,
                  }}
                >
                  Page {index + 1}
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section
        style={{
          border: "1px solid #d9e2ec",
          borderRadius: 12,
          background: "#f8fafc",
          padding: 10,
          display: "grid",
          gap: 8,
        }}
      >
        <h4 style={{ margin: 0, color: "#0f172a" }}>Groups</h4>
        {groups.length === 0 ? (
          <div style={{ fontSize: 12, color: "#64748b" }}>No groups yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {groups.map((group, index) => {
              const isSelected = selectedGroupId === group.id;
              return (
                <div key={group.id} style={{ display: "grid", gap: 4 }}>
                  <button
                    type="button"
                    onClick={() => selectGroup(group.id)}
                    style={{
                      textAlign: "left",
                      padding: "0.35rem 0.5rem",
                      borderRadius: 8,
                      border: `1px solid ${isSelected ? "#93c5fd" : "#cbd5e1"}`,
                      background: isSelected ? "#eff6ff" : "#ffffff",
                      color: "#0f172a",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    Group {index + 1} ({group.fieldIds.length})
                  </button>
                  <div style={{ display: "grid", gap: 4, paddingLeft: 10 }}>
                    {group.fieldIds.map((id) => {
                      const field = fieldById.get(id);
                      if (!field) return null;
                      const active = selectedIds.includes(id);
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => focusField(id)}
                          style={{
                            textAlign: "left",
                            padding: "0.3rem 0.45rem",
                            borderRadius: 6,
                            border: `1px solid ${active ? "#93c5fd" : "#dbe4ee"}`,
                            background: active ? "#eff6ff" : "#ffffff",
                            color: "#334155",
                            fontSize: 11,
                          }}
                        >
                          <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                            <span>{field.type} • {id.slice(0, 6)}</span>
                            {renderConfidenceBadge(getConfidenceScore(field))}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section
        style={{
          border: "1px solid #d9e2ec",
          borderRadius: 12,
          background: "#f8fafc",
          padding: 10,
          display: "grid",
          gap: 8,
        }}
      >
        <h4 style={{ margin: 0, color: "#0f172a" }}>Fields</h4>
        {ungroupedFields.length === 0 ? (
          <div style={{ fontSize: 12, color: "#64748b" }}>No ungrouped fields.</div>
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            {ungroupedFields.map((field) => {
              const isSelected = selectedIds.includes(field.id);
              return (
                <button
                  key={field.id}
                  type="button"
                  onClick={() => focusField(field.id)}
                  style={{
                    textAlign: "left",
                    padding: "0.35rem 0.5rem",
                    borderRadius: 8,
                    border: `1px solid ${isSelected ? "#93c5fd" : "#cbd5e1"}`,
                    background: isSelected ? "#eff6ff" : "#ffffff",
                    color: "#0f172a",
                    fontSize: 12,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <span>{field.type} • {field.id.slice(0, 6)}</span>
                  {renderConfidenceBadge(getConfidenceScore(field))}
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

export default DesignerLayersPanel;
