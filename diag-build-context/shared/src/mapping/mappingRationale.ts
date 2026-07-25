import type { FieldMapping } from "shared/types";

function compareCandidate(
  left: FieldMapping["suggestions"][number],
  right: FieldMapping["suggestions"][number],
): number {
  return (
    right.confidenceScore - left.confidenceScore ||
    (right.semanticSimilarity || 0) - (left.semanticSimilarity || 0) ||
    (right.lexicalScore || 0) - (left.lexicalScore || 0) ||
    left.acordCode.localeCompare(right.acordCode)
  );
}

function stableUnique(values: string[]): string[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}

export function buildMappingRationale(mapping: FieldMapping) {
  const chosen = mapping.chosen;
  const thresholds = {
    accepted: 0.8,
    review: 0.6,
    rejected: 0.45,
  };
  const summary = chosen
    ? `Selected ${chosen.acordCode} (${chosen.label}) at ${Math.round(chosen.confidenceScore * 100)}% confidence.`
    : "No ACORD label selected because the evidence was too weak or ambiguous.";

  return {
    summary,
    lexicalEvidence: chosen ? stableUnique([mapping.text]) : [],
    semanticEvidence: chosen
      ? stableUnique([
          `Source: ${chosen.source}`,
          typeof chosen.semanticSimilarity === "number"
            ? `Embedding similarity ${chosen.semanticSimilarity.toFixed(3)}`
            : "Embedding similarity unavailable",
        ])
      : [],
    ontologyEvidence: chosen?.ontology?.explanation || [],
    ontologyWarnings: chosen
      ? stableUnique([
          ...(chosen.ontology?.warnings || []),
          ...(chosen.ontology?.violatedConstraints || []),
        ])
      : [],
    arbitrationEvidence: chosen?.arbitration
      ? stableUnique([`Namespace ${chosen.arbitration.winningNamespace}`, chosen.arbitration.reason])
      : [],
    unificationEvidence: chosen?.unification
      ? stableUnique([
          `Canonical ${chosen.unification.canonicalCode}`,
          `Group ${chosen.unification.groupId}`,
          `Equivalents ${chosen.unification.equivalentCodes.join(", ")}`,
        ])
      : [],
    memoryEvidence: chosen?.memoryRecommendation
      ? stableUnique([
          `Memory recommendation ${chosen.memoryRecommendation.recommendationId}`,
          `Priority ${chosen.memoryRecommendation.priority}`,
          `Confidence ${Math.round(chosen.memoryRecommendation.confidence * 100)}%`,
          chosen.memoryRecommendation.reason,
        ])
      : [],
    memoryLineage: chosen?.memoryRecommendation
      ? [
          `memory.version=${chosen.memoryRecommendation.basedOnVersionId}`,
          `memory.recommendation=${chosen.memoryRecommendation.recommendationId}`,
        ]
      : [],
    graphEvidence: chosen?.graphInference
      ? stableUnique([
          `Graph inferred ${chosen.graphInference.inferred ? "yes" : "no"}`,
          `Graph confidence ${Math.round(chosen.graphInference.confidence * 100)}%`,
          `Recommendations ${chosen.graphInference.recommendedCodes.join(", ") || "none"}`,
          ...chosen.graphInference.evidence,
        ])
      : [],
    graphLineage: chosen?.graphInference?.lineage || [],
    carrierAdapterEvidence: chosen?.carrierAdapter
      ? stableUnique([
          `Carrier ${chosen.carrierAdapter.carrierId}`,
          `Carrier code ${chosen.carrierAdapter.carrierCode}`,
          `Mapped ACORD ${chosen.carrierAdapter.mappedAcordCode}`,
          `Adapter confidence ${Math.round(chosen.carrierAdapter.confidence * 100)}%`,
          ...chosen.carrierAdapter.constraints,
        ])
      : [],
    carrierAdapterLineage: chosen?.carrierAdapter?.lineage || [],
    underwritingRuleEvidence: chosen?.underwritingRules
      ? stableUnique([
          `Rule delta ${chosen.underwritingRules.scoreDelta.toFixed(3)}`,
          `Hard failures ${chosen.underwritingRules.hardFailures.join(", ") || "none"}`,
          ...chosen.underwritingRules.evaluations.map((rule) => rule.message),
        ])
      : [],
    underwritingRuleLineage: chosen?.underwritingRules?.lineage || [],
    riskFactorEvidence: chosen?.riskFactors
      ? stableUnique([
          `Risk categories ${chosen.riskFactors.categories.join(", ")}`,
          `Exposure severity ${chosen.riskFactors.exposureSeverity.toFixed(3)}`,
          `Hazard severity ${chosen.riskFactors.hazardSeverity.toFixed(3)}`,
          `Carrier modifier ${chosen.riskFactors.carrierModifier.toFixed(3)}`,
        ])
      : [],
    riskFactorLineage: chosen?.riskFactors?.lineage || [],
    riskScoringEvidence: chosen?.riskFactors
      ? stableUnique([`Completeness contribution ${chosen.riskFactors.completenessContribution.toFixed(3)}`])
      : [],
    riskScoringLineage: chosen?.riskFactors?.lineage || [],
    underwritingDecisionEvidence: chosen?.decisionIntelligence
      ? stableUnique([
          `Projected outcome ${chosen.decisionIntelligence.projectedOutcome}`,
          `Projected score ${chosen.decisionIntelligence.projectedScore.toFixed(3)}`,
          ...chosen.decisionIntelligence.reasons,
        ])
      : [],
    underwritingDecisionLineage: chosen?.decisionIntelligence?.lineage || [],
    ambiguityNotes: chosen
      ? []
      : ["No candidate cleared the current confidence and ambiguity thresholds."],
    contributingLabels: mapping.text ? stableUnique([mapping.text]) : [],
    candidateBreakdown: [...mapping.suggestions].sort(compareCandidate),
    confidenceThresholds: thresholds,
  };
}