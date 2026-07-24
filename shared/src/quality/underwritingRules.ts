import type {
  AcordLabelCandidate,
  CandidateUnderwritingRuleMetadata,
  UnderwritingRuleDecision,
  UnderwritingRuleDrift,
  UnderwritingRuleEvaluation,
  UnderwritingRuleOverride,
  UnderwritingRuleSnapshot,
} from "../acord";
import type { MappingPersistencePayload } from "../types";

type RuleDefinition = {
  ruleId: string;
  carrierId: string;
  kind: "hard" | "soft";
  description: string;
  predicate: (context: {
    candidate: AcordLabelCandidate;
    blockText: string;
    chosenCodes: string[];
  }) => boolean;
  scoreImpact: number;
};

export type UnderwritingRuleReport = {
  generatedAt: string;
  rulesHash: string;
  outcomeHash: string;
  evaluations: Array<{
    extractionBlockId: string;
    candidateCode: string;
    results: UnderwritingRuleEvaluation[];
    combinedScoreDelta: number;
    hasBlocker: boolean;
    lineage: string[];
  }>;
  conflicts: Array<{
    extractionBlockId: string;
    ruleId: string;
    message: string;
    severity: "warning" | "blocker";
    lineage: string[];
  }>;
};

const CANONICAL_GENERATED_AT = "1970-01-01T00:00:00.000Z";

