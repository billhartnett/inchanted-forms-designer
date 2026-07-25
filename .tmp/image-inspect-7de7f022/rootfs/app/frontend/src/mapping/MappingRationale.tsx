type MappingRationaleProps = {
  summary: string;
  details: string[];
  contributingLabels?: string[];
  lexicalEvidence?: string[];
  semanticEvidence?: string[];
  ontologyEvidence?: string[];
  ontologyWarnings?: string[];
  arbitrationEvidence?: string[];
  unificationEvidence?: string[];
  memoryEvidence?: string[];
  memoryLineage?: string[];
  graphEvidence?: string[];
  graphLineage?: string[];
  carrierAdapterEvidence?: string[];
  carrierAdapterLineage?: string[];
  underwritingRuleEvidence?: string[];
  underwritingRuleLineage?: string[];
  riskFactorEvidence?: string[];
  riskFactorLineage?: string[];
  riskScoringEvidence?: string[];
  riskScoringLineage?: string[];
  underwritingDecisionEvidence?: string[];
  underwritingDecisionLineage?: string[];
  conflictLineage?: string[];
  ambiguityNotes?: string[];
  associationHistory?: {
    changedAt: string;
    previousExtractionBlockId?: string;
    nextExtractionBlockId?: string;
  }[];
  thresholds?: {
    accepted: number;
    review: number;
    rejected: number;
  };
};

