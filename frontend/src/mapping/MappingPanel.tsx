import { useState } from "react";
import { evaluateMultiDocumentConsistency } from "../../../shared/src/quality";
import type { MappingPersistencePayload } from "../../../shared/src/types";
import { AssociationEditor } from "./AssociationEditor";
import { MappingConfidence } from "./MappingConfidence";
import { MappingOverrides } from "./MappingOverrides";
import { MappingRationale } from "./MappingRationale";
import { useMappingStore, useSelectedFieldMapping } from "../state";

const CONSISTENCY_SNAPSHOTS_KEY = "acord-consistency-snapshots";

function hasConsistencyMismatch(acordCode: string | undefined): boolean {
  if (!acordCode) {
    return false;
  }

  try {
    const raw = localStorage.getItem(CONSISTENCY_SNAPSHOTS_KEY);
    if (!raw) {
      return false;
    }

    const snapshots = JSON.parse(raw) as Array<{
      fixtureId: string;
      payload: MappingPersistencePayload;
    }>;
    if (!Array.isArray(snapshots) || snapshots.length === 0) {
      return false;
    }

    const consistency = evaluateMultiDocumentConsistency({
      documents: snapshots,
    });
    return (
      consistency.lowConfidenceFields.includes(acordCode) ||
      consistency.disagreements.includes(acordCode)
    );
  } catch {
    return false;
  }
}

