type MappingOverridesProps = {
  acordCode: string;
  documentId?: string;
  lastSavedBlobName?: string;
  isBusy?: boolean;
  statusMessage?: string | null;
  onClearOverride: () => void;
  onSaveReview: () => void;
  onLoadReview: () => void;
};

export function MappingOverrides({
  acordCode,
  documentId,
  lastSavedBlobName,
  isBusy = false,
  statusMessage,
  onClearOverride,
  onSaveReview,
  onLoadReview,
}: MappingOverridesProps) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ fontSize: 12, color: "#475569" }}>
        Reviewer overrides persist candidate changes and unified extraction-to-mapping decisions for the current document.
      </div>
      {documentId ? (
        <div style={{ fontSize: 12, color: "#334155" }}>
          Document: {documentId}
        </div>
      ) : null}
      {lastSavedBlobName ? (
        <div style={{ fontSize: 12, color: "#334155" }}>
          Last saved: {lastSavedBlobName}
        </div>
      ) : null}
      {statusMessage ? (
        <div style={{ fontSize: 12, color: "#334155" }}>{statusMessage}</div>
      ) : null}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={onClearOverride} disabled={!acordCode || isBusy}>
          Clear override
        </button>
        <button type="button" onClick={onSaveReview} disabled={!documentId || isBusy}>
          Save review
        </button>
        <button type="button" onClick={onLoadReview} disabled={!documentId || isBusy}>
          Reload review
        </button>
      </div>
    </div>
  );
}