export function MappingRationale({
  summary,
  details,
  contributingLabels,
  lexicalEvidence,
  semanticEvidence,
  ontologyEvidence,
  ontologyWarnings,
  arbitrationEvidence,
  unificationEvidence,
  memoryEvidence,
  memoryLineage,
  graphEvidence,
  graphLineage,
  carrierAdapterEvidence,
  carrierAdapterLineage,
  underwritingRuleEvidence,
  underwritingRuleLineage,
  riskFactorEvidence,
  riskFactorLineage,
  riskScoringEvidence,
  riskScoringLineage,
  underwritingDecisionEvidence,
  underwritingDecisionLineage,
  conflictLineage,
  ambiguityNotes,
  associationHistory,
  thresholds,
}: MappingRationaleProps) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ fontSize: 12, color: "#0f172a", fontWeight: 600 }}>
        {summary}
      </div>
      {details.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 18, color: "#475569", fontSize: 12 }}>
          {details.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
      )}
      {contributingLabels?.length ? (
        <div style={{ fontSize: 12, color: "#334155" }}>
          Contributing labels: {contributingLabels.join(" • ")}
        </div>
      ) : null}
      {semanticEvidence?.length ? (
        <div style={{ fontSize: 12, color: "#334155" }}>
          Semantic evidence: {semanticEvidence.join(" • ")}
        </div>
      ) : null}
      {lexicalEvidence?.length ? (
        <div style={{ fontSize: 12, color: "#334155" }}>
          Lexical evidence: {lexicalEvidence.join(" • ")}
        </div>
      ) : null}
      {ontologyEvidence?.length ? (
        <div style={{ fontSize: 12, color: "#334155" }}>
          Ontology evidence: {ontologyEvidence.join(" • ")}
        </div>
      ) : null}
      {ontologyWarnings?.length ? (
        <ul style={{ margin: 0, paddingLeft: 18, color: "#7c2d12", fontSize: 12 }}>
          {ontologyWarnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
      {arbitrationEvidence?.length ? (
        <div style={{ fontSize: 12, color: "#334155" }}>
          Arbitration evidence: {arbitrationEvidence.join(" • ")}
        </div>
      ) : null}
      {unificationEvidence?.length ? (
        <div style={{ fontSize: 12, color: "#334155" }}>
          Unification evidence: {unificationEvidence.join(" • ")}
        </div>
      ) : null}
      {memoryEvidence?.length ? (
        <div style={{ fontSize: 12, color: "#334155" }}>
          Memory evidence: {memoryEvidence.join(" • ")}
        </div>
      ) : null}
      {memoryLineage?.length ? (
        <div style={{ fontSize: 12, color: "#475569" }}>
          Memory lineage: {memoryLineage.join(" • ")}
        </div>
      ) : null}
      {graphEvidence?.length ? (
        <div style={{ fontSize: 12, color: "#334155" }}>
          Graph evidence: {graphEvidence.join(" • ")}
        </div>
      ) : null}
      {graphLineage?.length ? (
        <div style={{ fontSize: 12, color: "#475569" }}>
          Graph lineage: {graphLineage.join(" • ")}
        </div>
      ) : null}
      {carrierAdapterEvidence?.length ? (
        <div style={{ fontSize: 12, color: "#334155" }}>
          Carrier adapter evidence: {carrierAdapterEvidence.join(" • ")}
        </div>
      ) : null}
      {carrierAdapterLineage?.length ? (
        <div style={{ fontSize: 12, color: "#475569" }}>
          Carrier adapter lineage: {carrierAdapterLineage.join(" • ")}
        </div>
      ) : null}
      {underwritingRuleEvidence?.length ? (
        <div style={{ fontSize: 12, color: "#334155" }}>
          Underwriting rule evidence: {underwritingRuleEvidence.join(" • ")}
        </div>
      ) : null}
      {underwritingRuleLineage?.length ? (
        <div style={{ fontSize: 12, color: "#475569" }}>
          Underwriting rule lineage: {underwritingRuleLineage.join(" • ")}
        </div>
      ) : null}
      {riskFactorEvidence?.length ? (
        <div style={{ fontSize: 12, color: "#334155" }}>
          Risk factor evidence: {riskFactorEvidence.join(" • ")}
        </div>
      ) : null}
      {riskFactorLineage?.length ? (
        <div style={{ fontSize: 12, color: "#475569" }}>
          Risk factor lineage: {riskFactorLineage.join(" • ")}
        </div>
      ) : null}
      {riskScoringEvidence?.length ? (
        <div style={{ fontSize: 12, color: "#334155" }}>
          Risk scoring evidence: {riskScoringEvidence.join(" • ")}
        </div>
      ) : null}
      {riskScoringLineage?.length ? (
        <div style={{ fontSize: 12, color: "#475569" }}>
          Risk scoring lineage: {riskScoringLineage.join(" • ")}
        </div>
      ) : null}
      {underwritingDecisionEvidence?.length ? (
        <div style={{ fontSize: 12, color: "#334155" }}>
          Underwriting decision evidence: {underwritingDecisionEvidence.join(" • ")}
        </div>
      ) : null}
      {underwritingDecisionLineage?.length ? (
        <div style={{ fontSize: 12, color: "#475569" }}>
          Underwriting decision lineage: {underwritingDecisionLineage.join(" • ")}
        </div>
      ) : null}
      {conflictLineage?.length ? (
        <div style={{ fontSize: 12, color: "#475569" }}>
          Conflict lineage: {conflictLineage.join(" • ")}
        </div>
      ) : null}
      {ambiguityNotes?.length ? (
        <ul style={{ margin: 0, paddingLeft: 18, color: "#7c2d12", fontSize: 12 }}>
          {ambiguityNotes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
      {associationHistory?.length ? (
        <div style={{ fontSize: 12, color: "#475569" }}>
          Association lineage: latest {associationHistory[0]?.previousExtractionBlockId || "none"} to {associationHistory[0]?.nextExtractionBlockId || "none"}
        </div>
      ) : null}
      {thresholds ? (
        <div style={{ fontSize: 12, color: "#475569" }}>
          Thresholds: accept {Math.round(thresholds.accepted * 100)}% • review {Math.round(thresholds.review * 100)}% • reject below {Math.round(thresholds.rejected * 100)}%
        </div>
      ) : null}
    </div>
  );
}