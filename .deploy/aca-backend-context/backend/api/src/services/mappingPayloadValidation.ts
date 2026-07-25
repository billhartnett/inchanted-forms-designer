import type { MappingPersistencePayload } from "shared/types";
import { getDefaultOntologyMetadata } from "shared/acord";

type ValidationResult =
  | { valid: true; payload: MappingPersistencePayload }
  | { valid: false; error: string };

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isValidThresholds(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }

  const thresholds = value as {
    accepted?: unknown;
    review?: unknown;
    rejected?: unknown;
  };
  return (
    typeof thresholds.accepted === "number" &&
    typeof thresholds.review === "number" &&
    typeof thresholds.rejected === "number"
  );
}

export function validateMappingPersistencePayload(value: unknown): ValidationResult {
  if (!value || typeof value !== "object") {
    return { valid: false, error: "Payload must be an object" };
  }

  const payload = value as Partial<MappingPersistencePayload>;
  if (payload.version !== 1) {
    return { valid: false, error: "Unsupported payload version" };
  }

  if (!Array.isArray(payload.pages)) {
    return { valid: false, error: "pages must be an array" };
  }

  if (!Array.isArray(payload.fields)) {
    return { valid: false, error: "fields must be an array" };
  }

  if (!Array.isArray(payload.mappings)) {
    return { valid: false, error: "mappings must be an array" };
  }

  if (!payload.decisionGraph || typeof payload.decisionGraph !== "object") {
    return { valid: false, error: "decisionGraph is required" };
  }

  if (!payload.overrides || typeof payload.overrides !== "object") {
    return { valid: false, error: "overrides must be an object" };
  }

  if (!isStringArray(payload.suppressedOcrBlockIds)) {
    return { valid: false, error: "suppressedOcrBlockIds must be a string array" };
  }

  if (
    !Array.isArray(payload.associationEdits) ||
    payload.associationEdits.some(
      (edit) =>
        !edit ||
        typeof edit !== "object" ||
        typeof edit.fieldId !== "string" ||
        typeof edit.changedAt !== "string",
    )
  ) {
    return { valid: false, error: "associationEdits must contain fieldId and changedAt" };
  }

  if (
    !Array.isArray(payload.schemaArtifacts) ||
    payload.schemaArtifacts.some(
      (artifact) =>
        !artifact ||
        typeof artifact !== "object" ||
        typeof artifact.kind !== "string" ||
        typeof artifact.generatedAt !== "string" ||
        typeof artifact.hash !== "string" ||
        typeof artifact.includedMappings !== "number",
    )
  ) {
    return { valid: false, error: "schemaArtifacts are malformed" };
  }

  if (payload.calibrationProfile) {
    const profile = payload.calibrationProfile;
    if (
      typeof profile !== "object" ||
      typeof profile.profileId !== "string" ||
      typeof profile.name !== "string" ||
      typeof profile.version !== "number" ||
      typeof profile.createdAt !== "string" ||
      typeof profile.updatedAt !== "string" ||
      !isValidThresholds(profile.globalThresholds) ||
      !profile.codeThresholdOverrides ||
      typeof profile.codeThresholdOverrides !== "object" ||
      !profile.signalWeights ||
      typeof profile.signalWeights !== "object" ||
      typeof profile.signalWeights.embedding !== "number" ||
      typeof profile.signalWeights.lexical !== "number" ||
      typeof profile.signalWeights.dictionary !== "number" ||
      typeof profile.signalWeights.heuristic !== "number" ||
      !Array.isArray(profile.auditTrail)
    ) {
      return { valid: false, error: "calibrationProfile is malformed" };
    }

    if (
      profile.familyOverrides !== undefined &&
      (!profile.familyOverrides || typeof profile.familyOverrides !== "object")
    ) {
      return { valid: false, error: "calibrationProfile.familyOverrides is malformed" };
    }

    profile.familyOverrides = profile.familyOverrides || {};
    profile.lineage = Array.isArray(profile.lineage) ? profile.lineage : [];
    profile.suggestedOverrides = Array.isArray(profile.suggestedOverrides)
      ? profile.suggestedOverrides
      : [];

    const overrideValues = Object.values(profile.codeThresholdOverrides);
    if (overrideValues.some((item) => !isValidThresholds(item))) {
      return { valid: false, error: "calibrationProfile.codeThresholdOverrides are malformed" };
    }

    if (
      profile.auditTrail.some(
        (entry) =>
          !entry ||
          typeof entry !== "object" ||
          typeof entry.version !== "number" ||
          typeof entry.changedAt !== "string",
      )
    ) {
      return { valid: false, error: "calibrationProfile.auditTrail is malformed" };
    }
  }

  if (payload.formFamily) {
    const family = payload.formFamily;
    if (
      typeof family.familyId !== "string" ||
      typeof family.familyLabel !== "string" ||
      typeof family.confidence !== "number" ||
      typeof family.signatureHash !== "string" ||
      !Array.isArray(family.layoutSignature) ||
      !Array.isArray(family.semanticSignature) ||
      !isStringArray(family.evidence) ||
      typeof family.classifiedAt !== "string" ||
      typeof family.classifierVersion !== "string"
    ) {
      return { valid: false, error: "formFamily is malformed" };
    }
  }

  const defaultOntology = getDefaultOntologyMetadata();
  if (!payload.ontologyAlignment) {
    payload.ontologyAlignment = {
      ...defaultOntology,
      ontologyNamespace: "acord-core",
      bundleId: "acord-core@legacy",
      migrationNotes: ["legacy-payload-defaulted"],
    };
  } else {
    payload.ontologyAlignment = {
      ontologyId: payload.ontologyAlignment.ontologyId || defaultOntology.ontologyId,
      ontologyVersion:
        payload.ontologyAlignment.ontologyVersion || defaultOntology.ontologyVersion,
      ontologyHash: payload.ontologyAlignment.ontologyHash || defaultOntology.ontologyHash,
      ontologyNamespace: payload.ontologyAlignment.ontologyNamespace || "acord-core",
      bundleId: payload.ontologyAlignment.bundleId || "acord-core@legacy",
      alignedAt: payload.ontologyAlignment.alignedAt || defaultOntology.alignedAt,
      migrationNotes: Array.isArray(payload.ontologyAlignment.migrationNotes)
        ? payload.ontologyAlignment.migrationNotes
        : [],
    };
  }

  payload.ontologyBundles = Array.isArray(payload.ontologyBundles)
    ? payload.ontologyBundles
    : [];
  payload.semanticConflicts = Array.isArray(payload.semanticConflicts)
    ? payload.semanticConflicts
    : [];
  payload.conflictOverrides = Array.isArray(payload.conflictOverrides)
    ? payload.conflictOverrides
    : [];
  payload.fusionOverrides = Array.isArray(payload.fusionOverrides)
    ? payload.fusionOverrides
    : [];
  payload.semanticFusionSnapshot =
    payload.semanticFusionSnapshot && typeof payload.semanticFusionSnapshot === "object"
      ? {
          generatedAt:
            (payload.semanticFusionSnapshot as { generatedAt?: string }).generatedAt ||
            "1970-01-01T00:00:00.000Z",
          profileHash:
            (payload.semanticFusionSnapshot as { profileHash?: string }).profileHash ||
            "",
          unificationHash:
            (payload.semanticFusionSnapshot as { unificationHash?: string }).unificationHash ||
            "",
          conflictHash:
            (payload.semanticFusionSnapshot as { conflictHash?: string }).conflictHash ||
            "",
        }
      : undefined;

  payload.semanticMemorySnapshot =
    payload.semanticMemorySnapshot && typeof payload.semanticMemorySnapshot === "object"
      ? {
          generatedAt:
            (payload.semanticMemorySnapshot as { generatedAt?: string }).generatedAt ||
            "1970-01-01T00:00:00.000Z",
          versionId:
            (payload.semanticMemorySnapshot as { versionId?: string }).versionId ||
            "memory-v0",
          memoryHash:
            (payload.semanticMemorySnapshot as { memoryHash?: string }).memoryHash ||
            "",
          sourceProfileHash:
            (payload.semanticMemorySnapshot as { sourceProfileHash?: string })
              .sourceProfileHash || "",
          sourceUnificationHash:
            (payload.semanticMemorySnapshot as { sourceUnificationHash?: string })
              .sourceUnificationHash || "",
          sourceConflictHash:
            (payload.semanticMemorySnapshot as { sourceConflictHash?: string })
              .sourceConflictHash || "",
          pinnedVersionId:
            (payload.semanticMemorySnapshot as { pinnedVersionId?: string }).pinnedVersionId,
          entries: Array.isArray((payload.semanticMemorySnapshot as { entries?: unknown[] }).entries)
            ? ((payload.semanticMemorySnapshot as { entries: unknown[] }).entries as any[]).map(
                (entry) => ({
                  groupId: typeof entry?.groupId === "string" ? entry.groupId : "",
                  canonicalCode:
                    typeof entry?.canonicalCode === "string" ? entry.canonicalCode : "",
                  equivalentCodes: Array.isArray(entry?.equivalentCodes)
                    ? entry.equivalentCodes.filter((item: unknown) => typeof item === "string")
                    : [],
                  representativeCode:
                    typeof entry?.representativeCode === "string"
                      ? entry.representativeCode
                      : "",
                  occurrenceCount:
                    typeof entry?.occurrenceCount === "number" ? entry.occurrenceCount : 0,
                  confidenceHistory: Array.isArray(entry?.confidenceHistory)
                    ? entry.confidenceHistory.filter((item: unknown) => typeof item === "number")
                    : [],
                  rationaleHistory: Array.isArray(entry?.rationaleHistory)
                    ? entry.rationaleHistory.filter(
                        (item: unknown) => item && typeof item === "object",
                      )
                    : [],
                  families: Array.isArray(entry?.families)
                    ? entry.families.filter((item: unknown) => typeof item === "string")
                    : [],
                  ontologyNamespaces: Array.isArray(entry?.ontologyNamespaces)
                    ? entry.ontologyNamespaces.filter(
                        (item: unknown) => typeof item === "string",
                      )
                    : [],
                  conflictRecurrence:
                    typeof entry?.conflictRecurrence === "number" ? entry.conflictRecurrence : 0,
                  lastSeenAt:
                    typeof entry?.lastSeenAt === "string"
                      ? entry.lastSeenAt
                      : "1970-01-01T00:00:00.000Z",
                  stabilityScore:
                    typeof entry?.stabilityScore === "number" ? entry.stabilityScore : 0,
                  lineage: Array.isArray(entry?.lineage)
                    ? entry.lineage.filter((item: unknown) => typeof item === "string")
                    : [],
                }),
              )
            : [],
          lineage: Array.isArray((payload.semanticMemorySnapshot as { lineage?: unknown[] }).lineage)
            ? ((payload.semanticMemorySnapshot as { lineage: unknown[] }).lineage as unknown[]).filter(
                (item) => typeof item === "string",
              ) as string[]
            : [],
        }
      : undefined;

  payload.semanticMemoryDecisions = Array.isArray(payload.semanticMemoryDecisions)
    ? payload.semanticMemoryDecisions.filter(
        (decision) =>
          decision &&
          typeof decision === "object" &&
          typeof decision.decisionId === "string" &&
          typeof decision.action === "string" &&
          typeof decision.changedAt === "string",
      )
    : [];

  payload.selectedSemanticMemoryVersion =
    typeof payload.selectedSemanticMemoryVersion === "string"
      ? payload.selectedSemanticMemoryVersion
      : undefined;

  payload.globalSemanticGraphSnapshot =
    payload.globalSemanticGraphSnapshot && typeof payload.globalSemanticGraphSnapshot === "object"
      ? {
          generatedAt:
            (payload.globalSemanticGraphSnapshot as { generatedAt?: string }).generatedAt ||
            "1970-01-01T00:00:00.000Z",
          versionId:
            (payload.globalSemanticGraphSnapshot as { versionId?: string }).versionId ||
            "graph-v0",
          graphHash:
            (payload.globalSemanticGraphSnapshot as { graphHash?: string }).graphHash || "",
          harmonizationHash:
            (payload.globalSemanticGraphSnapshot as { harmonizationHash?: string })
              .harmonizationHash || "",
          nodeCount:
            (payload.globalSemanticGraphSnapshot as { nodeCount?: number }).nodeCount || 0,
          edgeCount:
            (payload.globalSemanticGraphSnapshot as { edgeCount?: number }).edgeCount || 0,
          nodes: Array.isArray((payload.globalSemanticGraphSnapshot as { nodes?: unknown[] }).nodes)
            ? ((payload.globalSemanticGraphSnapshot as { nodes: unknown[] }).nodes as unknown[]).filter(
                (node) => node && typeof node === "object",
              ) as any[]
            : [],
          edges: Array.isArray((payload.globalSemanticGraphSnapshot as { edges?: unknown[] }).edges)
            ? ((payload.globalSemanticGraphSnapshot as { edges: unknown[] }).edges as unknown[]).filter(
                (edge) => edge && typeof edge === "object",
              ) as any[]
            : [],
          pinnedVersionId:
            (payload.globalSemanticGraphSnapshot as { pinnedVersionId?: string }).pinnedVersionId,
          lineage: Array.isArray((payload.globalSemanticGraphSnapshot as { lineage?: unknown[] }).lineage)
            ? ((payload.globalSemanticGraphSnapshot as { lineage: unknown[] }).lineage as unknown[]).filter(
                (item) => typeof item === "string",
              ) as string[]
            : [],
        }
      : undefined;

  payload.globalSemanticGraphEdgeOverrides = Array.isArray(payload.globalSemanticGraphEdgeOverrides)
    ? payload.globalSemanticGraphEdgeOverrides.filter(
        (override) =>
          override &&
          typeof override === "object" &&
          typeof override.fromNodeId === "string" &&
          typeof override.toNodeId === "string" &&
          typeof override.edgeType === "string" &&
          typeof override.weight === "number" &&
          typeof override.active === "boolean" &&
          typeof override.changedAt === "string",
      )
    : [];

  payload.globalSemanticGraphMergeDecisions = Array.isArray(payload.globalSemanticGraphMergeDecisions)
    ? payload.globalSemanticGraphMergeDecisions.filter(
        (decision) =>
          decision &&
          typeof decision === "object" &&
          typeof decision.decisionId === "string" &&
          typeof decision.action === "string" &&
          typeof decision.changedAt === "string",
      )
    : [];

  payload.selectedGlobalSemanticGraphVersion =
    typeof payload.selectedGlobalSemanticGraphVersion === "string"
      ? payload.selectedGlobalSemanticGraphVersion
      : undefined;

  payload.carrierAdapterSnapshot =
    payload.carrierAdapterSnapshot && typeof payload.carrierAdapterSnapshot === "object"
      ? {
          generatedAt:
            (payload.carrierAdapterSnapshot as { generatedAt?: string }).generatedAt ||
            "1970-01-01T00:00:00.000Z",
          versionId:
            (payload.carrierAdapterSnapshot as { versionId?: string }).versionId ||
            "adapter-v0",
          adapterHash:
            (payload.carrierAdapterSnapshot as { adapterHash?: string }).adapterHash || "",
          carrierIds: Array.isArray((payload.carrierAdapterSnapshot as { carrierIds?: unknown[] }).carrierIds)
            ? ((payload.carrierAdapterSnapshot as { carrierIds: unknown[] }).carrierIds as unknown[]).filter(
                (item) => typeof item === "string",
              ) as string[]
            : [],
          mappingCount:
            (payload.carrierAdapterSnapshot as { mappingCount?: number }).mappingCount || 0,
          lineage: Array.isArray((payload.carrierAdapterSnapshot as { lineage?: unknown[] }).lineage)
            ? ((payload.carrierAdapterSnapshot as { lineage: unknown[] }).lineage as unknown[]).filter(
                (item) => typeof item === "string",
              ) as string[]
            : [],
        }
      : undefined;

  payload.carrierAdapterOverrides = Array.isArray(payload.carrierAdapterOverrides)
    ? payload.carrierAdapterOverrides.filter(
        (override) =>
          override &&
          typeof override === "object" &&
          typeof override.carrierId === "string" &&
          typeof override.carrierCode === "string" &&
          typeof override.forcedAcordCode === "string" &&
          typeof override.changedAt === "string",
      )
    : [];

  payload.underwritingRuleSnapshot =
    payload.underwritingRuleSnapshot && typeof payload.underwritingRuleSnapshot === "object"
      ? {
          generatedAt:
            (payload.underwritingRuleSnapshot as { generatedAt?: string }).generatedAt ||
            "1970-01-01T00:00:00.000Z",
          versionId:
            (payload.underwritingRuleSnapshot as { versionId?: string }).versionId ||
            "rules-v0",
          rulesHash:
            (payload.underwritingRuleSnapshot as { rulesHash?: string }).rulesHash || "",
          outcomeHash:
            (payload.underwritingRuleSnapshot as { outcomeHash?: string }).outcomeHash || "",
          conflictCount:
            (payload.underwritingRuleSnapshot as { conflictCount?: number }).conflictCount || 0,
          blockerCount:
            (payload.underwritingRuleSnapshot as { blockerCount?: number }).blockerCount || 0,
          lineage: Array.isArray((payload.underwritingRuleSnapshot as { lineage?: unknown[] }).lineage)
            ? ((payload.underwritingRuleSnapshot as { lineage: unknown[] }).lineage as unknown[]).filter(
                (item) => typeof item === "string",
              ) as string[]
            : [],
        }
      : undefined;

  payload.underwritingRuleOverrides = Array.isArray(payload.underwritingRuleOverrides)
    ? payload.underwritingRuleOverrides.filter(
        (override) =>
          override &&
          typeof override === "object" &&
          typeof override.ruleId === "string" &&
          typeof override.forcedPass === "boolean" &&
          typeof override.changedAt === "string",
      )
    : [];

  payload.underwritingRuleDecisions = Array.isArray(payload.underwritingRuleDecisions)
    ? payload.underwritingRuleDecisions.filter(
        (decision) =>
          decision &&
          typeof decision === "object" &&
          typeof decision.decisionId === "string" &&
          typeof decision.action === "string" &&
          typeof decision.changedAt === "string",
      )
    : [];

  payload.selectedUnderwritingRuleVersion =
    typeof payload.selectedUnderwritingRuleVersion === "string"
      ? payload.selectedUnderwritingRuleVersion
      : undefined;

  payload.riskFactorSnapshot =
    payload.riskFactorSnapshot && typeof payload.riskFactorSnapshot === "object"
      ? {
          generatedAt:
            (payload.riskFactorSnapshot as { generatedAt?: string }).generatedAt ||
            "1970-01-01T00:00:00.000Z",
          versionId:
            (payload.riskFactorSnapshot as { versionId?: string }).versionId || "risk-v0",
          riskFactorHash:
            (payload.riskFactorSnapshot as { riskFactorHash?: string }).riskFactorHash || "",
          signalCount:
            (payload.riskFactorSnapshot as { signalCount?: number }).signalCount || 0,
          categoryCounts:
            ((payload.riskFactorSnapshot as { categoryCounts?: Record<string, number> })
              .categoryCounts as Record<string, number>) || {
              exposure: 0,
              hazard: 0,
              applicant: 0,
              operations: 0,
              "loss-history": 0,
              supplemental: 0,
            },
          lineage: Array.isArray((payload.riskFactorSnapshot as { lineage?: unknown[] }).lineage)
            ? ((payload.riskFactorSnapshot as { lineage: unknown[] }).lineage as unknown[]).filter(
                (item) => typeof item === "string",
              ) as string[]
            : [],
        }
      : undefined;

  payload.riskFactorOverrides = Array.isArray(payload.riskFactorOverrides)
    ? payload.riskFactorOverrides.filter(
        (override) =>
          override &&
          typeof override === "object" &&
          typeof override.signalId === "string" &&
          typeof override.forcedSeverity === "number" &&
          typeof override.active === "boolean" &&
          typeof override.changedAt === "string",
      )
    : [];

  payload.riskScoringSnapshot =
    payload.riskScoringSnapshot && typeof payload.riskScoringSnapshot === "object"
      ? {
          generatedAt:
            (payload.riskScoringSnapshot as { generatedAt?: string }).generatedAt ||
            "1970-01-01T00:00:00.000Z",
          versionId:
            (payload.riskScoringSnapshot as { versionId?: string }).versionId ||
            "risk-score-v0",
          scoringHash:
            (payload.riskScoringSnapshot as { scoringHash?: string }).scoringHash || "",
          weightedScore:
            (payload.riskScoringSnapshot as { weightedScore?: number }).weightedScore || 0,
          classification:
            ((payload.riskScoringSnapshot as { classification?: "low" | "medium" | "high" })
              .classification as "low" | "medium" | "high") || "low",
          carrierClass:
            (payload.riskScoringSnapshot as { carrierClass?: string }).carrierClass || "",
          lineage: Array.isArray((payload.riskScoringSnapshot as { lineage?: unknown[] }).lineage)
            ? ((payload.riskScoringSnapshot as { lineage: unknown[] }).lineage as unknown[]).filter(
                (item) => typeof item === "string",
              ) as string[]
            : [],
        }
      : undefined;

  payload.underwritingDecisionSnapshot =
    payload.underwritingDecisionSnapshot && typeof payload.underwritingDecisionSnapshot === "object"
      ? {
          generatedAt:
            (payload.underwritingDecisionSnapshot as { generatedAt?: string }).generatedAt ||
            "1970-01-01T00:00:00.000Z",
          versionId:
            (payload.underwritingDecisionSnapshot as { versionId?: string }).versionId ||
            "uw-v0",
          decisionHash:
            (payload.underwritingDecisionSnapshot as { decisionHash?: string }).decisionHash ||
            "",
          outcome:
            ((payload.underwritingDecisionSnapshot as { outcome?: string }).outcome as
              | "accept"
              | "accept-with-conditions"
              | "refer-to-underwriter"
              | "decline") || "accept",
          firedRuleCount:
            (payload.underwritingDecisionSnapshot as { firedRuleCount?: number })
              .firedRuleCount || 0,
          overrideApplied:
            (payload.underwritingDecisionSnapshot as { overrideApplied?: boolean })
              .overrideApplied || false,
          lineage: Array.isArray((payload.underwritingDecisionSnapshot as { lineage?: unknown[] }).lineage)
            ? ((payload.underwritingDecisionSnapshot as { lineage: unknown[] }).lineage as unknown[]).filter(
                (item) => typeof item === "string",
              ) as string[]
            : [],
        }
      : undefined;

  payload.underwritingDecisionOverrides = Array.isArray(payload.underwritingDecisionOverrides)
    ? payload.underwritingDecisionOverrides.filter(
        (override) =>
          override &&
          typeof override === "object" &&
          typeof override.decisionId === "string" &&
          typeof override.forcedOutcome === "string" &&
          typeof override.changedAt === "string",
      )
    : [];

  payload.underwritingDecisionDecisions = Array.isArray(payload.underwritingDecisionDecisions)
    ? payload.underwritingDecisionDecisions.filter(
        (decision) =>
          decision &&
          typeof decision === "object" &&
          typeof decision.decisionId === "string" &&
          typeof decision.action === "string" &&
          typeof decision.changedAt === "string",
      )
    : [];

  payload.underwritingDecisionDrift =
    payload.underwritingDecisionDrift && typeof payload.underwritingDecisionDrift === "object"
      ? {
          hasDrift:
            (payload.underwritingDecisionDrift as { hasDrift?: boolean }).hasDrift || false,
          driftHash:
            (payload.underwritingDecisionDrift as { driftHash?: string }).driftHash || "",
          differences: Array.isArray((payload.underwritingDecisionDrift as { differences?: unknown[] }).differences)
            ? ((payload.underwritingDecisionDrift as { differences: unknown[] }).differences as unknown[]).filter(
                (item) => item && typeof item === "object",
              ) as any[]
            : [],
        }
      : undefined;

  payload.selectedUnderwritingDecisionVersion =
    typeof payload.selectedUnderwritingDecisionVersion === "string"
      ? payload.selectedUnderwritingDecisionVersion
      : undefined;

  payload.submissionPackage =
    payload.submissionPackage && typeof payload.submissionPackage === "object"
      ? {
          packageId:
            (payload.submissionPackage as { packageId?: string }).packageId || "submission-unknown",
          generatedAt:
            (payload.submissionPackage as { generatedAt?: string }).generatedAt ||
            "1970-01-01T00:00:00.000Z",
          acordXml:
            (payload.submissionPackage as { acordXml?: string }).acordXml || "",
          acordXmlHash:
            (payload.submissionPackage as { acordXmlHash?: string }).acordXmlHash || "",
          carrierPayloads: Array.isArray((payload.submissionPackage as { carrierPayloads?: unknown[] }).carrierPayloads)
            ? ((payload.submissionPackage as { carrierPayloads: unknown[] }).carrierPayloads as unknown[]).filter(
                (item) => item && typeof item === "object",
              ) as any[]
            : [],
          riskReport:
            ((payload.submissionPackage as { riskReport?: unknown }).riskReport as any) || {
              riskFactorHash: "",
              scoringHash: "",
              weightedScore: 0,
              classification: "low",
            },
          decisionReport:
            ((payload.submissionPackage as { decisionReport?: unknown }).decisionReport as any) || {
              decisionHash: "",
              outcome: "accept",
              firedRuleCount: 0,
            },
          semanticLineageBundle: Array.isArray((payload.submissionPackage as { semanticLineageBundle?: unknown[] }).semanticLineageBundle)
            ? ((payload.submissionPackage as { semanticLineageBundle: unknown[] }).semanticLineageBundle as unknown[]).filter(
                (item) => typeof item === "string",
              ) as string[]
            : undefined,
          packageHash:
            (payload.submissionPackage as { packageHash?: string }).packageHash || "",
          lineage: Array.isArray((payload.submissionPackage as { lineage?: unknown[] }).lineage)
            ? ((payload.submissionPackage as { lineage: unknown[] }).lineage as unknown[]).filter(
                (item) => typeof item === "string",
              ) as string[]
            : [],
        }
      : undefined;

  payload.submissionOverrides = Array.isArray(payload.submissionOverrides)
    ? payload.submissionOverrides.filter(
        (override) =>
          override &&
          typeof override === "object" &&
          typeof override.overrideId === "string" &&
          typeof override.action === "string" &&
          typeof override.changedAt === "string",
      )
    : [];

  payload.submissionStatus =
    payload.submissionStatus && typeof payload.submissionStatus === "object"
      ? {
          submissionId:
            (payload.submissionStatus as { submissionId?: string }).submissionId || "",
          packageId:
            (payload.submissionStatus as { packageId?: string }).packageId || "",
          carrierId:
            (payload.submissionStatus as { carrierId?: string }).carrierId || "",
          status:
            ((payload.submissionStatus as { status?: string }).status as any) || "draft",
          lastUpdatedAt:
            (payload.submissionStatus as { lastUpdatedAt?: string }).lastUpdatedAt ||
            "1970-01-01T00:00:00.000Z",
          attemptCount:
            (payload.submissionStatus as { attemptCount?: number }).attemptCount || 0,
          latestResponseHash:
            (payload.submissionStatus as { latestResponseHash?: string }).latestResponseHash,
          lineage: Array.isArray((payload.submissionStatus as { lineage?: unknown[] }).lineage)
            ? ((payload.submissionStatus as { lineage: unknown[] }).lineage as unknown[]).filter(
                (item) => typeof item === "string",
              ) as string[]
            : [],
        }
      : undefined;

  payload.carrierSubmissionResponse =
    payload.carrierSubmissionResponse && typeof payload.carrierSubmissionResponse === "object"
      ? {
          submissionId:
            (payload.carrierSubmissionResponse as { submissionId?: string }).submissionId || "",
          carrierId:
            (payload.carrierSubmissionResponse as { carrierId?: string }).carrierId || "",
          status:
            ((payload.carrierSubmissionResponse as { status?: string }).status as any) || "draft",
          carrierReferenceId:
            (payload.carrierSubmissionResponse as { carrierReferenceId?: string }).carrierReferenceId,
          message:
            (payload.carrierSubmissionResponse as { message?: string }).message || "",
          responseHash:
            (payload.carrierSubmissionResponse as { responseHash?: string }).responseHash || "",
          normalized:
            ((payload.carrierSubmissionResponse as {
              normalized?: Record<string, string | number | boolean | null>;
            }).normalized as Record<string, string | number | boolean | null>) || {},
          receivedAt:
            (payload.carrierSubmissionResponse as { receivedAt?: string }).receivedAt ||
            "1970-01-01T00:00:00.000Z",
          lineage: Array.isArray((payload.carrierSubmissionResponse as { lineage?: unknown[] }).lineage)
            ? ((payload.carrierSubmissionResponse as { lineage: unknown[] }).lineage as unknown[]).filter(
                (item) => typeof item === "string",
              ) as string[]
            : [],
        }
      : undefined;

  payload.submissionDrift =
    payload.submissionDrift && typeof payload.submissionDrift === "object"
      ? {
          hasDrift: (payload.submissionDrift as { hasDrift?: boolean }).hasDrift || false,
          driftHash: (payload.submissionDrift as { driftHash?: string }).driftHash || "",
          differences: Array.isArray((payload.submissionDrift as { differences?: unknown[] }).differences)
            ? ((payload.submissionDrift as { differences: unknown[] }).differences as unknown[]).filter(
                (item) => item && typeof item === "object",
              ) as any[]
            : [],
        }
      : undefined;

  payload.selectedSubmissionVersion =
    typeof payload.selectedSubmissionVersion === "string"
      ? payload.selectedSubmissionVersion
      : undefined;

  return { valid: true, payload: payload as MappingPersistencePayload };
}