function toFixed(value: number): number {
  return Number(value.toFixed(6));
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

function resolveCarrierId(familyId: string | undefined): string {
  const normalized = (familyId || "").toLowerCase();
  if (normalized.includes("markel")) return "carrier-markel";
  if (normalized.includes("ana") || normalized.includes("anac")) return "carrier-anac";
  if (normalized.includes("contractor") || normalized.includes("supplement")) return "carrier-markel";
  return "carrier-default";
}

function createRuleSet(carrierId: string): RuleDefinition[] {
  const shared: RuleDefinition[] = [
    {
      ruleId: "rule.required-named-insured",
      carrierId,
      kind: "hard",
      description: "Named insured identity must be present.",
      predicate: ({ chosenCodes }) => chosenCodes.some((code) => code.toLowerCase().includes("namedinsured") || code.toLowerCase().includes("applicant.name")),
      scoreImpact: 0,
    },
    {
      ruleId: "rule.forbid-mutually-exclusive-yes-no",
      carrierId,
      kind: "hard",
      description: "Yes/no contradiction should not coexist for same context.",
      predicate: ({ chosenCodes }) => {
        const yes = chosenCodes.some((code) => code.toLowerCase().includes("yes"));
        const no = chosenCodes.some((code) => code.toLowerCase().includes("no"));
        return !(yes && no);
      },
      scoreImpact: 0,
    },
    {
      ruleId: "rule.prefer-policy-identifiers",
      carrierId,
      kind: "soft",
      description: "Prefer policy identifier mapping when policy token appears.",
      predicate: ({ candidate, blockText }) =>
        !blockText.toLowerCase().includes("policy") || candidate.acordCode.toLowerCase().includes("policy"),
      scoreImpact: 0.06,
    },
  ];

  if (carrierId === "carrier-markel") {
    shared.push({
      ruleId: "rule.markel.prefer-subcontractor-cost",
      carrierId,
      kind: "soft",
      description: "Markel contractor supplement prefers subcontractor cost mapping.",
      predicate: ({ candidate, blockText }) =>
        !blockText.toLowerCase().includes("subcontract") ||
        candidate.acordCode === "Contractors_SubcontractorsPaidAmount",
      scoreImpact: 0.08,
    });
  }

  if (carrierId === "carrier-anac") {
    shared.push({
      ruleId: "rule.anac.require-license-identifier",
      carrierId,
      kind: "soft",
      description: "ANAC contractor forms prefer license identifier mapping.",
      predicate: ({ candidate, blockText }) =>
        !blockText.toLowerCase().includes("license") ||
        candidate.acordCode === "ContractorsUnderwriting_LicenseNumberIdentifier",
      scoreImpact: 0.08,
    });
  }

  return shared.sort((left, right) => left.ruleId.localeCompare(right.ruleId));
}

function applyRuleOverride(
  evaluation: UnderwritingRuleEvaluation,
  override: UnderwritingRuleOverride | undefined,
): UnderwritingRuleEvaluation {
  if (!override) return evaluation;
  return {
    ...evaluation,
    passed: override.forcedPass,
    message: `${evaluation.message} (override)` ,
    lineage: [
      ...evaluation.lineage,
      `rule.override.changedAt=${override.changedAt}`,
      `rule.override.reason=${override.reason || "none"}`,
    ],
  };
}

export function evaluateCandidateUnderwritingRules(
  candidate: AcordLabelCandidate,
  options: {
    blockText: string;
    chosenCodes: string[];
    familyId?: string;
    overrides?: UnderwritingRuleOverride[];
    extractionBlockId?: string;
  },
): CandidateUnderwritingRuleMetadata {
  const carrierId = resolveCarrierId(options.familyId);
  const rules = createRuleSet(carrierId);

  const evaluations = rules.map((rule) => {
    const passed = rule.predicate({
      candidate,
      blockText: options.blockText,
      chosenCodes: options.chosenCodes,
    });
    const base: UnderwritingRuleEvaluation = {
      ruleId: rule.ruleId,
      carrierId,
      severity: rule.kind === "hard" ? "blocker" : passed ? "info" : "warning",
      passed,
      scoreImpact: passed ? toFixed(rule.scoreImpact) : toFixed(-rule.scoreImpact),
      message: passed ? `Passed ${rule.description}` : `Failed ${rule.description}`,
      lineage: [`rule.kind=${rule.kind}`, `rule.carrier=${carrierId}`],
    };

    const override = (options.overrides || []).find(
      (item) =>
        item.ruleId === rule.ruleId &&
        (item.extractionBlockId ? item.extractionBlockId === options.extractionBlockId : true),
    );
    return applyRuleOverride(base, override);
  });

  const hardFailures = evaluations
    .filter((evaluation) => evaluation.severity === "blocker" && !evaluation.passed)
    .map((evaluation) => evaluation.ruleId)
    .sort((left, right) => left.localeCompare(right));
  const scoreDelta = toFixed(
    evaluations.reduce((sum, evaluation) => sum + evaluation.scoreImpact, 0),
  );

  return {
    scoreDelta,
    hardFailures,
    evaluations,
    lineage: [
      `rule.carrier=${carrierId}`,
      `rule.delta=${scoreDelta}`,
      `rule.hardFailures=${hardFailures.join("|") || "none"}`,
    ],
  };
}

export function evaluateUnderwritingRules(
  payload: MappingPersistencePayload,
  options?: {
    familyId?: string;
    overrides?: UnderwritingRuleOverride[];
  },
): UnderwritingRuleReport {
  const familyId = options?.familyId || payload.formFamily?.familyId;
  const carrierId = resolveCarrierId(familyId);
  const chosenCodes = payload.mappings
    .map((record) =>
      payload.decisionGraph.mappings[record.extractionBlockId]?.chosenCandidateCode ||
      record.mapping.chosen?.acordCode,
    )
    .filter((code): code is string => Boolean(code));

  const evaluations = payload.mappings
    .map((record) => {
      const chosenCode =
        payload.decisionGraph.mappings[record.extractionBlockId]?.chosenCandidateCode ||
        record.mapping.chosen?.acordCode;
      if (!chosenCode) return null;
      const candidate =
        record.mapping.suggestions.find((item) => item.acordCode === chosenCode) ||
        record.mapping.chosen;
      if (!candidate) return null;

      const aligned = evaluateCandidateUnderwritingRules(candidate, {
        blockText: record.mapping.text || "",
        chosenCodes,
        familyId,
        overrides: options?.overrides || payload.underwritingRuleOverrides || [],
        extractionBlockId: record.extractionBlockId,
      });

      return {
        extractionBlockId: record.extractionBlockId,
        candidateCode: chosenCode,
        results: aligned.evaluations,
        combinedScoreDelta: aligned.scoreDelta,
        hasBlocker: aligned.hardFailures.length > 0,
        lineage: aligned.lineage,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((left, right) => left.extractionBlockId.localeCompare(right.extractionBlockId));

  const conflicts = evaluations
    .flatMap((item) =>
      item.results
        .filter((result) => !result.passed)
        .map((result) => ({
          extractionBlockId: item.extractionBlockId,
          ruleId: result.ruleId,
          message: result.message,
          severity: result.severity === "blocker" ? "blocker" as const : "warning" as const,
          lineage: result.lineage,
        })),
    )
    .sort((left, right) =>
      left.extractionBlockId.localeCompare(right.extractionBlockId) || left.ruleId.localeCompare(right.ruleId),
    );

  const rulesHash = hashString(
    stableSerialize(
      createRuleSet(carrierId).map((rule) => ({
        ruleId: rule.ruleId,
        carrierId: rule.carrierId,
        kind: rule.kind,
        scoreImpact: rule.scoreImpact,
      })),
    ),
  );
  const outcomeHash = hashString(
    stableSerialize(
      evaluations.map((item) => ({
        extractionBlockId: item.extractionBlockId,
        candidateCode: item.candidateCode,
        combinedScoreDelta: item.combinedScoreDelta,
        hasBlocker: item.hasBlocker,
      })),
    ),
  );

  return {
    generatedAt: CANONICAL_GENERATED_AT,
    rulesHash,
    outcomeHash,
    evaluations,
    conflicts,
  };
}

export function buildUnderwritingRuleSnapshot(
  payload: MappingPersistencePayload,
  options?: {
    previousSnapshot?: UnderwritingRuleSnapshot;
    decisions?: UnderwritingRuleDecision[];
    overrides?: UnderwritingRuleOverride[];
  },
): UnderwritingRuleSnapshot {
  const report = evaluateUnderwritingRules(payload, {
    familyId: payload.formFamily?.familyId,
    overrides: options?.overrides || payload.underwritingRuleOverrides || [],
  });
  const previous = options?.previousSnapshot;
  const nextVersion = (previous ? Number(previous.versionId.replace("rules-v", "")) || 0 : 0) + 1;
  const versionId = `rules-v${nextVersion}`;

  const latestPin = [...(options?.decisions || payload.underwritingRuleDecisions || [])]
    .reverse()
    .find((decision) => decision.action === "pin" && decision.targetVersionId);

  return {
    generatedAt: CANONICAL_GENERATED_AT,
    versionId,
    rulesHash: report.rulesHash,
    outcomeHash: report.outcomeHash,
    conflictCount: report.conflicts.length,
    blockerCount: report.conflicts.filter((item) => item.severity === "blocker").length,
    lineage: [
      `rules.version=${versionId}`,
      `rules.hash=${report.rulesHash}`,
      `rules.outcome=${report.outcomeHash}`,
      latestPin ? `rules.pinned=${latestPin.targetVersionId}` : "rules.pinned=none",
    ],
  };
}

export function evaluateUnderwritingRuleDrift(
  baseline: UnderwritingRuleSnapshot | undefined,
  current: UnderwritingRuleSnapshot,
): UnderwritingRuleDrift {
  if (!baseline) {
    return {
      hasDrift: false,
      driftHash: hashString(stableSerialize({ baseline: null, current: current.outcomeHash })),
      differences: [],
    };
  }

  const differences = [
    { key: "rulesHash", baselineValue: baseline.rulesHash, currentValue: current.rulesHash },
    { key: "outcomeHash", baselineValue: baseline.outcomeHash, currentValue: current.outcomeHash },
    { key: "conflictCount", baselineValue: baseline.conflictCount, currentValue: current.conflictCount },
    { key: "blockerCount", baselineValue: baseline.blockerCount, currentValue: current.blockerCount },
  ].filter((item) => item.baselineValue !== item.currentValue);

  return {
    hasDrift: differences.length > 0,
    driftHash: hashString(stableSerialize(differences)),
    differences,
  };
}

