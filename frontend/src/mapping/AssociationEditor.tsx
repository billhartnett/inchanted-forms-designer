type AssociationCandidate = {
  extractionBlockId: string;
  labelText: string;
  extractedText: string;
  page: number;
  mappingDecision: string;
  evidence: string[];
  linkedToCurrentField: boolean;
};

type AssociationHistory = {
  fieldId: string;
  previousExtractionBlockId?: string;
  nextExtractionBlockId?: string;
  changedAt: string;
  reason?: string;
};

type AssociationEditorProps = {
  fieldId: string;
  extractionBlockId?: string;
  candidates: AssociationCandidate[];
  history: AssociationHistory[];
  isBusy?: boolean;
  onReassign: (fieldId: string, extractionBlockId: string) => void;
  onUnlink: (fieldId: string) => void;
};

export function AssociationEditor({
  fieldId,
  extractionBlockId,
  candidates,
  history,
  isBusy,
  onReassign,
  onUnlink,
}: AssociationEditorProps) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ fontSize: 12, color: "#0f172a", fontWeight: 600 }}>
        Association editor
      </div>
      <div style={{ fontSize: 12, color: "#475569" }}>
        Current extraction block: {extractionBlockId || "none"}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => onUnlink(fieldId)}
          disabled={!extractionBlockId || Boolean(isBusy)}
        >
          Unlink field
        </button>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {candidates.length > 0 ? (
          candidates.map((candidate) => {
            const previewText = candidate.extractedText.trim();
            return (
              <div
                key={candidate.extractionBlockId}
                style={{
                  border: candidate.linkedToCurrentField
                    ? "1px solid #2563eb"
                    : "1px solid #d9e2ec",
                  borderRadius: 10,
                  padding: 10,
                  background: candidate.linkedToCurrentField ? "#eff6ff" : "#fff",
                  display: "grid",
                  gap: 6,
                }}
              >
                <div style={{ fontSize: 12, color: "#0f172a", fontWeight: 600 }}>
                  {candidate.extractionBlockId} • Page {candidate.page}
                </div>
                <div style={{ fontSize: 12, color: "#334155" }}>
                  Label: {candidate.labelText || "(none)"}
                </div>
                <div style={{ fontSize: 12, color: "#334155" }}>
                  Text: {previewText ? previewText.slice(0, 180) : "(empty)"}
                </div>
                <div style={{ fontSize: 12, color: "#475569", textTransform: "capitalize" }}>
                  Mapping decision: {candidate.mappingDecision}
                </div>
                {candidate.evidence.length ? (
                  <ul style={{ margin: 0, paddingLeft: 18, color: "#475569", fontSize: 12 }}>
                    {candidate.evidence.map((item) => (
                      <li key={`${candidate.extractionBlockId}-${item}`}>{item}</li>
                    ))}
                  </ul>
                ) : null}
                <div>
                  <button
                    type="button"
                    onClick={() => onReassign(fieldId, candidate.extractionBlockId)}
                    disabled={candidate.linkedToCurrentField || Boolean(isBusy)}
                  >
                    {candidate.linkedToCurrentField ? "Linked" : "Link to this block"}
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <div style={{ fontSize: 12, color: "#475569" }}>
            No association candidates are available yet.
          </div>
        )}
      </div>

      {history.length ? (
        <div style={{ display: "grid", gap: 4 }}>
          <div style={{ fontSize: 12, color: "#0f172a", fontWeight: 600 }}>
            Association history
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, color: "#475569", fontSize: 12 }}>
            {history.map((edit) => (
              <li key={`${edit.changedAt}-${edit.fieldId}`}>
                {new Date(edit.changedAt).toLocaleString()} - {edit.previousExtractionBlockId || "none"} to {edit.nextExtractionBlockId || "none"}
                {edit.reason ? ` (${edit.reason})` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
