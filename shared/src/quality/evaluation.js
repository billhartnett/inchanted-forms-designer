"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_CALIBRATION_THRESHOLDS = exports.DEFAULT_CALIBRATION_SIGNAL_WEIGHTS = void 0;
exports.createDefaultCalibrationProfile = createDefaultCalibrationProfile;
exports.evaluateMappingQuality = evaluateMappingQuality;
exports.validateAcordXmlSemantic = validateAcordXmlSemantic;
exports.diffAcordXmlSemantics = diffAcordXmlSemantics;
exports.evaluateMultiDocumentConsistency = evaluateMultiDocumentConsistency;
const ontology_1 = require("../acord/ontology");
const familyClustering_1 = require("./familyClustering");
const crossFamilyNormalization_1 = require("./crossFamilyNormalization");
const semanticFusion_1 = require("./semanticFusion");
const semanticMemory_1 = require("./semanticMemory");
const globalSemanticGraph_1 = require("./globalSemanticGraph");
const carrierAdapters_1 = require("./carrierAdapters");
const underwritingRules_1 = require("./underwritingRules");
const riskDecisionIntelligence_1 = require("./riskDecisionIntelligence");
const submissionIntelligence_1 = require("./submissionIntelligence");
exports.DEFAULT_CALIBRATION_SIGNAL_WEIGHTS = {
    embedding: 0.5,
    lexical: 0.25,
    dictionary: 0.2,
    heuristic: 0.05,
};
exports.DEFAULT_CALIBRATION_THRESHOLDS = {
    accepted: 0.8,
    review: 0.6,
    rejected: 0.45,
};
function createDefaultCalibrationProfile(profileId = "default-calibration") {
    const now = new Date().toISOString();
    return {
        profileId,
        name: "Default Calibration",
        version: 1,
        createdAt: now,
        updatedAt: now,
        globalThresholds: exports.DEFAULT_CALIBRATION_THRESHOLDS,
        codeThresholdOverrides: {},
        signalWeights: exports.DEFAULT_CALIBRATION_SIGNAL_WEIGHTS,
        familyOverrides: {},
        lineage: [],
        suggestedOverrides: [],
        auditTrail: [
            {
                version: 1,
                changedAt: now,
                reason: "initial",
                summary: "Default deterministic calibration profile.",
            },
        ],
    };
}
function toFixedNumber(value) {
    return Number(value.toFixed(6));
}
function safeAverage(values) {
    if (!values.length) {
        return 0;
    }
    return toFixedNumber(values.reduce((sum, current) => sum + current, 0) / values.length);
}
function summarize(values) {
    if (!values.length) {
        return { count: 0, avg: 0, min: 0, max: 0 };
    }
    return {
        count: values.length,
        avg: safeAverage(values),
        min: toFixedNumber(Math.min(...values)),
        max: toFixedNumber(Math.max(...values)),
    };
}
function hashString(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash +=
            (hash << 1) +
                (hash << 4) +
                (hash << 7) +
                (hash << 8) +
                (hash << 24);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
}
function stableSerialize(value) {
    if (Array.isArray(value)) {
        return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
    }
    if (value && typeof value === "object") {
        const entries = Object.entries(value).sort((a, b) => a[0].localeCompare(b[0]));
        return `{${entries
            .map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`)
            .join(",")}}`;
    }
    return JSON.stringify(value);
}
function isAssociationInternallyConsistent(payload, record) {
    const fieldId = record.fieldId;
    if (!fieldId) {
        return false;
    }
    const field = payload.fields.find((item) => item.id === fieldId);
    if (!field) {
        return false;
    }
    return field.metadata?.extractionBlockId === record.extractionBlockId;
}
function findExpectationForRecord(record, expectations) {
    if (!expectations) {
        return undefined;
    }
    return expectations.fields.find((field) => {
        if (field.id === record.fieldId || field.id === record.extractionBlockId) {
            return true;
        }
        if (field.textPattern) {
            const text = record.mapping.text || "";
            return new RegExp(field.textPattern, "i").test(text);
        }
        return false;
    });
}
function resolveArtifactHash(schemaArtifacts, kind, fallbackSeed) {
    const artifact = schemaArtifacts.find((item) => item.kind === kind);
    return artifact?.hash || hashString(`${kind}:${fallbackSeed}`);
}
function buildMappingDecisionHash(payload) {
    const seed = stableSerialize(payload.mappings
        .map((record) => {
        const node = payload.decisionGraph.mappings[record.extractionBlockId];
        return {
            extractionBlockId: record.extractionBlockId,
            fieldId: record.fieldId || null,
            chosenCandidateCode: node?.chosenCandidateCode || record.mapping.chosen?.acordCode || null,
            decision: node?.decision || "pending",
            candidateDecisions: node?.candidateDecisions || {},
        };
    })
        .sort((left, right) => left.extractionBlockId.localeCompare(right.extractionBlockId)));
    return hashString(seed);
}
function clamp01(value) {
    if (!Number.isFinite(value)) {
        return 0;
    }
    return Math.max(0, Math.min(1, value));
}
function resolveCalibrationProfile(input) {
    return (input.calibrationProfile ||
        input.payload.calibrationProfile ||
        createDefaultCalibrationProfile());
}
function resolveThresholdForCode(profile, acordCode) {
    if (!acordCode) {
        return profile.globalThresholds;
    }
    return profile.codeThresholdOverrides[acordCode] || profile.globalThresholds;
}
function isRationaleDisagreement(lexical, embedding, dictionary, heuristic) {
    const lexicalEmbeddingGap = Math.abs(lexical - embedding);
    const dictionaryEmbeddingGap = Math.abs(dictionary - embedding);
    const lexicalHeuristicGap = Math.abs(lexical - heuristic);
    return (lexicalEmbeddingGap > 0.4 || dictionaryEmbeddingGap > 0.45 || lexicalHeuristicGap > 0.5);
}
function bucketConfidence(value) {
    if (value < 0.2)
        return "0.0-0.2";
    if (value < 0.4)
        return "0.2-0.4";
    if (value < 0.6)
        return "0.4-0.6";
    if (value < 0.8)
        return "0.6-0.8";
    return "0.8-1.0";
}
function buildCalibrationProfileHash(profile) {
    return hashString(stableSerialize({
        profileId: profile.profileId,
        version: profile.version,
        thresholds: profile.globalThresholds,
        overrides: Object.fromEntries(Object.entries(profile.codeThresholdOverrides).sort((a, b) => a[0].localeCompare(b[0]))),
        signalWeights: profile.signalWeights,
        familyOverrides: profile.familyOverrides || {},
    }));
}
function compareReports(baseline, current) {
    if (!baseline) {
        return [];
    }
    const baselineCalibration = baseline.calibration;
    const checks = [
        {
            key: "totals.exactAccuracy",
            baselineValue: baseline.totals.exactAccuracy,
            currentValue: current.totals.exactAccuracy,
        },
        {
            key: "totals.topNAccuracy",
            baselineValue: baseline.totals.topNAccuracy,
            currentValue: current.totals.topNAccuracy,
        },
        {
            key: "totals.associationAccuracy",
            baselineValue: baseline.totals.associationAccuracy,
            currentValue: current.totals.associationAccuracy,
        },
        {
            key: "formFamily.signatureHash",
            baselineValue: baseline.formFamily?.signatureHash || null,
            currentValue: current.formFamily.signatureHash,
        },
        {
            key: "formFamily.familyId",
            baselineValue: baseline.formFamily?.familyId || null,
            currentValue: current.formFamily.familyId,
        },
        {
            key: "coverage.mappedRate",
            baselineValue: baseline.coverage?.mappedRate ?? null,
            currentValue: current.coverage.mappedRate,
        },
        {
            key: "coverage.correctRate",
            baselineValue: baseline.coverage?.correctRate ?? null,
            currentValue: current.coverage.correctRate,
        },
        {
            key: "coverage.lowConfidenceRate",
            baselineValue: baseline.coverage?.lowConfidenceRate ?? null,
            currentValue: current.coverage.lowConfidenceRate,
        },
        {
            key: "coverage.normalizationFactor",
            baselineValue: baseline.coverage?.normalizationFactor ?? null,
            currentValue: current.coverage.normalizationFactor,
        },
        {
            key: "coverage.crossFamilyConfidenceDelta",
            baselineValue: baseline.coverage?.crossFamilyConfidenceDelta ?? null,
            currentValue: current.coverage.crossFamilyConfidenceDelta,
        },
        {
            key: "artifactHashes.mappingDecisionHash",
            baselineValue: baseline.artifactHashes.mappingDecisionHash,
            currentValue: current.artifactHashes.mappingDecisionHash,
        },
        {
            key: "artifactHashes.uiSchemaHash",
            baselineValue: baseline.artifactHashes.uiSchemaHash,
            currentValue: current.artifactHashes.uiSchemaHash,
        },
        {
            key: "artifactHashes.jsonSchemaHash",
            baselineValue: baseline.artifactHashes.jsonSchemaHash,
            currentValue: current.artifactHashes.jsonSchemaHash,
        },
        {
            key: "artifactHashes.xmlHash",
            baselineValue: baseline.artifactHashes.xmlHash,
            currentValue: current.artifactHashes.xmlHash,
        },
        {
            key: "calibration.profileHash",
            baselineValue: baselineCalibration?.profileHash || null,
            currentValue: current.calibration.profileHash,
        },
        {
            key: "calibration.calibratedAccuracy",
            baselineValue: baselineCalibration?.calibratedAccuracy ?? null,
            currentValue: current.calibration.calibratedAccuracy,
        },
        {
            key: "calibration.thresholdAdjustedRankingQuality",
            baselineValue: baselineCalibration?.thresholdAdjustedRankingQuality ?? null,
            currentValue: current.calibration.thresholdAdjustedRankingQuality,
        },
        {
            key: "calibration.rationaleWeightedSignalStability",
            baselineValue: baselineCalibration?.rationaleWeightedSignalStability ?? null,
            currentValue: current.calibration.rationaleWeightedSignalStability,
        },
        {
            key: "ontology.ontologyHash",
            baselineValue: baseline.ontology?.ontologyHash || null,
            currentValue: current.ontology.ontologyHash,
        },
        {
            key: "ontology.valid",
            baselineValue: baseline.ontology?.valid === undefined
                ? null
                : baseline.ontology.valid
                    ? 1
                    : 0,
            currentValue: current.ontology.valid ? 1 : 0,
        },
        {
            key: "transferability.transferabilityScore",
            baselineValue: baseline.transferability?.transferabilityScore ?? null,
            currentValue: current.transferability.transferabilityScore,
        },
        {
            key: "fusion.profileHash",
            baselineValue: baseline.fusion?.profileHash || null,
            currentValue: current.fusion.profileHash,
        },
        {
            key: "fusion.fusedRankingQuality",
            baselineValue: baseline.fusion?.fusedRankingQuality ?? null,
            currentValue: current.fusion.fusedRankingQuality,
        },
        {
            key: "memory.memoryHash",
            baselineValue: baseline.memory?.memoryHash || null,
            currentValue: current.memory.memoryHash,
        },
        {
            key: "memory.versionId",
            baselineValue: baseline.memory?.versionId || null,
            currentValue: current.memory.versionId,
        },
        {
            key: "memory.highPriorityRecommendations",
            baselineValue: baseline.memory?.highPriorityRecommendations ?? null,
            currentValue: current.memory.highPriorityRecommendations,
        },
        {
            key: "memory.highSeverityConflicts",
            baselineValue: baseline.memory?.highSeverityConflicts ?? null,
            currentValue: current.memory.highSeverityConflicts,
        },
        {
            key: "globalGraph.graphHash",
            baselineValue: baseline.globalGraph?.graphHash || null,
            currentValue: current.globalGraph.graphHash,
        },
        {
            key: "globalGraph.harmonizationHash",
            baselineValue: baseline.globalGraph?.harmonizationHash || null,
            currentValue: current.globalGraph.harmonizationHash,
        },
        {
            key: "carrierAdapters.adapterHash",
            baselineValue: baseline.carrierAdapters?.adapterHash || null,
            currentValue: current.carrierAdapters.adapterHash,
        },
        {
            key: "carrierAdapters.versionId",
            baselineValue: baseline.carrierAdapters?.versionId || null,
            currentValue: current.carrierAdapters.versionId,
        },
        {
            key: "underwritingRules.rulesHash",
            baselineValue: baseline.underwritingRules?.rulesHash || null,
            currentValue: current.underwritingRules.rulesHash,
        },
        {
            key: "underwritingRules.outcomeHash",
            baselineValue: baseline.underwritingRules?.outcomeHash || null,
            currentValue: current.underwritingRules.outcomeHash,
        },
        {
            key: "riskFactors.riskFactorHash",
            baselineValue: baseline.riskFactors?.riskFactorHash || null,
            currentValue: current.riskFactors.riskFactorHash,
        },
        {
            key: "riskScoring.scoringHash",
            baselineValue: baseline.riskScoring?.scoringHash || null,
            currentValue: current.riskScoring.scoringHash,
        },
        {
            key: "underwritingDecision.decisionHash",
            baselineValue: baseline.underwritingDecision?.decisionHash || null,
            currentValue: current.underwritingDecision.decisionHash,
        },
        {
            key: "underwritingDecision.outcome",
            baselineValue: baseline.underwritingDecision?.outcome || null,
            currentValue: current.underwritingDecision.outcome,
        },
        {
            key: "submission.packageHash",
            baselineValue: baseline.submission?.packageHash || null,
            currentValue: current.submission.packageHash,
        },
        {
            key: "submission.status",
            baselineValue: baseline.submission?.status || null,
            currentValue: current.submission.status,
        },
    ];
    return checks
        .filter((item) => item.baselineValue !== item.currentValue)
        .map((item) => ({
        key: item.key,
        baselineValue: item.baselineValue,
        currentValue: item.currentValue,
    }));
}
function evaluateMappingQuality(input) {
    const payload = input.payload;
    const topN = Math.max(1, input.topN || 3);
    const fixtureId = input.fixtureId || payload.documentId || "unknown-fixture";
    const calibrationProfile = resolveCalibrationProfile(input);
    const inferredFamily = payload.formFamily || (0, familyClustering_1.classifyFormFamily)(payload, fixtureId);
    const familyId = input.familyId || input.expectations?.familyId || inferredFamily.familyId;
    const familyCalibration = (0, familyClustering_1.resolveFamilyCalibration)(calibrationProfile, familyId);
    const effectiveCalibrationProfile = {
        ...calibrationProfile,
        globalThresholds: familyCalibration.thresholds,
        signalWeights: familyCalibration.signalWeights,
        codeThresholdOverrides: familyCalibration.codeThresholdOverrides,
        lineage: familyCalibration.lineage,
    };
    const profileHash = buildCalibrationProfileHash(effectiveCalibrationProfile);
    const embeddingSignals = [];
    const lexicalSignals = [];
    const dictionarySignals = [];
    const heuristicSignals = [];
    const confidenceBuckets = new Map();
    const normalizedConfidenceValues = [];
    const normalizationDeltas = [];
    const normalizationFactors = [];
    const codeProfiles = new Map();
    const familyProfiles = new Map();
    const fields = payload.mappings
        .map((record) => {
        const expectation = findExpectationForRecord(record, input.expectations);
        const chosenCode = payload.decisionGraph.mappings[record.extractionBlockId]?.chosenCandidateCode ||
            record.mapping.chosen?.acordCode;
        const orderedCandidates = [...record.mapping.suggestions].sort((left, right) => right.confidenceScore - left.confidenceScore ||
            (right.semanticSimilarity || 0) - (left.semanticSimilarity || 0) ||
            (right.lexicalScore || 0) - (left.lexicalScore || 0) ||
            left.acordCode.localeCompare(right.acordCode));
        const topNCandidateCodes = orderedCandidates
            .slice(0, topN)
            .map((candidate) => candidate.acordCode);
        const chosenRank = chosenCode
            ? orderedCandidates.findIndex((candidate) => candidate.acordCode === chosenCode)
            : -1;
        const chosenCandidate = orderedCandidates.find((candidate) => candidate.acordCode === chosenCode) ||
            record.mapping.chosen;
        const chosenConfidence = chosenCandidate?.confidenceScore || 0;
        const thresholds = resolveThresholdForCode(effectiveCalibrationProfile, chosenCode);
        const appliedThreshold = thresholds.accepted;
        const lexical = chosenCandidate?.lexicalScore || 0;
        const embedding = chosenCandidate?.semanticSimilarity || 0;
        const dictionary = chosenCandidate?.dictionaryScore || 0;
        const heuristic = chosenCandidate?.heuristicScore || 0;
        const normalizedSignals = (0, crossFamilyNormalization_1.normalizeSignalsForFamily)({
            embedding,
            lexical,
            dictionary,
            heuristic,
        }, familyId);
        normalizationFactors.push(normalizedSignals.familyFactor);
        const normalizedConfidence = chosenCandidate?.normalizedConfidenceScore ?? chosenConfidence;
        normalizedConfidenceValues.push(normalizedConfidence);
        normalizationDeltas.push(normalizedConfidence - chosenConfidence);
        const disagreement = isRationaleDisagreement(lexical, embedding, dictionary, heuristic);
        const ontologyWarnings = chosenCandidate?.ontology?.warnings || [];
        const ontologyConstraintViolations = chosenCandidate?.ontology?.violatedConstraints || [];
        const warnings = [];
        if (chosenCode && chosenConfidence < appliedThreshold) {
            warnings.push("chosen-confidence-below-threshold");
        }
        if (disagreement) {
            warnings.push("rationale-signal-disagreement");
        }
        if (ontologyConstraintViolations.length > 0) {
            warnings.push("ontology-constraint-violation");
        }
        if (ontologyWarnings.length > 0) {
            warnings.push("ontology-warning");
        }
        if (chosenConfidence >= thresholds.review && chosenConfidence < appliedThreshold) {
            warnings.push("borderline-confidence");
        }
        for (const candidate of record.mapping.suggestions) {
            if (typeof candidate.semanticSimilarity === "number") {
                embeddingSignals.push(candidate.semanticSimilarity);
            }
            if (typeof candidate.lexicalScore === "number") {
                lexicalSignals.push(candidate.lexicalScore);
            }
            if (typeof candidate.dictionaryScore === "number") {
                dictionarySignals.push(candidate.dictionaryScore);
            }
            if (typeof candidate.heuristicScore === "number") {
                heuristicSignals.push(candidate.heuristicScore);
            }
        }
        const expectedCode = expectation?.expectedAcordCode;
        const exactMatch = Boolean(expectedCode && chosenCode === expectedCode);
        const topNHit = Boolean(expectedCode && topNCandidateCodes.includes(expectedCode));
        const associationCorrect = expectation?.expectedExtractionBlockId
            ? expectation.expectedExtractionBlockId === record.extractionBlockId
            : isAssociationInternallyConsistent(payload, record);
        const confidenceBucket = bucketConfidence(chosenConfidence);
        confidenceBuckets.set(confidenceBucket, (confidenceBuckets.get(confidenceBucket) || 0) + 1);
        if (chosenCode) {
            const aggregate = codeProfiles.get(chosenCode) || {
                confidences: [],
                belowThresholdCount: 0,
                disagreements: 0,
                threshold: appliedThreshold,
            };
            aggregate.confidences.push(chosenConfidence);
            if (chosenConfidence < appliedThreshold) {
                aggregate.belowThresholdCount += 1;
            }
            if (disagreement) {
                aggregate.disagreements += 1;
            }
            aggregate.threshold = appliedThreshold;
            codeProfiles.set(chosenCode, aggregate);
        }
        const family = classifyFormFamily(fixtureId);
        const familyAggregate = familyProfiles.get(family) || {
            confidences: [],
            belowThresholdCount: 0,
        };
        familyAggregate.confidences.push(chosenConfidence);
        if (chosenConfidence < appliedThreshold) {
            familyAggregate.belowThresholdCount += 1;
        }
        familyProfiles.set(family, familyAggregate);
        return {
            fieldId: record.fieldId || record.extractionBlockId,
            extractionBlockId: record.extractionBlockId,
            expectedAcordCode: expectedCode,
            chosenAcordCode: chosenCode,
            chosenConfidence: toFixedNumber(chosenConfidence),
            appliedThreshold: toFixedNumber(appliedThreshold),
            topNCandidateCodes,
            exactMatch,
            topNHit,
            chosenWithinTopN: chosenRank >= 0 && chosenRank < topN,
            chosenRank: chosenRank >= 0 ? chosenRank + 1 : null,
            associationCorrect,
            candidateCount: record.mapping.suggestions.length,
            rationaleDisagreement: disagreement,
            ontologyWarnings,
            ontologyConstraintViolations,
            warnings,
        };
    })
        .sort((left, right) => left.fieldId.localeCompare(right.fieldId));
    const expectedFields = fields.filter((field) => Boolean(field.expectedAcordCode));
    const exactMatches = expectedFields.filter((field) => field.exactMatch).length;
    const topNHits = expectedFields.filter((field) => field.topNHit).length;
    const associationScope = expectedFields.length ? expectedFields : fields;
    const associationCorrect = associationScope.filter((field) => field.associationCorrect).length;
    const chosenWithinTopN = fields.filter((field) => field.chosenWithinTopN).length;
    const lowConfidenceFields = fields
        .filter((field) => Boolean(field.chosenAcordCode) && field.chosenConfidence < field.appliedThreshold)
        .map((field) => field.fieldId)
        .sort((a, b) => a.localeCompare(b));
    const borderlineFields = fields
        .filter((field) => Boolean(field.chosenAcordCode) &&
        field.chosenConfidence >= Math.max(0, field.appliedThreshold - 0.1) &&
        field.chosenConfidence < field.appliedThreshold)
        .map((field) => field.fieldId)
        .sort((a, b) => a.localeCompare(b));
    const unstableSignals = fields
        .filter((field) => field.rationaleDisagreement)
        .map((field) => field.fieldId)
        .sort((a, b) => a.localeCompare(b));
    const calibratedAccepted = fields.filter((field) => field.chosenAcordCode && field.chosenConfidence >= field.appliedThreshold).length;
    const calibratedAccuracy = fields.length ? toFixedNumber(calibratedAccepted / fields.length) : 0;
    const rankingQualityTotal = fields.reduce((sum, field) => {
        if (!field.chosenAcordCode) {
            return sum;
        }
        const rankFactor = field.chosenRank ? 1 / field.chosenRank : 0;
        const thresholdFactor = field.appliedThreshold > 0 ? field.chosenConfidence / field.appliedThreshold : 0;
        return sum + clamp01(rankFactor * thresholdFactor);
    }, 0);
    const thresholdAdjustedRankingQuality = fields.length
        ? toFixedNumber(rankingQualityTotal / fields.length)
        : 0;
    const weights = effectiveCalibrationProfile.signalWeights;
    const weightTotal = Math.max(0.000001, weights.embedding + weights.lexical + weights.dictionary + weights.heuristic);
    const normalizedWeights = {
        embedding: weights.embedding / weightTotal,
        lexical: weights.lexical / weightTotal,
        dictionary: weights.dictionary / weightTotal,
        heuristic: weights.heuristic / weightTotal,
    };
    const weightedStability = fields.length
        ? fields.reduce((sum, field) => {
            if (!field.chosenAcordCode) {
                return sum;
            }
            const record = payload.mappings.find((item) => item.extractionBlockId === field.extractionBlockId);
            const candidate = record?.mapping.suggestions.find((item) => item.acordCode === field.chosenAcordCode);
            const weightedConfidence = (candidate?.semanticSimilarity || 0) * normalizedWeights.embedding +
                (candidate?.lexicalScore || 0) * normalizedWeights.lexical +
                (candidate?.dictionaryScore || 0) * normalizedWeights.dictionary +
                (candidate?.heuristicScore || 0) * normalizedWeights.heuristic;
            return sum + clamp01(weightedConfidence);
        }, 0)
        : 0;
    const rationaleWeightedSignalStability = fields.length
        ? toFixedNumber(weightedStability / fields.length)
        : 0;
    const mappedFields = fields.filter((field) => Boolean(field.chosenAcordCode)).length;
    const correctScope = expectedFields.length;
    const baselineTopNAccuracy = input.baseline?.coverage?.calibratedTopNAccuracy ?? null;
    const calibratedTopNAccuracy = expectedFields.length
        ? toFixedNumber(topNHits / expectedFields.length)
        : 0;
    const normalizationFactor = normalizationFactors.length
        ? safeAverage(normalizationFactors)
        : 1;
    const crossFamilyConfidenceDelta = normalizationDeltas.length
        ? safeAverage(normalizationDeltas)
        : 0;
    const coverage = {
        familyId,
        normalizationFactor,
        crossFamilyConfidenceDelta,
        fieldsTotal: fields.length,
        fieldsMapped: mappedFields,
        fieldsCorrect: exactMatches,
        fieldsLowConfidence: lowConfidenceFields.length,
        mappedRate: fields.length ? toFixedNumber(mappedFields / fields.length) : 0,
        correctRate: correctScope ? toFixedNumber(exactMatches / correctScope) : 0,
        lowConfidenceRate: mappedFields
            ? toFixedNumber(lowConfidenceFields.length / mappedFields)
            : 0,
        calibratedTopNAccuracy,
        baselineTopNAccuracy,
        calibratedTopNDelta: baselineTopNAccuracy === null
            ? null
            : toFixedNumber(calibratedTopNAccuracy - baselineTopNAccuracy),
    };
    const confidenceDistribution = Array.from(confidenceBuckets.entries())
        .map(([bucket, count]) => ({ bucket, count }))
        .sort((left, right) => left.bucket.localeCompare(right.bucket));
    const perCodeProfiles = Array.from(codeProfiles.entries())
        .map(([acordCode, aggregate]) => ({
        acordCode,
        fields: aggregate.confidences.length,
        avgConfidence: safeAverage(aggregate.confidences),
        minConfidence: toFixedNumber(Math.min(...aggregate.confidences)),
        maxConfidence: toFixedNumber(Math.max(...aggregate.confidences)),
        threshold: toFixedNumber(aggregate.threshold),
        belowThresholdCount: aggregate.belowThresholdCount,
        rationaleDisagreementRate: toFixedNumber(aggregate.disagreements / aggregate.confidences.length),
    }))
        .sort((left, right) => left.acordCode.localeCompare(right.acordCode));
    const biasByFormFamily = Array.from(familyProfiles.entries())
        .map(([formFamily, aggregate]) => ({
        formFamily,
        fields: aggregate.confidences.length,
        avgConfidence: safeAverage(aggregate.confidences),
        belowThresholdRate: toFixedNumber(aggregate.belowThresholdCount / aggregate.confidences.length),
    }))
        .sort((left, right) => left.formFamily.localeCompare(right.formFamily));
    const mappingDecisionHash = buildMappingDecisionHash(payload);
    const ontology = (0, ontology_1.getAcordOntology)();
    const ontologyMetadata = payload.ontologyAlignment || (0, ontology_1.getDefaultOntologyMetadata)();
    const selectedCodes = fields
        .map((field) => field.chosenAcordCode)
        .filter((code) => Boolean(code));
    const ontologyValidation = (0, ontology_1.validateOntologySelection)(selectedCodes);
    const transferReport = (0, crossFamilyNormalization_1.evaluateCrossFamilyNormalization)([
        { fixtureId, payload },
    ]);
    const transferability = {
        transferabilityScore: transferReport.transferabilityScore,
        confidenceDrift: transferReport.driftByFamily.length
            ? safeAverage(transferReport.driftByFamily.map((item) => item.normalizedConfidenceDelta))
            : 0,
        rationaleSignalDrift: transferReport.driftByFamily.length
            ? safeAverage(transferReport.driftByFamily.map((item) => item.rationaleSignalDelta))
            : 0,
        candidateStabilityDrift: transferReport.driftByFamily.length
            ? safeAverage(transferReport.driftByFamily.map((item) => item.candidateStabilityDelta))
            : 0,
    };
    const fusionReport = (0, semanticFusion_1.evaluateSemanticFusion)([
        {
            fixtureId,
            payload,
        },
    ], {
        fusionOverrides: payload.fusionOverrides || [],
    });
    const fusedConfidenceScore = fusionReport.profiles.length
        ? safeAverage(fusionReport.profiles.map((profile) => profile.fusedConfidenceScore))
        : 0;
    const semanticMemory = (0, semanticMemory_1.buildSemanticMemorySnapshot)([
        {
            fixtureId,
            payload,
        },
    ], {
        previousSnapshot: payload.semanticMemorySnapshot,
        decisions: payload.semanticMemoryDecisions || [],
    });
    const memoryRecommendations = (0, semanticMemory_1.generateSemanticMemoryRecommendations)(fusionReport, semanticMemory);
    const prioritizedConflicts = (0, semanticMemory_1.prioritizeConflictRecurrence)(fusionReport, semanticMemory);
    const memoryDrift = (0, semanticMemory_1.evaluateLongitudinalMemoryDrift)(input.baseline?.memory
        ? {
            generatedAt: "1970-01-01T00:00:00.000Z",
            versionId: input.baseline.memory.versionId,
            memoryHash: input.baseline.memory.memoryHash,
            sourceProfileHash: input.baseline.fusion.profileHash,
            sourceUnificationHash: input.baseline.fusion.unificationHash,
            sourceConflictHash: input.baseline.fusion.conflictHash,
            entries: [],
            lineage: input.baseline.memory.lineage,
        }
        : payload.semanticMemorySnapshot, semanticMemory);
    const globalGraph = (0, globalSemanticGraph_1.buildGlobalSemanticGraph)([
        {
            fixtureId,
            payload,
        },
    ], {
        previousSnapshot: payload.globalSemanticGraphSnapshot,
        memorySnapshot: semanticMemory,
        edgeOverrides: payload.globalSemanticGraphEdgeOverrides || [],
        mergeDecisions: payload.globalSemanticGraphMergeDecisions || [],
    });
    const graphInference = (0, globalSemanticGraph_1.evaluateGraphInference)(payload, globalGraph.snapshot);
    const globalGraphDrift = (0, globalSemanticGraph_1.evaluateGlobalSemanticDrift)(payload.globalSemanticGraphSnapshot, globalGraph.snapshot);
    const carrierAdapterMappings = (0, carrierAdapters_1.evaluateCarrierAdapterMappings)(payload, {
        familyId,
        overrides: payload.carrierAdapterOverrides || [],
    });
    const carrierSnapshot = (0, carrierAdapters_1.buildCarrierAdapterSnapshot)([
        {
            fixtureId,
            payload,
        },
    ], {
        previousSnapshot: payload.carrierAdapterSnapshot,
        overrides: payload.carrierAdapterOverrides || [],
    });
    const carrierDrift = (0, carrierAdapters_1.evaluateCarrierAdapterDrift)(payload.carrierAdapterSnapshot, carrierSnapshot);
    const underwritingReport = (0, underwritingRules_1.evaluateUnderwritingRules)(payload, {
        familyId,
        overrides: payload.underwritingRuleOverrides || [],
    });
    const underwritingSnapshot = (0, underwritingRules_1.buildUnderwritingRuleSnapshot)(payload, {
        previousSnapshot: payload.underwritingRuleSnapshot,
        decisions: payload.underwritingRuleDecisions || [],
        overrides: payload.underwritingRuleOverrides || [],
    });
    const underwritingDrift = (0, underwritingRules_1.evaluateUnderwritingRuleDrift)(payload.underwritingRuleSnapshot, underwritingSnapshot);
    const riskSignals = (0, riskDecisionIntelligence_1.extractRiskFactors)(payload, {
        overrides: payload.riskFactorOverrides || [],
    });
    const riskFactorSnapshot = (0, riskDecisionIntelligence_1.buildRiskFactorSnapshot)(payload, {
        previousSnapshot: payload.riskFactorSnapshot,
        overrides: payload.riskFactorOverrides || [],
    });
    const riskScoringBreakdown = (0, riskDecisionIntelligence_1.evaluateRiskScoring)(payload, {
        signals: riskSignals,
    });
    const riskScoringSnapshot = (0, riskDecisionIntelligence_1.buildRiskScoringSnapshot)(payload, {
        previousSnapshot: payload.riskScoringSnapshot,
        signals: riskSignals,
    });
    const underwritingDecisionReport = (0, riskDecisionIntelligence_1.evaluateUnderwritingDecision)(payload, {
        riskSignals,
        riskScoring: riskScoringBreakdown,
        overrides: payload.underwritingDecisionOverrides || [],
    });
    const underwritingDecisionSnapshot = (0, riskDecisionIntelligence_1.buildUnderwritingDecisionSnapshot)(payload, {
        previousSnapshot: payload.underwritingDecisionSnapshot,
        riskSignals,
        riskScoring: riskScoringBreakdown,
        overrides: payload.underwritingDecisionOverrides || [],
        decisions: payload.underwritingDecisionDecisions || [],
    });
    const underwritingDecisionDrift = (0, riskDecisionIntelligence_1.evaluateUnderwritingDecisionDrift)({
        riskFactorSnapshot: input.baseline?.riskFactors
            ? {
                generatedAt: "1970-01-01T00:00:00.000Z",
                versionId: input.baseline.riskFactors.versionId,
                riskFactorHash: input.baseline.riskFactors.riskFactorHash,
                signalCount: input.baseline.riskFactors.signalCount,
                categoryCounts: input.baseline.riskFactors.categoryCounts,
                lineage: input.baseline.riskFactors.lineage,
            }
            : payload.riskFactorSnapshot,
        riskScoringSnapshot: input.baseline?.riskScoring
            ? {
                generatedAt: "1970-01-01T00:00:00.000Z",
                versionId: input.baseline.riskScoring.versionId,
                scoringHash: input.baseline.riskScoring.scoringHash,
                weightedScore: input.baseline.riskScoring.weightedScore,
                classification: input.baseline.riskScoring.classification,
                carrierClass: input.baseline.riskScoring.carrierClass,
                lineage: input.baseline.riskScoring.lineage,
            }
            : payload.riskScoringSnapshot,
        underwritingRuleSnapshot: payload.underwritingRuleSnapshot,
        underwritingDecisionSnapshot: payload.underwritingDecisionSnapshot,
        underwritingDecisionOverrides: payload.underwritingDecisionOverrides || [],
    }, {
        riskFactorSnapshot,
        riskScoringSnapshot,
        underwritingRuleSnapshot: underwritingSnapshot,
        underwritingDecisionSnapshot,
        underwritingDecisionOverrides: payload.underwritingDecisionOverrides || [],
    });
    const submissionDrift = (0, submissionIntelligence_1.evaluateSubmissionDrift)({
        submissionPackage: input.baseline?.submission
            ? {
                packageId: input.baseline.submission.packageId,
                generatedAt: "1970-01-01T00:00:00.000Z",
                acordXml: "",
                acordXmlHash: "",
                carrierPayloads: [],
                riskReport: {
                    riskFactorHash: "",
                    scoringHash: "",
                    weightedScore: 0,
                    classification: "low",
                },
                decisionReport: {
                    decisionHash: "",
                    outcome: "accept",
                    firedRuleCount: 0,
                },
                packageHash: input.baseline.submission.packageHash,
                lineage: input.baseline.submission.lineage,
            }
            : payload.submissionPackage,
        submissionStatus: payload.submissionStatus,
        carrierSubmissionResponse: payload.carrierSubmissionResponse,
        underwritingDecisionHash: payload.underwritingDecisionSnapshot?.decisionHash,
    }, {
        submissionPackage: payload.submissionPackage,
        submissionStatus: payload.submissionStatus,
        carrierSubmissionResponse: payload.carrierSubmissionResponse,
        underwritingDecisionHash: underwritingDecisionSnapshot.decisionHash,
    });
    const fallbackSeed = stableSerialize({
        mappingDecisionHash,
        expectedFields: expectedFields.length,
        exactMatches,
        topNHits,
    });
    const report = {
        fixtureId,
        generatedAt: new Date().toISOString(),
        ontology: {
            ontologyId: ontologyMetadata.ontologyId || ontology.ontologyId,
            ontologyVersion: ontologyMetadata.ontologyVersion || ontology.version,
            ontologyHash: ontologyMetadata.ontologyHash || ontology.hash,
            selectedCodeCount: selectedCodes.length,
            valid: ontologyValidation.valid,
            issues: ontologyValidation.issues,
        },
        transferability,
        fusion: {
            profileHash: fusionReport.profileHash,
            unificationHash: fusionReport.unificationHash,
            conflictHash: fusionReport.conflictHash,
            fusedConfidenceScore,
            fusedRankingQuality: fusionReport.fusedRankingQuality,
            fusedRationaleDistribution: fusionReport.fusedRationaleDistribution,
            fusedConsistency: fusionReport.fusedConsistency,
            lineage: fusionReport.lineage,
        },
        memory: {
            versionId: semanticMemory.versionId,
            memoryHash: semanticMemory.memoryHash,
            entryCount: semanticMemory.entries.length,
            recommendationCount: memoryRecommendations.length,
            highPriorityRecommendations: memoryRecommendations.filter((recommendation) => recommendation.priority === "high").length,
            highSeverityConflicts: prioritizedConflicts.filter((conflict) => conflict.priority === "high").length,
            longitudinalDrift: {
                hasDrift: memoryDrift.hasDrift,
                driftHash: memoryDrift.driftHash,
                confidenceDrift: memoryDrift.confidenceDrift,
                conflictRecurrenceDelta: memoryDrift.conflictRecurrenceDelta,
                stabilityDrift: memoryDrift.stabilityDrift,
            },
            lineage: semanticMemory.lineage,
        },
        globalGraph: {
            versionId: globalGraph.snapshot.versionId,
            graphHash: globalGraph.snapshot.graphHash,
            harmonizationHash: globalGraph.snapshot.harmonizationHash,
            nodeCount: globalGraph.snapshot.nodeCount,
            edgeCount: globalGraph.snapshot.edgeCount,
            compatibilityViolations: globalGraph.harmonization.compatibilityViolations.length,
            inferredMappings: graphInference.filter((item) => item.inferredCodes.length > 0).length,
            abstainedByGraph: graphInference.filter((item) => item.abstain).length,
            drift: {
                hasDrift: globalGraphDrift.hasDrift,
                driftHash: globalGraphDrift.driftHash,
            },
            lineage: globalGraph.snapshot.lineage,
        },
        carrierAdapters: {
            versionId: carrierSnapshot.versionId,
            adapterHash: carrierSnapshot.adapterHash,
            carrierCount: carrierSnapshot.carrierIds.length,
            mappingCount: carrierAdapterMappings.length,
            drift: {
                hasDrift: carrierDrift.hasDrift,
                driftHash: carrierDrift.driftHash,
            },
            lineage: carrierSnapshot.lineage,
        },
        underwritingRules: {
            versionId: underwritingSnapshot.versionId,
            rulesHash: underwritingSnapshot.rulesHash,
            outcomeHash: underwritingSnapshot.outcomeHash,
            conflictCount: underwritingReport.conflicts.length,
            blockerCount: underwritingSnapshot.blockerCount,
            drift: {
                hasDrift: underwritingDrift.hasDrift,
                driftHash: underwritingDrift.driftHash,
            },
            lineage: underwritingSnapshot.lineage,
        },
        riskFactors: {
            versionId: riskFactorSnapshot.versionId,
            riskFactorHash: riskFactorSnapshot.riskFactorHash,
            signalCount: riskFactorSnapshot.signalCount,
            categoryCounts: riskFactorSnapshot.categoryCounts,
            lineage: riskFactorSnapshot.lineage,
        },
        riskScoring: {
            versionId: riskScoringSnapshot.versionId,
            scoringHash: riskScoringSnapshot.scoringHash,
            weightedScore: riskScoringSnapshot.weightedScore,
            classification: riskScoringSnapshot.classification,
            carrierClass: riskScoringSnapshot.carrierClass,
            lineage: riskScoringSnapshot.lineage,
        },
        underwritingDecision: {
            versionId: underwritingDecisionSnapshot.versionId,
            decisionHash: underwritingDecisionSnapshot.decisionHash,
            outcome: underwritingDecisionReport.outcome,
            firedRuleCount: underwritingDecisionReport.firedRules.length,
            overrideApplied: underwritingDecisionSnapshot.overrideApplied,
            drift: {
                hasDrift: underwritingDecisionDrift.hasDrift,
                driftHash: underwritingDecisionDrift.driftHash,
            },
            lineage: underwritingDecisionSnapshot.lineage,
        },
        submission: {
            packageId: payload.submissionPackage?.packageId || "submission-unavailable",
            packageHash: payload.submissionPackage?.packageHash || "",
            carrierId: payload.submissionPackage?.carrierPayloads?.[0]?.carrierId ||
                payload.submissionStatus?.carrierId ||
                "unknown",
            status: payload.submissionStatus?.status || "draft",
            responseHash: payload.carrierSubmissionResponse?.responseHash || "",
            drift: {
                hasDrift: submissionDrift.hasDrift,
                driftHash: submissionDrift.driftHash,
            },
            lineage: [
                ...(payload.submissionPackage?.lineage || []),
                ...(payload.submissionStatus?.lineage || []),
                ...(payload.carrierSubmissionResponse?.lineage || []),
            ],
        },
        formFamily: {
            ...inferredFamily,
            familyId,
            familyLabel: familyId === inferredFamily.familyId ? inferredFamily.familyLabel : familyId,
            evidence: familyId === inferredFamily.familyId
                ? inferredFamily.evidence
                : [...inferredFamily.evidence, `reviewer-family:${familyId}`].sort(),
        },
        coverage,
        totals: {
            fieldsEvaluated: fields.length,
            expectedFields: expectedFields.length,
            exactMatches,
            exactAccuracy: expectedFields.length
                ? toFixedNumber(exactMatches / expectedFields.length)
                : 0,
            topNHits,
            topNAccuracy: expectedFields.length
                ? toFixedNumber(topNHits / expectedFields.length)
                : 0,
            chosenWithinTopN,
            chosenWithinTopNRate: fields.length
                ? toFixedNumber(chosenWithinTopN / fields.length)
                : 0,
            associationCorrect,
            associationAccuracy: associationScope.length
                ? toFixedNumber(associationCorrect / associationScope.length)
                : 0,
        },
        rationaleSignalDistribution: {
            embedding: summarize(embeddingSignals),
            lexical: summarize(lexicalSignals),
            dictionary: summarize(dictionarySignals),
            heuristic: summarize(heuristicSignals),
        },
        artifactHashes: {
            mappingDecisionHash,
            uiSchemaHash: resolveArtifactHash(payload.schemaArtifacts || [], "ui", fallbackSeed),
            jsonSchemaHash: resolveArtifactHash(payload.schemaArtifacts || [], "json", fallbackSeed),
            xmlHash: resolveArtifactHash(payload.schemaArtifacts || [], "xml", fallbackSeed),
        },
        fields,
        calibration: {
            profileId: effectiveCalibrationProfile.profileId,
            profileVersion: effectiveCalibrationProfile.version,
            profileHash,
            calibratedAccuracy,
            thresholdAdjustedRankingQuality,
            rationaleWeightedSignalStability,
            confidenceDistribution,
            lowConfidenceFields,
            borderlineFields,
            unstableSignals,
            perCodeProfiles,
            biasByFormFamily,
            lineage: familyCalibration.lineage,
            suggestedOverrides: (0, familyClustering_1.suggestFamilyCalibrationOverrides)(payload, effectiveCalibrationProfile, {
                ...inferredFamily,
                familyId,
            }),
            profileDrift: {
                hasDrift: false,
                baselineHash: input.baseline?.calibration?.profileHash || null,
                currentHash: profileHash,
            },
        },
        drift: {
            hasDrift: false,
            differences: [],
        },
    };
    report.calibration.profileDrift = {
        hasDrift: Boolean(input.baseline?.calibration?.profileHash) &&
            input.baseline?.calibration?.profileHash !== profileHash,
        baselineHash: input.baseline?.calibration?.profileHash || null,
        currentHash: profileHash,
    };
    const differences = compareReports(input.baseline, report);
    report.drift = {
        hasDrift: differences.length > 0,
        differences,
    };
    return report;
}
function parseAttributes(rawAttributes) {
    const attributes = {};
    const expression = /([A-Za-z_:][A-Za-z0-9_.:-]*)\s*=\s*"([^"]*)"/g;
    let match = expression.exec(rawAttributes);
    while (match) {
        attributes[match[1]] = match[2];
        match = expression.exec(rawAttributes);
    }
    return attributes;
}
function decodeXml(value) {
    return value
        .replace(/&apos;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&gt;/g, ">")
        .replace(/&lt;/g, "<")
        .replace(/&amp;/g, "&");
}
function parseAcordXmlNodes(xml) {
    const submission = xml.match(/<Submission\b[^>]*>([\s\S]*?)<\/Submission>/i);
    if (!submission) {
        return [];
    }
    const body = submission[1];
    const nodes = [];
    const expression = /<([A-Za-z_][A-Za-z0-9_.:-]*)\b([^>]*)>([\s\S]*?)<\/\1>/g;
    let match = expression.exec(body);
    while (match) {
        const tag = match[1];
        const attributes = parseAttributes(match[2] || "");
        const value = decodeXml((match[3] || "").trim());
        nodes.push({ tag, attributes, value });
        match = expression.exec(body);
    }
    return nodes;
}
function normalizeCode(code) {
    return code.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
}
function inferExpectedType(acordCode) {
    const normalized = normalizeCode(acordCode);
    if (normalized.includes("date") || normalized.includes("time")) {
        return "date";
    }
    if (normalized.includes("amount") ||
        normalized.includes("premium") ||
        normalized.includes("count") ||
        normalized.includes("number") ||
        normalized.includes("limit")) {
        return "number";
    }
    if (normalized.includes("indicator") ||
        normalized.startsWith("is") ||
        normalized.endsWith("flag")) {
        return "boolean";
    }
    return "string";
}
function isDateLike(value) {
    if (!value) {
        return true;
    }
    return /(\d{4}-\d{2}-\d{2})|(\d{1,2}\/\d{1,2}\/\d{2,4})/.test(value);
}
function isBooleanLike(value) {
    if (!value) {
        return true;
    }
    return /^(true|false|yes|no|0|1)$/i.test(value);
}
function isNumericLike(value) {
    if (!value) {
        return true;
    }
    return /^-?\d+(\.\d+)?$/.test(value.trim());
}
function findAcceptedAcordCodes(payload) {
    const codes = [];
    for (const record of payload.mappings) {
        const mappingNode = payload.decisionGraph.mappings[record.extractionBlockId];
        if (mappingNode?.decision !== "accepted") {
            continue;
        }
        const chosenCode = mappingNode.chosenCandidateCode || record.mapping.chosen?.acordCode || "";
        if (!chosenCode) {
            continue;
        }
        const decision = mappingNode.candidateDecisions?.[chosenCode];
        if (decision === "rejected") {
            continue;
        }
        codes.push(chosenCode);
    }
    return Array.from(new Set(codes)).sort((a, b) => a.localeCompare(b));
}
function classifyFormFamily(fixtureId) {
    const normalized = fixtureId.toLowerCase();
    if (normalized.includes("contractor")) {
        return "contractors";
    }
    if (normalized.includes("acord") || normalized.includes("125")) {
        return "acord-125";
    }
    return "general";
}
function validateAcordXmlSemantic(payload, xml, fixtureId) {
    const resolvedFixtureId = fixtureId || payload.documentId || "unknown-fixture";
    const nodes = parseAcordXmlNodes(xml);
    const issues = [];
    const crossFieldWarnings = [];
    const acceptedCodes = findAcceptedAcordCodes(payload);
    const ontologyValidation = (0, ontology_1.validateOntologySelection)(acceptedCodes);
    if (!/<ACORD>/i.test(xml) || !/<\/ACORD>/i.test(xml)) {
        issues.push({
            severity: "error",
            code: "missing-root",
            message: "ACORD root element is missing.",
            path: "/ACORD",
        });
    }
    if (!/<Submission\b/i.test(xml) || !/<\/Submission>/i.test(xml)) {
        issues.push({
            severity: "error",
            code: "missing-submission",
            message: "Submission node is missing under ACORD.",
            path: "/ACORD/Submission",
        });
    }
    const byTag = new Map();
    for (const node of nodes) {
        const list = byTag.get(node.tag) || [];
        list.push(node);
        byTag.set(node.tag, list);
        const expectedType = inferExpectedType(node.tag);
        if (expectedType === "date" && !isDateLike(node.value)) {
            issues.push({
                severity: "error",
                code: "type-date",
                message: `${node.tag} expects a date-like value.`,
                path: `/ACORD/Submission/${node.tag}`,
            });
        }
        if (expectedType === "number" && !isNumericLike(node.value)) {
            issues.push({
                severity: "error",
                code: "type-number",
                message: `${node.tag} expects a numeric value.`,
                path: `/ACORD/Submission/${node.tag}`,
            });
        }
        if (expectedType === "boolean" && !isBooleanLike(node.value)) {
            issues.push({
                severity: "error",
                code: "type-boolean",
                message: `${node.tag} expects a boolean-like value.`,
                path: `/ACORD/Submission/${node.tag}`,
            });
        }
        if (/state|province/i.test(node.tag) && node.value && !/^[A-Za-z]{2}$/.test(node.value)) {
            issues.push({
                severity: "warning",
                code: "enum-state",
                message: `${node.tag} should typically use a two-letter region code.`,
                path: `/ACORD/Submission/${node.tag}`,
            });
        }
    }
    for (const code of acceptedCodes) {
        if (!byTag.has(code.replace(/[^A-Za-z0-9_.-]/g, "_"))) {
            issues.push({
                severity: "error",
                code: "missing-required-node",
                message: `Accepted ACORD code ${code} is not represented in exported XML.`,
                path: `/ACORD/Submission/${code}`,
            });
        }
    }
    for (const issue of ontologyValidation.issues) {
        issues.push({
            severity: issue.type === "required-sibling-missing" ? "warning" : "error",
            code: `ontology-${issue.type}`,
            message: issue.message,
            path: `/ACORD/Submission/${issue.acordCode}`,
        });
    }
    const cardinalityOnePatterns = [
        /namedinsured/i,
        /applicant.*name/i,
        /business.*name/i,
    ];
    for (const [tag, entries] of byTag.entries()) {
        if (cardinalityOnePatterns.some((pattern) => pattern.test(tag)) && entries.length > 1) {
            issues.push({
                severity: "warning",
                code: "cardinality-max-1",
                message: `${tag} appears ${entries.length} times but is expected to be singular.`,
                path: `/ACORD/Submission/${tag}`,
            });
        }
    }
    const hasApplicant = Array.from(byTag.keys()).some((tag) => /applicant/i.test(tag));
    const hasApplicantAddress = Array.from(byTag.keys()).some((tag) => /applicant/i.test(tag) && /address|city|state|postal|zip/i.test(tag));
    if (hasApplicant && !hasApplicantAddress) {
        crossFieldWarnings.push("Applicant information exists without applicant address fields.");
        issues.push({
            severity: "warning",
            code: "dependency-applicant-address",
            message: "Applicant information requires at least one applicant address-related node.",
            path: "/ACORD/Submission",
        });
    }
    const semanticSeed = stableSerialize(nodes
        .map((node) => ({
        tag: node.tag,
        value: node.value,
    }))
        .sort((left, right) => `${left.tag}:${left.value}`.localeCompare(`${right.tag}:${right.value}`)));
    return {
        fixtureId: resolvedFixtureId,
        generatedAt: new Date().toISOString(),
        structuralHash: hashString(stableSerialize(nodes.map((node) => node.tag).sort())),
        semanticHash: hashString(semanticSeed),
        nodeCount: nodes.length,
        codes: Array.from(new Set(nodes.map((node) => node.tag))).sort((a, b) => a.localeCompare(b)),
        issues,
        crossFieldWarnings,
        isValid: !issues.some((issue) => issue.severity === "error"),
    };
}
function diffAcordXmlSemantics(baseline, current) {
    const differences = [];
    if (baseline.semanticHash !== current.semanticHash) {
        differences.push({
            severity: "warning",
            code: "semantic-hash-drift",
            message: "Semantic XML hash changed.",
            path: "/ACORD/Submission",
        });
    }
    if (baseline.structuralHash !== current.structuralHash) {
        differences.push({
            severity: "warning",
            code: "structural-hash-drift",
            message: "Structural XML hash changed.",
            path: "/ACORD/Submission",
        });
    }
    const baselineCodes = new Set(baseline.codes);
    const currentCodes = new Set(current.codes);
    for (const code of baselineCodes) {
        if (!currentCodes.has(code)) {
            differences.push({
                severity: "error",
                code: "code-removed",
                message: `Code removed from XML: ${code}`,
                path: `/ACORD/Submission/${code}`,
            });
        }
    }
    for (const code of currentCodes) {
        if (!baselineCodes.has(code)) {
            differences.push({
                severity: "warning",
                code: "code-added",
                message: `Code added to XML: ${code}`,
                path: `/ACORD/Submission/${code}`,
            });
        }
    }
    return {
        hasDrift: differences.length > 0,
        differences,
        baselineSemanticHash: baseline.semanticHash,
        currentSemanticHash: current.semanticHash,
    };
}
function evaluateMultiDocumentConsistency(input) {
    const calibrationProfile = input.calibrationProfile || input.documents[0]?.payload.calibrationProfile || createDefaultCalibrationProfile();
    const codeMap = new Map();
    for (const document of input.documents) {
        const formFamily = document.payload.formFamily?.familyId ||
            (0, familyClustering_1.classifyFormFamily)(document.payload, document.fixtureId).familyId;
        for (const record of document.payload.mappings) {
            const node = document.payload.decisionGraph.mappings[record.extractionBlockId];
            if (node?.decision !== "accepted") {
                continue;
            }
            const chosenCode = node.chosenCandidateCode || record.mapping.chosen?.acordCode;
            if (!chosenCode) {
                continue;
            }
            const candidate = record.mapping.suggestions.find((item) => item.acordCode === chosenCode) ||
                record.mapping.chosen;
            const metrics = {
                fixtureId: document.fixtureId,
                confidence: candidate?.confidenceScore || 0,
                lexical: candidate?.lexicalScore || 0,
                embedding: candidate?.semanticSimilarity || 0,
                dictionary: candidate?.dictionaryScore || 0,
                heuristic: candidate?.heuristicScore || 0,
                formFamily,
            };
            const current = codeMap.get(chosenCode) || [];
            current.push(metrics);
            codeMap.set(chosenCode, current);
        }
    }
    const fields = [];
    const lowConfidenceFields = [];
    const disagreements = [];
    for (const [acordCode, entries] of codeMap.entries()) {
        const confidences = entries.map((entry) => entry.confidence);
        const avgConfidence = safeAverage(confidences);
        const minConfidence = toFixedNumber(Math.min(...confidences));
        const maxConfidence = toFixedNumber(Math.max(...confidences));
        const confidenceDelta = toFixedNumber(maxConfidence - minConfidence);
        const thresholds = resolveThresholdForCode(calibrationProfile, acordCode);
        const lowConfidenceRate = toFixedNumber(entries.filter((entry) => entry.confidence < thresholds.accepted).length / entries.length);
        const rationaleDisagreement = entries.some((entry) => {
            const lexicalVsEmbedding = Math.abs(entry.lexical - entry.embedding);
            return lexicalVsEmbedding > 0.45;
        });
        if (avgConfidence < thresholds.accepted || lowConfidenceRate > 0.35) {
            lowConfidenceFields.push(acordCode);
        }
        if (rationaleDisagreement || confidenceDelta > 0.35) {
            disagreements.push(acordCode);
        }
        fields.push({
            acordCode,
            documents: entries.length,
            avgConfidence,
            minConfidence,
            maxConfidence,
            confidenceDelta,
            rationaleDisagreement,
            lowConfidenceRate,
        });
    }
    const familyMap = new Map();
    for (const entries of codeMap.values()) {
        for (const entry of entries) {
            const values = familyMap.get(entry.formFamily) || [];
            values.push(entry.confidence);
            familyMap.set(entry.formFamily, values);
        }
    }
    const biasByFormFamily = Array.from(familyMap.entries())
        .map(([formFamily, values]) => ({
        formFamily,
        sampleCount: values.length,
        avgConfidence: safeAverage(values),
        lowConfidenceRate: toFixedNumber(values.filter((value) => value < calibrationProfile.globalThresholds.accepted).length / values.length),
    }))
        .sort((left, right) => left.formFamily.localeCompare(right.formFamily));
    const consistencyHash = hashString(stableSerialize({
        fields: fields
            .map((field) => ({
            acordCode: field.acordCode,
            avgConfidence: field.avgConfidence,
            confidenceDelta: field.confidenceDelta,
            lowConfidenceRate: field.lowConfidenceRate,
        }))
            .sort((left, right) => left.acordCode.localeCompare(right.acordCode)),
        biasByFormFamily,
    }));
    const normalizationReport = (0, crossFamilyNormalization_1.evaluateCrossFamilyNormalization)(input.documents);
    const crossFamilyDrift = {
        confidence: normalizationReport.driftByFamily.length
            ? safeAverage(normalizationReport.driftByFamily.map((item) => Math.abs(item.normalizedConfidenceDelta)))
            : 0,
        rationaleSignals: normalizationReport.driftByFamily.length
            ? safeAverage(normalizationReport.driftByFamily.map((item) => Math.abs(item.rationaleSignalDelta)))
            : 0,
        chosenCandidateStability: normalizationReport.driftByFamily.length
            ? safeAverage(normalizationReport.driftByFamily.map((item) => Math.abs(item.candidateStabilityDelta)))
            : 0,
    };
    return {
        generatedAt: new Date().toISOString(),
        documentCount: input.documents.length,
        consistencyHash,
        transferabilityScore: normalizationReport.transferabilityScore,
        crossFamilyDrift,
        fields: fields.sort((left, right) => left.acordCode.localeCompare(right.acordCode)),
        biasByFormFamily,
        lowConfidenceFields: Array.from(new Set(lowConfidenceFields)).sort((a, b) => a.localeCompare(b)),
        disagreements: Array.from(new Set(disagreements)).sort((a, b) => a.localeCompare(b)),
        drift: {
            hasDrift: false,
            differences: [],
        },
    };
}
