"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateMappingPersistencePayload = validateMappingPersistencePayload;
const acord_1 = require("shared/acord");
function isStringArray(value) {
    return Array.isArray(value) && value.every((item) => typeof item === "string");
}
function isValidThresholds(value) {
    if (!value || typeof value !== "object") {
        return false;
    }
    const thresholds = value;
    return (typeof thresholds.accepted === "number" &&
        typeof thresholds.review === "number" &&
        typeof thresholds.rejected === "number");
}
function validateMappingPersistencePayload(value) {
    if (!value || typeof value !== "object") {
        return { valid: false, error: "Payload must be an object" };
    }
    const payload = value;
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
    if (!Array.isArray(payload.associationEdits) ||
        payload.associationEdits.some((edit) => !edit ||
            typeof edit !== "object" ||
            typeof edit.fieldId !== "string" ||
            typeof edit.changedAt !== "string")) {
        return { valid: false, error: "associationEdits must contain fieldId and changedAt" };
    }
    if (!Array.isArray(payload.schemaArtifacts) ||
        payload.schemaArtifacts.some((artifact) => !artifact ||
            typeof artifact !== "object" ||
            typeof artifact.kind !== "string" ||
            typeof artifact.generatedAt !== "string" ||
            typeof artifact.hash !== "string" ||
            typeof artifact.includedMappings !== "number")) {
        return { valid: false, error: "schemaArtifacts are malformed" };
    }
    if (payload.calibrationProfile) {
        const profile = payload.calibrationProfile;
        if (typeof profile !== "object" ||
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
            !Array.isArray(profile.auditTrail)) {
            return { valid: false, error: "calibrationProfile is malformed" };
        }
        if (profile.familyOverrides !== undefined &&
            (!profile.familyOverrides || typeof profile.familyOverrides !== "object")) {
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
        if (profile.auditTrail.some((entry) => !entry ||
            typeof entry !== "object" ||
            typeof entry.version !== "number" ||
            typeof entry.changedAt !== "string")) {
            return { valid: false, error: "calibrationProfile.auditTrail is malformed" };
        }
    }
    if (payload.formFamily) {
        const family = payload.formFamily;
        if (typeof family.familyId !== "string" ||
            typeof family.familyLabel !== "string" ||
            typeof family.confidence !== "number" ||
            typeof family.signatureHash !== "string" ||
            !Array.isArray(family.layoutSignature) ||
            !Array.isArray(family.semanticSignature) ||
            !isStringArray(family.evidence) ||
            typeof family.classifiedAt !== "string" ||
            typeof family.classifierVersion !== "string") {
            return { valid: false, error: "formFamily is malformed" };
        }
    }
    const defaultOntology = (0, acord_1.getDefaultOntologyMetadata)();
    if (!payload.ontologyAlignment) {
        payload.ontologyAlignment = {
            ...defaultOntology,
            ontologyNamespace: "acord-core",
            bundleId: "acord-core@legacy",
            migrationNotes: ["legacy-payload-defaulted"],
        };
    }
    else {
        payload.ontologyAlignment = {
            ontologyId: payload.ontologyAlignment.ontologyId || defaultOntology.ontologyId,
            ontologyVersion: payload.ontologyAlignment.ontologyVersion || defaultOntology.ontologyVersion,
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
                generatedAt: payload.semanticFusionSnapshot.generatedAt ||
                    "1970-01-01T00:00:00.000Z",
                profileHash: payload.semanticFusionSnapshot.profileHash ||
                    "",
                unificationHash: payload.semanticFusionSnapshot.unificationHash ||
                    "",
                conflictHash: payload.semanticFusionSnapshot.conflictHash ||
                    "",
            }
            : undefined;
    payload.semanticMemorySnapshot =
        payload.semanticMemorySnapshot && typeof payload.semanticMemorySnapshot === "object"
            ? {
                generatedAt: payload.semanticMemorySnapshot.generatedAt ||
                    "1970-01-01T00:00:00.000Z",
                versionId: payload.semanticMemorySnapshot.versionId ||
                    "memory-v0",
                memoryHash: payload.semanticMemorySnapshot.memoryHash ||
                    "",
                sourceProfileHash: payload.semanticMemorySnapshot
                    .sourceProfileHash || "",
                sourceUnificationHash: payload.semanticMemorySnapshot
                    .sourceUnificationHash || "",
                sourceConflictHash: payload.semanticMemorySnapshot
                    .sourceConflictHash || "",
                pinnedVersionId: payload.semanticMemorySnapshot.pinnedVersionId,
                entries: Array.isArray(payload.semanticMemorySnapshot.entries)
                    ? payload.semanticMemorySnapshot.entries.map((entry) => ({
                        groupId: typeof entry?.groupId === "string" ? entry.groupId : "",
                        canonicalCode: typeof entry?.canonicalCode === "string" ? entry.canonicalCode : "",
                        equivalentCodes: Array.isArray(entry?.equivalentCodes)
                            ? entry.equivalentCodes.filter((item) => typeof item === "string")
                            : [],
                        representativeCode: typeof entry?.representativeCode === "string"
                            ? entry.representativeCode
                            : "",
                        occurrenceCount: typeof entry?.occurrenceCount === "number" ? entry.occurrenceCount : 0,
                        confidenceHistory: Array.isArray(entry?.confidenceHistory)
                            ? entry.confidenceHistory.filter((item) => typeof item === "number")
                            : [],
                        rationaleHistory: Array.isArray(entry?.rationaleHistory)
                            ? entry.rationaleHistory.filter((item) => item && typeof item === "object")
                            : [],
                        families: Array.isArray(entry?.families)
                            ? entry.families.filter((item) => typeof item === "string")
                            : [],
                        ontologyNamespaces: Array.isArray(entry?.ontologyNamespaces)
                            ? entry.ontologyNamespaces.filter((item) => typeof item === "string")
                            : [],
                        conflictRecurrence: typeof entry?.conflictRecurrence === "number" ? entry.conflictRecurrence : 0,
                        lastSeenAt: typeof entry?.lastSeenAt === "string"
                            ? entry.lastSeenAt
                            : "1970-01-01T00:00:00.000Z",
                        stabilityScore: typeof entry?.stabilityScore === "number" ? entry.stabilityScore : 0,
                        lineage: Array.isArray(entry?.lineage)
                            ? entry.lineage.filter((item) => typeof item === "string")
                            : [],
                    }))
                    : [],
                lineage: Array.isArray(payload.semanticMemorySnapshot.lineage)
                    ? payload.semanticMemorySnapshot.lineage.filter((item) => typeof item === "string")
                    : [],
            }
            : undefined;
    payload.semanticMemoryDecisions = Array.isArray(payload.semanticMemoryDecisions)
        ? payload.semanticMemoryDecisions.filter((decision) => decision &&
            typeof decision === "object" &&
            typeof decision.decisionId === "string" &&
            typeof decision.action === "string" &&
            typeof decision.changedAt === "string")
        : [];
    payload.selectedSemanticMemoryVersion =
        typeof payload.selectedSemanticMemoryVersion === "string"
            ? payload.selectedSemanticMemoryVersion
            : undefined;
    payload.globalSemanticGraphSnapshot =
        payload.globalSemanticGraphSnapshot && typeof payload.globalSemanticGraphSnapshot === "object"
            ? {
                generatedAt: payload.globalSemanticGraphSnapshot.generatedAt ||
                    "1970-01-01T00:00:00.000Z",
                versionId: payload.globalSemanticGraphSnapshot.versionId ||
                    "graph-v0",
                graphHash: payload.globalSemanticGraphSnapshot.graphHash || "",
                harmonizationHash: payload.globalSemanticGraphSnapshot
                    .harmonizationHash || "",
                nodeCount: payload.globalSemanticGraphSnapshot.nodeCount || 0,
                edgeCount: payload.globalSemanticGraphSnapshot.edgeCount || 0,
                nodes: Array.isArray(payload.globalSemanticGraphSnapshot.nodes)
                    ? payload.globalSemanticGraphSnapshot.nodes.filter((node) => node && typeof node === "object")
                    : [],
                edges: Array.isArray(payload.globalSemanticGraphSnapshot.edges)
                    ? payload.globalSemanticGraphSnapshot.edges.filter((edge) => edge && typeof edge === "object")
                    : [],
                pinnedVersionId: payload.globalSemanticGraphSnapshot.pinnedVersionId,
                lineage: Array.isArray(payload.globalSemanticGraphSnapshot.lineage)
                    ? payload.globalSemanticGraphSnapshot.lineage.filter((item) => typeof item === "string")
                    : [],
            }
            : undefined;
    payload.globalSemanticGraphEdgeOverrides = Array.isArray(payload.globalSemanticGraphEdgeOverrides)
        ? payload.globalSemanticGraphEdgeOverrides.filter((override) => override &&
            typeof override === "object" &&
            typeof override.fromNodeId === "string" &&
            typeof override.toNodeId === "string" &&
            typeof override.edgeType === "string" &&
            typeof override.weight === "number" &&
            typeof override.active === "boolean" &&
            typeof override.changedAt === "string")
        : [];
    payload.globalSemanticGraphMergeDecisions = Array.isArray(payload.globalSemanticGraphMergeDecisions)
        ? payload.globalSemanticGraphMergeDecisions.filter((decision) => decision &&
            typeof decision === "object" &&
            typeof decision.decisionId === "string" &&
            typeof decision.action === "string" &&
            typeof decision.changedAt === "string")
        : [];
    payload.selectedGlobalSemanticGraphVersion =
        typeof payload.selectedGlobalSemanticGraphVersion === "string"
            ? payload.selectedGlobalSemanticGraphVersion
            : undefined;
    payload.carrierAdapterSnapshot =
        payload.carrierAdapterSnapshot && typeof payload.carrierAdapterSnapshot === "object"
            ? {
                generatedAt: payload.carrierAdapterSnapshot.generatedAt ||
                    "1970-01-01T00:00:00.000Z",
                versionId: payload.carrierAdapterSnapshot.versionId ||
                    "adapter-v0",
                adapterHash: payload.carrierAdapterSnapshot.adapterHash || "",
                carrierIds: Array.isArray(payload.carrierAdapterSnapshot.carrierIds)
                    ? payload.carrierAdapterSnapshot.carrierIds.filter((item) => typeof item === "string")
                    : [],
                mappingCount: payload.carrierAdapterSnapshot.mappingCount || 0,
                lineage: Array.isArray(payload.carrierAdapterSnapshot.lineage)
                    ? payload.carrierAdapterSnapshot.lineage.filter((item) => typeof item === "string")
                    : [],
            }
            : undefined;
    payload.carrierAdapterOverrides = Array.isArray(payload.carrierAdapterOverrides)
        ? payload.carrierAdapterOverrides.filter((override) => override &&
            typeof override === "object" &&
            typeof override.carrierId === "string" &&
            typeof override.carrierCode === "string" &&
            typeof override.forcedAcordCode === "string" &&
            typeof override.changedAt === "string")
        : [];
    payload.underwritingRuleSnapshot =
        payload.underwritingRuleSnapshot && typeof payload.underwritingRuleSnapshot === "object"
            ? {
                generatedAt: payload.underwritingRuleSnapshot.generatedAt ||
                    "1970-01-01T00:00:00.000Z",
                versionId: payload.underwritingRuleSnapshot.versionId ||
                    "rules-v0",
                rulesHash: payload.underwritingRuleSnapshot.rulesHash || "",
                outcomeHash: payload.underwritingRuleSnapshot.outcomeHash || "",
                conflictCount: payload.underwritingRuleSnapshot.conflictCount || 0,
                blockerCount: payload.underwritingRuleSnapshot.blockerCount || 0,
                lineage: Array.isArray(payload.underwritingRuleSnapshot.lineage)
                    ? payload.underwritingRuleSnapshot.lineage.filter((item) => typeof item === "string")
                    : [],
            }
            : undefined;
    payload.underwritingRuleOverrides = Array.isArray(payload.underwritingRuleOverrides)
        ? payload.underwritingRuleOverrides.filter((override) => override &&
            typeof override === "object" &&
            typeof override.ruleId === "string" &&
            typeof override.forcedPass === "boolean" &&
            typeof override.changedAt === "string")
        : [];
    payload.underwritingRuleDecisions = Array.isArray(payload.underwritingRuleDecisions)
        ? payload.underwritingRuleDecisions.filter((decision) => decision &&
            typeof decision === "object" &&
            typeof decision.decisionId === "string" &&
            typeof decision.action === "string" &&
            typeof decision.changedAt === "string")
        : [];
    payload.selectedUnderwritingRuleVersion =
        typeof payload.selectedUnderwritingRuleVersion === "string"
            ? payload.selectedUnderwritingRuleVersion
            : undefined;
    payload.riskFactorSnapshot =
        payload.riskFactorSnapshot && typeof payload.riskFactorSnapshot === "object"
            ? {
                generatedAt: payload.riskFactorSnapshot.generatedAt ||
                    "1970-01-01T00:00:00.000Z",
                versionId: payload.riskFactorSnapshot.versionId || "risk-v0",
                riskFactorHash: payload.riskFactorSnapshot.riskFactorHash || "",
                signalCount: payload.riskFactorSnapshot.signalCount || 0,
                categoryCounts: payload.riskFactorSnapshot
                    .categoryCounts || {
                    exposure: 0,
                    hazard: 0,
                    applicant: 0,
                    operations: 0,
                    "loss-history": 0,
                    supplemental: 0,
                },
                lineage: Array.isArray(payload.riskFactorSnapshot.lineage)
                    ? payload.riskFactorSnapshot.lineage.filter((item) => typeof item === "string")
                    : [],
            }
            : undefined;
    payload.riskFactorOverrides = Array.isArray(payload.riskFactorOverrides)
        ? payload.riskFactorOverrides.filter((override) => override &&
            typeof override === "object" &&
            typeof override.signalId === "string" &&
            typeof override.forcedSeverity === "number" &&
            typeof override.active === "boolean" &&
            typeof override.changedAt === "string")
        : [];
    payload.riskScoringSnapshot =
        payload.riskScoringSnapshot && typeof payload.riskScoringSnapshot === "object"
            ? {
                generatedAt: payload.riskScoringSnapshot.generatedAt ||
                    "1970-01-01T00:00:00.000Z",
                versionId: payload.riskScoringSnapshot.versionId ||
                    "risk-score-v0",
                scoringHash: payload.riskScoringSnapshot.scoringHash || "",
                weightedScore: payload.riskScoringSnapshot.weightedScore || 0,
                classification: payload.riskScoringSnapshot
                    .classification || "low",
                carrierClass: payload.riskScoringSnapshot.carrierClass || "",
                lineage: Array.isArray(payload.riskScoringSnapshot.lineage)
                    ? payload.riskScoringSnapshot.lineage.filter((item) => typeof item === "string")
                    : [],
            }
            : undefined;
    payload.underwritingDecisionSnapshot =
        payload.underwritingDecisionSnapshot && typeof payload.underwritingDecisionSnapshot === "object"
            ? {
                generatedAt: payload.underwritingDecisionSnapshot.generatedAt ||
                    "1970-01-01T00:00:00.000Z",
                versionId: payload.underwritingDecisionSnapshot.versionId ||
                    "uw-v0",
                decisionHash: payload.underwritingDecisionSnapshot.decisionHash ||
                    "",
                outcome: payload.underwritingDecisionSnapshot.outcome || "accept",
                firedRuleCount: payload.underwritingDecisionSnapshot
                    .firedRuleCount || 0,
                overrideApplied: payload.underwritingDecisionSnapshot
                    .overrideApplied || false,
                lineage: Array.isArray(payload.underwritingDecisionSnapshot.lineage)
                    ? payload.underwritingDecisionSnapshot.lineage.filter((item) => typeof item === "string")
                    : [],
            }
            : undefined;
    payload.underwritingDecisionOverrides = Array.isArray(payload.underwritingDecisionOverrides)
        ? payload.underwritingDecisionOverrides.filter((override) => override &&
            typeof override === "object" &&
            typeof override.decisionId === "string" &&
            typeof override.forcedOutcome === "string" &&
            typeof override.changedAt === "string")
        : [];
    payload.underwritingDecisionDecisions = Array.isArray(payload.underwritingDecisionDecisions)
        ? payload.underwritingDecisionDecisions.filter((decision) => decision &&
            typeof decision === "object" &&
            typeof decision.decisionId === "string" &&
            typeof decision.action === "string" &&
            typeof decision.changedAt === "string")
        : [];
    payload.underwritingDecisionDrift =
        payload.underwritingDecisionDrift && typeof payload.underwritingDecisionDrift === "object"
            ? {
                hasDrift: payload.underwritingDecisionDrift.hasDrift || false,
                driftHash: payload.underwritingDecisionDrift.driftHash || "",
                differences: Array.isArray(payload.underwritingDecisionDrift.differences)
                    ? payload.underwritingDecisionDrift.differences.filter((item) => item && typeof item === "object")
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
                packageId: payload.submissionPackage.packageId || "submission-unknown",
                generatedAt: payload.submissionPackage.generatedAt ||
                    "1970-01-01T00:00:00.000Z",
                acordXml: payload.submissionPackage.acordXml || "",
                acordXmlHash: payload.submissionPackage.acordXmlHash || "",
                carrierPayloads: Array.isArray(payload.submissionPackage.carrierPayloads)
                    ? payload.submissionPackage.carrierPayloads.filter((item) => item && typeof item === "object")
                    : [],
                riskReport: payload.submissionPackage.riskReport || {
                    riskFactorHash: "",
                    scoringHash: "",
                    weightedScore: 0,
                    classification: "low",
                },
                decisionReport: payload.submissionPackage.decisionReport || {
                    decisionHash: "",
                    outcome: "accept",
                    firedRuleCount: 0,
                },
                semanticLineageBundle: Array.isArray(payload.submissionPackage.semanticLineageBundle)
                    ? payload.submissionPackage.semanticLineageBundle.filter((item) => typeof item === "string")
                    : undefined,
                packageHash: payload.submissionPackage.packageHash || "",
                lineage: Array.isArray(payload.submissionPackage.lineage)
                    ? payload.submissionPackage.lineage.filter((item) => typeof item === "string")
                    : [],
            }
            : undefined;
    payload.submissionOverrides = Array.isArray(payload.submissionOverrides)
        ? payload.submissionOverrides.filter((override) => override &&
            typeof override === "object" &&
            typeof override.overrideId === "string" &&
            typeof override.action === "string" &&
            typeof override.changedAt === "string")
        : [];
    payload.submissionStatus =
        payload.submissionStatus && typeof payload.submissionStatus === "object"
            ? {
                submissionId: payload.submissionStatus.submissionId || "",
                packageId: payload.submissionStatus.packageId || "",
                carrierId: payload.submissionStatus.carrierId || "",
                status: payload.submissionStatus.status || "draft",
                lastUpdatedAt: payload.submissionStatus.lastUpdatedAt ||
                    "1970-01-01T00:00:00.000Z",
                attemptCount: payload.submissionStatus.attemptCount || 0,
                latestResponseHash: payload.submissionStatus.latestResponseHash,
                lineage: Array.isArray(payload.submissionStatus.lineage)
                    ? payload.submissionStatus.lineage.filter((item) => typeof item === "string")
                    : [],
            }
            : undefined;
    payload.carrierSubmissionResponse =
        payload.carrierSubmissionResponse && typeof payload.carrierSubmissionResponse === "object"
            ? {
                submissionId: payload.carrierSubmissionResponse.submissionId || "",
                carrierId: payload.carrierSubmissionResponse.carrierId || "",
                status: payload.carrierSubmissionResponse.status || "draft",
                carrierReferenceId: payload.carrierSubmissionResponse.carrierReferenceId,
                message: payload.carrierSubmissionResponse.message || "",
                responseHash: payload.carrierSubmissionResponse.responseHash || "",
                normalized: payload.carrierSubmissionResponse.normalized || {},
                receivedAt: payload.carrierSubmissionResponse.receivedAt ||
                    "1970-01-01T00:00:00.000Z",
                lineage: Array.isArray(payload.carrierSubmissionResponse.lineage)
                    ? payload.carrierSubmissionResponse.lineage.filter((item) => typeof item === "string")
                    : [],
            }
            : undefined;
    payload.submissionDrift =
        payload.submissionDrift && typeof payload.submissionDrift === "object"
            ? {
                hasDrift: payload.submissionDrift.hasDrift || false,
                driftHash: payload.submissionDrift.driftHash || "",
                differences: Array.isArray(payload.submissionDrift.differences)
                    ? payload.submissionDrift.differences.filter((item) => item && typeof item === "object")
                    : [],
            }
            : undefined;
    payload.selectedSubmissionVersion =
        typeof payload.selectedSubmissionVersion === "string"
            ? payload.selectedSubmissionVersion
            : undefined;
    return { valid: true, payload: payload };
}
