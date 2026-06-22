import type {
  AcordLabelCandidate,
  CandidateDecisionIntelligenceMetadata,
  CandidateRiskFactorMetadata,
  RiskFactorCategory,
  RiskFactorOverride,
  RiskFactorSignal,
  RiskFactorSnapshot,
  RiskScoringBreakdown,
  RiskScoringSnapshot,
  UnderwritingDecisionDrift,
  UnderwritingDecisionGovernanceDecision,
  UnderwritingDecisionOverride,
  UnderwritingDecisionOutcome,
  UnderwritingDecisionReport,
  UnderwritingDecisionRuleResult,
  UnderwritingDecisionSnapshot,
} from "../acord";
import type { MappingPersistencePayload } from "../types";
import { evaluateUnderwritingRules } from "./underwritingRules";
import { buildGlobalSemanticGraph, evaluateGraphInference } from "./globalSemanticGraph";

const CANONICAL_GENERATED_AT = "1970-01-01T00:00:00.000Z";

function toFixed(value: number): number {
  return Number(value.toFixed(6));
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function safeAverage(values: number[]): number {
  if (!values.length) return 0;
  return toFixed(values.reduce((sum, current) => sum + current, 0) / values.length);
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hashString(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort((a, b) =>
      a[0].localeCompare(b[0]),
    );
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function inferRiskCategory(text: string, candidate: AcordLabelCandidate): RiskFactorCategory {
  const normalized = normalizeText(`${text} ${candidate.acordCode} ${candidate.label}`);
  if (/(loss|claim|incident|prior)/.test(normalized)) return "loss-history";
  if (/(operation|work|class|naics|trade)/.test(normalized)) return "operations";
  if (/(hazard|flammable|height|roof|electrical|chemical)/.test(normalized)) return "hazard";
  if (/(exposure|sales|payroll|receipts|units|revenue)/.test(normalized)) return "exposure";
  if (/(applicant|insured|entity|experience|years)/.test(normalized)) return "applicant";
  return "supplemental";
}

function carrierModifierFromCandidate(candidate: AcordLabelCandidate): number {
  const adapterConfidence = candidate.carrierAdapter?.confidence || 0;
  const hardFailures = candidate.underwritingRules?.hardFailures.length || 0;
  return toFixed(adapterConfidence * 0.3 + hardFailures * 0.1);
}

function severityFromCandidate(candidate: AcordLabelCandidate, blockText: string): number {
  const confidence = clamp01(candidate.normalizedConfidenceScore || candidate.confidenceScore);
  const text = normalizeText(blockText);
  const hazardCue = /(hazard|loss|injury|fire|chemical|decline)/.test(text) ? 0.15 : 0;
  const ontologyPenalty = (candidate.ontology?.violatedConstraints?.length || 0) > 0 ? 0.1 : 0;
  const rulePenalty = (candidate.underwritingRules?.hardFailures.length || 0) > 0 ? 0.2 : 0;
  return clamp01(toFixed(1 - confidence + hazardCue + ontologyPenalty + rulePenalty));
}

export function inferCandidateRiskAndDecisionIntelligence(
  candidate: AcordLabelCandidate,
  options: {
    blockText: string;
    familyId?: string;
  },
): {
  riskFactors: CandidateRiskFactorMetadata;
  decisionIntelligence: CandidateDecisionIntelligenceMetadata;
} {
  const category = inferRiskCategory(options.blockText, candidate);
  const severity = severityFromCandidate(candidate, options.blockText);
  const carrierModifier = carrierModifierFromCandidate(candidate);
  const completenessContribution = clamp01(
    1 - (candidate.ontology?.violatedConstraints?.length || 0) * 0.2,
  );
  const projectedScore = clamp01(
    severity * 0.55 +
      (candidate.underwritingRules?.scoreDelta ? Math.abs(candidate.underwritingRules.scoreDelta) : 0) * 0.2 +
      carrierModifier * 0.25,
  );
  const projectedOutcome: UnderwritingDecisionOutcome =
    projectedScore >= 0.8
      ? "decline"
      : projectedScore >= 0.6
        ? "refer-to-underwriter"
        : projectedScore >= 0.4
          ? "accept-with-conditions"
          : "accept";

  return {
    riskFactors: {
      categories: [category],
      exposureSeverity: category === "exposure" ? severity : 0,
      hazardSeverity: category === "hazard" ? severity : 0,
      completenessContribution: toFixed(completenessContribution),
      carrierModifier,
      lineage: [
        `risk.category=${category}`,
        `risk.severity=${severity}`,
        `risk.carrierModifier=${carrierModifier}`,
      ],
    },
    decisionIntelligence: {
      projectedOutcome,
      projectedScore: toFixed(projectedScore),
      reasons: [
        `Projected outcome ${projectedOutcome}`,
        `Projected score ${toFixed(projectedScore)}`,
      ],
      lineage: [
        `decision.projectedOutcome=${projectedOutcome}`,
        `decision.projectedScore=${toFixed(projectedScore)}`,
      ],
    },
  };
}

export function extractRiskFactors(
  payload: MappingPersistencePayload,
  options?: {
    overrides?: RiskFactorOverride[];
  },
): RiskFactorSignal[] {
  const overrides = options?.overrides || payload.riskFactorOverrides || [];

  return payload.mappings
    .map((record) => {
      const chosenCode =
        payload.decisionGraph.mappings[record.extractionBlockId]?.chosenCandidateCode ||
        record.mapping.chosen?.acordCode;
      if (!chosenCode) return null;

      const candidate =
        record.mapping.suggestions.find((item) => item.acordCode === chosenCode) ||
        record.mapping.chosen;
      if (!candidate) return null;

      const category = inferRiskCategory(record.mapping.text || "", candidate);
      const baseSeverity = severityFromCandidate(candidate, record.mapping.text || "");
      const confidence = clamp01(candidate.normalizedConfidenceScore || candidate.confidenceScore);
      const signalId = `risk:${record.extractionBlockId}:${category}:${candidate.acordCode}`;
      const override = overrides.find((item) => item.signalId === signalId && item.active);
      const severity = clamp01(override ? override.forcedSeverity : baseSeverity);
      const carrierModifier = carrierModifierFromCandidate(candidate);

      return {
        signalId,
        extractionBlockId: record.extractionBlockId,
        category,
        code: candidate.acordCode,
        label: candidate.label,
        severity: toFixed(severity),
        confidence: toFixed(confidence),
        carrierModifier,
        lineage: [
          `risk.signal=${signalId}`,
          `risk.category=${category}`,
          `risk.override=${override ? "applied" : "none"}`,
          ...(candidate.unification?.lineage || []),
          ...(candidate.graphInference?.lineage || []),
          ...(candidate.carrierAdapter?.lineage || []),
          ...(candidate.underwritingRules?.lineage || []),
        ],
      } as RiskFactorSignal;
    })
    .filter((item): item is RiskFactorSignal => Boolean(item))
    .sort(
      (left, right) =>
        left.extractionBlockId.localeCompare(right.extractionBlockId) ||
        left.category.localeCompare(right.category) ||
        left.code.localeCompare(right.code),
    );
}

export function buildRiskFactorSnapshot(
  payload: MappingPersistencePayload,
  options?: {
    previousSnapshot?: RiskFactorSnapshot;
    overrides?: RiskFactorOverride[];
  },
): RiskFactorSnapshot {
  const signals = extractRiskFactors(payload, { overrides: options?.overrides });
  const categoryCounts: Record<RiskFactorCategory, number> = {
    exposure: 0,
    hazard: 0,
    applicant: 0,
    operations: 0,
    "loss-history": 0,
    supplemental: 0,
  };
  for (const signal of signals) {
    categoryCounts[signal.category] += 1;
  }

  const previous = options?.previousSnapshot;
  const nextVersion =
    (previous ? Number(previous.versionId.replace("risk-v", "")) || 0 : 0) + 1;
  const versionId = `risk-v${nextVersion}`;
  const riskFactorHash = hashString(
    stableSerialize(
      signals.map((signal) => ({
        signalId: signal.signalId,
        category: signal.category,
        code: signal.code,
        severity: signal.severity,
      })),
    ),
  );

  return {
    generatedAt: CANONICAL_GENERATED_AT,
    versionId,
    riskFactorHash,
    signalCount: signals.length,
    categoryCounts,
    lineage: [
      `risk.version=${versionId}`,
      `risk.hash=${riskFactorHash}`,
      `risk.signals=${signals.length}`,
    ],
  };
}

export function evaluateRiskScoring(
  payload: MappingPersistencePayload,
  options?: {
    signals?: RiskFactorSignal[];
  },
): RiskScoringBreakdown {
  const signals = options?.signals || extractRiskFactors(payload);
  const exposureSeverity = safeAverage(
    signals.filter((item) => item.category === "exposure").map((item) => item.severity),
  );
  const hazardSeverity = safeAverage(
    signals.filter((item) => item.category === "hazard").map((item) => item.severity),
  );
  const requiredFields = payload.fields.filter((field) => field.metadata?.required).length;
  const satisfiedRequired = payload.fields.filter(
    (field) =>
      field.metadata?.required &&
      field.metadata?.acordCode &&
      (field.metadata?.confidenceScore || 0) >= 0.55,
  ).length;
  const completenessRate = requiredFields > 0 ? satisfiedRequired / requiredFields : 1;
  const submissionCompleteness = toFixed(1 - completenessRate);
  const carrierModifierScore = safeAverage(signals.map((item) => item.carrierModifier));
  const weightedScore = clamp01(
    toFixed(
      exposureSeverity * 0.32 +
        hazardSeverity * 0.33 +
        submissionCompleteness * 0.2 +
        carrierModifierScore * 0.15,
    ),
  );
  const classification: "low" | "medium" | "high" =
    weightedScore >= 0.67 ? "high" : weightedScore >= 0.34 ? "medium" : "low";
  const carrierClass = `${payload.formFamily?.familyId || "default"}-${classification}`;

  return {
    exposureSeverity,
    hazardSeverity,
    submissionCompleteness,
    carrierModifierScore,
    weightedScore,
    classification,
    carrierClass,
    lineage: [
      `score.exposure=${exposureSeverity}`,
      `score.hazard=${hazardSeverity}`,
      `score.completeness=${submissionCompleteness}`,
      `score.carrierModifier=${carrierModifierScore}`,
      `score.weighted=${weightedScore}`,
      `score.classification=${classification}`,
    ],
  };
}

export function buildRiskScoringSnapshot(
  payload: MappingPersistencePayload,
  options?: {
    previousSnapshot?: RiskScoringSnapshot;
    signals?: RiskFactorSignal[];
  },
): RiskScoringSnapshot {
  const scoring = evaluateRiskScoring(payload, { signals: options?.signals });
  const previous = options?.previousSnapshot;
  const nextVersion =
    (previous ? Number(previous.versionId.replace("risk-score-v", "")) || 0 : 0) + 1;
  const versionId = `risk-score-v${nextVersion}`;
  const scoringHash = hashString(
    stableSerialize({
      exposureSeverity: scoring.exposureSeverity,
      hazardSeverity: scoring.hazardSeverity,
      submissionCompleteness: scoring.submissionCompleteness,
      carrierModifierScore: scoring.carrierModifierScore,
      weightedScore: scoring.weightedScore,
      classification: scoring.classification,
      carrierClass: scoring.carrierClass,
    }),
  );

  return {
    generatedAt: CANONICAL_GENERATED_AT,
    versionId,
    scoringHash,
    weightedScore: scoring.weightedScore,
    classification: scoring.classification,
    carrierClass: scoring.carrierClass,
    lineage: [`riskScoring.version=${versionId}`, `riskScoring.hash=${scoringHash}`, ...scoring.lineage],
  };
}

function buildDecisionRules(
  payload: MappingPersistencePayload,
  scoring: RiskScoringBreakdown,
): UnderwritingDecisionRuleResult[] {
  const chosenCodes = payload.mappings
    .map((record) =>
      payload.decisionGraph.mappings[record.extractionBlockId]?.chosenCandidateCode ||
      record.mapping.chosen?.acordCode,
    )
    .filter((code): code is string => Boolean(code));
  const normalizedCodes = chosenCodes.map((code) => normalizeText(code));
  const missingNamedInsured = !normalizedCodes.some((code) => code.includes("namedinsured"));
  const hasContradiction =
    normalizedCodes.some((code) => code.includes("yes")) &&
    normalizedCodes.some((code) => code.includes("no"));

  const rules: UnderwritingDecisionRuleResult[] = [
    {
      ruleId: "decision.required.named-insured",
      passed: !missingNamedInsured,
      severity: missingNamedInsured ? "blocker" : "info",
      message: missingNamedInsured
        ? "Named insured requirement not satisfied."
        : "Named insured requirement satisfied.",
      lineage: ["decision.rule=required-named-insured"],
    },
    {
      ruleId: "decision.forbidden.yes-no-contradiction",
      passed: !hasContradiction,
      severity: hasContradiction ? "blocker" : "info",
      message: hasContradiction
        ? "Contradictory yes/no signals detected."
        : "No contradictory yes/no signals detected.",
      lineage: ["decision.rule=forbidden-contradiction"],
    },
    {
      ruleId: "decision.risk.weighted-threshold",
      passed: scoring.weightedScore < 0.85,
      severity: scoring.weightedScore >= 0.85 ? "blocker" : scoring.weightedScore >= 0.67 ? "warning" : "info",
      message:
        scoring.weightedScore >= 0.85
          ? "Weighted risk score exceeds decline threshold."
          : scoring.weightedScore >= 0.67
            ? "Weighted risk score requires referral/conditions."
            : "Weighted risk score is within standard appetite.",
      lineage: ["decision.rule=risk-weighted-threshold"],
    },
  ];

  return rules;
}

export function evaluateUnderwritingDecision(
  payload: MappingPersistencePayload,
  options?: {
    riskSignals?: RiskFactorSignal[];
    riskScoring?: RiskScoringBreakdown;
    overrides?: UnderwritingDecisionOverride[];
  },
): UnderwritingDecisionReport {
  const riskSignals = options?.riskSignals || extractRiskFactors(payload);
  const scoring = options?.riskScoring || evaluateRiskScoring(payload, { signals: riskSignals });
  const ruleReport = evaluateUnderwritingRules(payload, {
    familyId: payload.formFamily?.familyId,
    overrides: payload.underwritingRuleOverrides || [],
  });
  const graphSnapshot =
    payload.globalSemanticGraphSnapshot ||
    buildGlobalSemanticGraph([{ fixtureId: payload.documentId || "unknown-document", payload }]).snapshot;
  const graphInference = evaluateGraphInference(payload, graphSnapshot);

  const decisionRules = buildDecisionRules(payload, scoring);
  const carrierBlockers = ruleReport.conflicts.filter((item) => item.severity === "blocker").length;
  const graphAbstainCount = graphInference.filter((item) => item.abstain).length;
  const hasBlockers =
    decisionRules.some((rule) => rule.severity === "blocker" && !rule.passed) ||
    carrierBlockers > 0;

  let outcome: UnderwritingDecisionOutcome;
  const conditions: string[] = [];
  if (hasBlockers || scoring.weightedScore >= 0.9) {
    outcome = "decline";
  } else if (scoring.weightedScore >= 0.67 || graphAbstainCount > 0) {
    outcome = "refer-to-underwriter";
  } else if (scoring.weightedScore >= 0.4 || ruleReport.conflicts.length > 0) {
    outcome = "accept-with-conditions";
    conditions.push("additional-documentation");
    if (ruleReport.conflicts.length > 0) {
      conditions.push("rule-exception-review");
    }
    if (graphAbstainCount > 0) {
      conditions.push("graph-consistency-check");
    }
  } else {
    outcome = "accept";
  }

  const override = (options?.overrides || payload.underwritingDecisionOverrides || []).slice().reverse().find((item) => item.decisionId);
  if (override) {
    outcome = override.forcedOutcome;
  }

  const reasons = [
    `Weighted risk score ${scoring.weightedScore.toFixed(3)} (${scoring.classification})`,
    `Carrier rule blockers ${carrierBlockers}`,
    `Decision blockers ${decisionRules.filter((rule) => rule.severity === "blocker" && !rule.passed).length}`,
    `Graph abstain count ${graphAbstainCount}`,
  ];

  const firedRules = [
    ...decisionRules,
    ...ruleReport.conflicts.map((item) => ({
      ruleId: item.ruleId,
      passed: false,
      severity: item.severity,
      message: item.message,
      lineage: item.lineage,
    })),
  ].sort((left, right) => left.ruleId.localeCompare(right.ruleId));

  const decisionHashSeed = stableSerialize({
    outcome,
    weightedScore: scoring.weightedScore,
    conditions,
    firedRules: firedRules.map((rule) => ({ ruleId: rule.ruleId, passed: rule.passed, severity: rule.severity })),
  });

  return {
    decisionId: `uw-${hashString(decisionHashSeed)}`,
    outcome,
    conditions: Array.from(new Set(conditions)).sort((a, b) => a.localeCompare(b)),
    reasons,
    firedRules,
    rationale: [
      ...reasons,
      `Risk factors considered: ${riskSignals.length}`,
      `Carrier class ${scoring.carrierClass}`,
      override ? `Outcome override applied: ${override.forcedOutcome}` : "No outcome override applied",
    ],
    lineage: [
      ...scoring.lineage,
      `decision.outcome=${outcome}`,
      `decision.override=${override ? "applied" : "none"}`,
      `decision.graphAbstainCount=${graphAbstainCount}`,
    ],
  };
}

export function buildUnderwritingDecisionSnapshot(
  payload: MappingPersistencePayload,
  options?: {
    previousSnapshot?: UnderwritingDecisionSnapshot;
    riskSignals?: RiskFactorSignal[];
    riskScoring?: RiskScoringBreakdown;
    overrides?: UnderwritingDecisionOverride[];
    decisions?: UnderwritingDecisionGovernanceDecision[];
  },
): UnderwritingDecisionSnapshot {
  const report = evaluateUnderwritingDecision(payload, {
    riskSignals: options?.riskSignals,
    riskScoring: options?.riskScoring,
    overrides: options?.overrides,
  });
  const previous = options?.previousSnapshot;
  const nextVersion =
    (previous ? Number(previous.versionId.replace("uw-v", "")) || 0 : 0) + 1;
  const versionId = `uw-v${nextVersion}`;
  const governancePin = [...(options?.decisions || payload.underwritingDecisionDecisions || [])]
    .reverse()
    .find((decision) => decision.action === "pin" && decision.targetVersionId);

  return {
    generatedAt: CANONICAL_GENERATED_AT,
    versionId,
    decisionHash: hashString(
      stableSerialize({
        decisionId: report.decisionId,
        outcome: report.outcome,
        conditions: report.conditions,
        firedRules: report.firedRules.map((rule) => ({
          ruleId: rule.ruleId,
          passed: rule.passed,
          severity: rule.severity,
        })),
      }),
    ),
    outcome: report.outcome,
    firedRuleCount: report.firedRules.length,
    overrideApplied: Boolean((options?.overrides || payload.underwritingDecisionOverrides || []).length),
    lineage: [
      `decision.version=${versionId}`,
      `decision.outcome=${report.outcome}`,
      governancePin ? `decision.pinned=${governancePin.targetVersionId}` : "decision.pinned=none",
      ...report.lineage,
    ],
  };
}

export function evaluateUnderwritingDecisionDrift(
  baseline: {
    riskFactorSnapshot?: RiskFactorSnapshot;
    riskScoringSnapshot?: RiskScoringSnapshot;
    underwritingRuleSnapshot?: MappingPersistencePayload["underwritingRuleSnapshot"];
    underwritingDecisionSnapshot?: UnderwritingDecisionSnapshot;
    underwritingDecisionOverrides?: UnderwritingDecisionOverride[];
  },
  current: {
    riskFactorSnapshot?: RiskFactorSnapshot;
    riskScoringSnapshot?: RiskScoringSnapshot;
    underwritingRuleSnapshot?: MappingPersistencePayload["underwritingRuleSnapshot"];
    underwritingDecisionSnapshot?: UnderwritingDecisionSnapshot;
    underwritingDecisionOverrides?: UnderwritingDecisionOverride[];
  },
): UnderwritingDecisionDrift {
  const differences = [
    {
      key: "riskFactorHash",
      baselineValue: baseline.riskFactorSnapshot?.riskFactorHash || null,
      currentValue: current.riskFactorSnapshot?.riskFactorHash || null,
    },
    {
      key: "riskScoringHash",
      baselineValue: baseline.riskScoringSnapshot?.scoringHash || null,
      currentValue: current.riskScoringSnapshot?.scoringHash || null,
    },
    {
      key: "ruleOutcomeHash",
      baselineValue: baseline.underwritingRuleSnapshot?.outcomeHash || null,
      currentValue: current.underwritingRuleSnapshot?.outcomeHash || null,
    },
    {
      key: "decisionOutcome",
      baselineValue: baseline.underwritingDecisionSnapshot?.outcome || null,
      currentValue: current.underwritingDecisionSnapshot?.outcome || null,
    },
    {
      key: "decisionHash",
      baselineValue: baseline.underwritingDecisionSnapshot?.decisionHash || null,
      currentValue: current.underwritingDecisionSnapshot?.decisionHash || null,
    },
    {
      key: "overrideCount",
      baselineValue: baseline.underwritingDecisionOverrides?.length || 0,
      currentValue: current.underwritingDecisionOverrides?.length || 0,
    },
  ].filter((item) => item.baselineValue !== item.currentValue);

  return {
    hasDrift: differences.length > 0,
    driftHash: hashString(stableSerialize(differences)),
    differences,
  };
}