export function MappingPanel() {
  const selectedMapping = useSelectedFieldMapping();
  const chooseCandidate = useMappingStore((state) => state.chooseCandidate);
  const acceptCandidate = useMappingStore((state) => state.acceptCandidate);
  const rejectCandidate = useMappingStore((state) => state.rejectCandidate);
  const acceptMapping = useMappingStore((state) => state.acceptMapping);
  const rejectMapping = useMappingStore((state) => state.rejectMapping);
  const unlinkFieldAssociation = useMappingStore((state) => state.unlinkFieldAssociation);
  const reassignFieldAssociation = useMappingStore((state) => state.reassignFieldAssociation);
  const clearOverride = useMappingStore((state) => state.clearOverride);
  const saveReview = useMappingStore((state) => state.saveReview);
  const loadReview = useMappingStore((state) => state.loadReview);
  const lastSavedBlobName = useMappingStore((state) => state.lastSavedBlobName);
  const [isBusy, setIsBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  if (!selectedMapping) {
    return (
      <section
        style={{
          border: "1px solid #d9e2ec",
          borderRadius: 12,
          padding: 12,
          background: "#f8fafc",
        }}
      >
        <h3 style={{ marginTop: 0, marginBottom: 8 }}>Mapping</h3>
        <div style={{ fontSize: 12, color: "#475569" }}>
          Select a field to inspect ACORD mapping confidence, rationale, and override state.
        </div>
      </section>
    );
  }

  const reviewerWarnings: string[] = [];
  const thresholds = selectedMapping.thresholds || {
    accepted: 0.8,
    review: 0.6,
    rejected: 0.45,
  };
  const acceptedThreshold = thresholds.accepted;
  const chosenCandidate = selectedMapping.chosenCandidate;
  if (chosenCandidate && chosenCandidate.confidenceScore < acceptedThreshold) {
    reviewerWarnings.push("Chosen candidate confidence is below calibrated threshold.");
  }
  if (
    chosenCandidate &&
    typeof chosenCandidate.semanticSimilarity === "number" &&
    typeof chosenCandidate.lexicalScore === "number" &&
    Math.abs(chosenCandidate.semanticSimilarity - chosenCandidate.lexicalScore) > 0.4
  ) {
    reviewerWarnings.push("Rationale signals disagree (semantic vs lexical evidence). ");
  }
  if (hasConsistencyMismatch(chosenCandidate?.acordCode)) {
    reviewerWarnings.push("Multi-document consistency flagged this ACORD code.");
  }
  if ((chosenCandidate?.ontology?.violatedConstraints?.length || 0) > 0) {
    reviewerWarnings.push("Ontology constraints are violated for the chosen ACORD code.");
  }
  if ((chosenCandidate?.ontology?.warnings?.length || 0) > 0) {
    reviewerWarnings.push("Ontology relationship warnings are present for this mapping.");
  }

  const handleSave = async () => {
    setIsBusy(true);
    try {
      const saved = await saveReview();
      setStatusMessage(
        saved ? `Saved review to ${saved.blobName}` : "No document id is available for save.",
      );
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Save failed");
    } finally {
      setIsBusy(false);
    }
  };

  const handleLoad = async () => {
    setIsBusy(true);
    try {
      const loaded = await loadReview(selectedMapping.documentId);
      setStatusMessage(
        loaded ? "Reloaded saved review state." : "No document id is available for reload.",
      );
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Reload failed");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <section
      style={{
        border: "1px solid #d9e2ec",
        borderRadius: 12,
        padding: 12,
        background: "#f8fafc",
        display: "grid",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <div>
          <h3 style={{ marginTop: 0, marginBottom: 4 }}>Mapping</h3>
          <div style={{ fontSize: 12, color: "#475569" }}>
            {selectedMapping.acordCode || "Unmapped"}
            {selectedMapping.acordLabel ? ` • ${selectedMapping.acordLabel}` : ""}
          </div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
            Field {selectedMapping.fieldDecision} • Label {selectedMapping.labelDecision} • Mapping {selectedMapping.mappingDecision}
          </div>
        </div>
        <MappingConfidence
          confidenceScore={selectedMapping.confidenceScore}
          thresholds={thresholds}
        />
      </div>

      <MappingRationale
        summary={selectedMapping.summary}
        details={selectedMapping.details}
        contributingLabels={selectedMapping.rationale?.contributingLabels}
        lexicalEvidence={selectedMapping.rationale?.lexicalEvidence}
        semanticEvidence={selectedMapping.rationale?.semanticEvidence}
        ontologyEvidence={selectedMapping.rationale?.ontologyEvidence}
        ontologyWarnings={selectedMapping.rationale?.ontologyWarnings}
        arbitrationEvidence={selectedMapping.rationale?.arbitrationEvidence}
        unificationEvidence={selectedMapping.rationale?.unificationEvidence}
        memoryEvidence={selectedMapping.rationale?.memoryEvidence}
        memoryLineage={selectedMapping.rationale?.memoryLineage}
        graphEvidence={selectedMapping.rationale?.graphEvidence}
        graphLineage={selectedMapping.rationale?.graphLineage}
        carrierAdapterEvidence={selectedMapping.rationale?.carrierAdapterEvidence}
        carrierAdapterLineage={selectedMapping.rationale?.carrierAdapterLineage}
        underwritingRuleEvidence={selectedMapping.rationale?.underwritingRuleEvidence}
        underwritingRuleLineage={selectedMapping.rationale?.underwritingRuleLineage}
        riskFactorEvidence={selectedMapping.rationale?.riskFactorEvidence}
        riskFactorLineage={selectedMapping.rationale?.riskFactorLineage}
        riskScoringEvidence={selectedMapping.rationale?.riskScoringEvidence}
        riskScoringLineage={selectedMapping.rationale?.riskScoringLineage}
        underwritingDecisionEvidence={selectedMapping.rationale?.underwritingDecisionEvidence}
        underwritingDecisionLineage={selectedMapping.rationale?.underwritingDecisionLineage}
        conflictLineage={selectedMapping.rationale?.conflictLineage}
        ambiguityNotes={selectedMapping.rationale?.ambiguityNotes}
        thresholds={thresholds}
        associationHistory={selectedMapping.associationHistory}
      />

      {reviewerWarnings.length > 0 ? (
        <div
          style={{
            border: "1px solid #fbbf24",
            borderRadius: 10,
            background: "#fffbeb",
            padding: 10,
            display: "grid",
            gap: 4,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: "#92400e" }}>
            Reviewer warnings
          </div>
          {reviewerWarnings.map((warning) => (
            <div key={warning} style={{ fontSize: 12, color: "#78350f" }}>
              {warning}
            </div>
          ))}
        </div>
      ) : null}

      <AssociationEditor
        fieldId={selectedMapping.fieldId}
        extractionBlockId={selectedMapping.extractionBlockId}
        candidates={selectedMapping.associationCandidates}
        history={selectedMapping.associationHistory}
        isBusy={isBusy}
        onUnlink={(fieldId) => unlinkFieldAssociation(fieldId, "manual review")}
        onReassign={(fieldId, extractionBlockId) =>
          reassignFieldAssociation(fieldId, extractionBlockId, "manual review")
        }
      />

      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ fontSize: 12, color: "#0f172a", fontWeight: 600 }}>
          ACORD candidates
        </div>
        {selectedMapping.candidates.length > 0 ? (
          <div style={{ display: "grid", gap: 8 }}>
            {selectedMapping.candidates.map((candidate) => {
              const isChosen = candidate.acordCode === selectedMapping.chosenCandidate?.acordCode;
              const candidateDecision =
                selectedMapping.candidateDecisions[candidate.acordCode] || "pending";

              return (
                <div
                  key={candidate.acordCode}
                  style={{
                    border: isChosen ? "1px solid #2563eb" : "1px solid #d9e2ec",
                    borderRadius: 10,
                    padding: 10,
                    background: isChosen ? "#eff6ff" : "#ffffff",
                    display: "grid",
                    gap: 6,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <div>
                      <div style={{ fontWeight: 600, color: "#0f172a" }}>
                        {candidate.acordCode} • {candidate.label}
                      </div>
                      <div style={{ fontSize: 12, color: "#475569" }}>
                        {candidate.description || "No description available."}
                      </div>
                    </div>
                    <div style={{ display: "grid", gap: 4, justifyItems: "end" }}>
                      <MappingConfidence
                        confidenceScore={candidate.confidenceScore}
                        thresholds={thresholds}
                      />
                      <div style={{ fontSize: 12, color: "#475569", textTransform: "capitalize" }}>
                        {candidateDecision}
                      </div>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: "#334155" }}>
                    Source: {candidate.source}
                    {typeof candidate.semanticSimilarity === "number"
                      ? ` • Embedding ${candidate.semanticSimilarity.toFixed(3)}`
                      : ""}
                    {typeof candidate.lexicalScore === "number"
                      ? ` • Lexical ${candidate.lexicalScore.toFixed(3)}`
                      : ""}
                    {typeof candidate.dictionaryScore === "number"
                      ? ` • Dictionary ${candidate.dictionaryScore.toFixed(3)}`
                      : ""}
                    {typeof candidate.heuristicScore === "number"
                      ? ` • Heuristic ${candidate.heuristicScore.toFixed(3)}`
                      : ""}
                    {candidate.ontology?.sections?.length
                      ? ` • Sections ${candidate.ontology.sections.join("/")}`
                      : ""}
                  </div>
                  {candidate.ontology?.warnings?.length ? (
                    <div style={{ fontSize: 12, color: "#92400e" }}>
                      Ontology warnings: {candidate.ontology.warnings.join(" • ")}
                    </div>
                  ) : null}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() =>
                        selectedMapping.extractionBlockId &&
                        chooseCandidate(selectedMapping.extractionBlockId, candidate.acordCode)
                      }
                      disabled={!selectedMapping.extractionBlockId || isBusy}
                    >
                      {isChosen ? "Chosen" : "Choose"}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        selectedMapping.extractionBlockId &&
                        acceptCandidate(selectedMapping.extractionBlockId, candidate.acordCode)
                      }
                      disabled={!selectedMapping.extractionBlockId || isBusy}
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        selectedMapping.extractionBlockId &&
                        rejectCandidate(selectedMapping.extractionBlockId, candidate.acordCode)
                      }
                      disabled={!selectedMapping.extractionBlockId || isBusy}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "#475569" }}>
            No stored ACORD candidates are available for this field yet.
          </div>
        )}
      </div>

      <div style={{ fontSize: 12, color: "#475569" }}>
        Source: <strong>{selectedMapping.source}</strong>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() =>
            selectedMapping.extractionBlockId &&
            acceptMapping(selectedMapping.extractionBlockId)
          }
          disabled={!selectedMapping.extractionBlockId || isBusy}
        >
          Accept mapping
        </button>
        <button
          type="button"
          onClick={() =>
            selectedMapping.extractionBlockId &&
            rejectMapping(selectedMapping.extractionBlockId)
          }
          disabled={!selectedMapping.extractionBlockId || isBusy}
        >
          Reject mapping
        </button>
      </div>

      <MappingOverrides
        acordCode={selectedMapping.acordCode}
        documentId={selectedMapping.documentId}
        lastSavedBlobName={lastSavedBlobName}
        isBusy={isBusy}
        statusMessage={statusMessage}
        onClearOverride={() => clearOverride(selectedMapping.fieldId)}
        onSaveReview={handleSave}
        onLoadReview={handleLoad}
      />
    </section>
  );
}