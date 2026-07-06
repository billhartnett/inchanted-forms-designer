"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLastReducerDebugSnapshot = getLastReducerDebugSnapshot;
exports.mapBlocksToAcord = mapBlocksToAcord;
const acordDictionary_1 = require("./acordDictionary");
const supervision_1 = require("../../../wave8/supervision");
const acordTaxonomy_1 = require("./acordTaxonomy");
const embeddings_1 = require("./embeddings");
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const acord_1 = require("shared/acord");
const quality_1 = require("shared/quality");
const geometryArchitectureScaffold_1 = require("./wave5/geometryArchitectureScaffold");
const categoryModeArchitectureScaffold_1 = require("./wave5/categoryModeArchitectureScaffold");
const reflowArchitectureScaffold_1 = require("./wave5/reflowArchitectureScaffold");
const semanticGeometryFusionIntegrationScaffold_1 = require("./wave5/semanticGeometryFusionIntegrationScaffold");
const geometryModeDiagnostics_1 = require("./wave5/geometryModeDiagnostics");
const categoryModeDiagnostics_1 = require("./wave5/categoryModeDiagnostics");
const reflowModeDiagnostics_1 = require("./wave5/reflowModeDiagnostics");
const REDUCER_DEBUG_BLOCK_LIMIT = 20;
let lastReducerDebugSnapshot = {
    timestamp: new Date(0).toISOString(),
    totalBlocks: 0,
    capturedBlocks: 0,
    entries: [],
};
function getLastReducerDebugSnapshot() {
    return lastReducerDebugSnapshot;
}
const SCORE_PRECISION = 6;
const LAYOUTLM_PRIMARY_TOP_K = Math.max(1, Number(process.env.LAYOUTLM_PRIMARY_TOP_K || 4));
const WAVE49_TELEMETRY_ENABLED = process.env.WAVE49_TELEMETRY_ENABLED === "1";
const WAVE44_FUSION_ENABLED = process.env.WAVE44_FUSION_ENABLED !== "0";
const WAVE44_GATE_ENABLED = process.env.WAVE44_GATE_ENABLED !== "0";
const WAVE44_CATEGORY_PRUNING_ENABLED = process.env.WAVE44_CATEGORY_PRUNING_ENABLED !== "0";
const DEFAULT_WAVE44_FUSION = {
    category: 0.38,
    heuristic: 0.12,
    geometry: 0.2,
    ontology: 0.15,
    semantic: 0.1,
    dictionary: 0.03,
    lexical: 0.02,
};
const WAVE8_USABILITY_MODE = process.env.WAVE8_USABILITY_MODE !== "0";
const WAVE8_CONFIDENCE_FALLBACK_THRESHOLD = Math.max(0, Math.min(1, Number(process.env.WAVE8_CONFIDENCE_FALLBACK_THRESHOLD || 0.3)));
const WAVE8_OVERLAP_IOU_THRESHOLD = Math.max(0, Math.min(1, Number(process.env.WAVE8_OVERLAP_IOU_THRESHOLD || 0.68)));
const WAVE8_OVERLAP_SUPPRESSION_MARGIN = Math.max(0, Math.min(1, Number(process.env.WAVE8_OVERLAP_SUPPRESSION_MARGIN || 0.14)));
const WAVE8_MIN_CONFIDENCE_FOR_RETAIN = Math.max(0, Math.min(1, Number(process.env.WAVE8_MIN_CONFIDENCE_FOR_RETAIN || 0.26)));
const WAVE8_GATE_MIN_CONFIDENCE = Math.max(0, Math.min(1, Number(process.env.WAVE8_GATE_MIN_CONFIDENCE || 0.3)));
const WAVE8_GATE_MIN_SEMANTIC_CONSISTENCY = Math.max(0, Math.min(1, Number(process.env.WAVE8_GATE_MIN_SEMANTIC_CONSISTENCY || 0.24)));
const WAVE8_GATE_MIN_DICTIONARY_CONSISTENCY = Math.max(0, Math.min(1, Number(process.env.WAVE8_GATE_MIN_DICTIONARY_CONSISTENCY || 0.2)));
const WAVE8_GATE_MIN_CATEGORY_CONSISTENCY = Math.max(0, Math.min(1, Number(process.env.WAVE8_GATE_MIN_CATEGORY_CONSISTENCY || 0.22)));
const WAVE8_HEADER_TOP_BAND_Y = Math.max(0, Number(process.env.WAVE8_HEADER_TOP_BAND_Y || 120));
const WAVE8_HEADER_STRICT_MIN_CONSISTENCY = Math.max(0, Math.min(1, Number(process.env.WAVE8_HEADER_STRICT_MIN_CONSISTENCY || 0.4)));
const WAVE8_PERMISSIVE_FUSION_THRESHOLD = Math.max(0, Math.min(1, Number(process.env.WAVE8_PERMISSIVE_FUSION_THRESHOLD || 0.15)));
const WAVE8_MIN_FUSION_WEIGHT = 0.01;
const DEFAULT_WAVE44_GATE = {
    acceptedGlobalRelax: 0.04,
    reviewGlobalRelax: 0.04,
    rejectedGlobalRelax: 0.02,
    acceptedLowerForCategory: 0.03,
    reviewLowerForCategory: 0.035,
    reviewRaiseForLowCategory: 0.005,
    rejectRaiseForLowCategory: 0,
    acceptedLowerForLowCategoryFallback: 0.02,
    reviewLowerForLowCategoryFallback: 0.015,
    acceptedLowerForHeuristicRescue: 0.03,
    reviewLowerForHeuristicRescue: 0.03,
    rejectedLowerForHeuristicRescue: 0.015,
    acceptedLowerForGeometryPriority: 0.025,
    reviewLowerForGeometryPriority: 0.025,
    geometryBonus: 0.025,
    ontologyBonus: 0.02,
};
function loadWave44Fusion() {
    const configuredPath = process.env.WAVE44_FUSION_PATH || node_path_1.default.resolve(__dirname, "../../../../training-data/acord-labeled/wave4_4_fusion.json");
    try {
        if (!node_fs_1.default.existsSync(configuredPath)) {
            return DEFAULT_WAVE44_FUSION;
        }
        const payload = JSON.parse(node_fs_1.default.readFileSync(configuredPath, "utf8"));
        return {
            category: Number(payload?.weights?.category ?? DEFAULT_WAVE44_FUSION.category),
            heuristic: Number(payload?.weights?.heuristic ?? DEFAULT_WAVE44_FUSION.heuristic),
            geometry: Number(payload?.weights?.geometry ?? DEFAULT_WAVE44_FUSION.geometry),
            ontology: Number(payload?.weights?.ontology ?? DEFAULT_WAVE44_FUSION.ontology),
            semantic: Number(payload?.weights?.semantic ?? DEFAULT_WAVE44_FUSION.semantic),
            dictionary: Number(payload?.weights?.dictionary ?? DEFAULT_WAVE44_FUSION.dictionary),
            lexical: Number(payload?.weights?.lexical ?? DEFAULT_WAVE44_FUSION.lexical),
        };
    }
    catch {
        return DEFAULT_WAVE44_FUSION;
    }
}
function loadWave44Gate() {
    const configuredPath = process.env.WAVE44_GATE_PATH || node_path_1.default.resolve(__dirname, "../../../../training-data/acord-labeled/wave4_4_gate.json");
    try {
        if (!node_fs_1.default.existsSync(configuredPath)) {
            return DEFAULT_WAVE44_GATE;
        }
        const payload = JSON.parse(node_fs_1.default.readFileSync(configuredPath, "utf8"));
        return {
            acceptedGlobalRelax: Number(payload?.adjustments?.acceptedGlobalRelax ?? DEFAULT_WAVE44_GATE.acceptedGlobalRelax),
            reviewGlobalRelax: Number(payload?.adjustments?.reviewGlobalRelax ?? DEFAULT_WAVE44_GATE.reviewGlobalRelax),
            rejectedGlobalRelax: Number(payload?.adjustments?.rejectedGlobalRelax ?? DEFAULT_WAVE44_GATE.rejectedGlobalRelax),
            acceptedLowerForCategory: Number(payload?.adjustments?.acceptedLowerForCategory ?? DEFAULT_WAVE44_GATE.acceptedLowerForCategory),
            reviewLowerForCategory: Number(payload?.adjustments?.reviewLowerForCategory ?? DEFAULT_WAVE44_GATE.reviewLowerForCategory),
            reviewRaiseForLowCategory: Number(payload?.adjustments?.reviewRaiseForLowCategory ?? DEFAULT_WAVE44_GATE.reviewRaiseForLowCategory),
            rejectRaiseForLowCategory: Number(payload?.adjustments?.rejectRaiseForLowCategory ?? DEFAULT_WAVE44_GATE.rejectRaiseForLowCategory),
            acceptedLowerForLowCategoryFallback: Number(payload?.adjustments?.acceptedLowerForLowCategoryFallback ?? DEFAULT_WAVE44_GATE.acceptedLowerForLowCategoryFallback),
            reviewLowerForLowCategoryFallback: Number(payload?.adjustments?.reviewLowerForLowCategoryFallback ?? DEFAULT_WAVE44_GATE.reviewLowerForLowCategoryFallback),
            acceptedLowerForHeuristicRescue: Number(payload?.adjustments?.acceptedLowerForHeuristicRescue ?? DEFAULT_WAVE44_GATE.acceptedLowerForHeuristicRescue),
            reviewLowerForHeuristicRescue: Number(payload?.adjustments?.reviewLowerForHeuristicRescue ?? DEFAULT_WAVE44_GATE.reviewLowerForHeuristicRescue),
            rejectedLowerForHeuristicRescue: Number(payload?.adjustments?.rejectedLowerForHeuristicRescue ?? DEFAULT_WAVE44_GATE.rejectedLowerForHeuristicRescue),
            acceptedLowerForGeometryPriority: Number(payload?.adjustments?.acceptedLowerForGeometryPriority ?? DEFAULT_WAVE44_GATE.acceptedLowerForGeometryPriority),
            reviewLowerForGeometryPriority: Number(payload?.adjustments?.reviewLowerForGeometryPriority ?? DEFAULT_WAVE44_GATE.reviewLowerForGeometryPriority),
            geometryBonus: Number(payload?.adjustments?.geometryBonus ?? DEFAULT_WAVE44_GATE.geometryBonus),
            ontologyBonus: Number(payload?.adjustments?.ontologyBonus ?? DEFAULT_WAVE44_GATE.ontologyBonus),
        };
    }
    catch {
        return DEFAULT_WAVE44_GATE;
    }
}
const WAVE44_FUSION = loadWave44Fusion();
const WAVE44_GATE = loadWave44Gate();
const WAVE45_ALIGNMENT_ENABLED = process.env.WAVE45_ALIGNMENT_ENABLED !== "0";
const WAVE45_CONSISTENCY_ENABLED = process.env.WAVE45_CONSISTENCY_ENABLED !== "0";
const WAVE45_RERANK_ENABLED = process.env.WAVE45_RERANK_ENABLED !== "0";
const WAVE46_CARRIER_ENABLED = process.env.WAVE46_CARRIER_ENABLED !== "0";
const WAVE46_CARRIER_BOOST_ENABLED = process.env.WAVE46_CARRIER_BOOST_ENABLED !== "0";
const WAVE46_CARRIER_GATE_ENABLED = process.env.WAVE46_CARRIER_GATE_ENABLED !== "0";
const WAVE47_GENERALIZATION_ENABLED = process.env.WAVE47_GENERALIZATION_ENABLED !== "0";
const WAVE47_ROBUSTNESS_ENABLED = process.env.WAVE47_ROBUSTNESS_ENABLED !== "0";
const WAVE47_GATE_ENABLED = process.env.WAVE47_GATE_ENABLED !== "0";
const WAVE48_OVERRIDES_ENABLED = process.env.WAVE48_OVERRIDES_ENABLED !== "0";
const WAVE48_GATE_ENABLED = process.env.WAVE48_GATE_ENABLED !== "0";
const WAVE48_RERANK_ENABLED = process.env.WAVE48_RERANK_ENABLED !== "0";
const WAVE5_GEOMETRY_ENABLED = process.env.WAVE5_GEOMETRY_ENABLED === "1";
const WAVE5_CATEGORY_MODE_ENABLED = process.env.WAVE5_CATEGORY_MODE_ENABLED === "1";
const WAVE5_REFLOW_ENABLED = process.env.WAVE5_REFLOW_ENABLED === "1";
const DEFAULT_WAVE45_ALIGNMENT = {
    wave: "4.5",
    concepts: [],
};
const DEFAULT_WAVE45_RERANK = {
    alignmentBoost: 0.055,
    consistencyBoost: 0.115,
    priorPageConsistencyRescueBoost: 0.07,
    categoryPriorBoost: 0.045,
    geometryAgreementBoost: 0.06,
    categoryMismatchPenalty: 0.03,
    ontologyMismatchPenalty: 0.06,
    geometryMismatchPenalty: 0.04,
};
const DEFAULT_WAVE46_CARRIER_ONTOLOGY = {
    wave: "4.6",
    carriers: [],
};
const DEFAULT_WAVE46_BOOST = {
    carrierContextBoost: 0.02,
    synonymBoost: 0.045,
    geometryBoost: 0.04,
    blockPatternBoost: 0.04,
    fieldOverrideBoost: 0.055,
    mismatchPenalty: 0.01,
};
const DEFAULT_WAVE46_GATE = {
    acceptLowerForStrongCarrierMatch: 0.03,
    reviewLowerForCarrierAligned: 0.025,
    rejectRaiseForCarrierAligned: 0.015,
    carrierPriorityOverrideMinScore: 0.62,
};
const DEFAULT_WAVE47_GENERALIZATION = {
    wave: "4.7",
    clusters: [],
};
const DEFAULT_WAVE47_ROBUSTNESS = {
    ontologyClusterBoost: 0.04,
    geometryClusterBoost: 0.04,
    semanticClusterBoost: 0.05,
    oodGeometryBoost: 0.03,
    oodPatternBoost: 0.03,
    oodMismatchPenalty: 0.01,
};
const DEFAULT_WAVE47_GATE = {
    acceptLowerForStrongSemanticMatch: 0.03,
    reviewLowerForClusterAligned: 0.025,
    rejectRaiseForClusterAligned: 0.015,
    oodPriorityOverrideMinScore: 0.58,
};
const DEFAULT_WAVE48_OVERRIDES = {
    wave: "4.8",
    exceptions: [],
};
const DEFAULT_WAVE48_GATE = {
    forceAcceptScoreFloor: 0.78,
    forceReviewScoreFloor: 0.62,
    bypassCategoryMismatchPenalty: true,
    bypassGeometryMismatchPenalty: true,
    bypassOntologyMismatchPenalty: true,
};
const DEFAULT_WAVE48_RERANK = {
    overrideCandidateBoost: 0.22,
    forceAcceptedBoost: 0.1,
    forceReviewBoost: 0.06,
    conflictSuppressionPenalty: 0.18,
};
function loadWave45Alignment() {
    const configuredPath = process.env.WAVE45_ALIGNMENT_PATH || node_path_1.default.resolve(__dirname, "../../../../training-data/acord-labeled/wave4_5_alignment.json");
    try {
        if (!node_fs_1.default.existsSync(configuredPath)) {
            return DEFAULT_WAVE45_ALIGNMENT;
        }
        const payload = JSON.parse(node_fs_1.default.readFileSync(configuredPath, "utf8"));
        if (!Array.isArray(payload?.concepts)) {
            return DEFAULT_WAVE45_ALIGNMENT;
        }
        return {
            wave: String(payload.wave || "4.5"),
            concepts: payload.concepts
                .map((concept) => ({
                conceptId: String(concept?.conceptId || ""),
                canonicalAcordCode: String(concept?.canonicalAcordCode || ""),
                acordCodes: Array.isArray(concept?.acordCodes)
                    ? concept.acordCodes.map((code) => String(code || "")).filter(Boolean)
                    : [],
                synonyms: Array.isArray(concept?.synonyms)
                    ? concept.synonyms.map((token) => String(token || "")).filter(Boolean)
                    : [],
                carrierVariants: Array.isArray(concept?.carrierVariants)
                    ? concept.carrierVariants.map((token) => String(token || "")).filter(Boolean)
                    : [],
                geometryAnchors: Array.isArray(concept?.geometryAnchors)
                    ? concept.geometryAnchors.map((token) => String(token || "")).filter(Boolean)
                    : [],
            }))
                .filter((concept) => concept.canonicalAcordCode.length > 0),
        };
    }
    catch {
        return DEFAULT_WAVE45_ALIGNMENT;
    }
}
function loadWave45Rerank() {
    const configuredPath = process.env.WAVE45_RERANK_PATH || node_path_1.default.resolve(__dirname, "../../../../training-data/acord-labeled/wave4_5_rerank.json");
    try {
        if (!node_fs_1.default.existsSync(configuredPath)) {
            return DEFAULT_WAVE45_RERANK;
        }
        const payload = JSON.parse(node_fs_1.default.readFileSync(configuredPath, "utf8"));
        return {
            alignmentBoost: Number(payload?.weights?.alignmentBoost ?? DEFAULT_WAVE45_RERANK.alignmentBoost),
            consistencyBoost: Number(payload?.weights?.consistencyBoost ?? DEFAULT_WAVE45_RERANK.consistencyBoost),
            priorPageConsistencyRescueBoost: Number(payload?.weights?.priorPageConsistencyRescueBoost ?? DEFAULT_WAVE45_RERANK.priorPageConsistencyRescueBoost),
            categoryPriorBoost: Number(payload?.weights?.categoryPriorBoost ?? DEFAULT_WAVE45_RERANK.categoryPriorBoost),
            geometryAgreementBoost: Number(payload?.weights?.geometryAgreementBoost ?? DEFAULT_WAVE45_RERANK.geometryAgreementBoost),
            categoryMismatchPenalty: Number(payload?.weights?.categoryMismatchPenalty ?? DEFAULT_WAVE45_RERANK.categoryMismatchPenalty),
            ontologyMismatchPenalty: Number(payload?.weights?.ontologyMismatchPenalty ?? DEFAULT_WAVE45_RERANK.ontologyMismatchPenalty),
            geometryMismatchPenalty: Number(payload?.weights?.geometryMismatchPenalty ?? DEFAULT_WAVE45_RERANK.geometryMismatchPenalty),
        };
    }
    catch {
        return DEFAULT_WAVE45_RERANK;
    }
}
function loadWave46CarrierOntology() {
    const configuredPath = process.env.WAVE46_CARRIER_ONTOLOGY_PATH || node_path_1.default.resolve(__dirname, "../../../../training-data/acord-labeled/wave4_6_carrier_ontology.json");
    try {
        if (!node_fs_1.default.existsSync(configuredPath)) {
            return DEFAULT_WAVE46_CARRIER_ONTOLOGY;
        }
        const payload = JSON.parse(node_fs_1.default.readFileSync(configuredPath, "utf8"));
        if (!Array.isArray(payload?.carriers)) {
            return DEFAULT_WAVE46_CARRIER_ONTOLOGY;
        }
        return {
            wave: String(payload.wave || "4.6"),
            carriers: payload.carriers
                .map((carrier) => ({
                carrierId: String(carrier?.carrierId || "").trim(),
                matchTokens: Array.isArray(carrier?.matchTokens)
                    ? carrier.matchTokens.map((token) => String(token || "").trim()).filter(Boolean)
                    : [],
                synonyms: Array.isArray(carrier?.synonyms)
                    ? carrier.synonyms.map((token) => String(token || "").trim()).filter(Boolean)
                    : [],
                geometrySignatures: Array.isArray(carrier?.geometrySignatures)
                    ? carrier.geometrySignatures.map((token) => String(token || "").trim()).filter(Boolean)
                    : [],
                blockPatterns: Array.isArray(carrier?.blockPatterns)
                    ? carrier.blockPatterns.map((token) => String(token || "").trim()).filter(Boolean)
                    : [],
                fieldOverrides: Array.isArray(carrier?.fieldOverrides)
                    ? carrier.fieldOverrides
                        .map((override) => ({
                        canonicalAcordCode: String(override?.canonicalAcordCode || "").trim(),
                        carrierAcordCodes: Array.isArray(override?.carrierAcordCodes)
                            ? override.carrierAcordCodes.map((code) => String(code || "").trim()).filter(Boolean)
                            : [],
                        aliases: Array.isArray(override?.aliases)
                            ? override.aliases.map((token) => String(token || "").trim()).filter(Boolean)
                            : [],
                        priority: Boolean(override?.priority),
                    }))
                        .filter((override) => override.canonicalAcordCode.length > 0)
                    : [],
            }))
                .filter((carrier) => carrier.carrierId.length > 0),
        };
    }
    catch {
        return DEFAULT_WAVE46_CARRIER_ONTOLOGY;
    }
}
function loadWave46Boost() {
    const configuredPath = process.env.WAVE46_BOOST_PATH || node_path_1.default.resolve(__dirname, "../../../../training-data/acord-labeled/wave4_6_boost.json");
    try {
        if (!node_fs_1.default.existsSync(configuredPath)) {
            return DEFAULT_WAVE46_BOOST;
        }
        const payload = JSON.parse(node_fs_1.default.readFileSync(configuredPath, "utf8"));
        return {
            carrierContextBoost: Number(payload?.weights?.carrierContextBoost ?? DEFAULT_WAVE46_BOOST.carrierContextBoost),
            synonymBoost: Number(payload?.weights?.synonymBoost ?? DEFAULT_WAVE46_BOOST.synonymBoost),
            geometryBoost: Number(payload?.weights?.geometryBoost ?? DEFAULT_WAVE46_BOOST.geometryBoost),
            blockPatternBoost: Number(payload?.weights?.blockPatternBoost ?? DEFAULT_WAVE46_BOOST.blockPatternBoost),
            fieldOverrideBoost: Number(payload?.weights?.fieldOverrideBoost ?? DEFAULT_WAVE46_BOOST.fieldOverrideBoost),
            mismatchPenalty: Number(payload?.weights?.mismatchPenalty ?? DEFAULT_WAVE46_BOOST.mismatchPenalty),
        };
    }
    catch {
        return DEFAULT_WAVE46_BOOST;
    }
}
function loadWave46Gate() {
    const configuredPath = process.env.WAVE46_GATE_PATH || node_path_1.default.resolve(__dirname, "../../../../training-data/acord-labeled/wave4_6_gate.json");
    try {
        if (!node_fs_1.default.existsSync(configuredPath)) {
            return DEFAULT_WAVE46_GATE;
        }
        const payload = JSON.parse(node_fs_1.default.readFileSync(configuredPath, "utf8"));
        return {
            acceptLowerForStrongCarrierMatch: Number(payload?.adjustments?.acceptLowerForStrongCarrierMatch ?? DEFAULT_WAVE46_GATE.acceptLowerForStrongCarrierMatch),
            reviewLowerForCarrierAligned: Number(payload?.adjustments?.reviewLowerForCarrierAligned ?? DEFAULT_WAVE46_GATE.reviewLowerForCarrierAligned),
            rejectRaiseForCarrierAligned: Number(payload?.adjustments?.rejectRaiseForCarrierAligned ?? DEFAULT_WAVE46_GATE.rejectRaiseForCarrierAligned),
            carrierPriorityOverrideMinScore: Number(payload?.adjustments?.carrierPriorityOverrideMinScore ?? DEFAULT_WAVE46_GATE.carrierPriorityOverrideMinScore),
        };
    }
    catch {
        return DEFAULT_WAVE46_GATE;
    }
}
function loadWave47Generalization() {
    const configuredPath = process.env.WAVE47_GENERALIZATION_PATH || node_path_1.default.resolve(__dirname, "../../../../training-data/acord-labeled/wave4_7_generalization.json");
    try {
        if (!node_fs_1.default.existsSync(configuredPath)) {
            return DEFAULT_WAVE47_GENERALIZATION;
        }
        const payload = JSON.parse(node_fs_1.default.readFileSync(configuredPath, "utf8"));
        if (!Array.isArray(payload?.clusters)) {
            return DEFAULT_WAVE47_GENERALIZATION;
        }
        return {
            wave: String(payload.wave || "4.7"),
            clusters: payload.clusters
                .map((cluster) => ({
                clusterId: String(cluster?.clusterId || "").trim(),
                carrierHints: Array.isArray(cluster?.carrierHints)
                    ? cluster.carrierHints.map((token) => String(token || "").trim()).filter(Boolean)
                    : [],
                synonyms: Array.isArray(cluster?.synonyms)
                    ? cluster.synonyms.map((token) => String(token || "").trim()).filter(Boolean)
                    : [],
                geometryClusters: Array.isArray(cluster?.geometryClusters)
                    ? cluster.geometryClusters.map((token) => String(token || "").trim()).filter(Boolean)
                    : [],
                blockPatternFamilies: Array.isArray(cluster?.blockPatternFamilies)
                    ? cluster.blockPatternFamilies.map((token) => String(token || "").trim()).filter(Boolean)
                    : [],
                semanticGroups: Array.isArray(cluster?.semanticGroups)
                    ? cluster.semanticGroups.map((token) => String(token || "").trim()).filter(Boolean)
                    : [],
                canonicalAcordCodes: Array.isArray(cluster?.canonicalAcordCodes)
                    ? cluster.canonicalAcordCodes.map((code) => String(code || "").trim()).filter(Boolean)
                    : [],
                priority: Boolean(cluster?.priority),
            }))
                .filter((cluster) => cluster.clusterId.length > 0),
        };
    }
    catch {
        return DEFAULT_WAVE47_GENERALIZATION;
    }
}
function loadWave47Robustness() {
    const configuredPath = process.env.WAVE47_ROBUSTNESS_PATH || node_path_1.default.resolve(__dirname, "../../../../training-data/acord-labeled/wave4_7_robustness.json");
    try {
        if (!node_fs_1.default.existsSync(configuredPath)) {
            return DEFAULT_WAVE47_ROBUSTNESS;
        }
        const payload = JSON.parse(node_fs_1.default.readFileSync(configuredPath, "utf8"));
        return {
            ontologyClusterBoost: Number(payload?.weights?.ontologyClusterBoost ?? DEFAULT_WAVE47_ROBUSTNESS.ontologyClusterBoost),
            geometryClusterBoost: Number(payload?.weights?.geometryClusterBoost ?? DEFAULT_WAVE47_ROBUSTNESS.geometryClusterBoost),
            semanticClusterBoost: Number(payload?.weights?.semanticClusterBoost ?? DEFAULT_WAVE47_ROBUSTNESS.semanticClusterBoost),
            oodGeometryBoost: Number(payload?.weights?.oodGeometryBoost ?? DEFAULT_WAVE47_ROBUSTNESS.oodGeometryBoost),
            oodPatternBoost: Number(payload?.weights?.oodPatternBoost ?? DEFAULT_WAVE47_ROBUSTNESS.oodPatternBoost),
            oodMismatchPenalty: Number(payload?.weights?.oodMismatchPenalty ?? DEFAULT_WAVE47_ROBUSTNESS.oodMismatchPenalty),
        };
    }
    catch {
        return DEFAULT_WAVE47_ROBUSTNESS;
    }
}
function loadWave47Gate() {
    const configuredPath = process.env.WAVE47_GATE_PATH || node_path_1.default.resolve(__dirname, "../../../../training-data/acord-labeled/wave4_7_gate.json");
    try {
        if (!node_fs_1.default.existsSync(configuredPath)) {
            return DEFAULT_WAVE47_GATE;
        }
        const payload = JSON.parse(node_fs_1.default.readFileSync(configuredPath, "utf8"));
        return {
            acceptLowerForStrongSemanticMatch: Number(payload?.adjustments?.acceptLowerForStrongSemanticMatch ?? DEFAULT_WAVE47_GATE.acceptLowerForStrongSemanticMatch),
            reviewLowerForClusterAligned: Number(payload?.adjustments?.reviewLowerForClusterAligned ?? DEFAULT_WAVE47_GATE.reviewLowerForClusterAligned),
            rejectRaiseForClusterAligned: Number(payload?.adjustments?.rejectRaiseForClusterAligned ?? DEFAULT_WAVE47_GATE.rejectRaiseForClusterAligned),
            oodPriorityOverrideMinScore: Number(payload?.adjustments?.oodPriorityOverrideMinScore ?? DEFAULT_WAVE47_GATE.oodPriorityOverrideMinScore),
        };
    }
    catch {
        return DEFAULT_WAVE47_GATE;
    }
}
function loadWave48Overrides() {
    const configuredPath = process.env.WAVE48_OVERRIDES_PATH || node_path_1.default.resolve(__dirname, "../../../../training-data/acord-labeled/wave4_8_overrides.json");
    try {
        if (!node_fs_1.default.existsSync(configuredPath)) {
            return DEFAULT_WAVE48_OVERRIDES;
        }
        const payload = JSON.parse(node_fs_1.default.readFileSync(configuredPath, "utf8"));
        if (!Array.isArray(payload?.exceptions)) {
            return DEFAULT_WAVE48_OVERRIDES;
        }
        return {
            wave: String(payload.wave || "4.8"),
            exceptions: payload.exceptions
                .map((entry) => ({
                exceptionId: String(entry?.exceptionId || "").trim(),
                carrierHints: Array.isArray(entry?.carrierHints)
                    ? entry.carrierHints.map((token) => String(token || "").trim()).filter(Boolean)
                    : [],
                explicitELabelOverrides: Array.isArray(entry?.explicitELabelOverrides)
                    ? entry.explicitELabelOverrides.map((code) => String(code || "").trim()).filter(Boolean)
                    : [],
                geometrySignatures: Array.isArray(entry?.geometrySignatures)
                    ? entry.geometrySignatures.map((signature) => String(signature || "").trim()).filter(Boolean)
                    : [],
                blockPatterns: Array.isArray(entry?.blockPatterns)
                    ? entry.blockPatterns.map((pattern) => String(pattern || "").trim()).filter(Boolean)
                    : [],
                semanticTokens: Array.isArray(entry?.semanticTokens)
                    ? entry.semanticTokens.map((token) => String(token || "").trim()).filter(Boolean)
                    : [],
                forceDecision: entry?.forceDecision === "accepted" ? "accepted" : "review",
            }))
                .filter((entry) => entry.exceptionId.length > 0),
        };
    }
    catch {
        return DEFAULT_WAVE48_OVERRIDES;
    }
}
function loadWave48Gate() {
    const configuredPath = process.env.WAVE48_GATE_PATH || node_path_1.default.resolve(__dirname, "../../../../training-data/acord-labeled/wave4_8_gate.json");
    try {
        if (!node_fs_1.default.existsSync(configuredPath)) {
            return DEFAULT_WAVE48_GATE;
        }
        const payload = JSON.parse(node_fs_1.default.readFileSync(configuredPath, "utf8"));
        return {
            forceAcceptScoreFloor: Number(payload?.adjustments?.forceAcceptScoreFloor ?? DEFAULT_WAVE48_GATE.forceAcceptScoreFloor),
            forceReviewScoreFloor: Number(payload?.adjustments?.forceReviewScoreFloor ?? DEFAULT_WAVE48_GATE.forceReviewScoreFloor),
            bypassCategoryMismatchPenalty: payload?.adjustments?.bypassCategoryMismatchPenalty !== false,
            bypassGeometryMismatchPenalty: payload?.adjustments?.bypassGeometryMismatchPenalty !== false,
            bypassOntologyMismatchPenalty: payload?.adjustments?.bypassOntologyMismatchPenalty !== false,
        };
    }
    catch {
        return DEFAULT_WAVE48_GATE;
    }
}
function loadWave48Rerank() {
    const configuredPath = process.env.WAVE48_RERANK_PATH || node_path_1.default.resolve(__dirname, "../../../../training-data/acord-labeled/wave4_8_rerank.json");
    try {
        if (!node_fs_1.default.existsSync(configuredPath)) {
            return DEFAULT_WAVE48_RERANK;
        }
        const payload = JSON.parse(node_fs_1.default.readFileSync(configuredPath, "utf8"));
        return {
            overrideCandidateBoost: Number(payload?.weights?.overrideCandidateBoost ?? DEFAULT_WAVE48_RERANK.overrideCandidateBoost),
            forceAcceptedBoost: Number(payload?.weights?.forceAcceptedBoost ?? DEFAULT_WAVE48_RERANK.forceAcceptedBoost),
            forceReviewBoost: Number(payload?.weights?.forceReviewBoost ?? DEFAULT_WAVE48_RERANK.forceReviewBoost),
            conflictSuppressionPenalty: Number(payload?.weights?.conflictSuppressionPenalty ?? DEFAULT_WAVE48_RERANK.conflictSuppressionPenalty),
        };
    }
    catch {
        return DEFAULT_WAVE48_RERANK;
    }
}
const WAVE45_ALIGNMENT = loadWave45Alignment();
const WAVE45_RERANK = loadWave45Rerank();
const WAVE46_CARRIER_ONTOLOGY = loadWave46CarrierOntology();
const WAVE46_BOOST = loadWave46Boost();
const WAVE46_GATE = loadWave46Gate();
const WAVE47_GENERALIZATION = loadWave47Generalization();
const WAVE47_ROBUSTNESS = loadWave47Robustness();
const WAVE47_GATE = loadWave47Gate();
const WAVE48_OVERRIDES = loadWave48Overrides();
const WAVE48_GATE = loadWave48Gate();
const WAVE48_RERANK = loadWave48Rerank();
const WAVE8_EFFECTIVE_FUSION = {
    category: ensureNonZeroFusionWeight(Number(WAVE44_FUSION.category || 0)),
    heuristic: ensureNonZeroFusionWeight(Number(WAVE44_FUSION.heuristic || 0)),
    geometry: ensureNonZeroFusionWeight(Number(WAVE44_FUSION.geometry || 0)),
    ontology: ensureNonZeroFusionWeight(Number(WAVE44_FUSION.ontology || 0)),
    semantic: ensureNonZeroFusionWeight(Number(WAVE44_FUSION.semantic || 0)),
    dictionary: ensureNonZeroFusionWeight(Number(WAVE44_FUSION.dictionary || 0)),
    lexical: ensureNonZeroFusionWeight(Number(WAVE44_FUSION.lexical || 0)),
};
let wave42ThresholdConfigLoaded = false;
let wave42ThresholdConfig = null;
function loadWave42ThresholdConfig() {
    if (wave42ThresholdConfigLoaded) {
        return wave42ThresholdConfig;
    }
    wave42ThresholdConfigLoaded = true;
    const configuredPath = process.env.WAVE42_THRESHOLDS_PATH || node_path_1.default.resolve(__dirname, "../../../../training-data/acord-labeled/wave4_2_thresholds.json");
    try {
        if (!node_fs_1.default.existsSync(configuredPath)) {
            return null;
        }
        const payload = JSON.parse(node_fs_1.default.readFileSync(configuredPath, "utf8"));
        if (!payload || typeof payload !== "object") {
            return null;
        }
        wave42ThresholdConfig = payload;
        return wave42ThresholdConfig;
    }
    catch {
        return null;
    }
}
function resolveConfidenceLevel(confidenceScore, thresholds) {
    if (confidenceScore >= thresholds.accepted)
        return "accepted";
    if (confidenceScore >= thresholds.review)
        return "review";
    return "rejected";
}
function quantize(value, digits = SCORE_PRECISION) {
    if (!Number.isFinite(value)) {
        return 0;
    }
    return Number(value.toFixed(digits));
}
function compareScoreAccumulator(left, right) {
    return (right.score - left.score ||
        right.layoutlmScore - left.layoutlmScore ||
        right.semanticSimilarity - left.semanticSimilarity ||
        right.dictionaryScore - left.dictionaryScore ||
        right.heuristicScore - left.heuristicScore ||
        left.acordCode.localeCompare(right.acordCode) ||
        left.label.localeCompare(right.label));
}
function compareSuggestion(left, right) {
    return (right.confidenceScore - left.confidenceScore ||
        right.semanticSimilarity - left.semanticSimilarity ||
        right.lexicalScore - left.lexicalScore ||
        right.dictionaryScore - left.dictionaryScore ||
        right.heuristicScore - left.heuristicScore ||
        left.acordCode.localeCompare(right.acordCode));
}
function normalizeWave49Error(stage, error) {
    if (error instanceof Error) {
        return { stage, message: error.message };
    }
    if (typeof error === "string") {
        return { stage, message: error };
    }
    try {
        return { stage, message: JSON.stringify(error) };
    }
    catch {
        return { stage, message: `${stage} failure` };
    }
}
function buildWave49FallbackSuggestions(accum, limit = 3) {
    const ordered = [...accum.values()].sort(compareScoreAccumulator).slice(0, limit);
    if (ordered.length === 0) {
        return [];
    }
    const topScore = Math.max(ordered[0]?.score || 0, 1);
    return ordered.map((item) => {
        const found = (0, acordDictionary_1.lookupAcordByCode)(item.acordCode);
        const confidenceScore = Number(Math.min(0.48, Math.max(0.18, (item.score / topScore) * 0.46)).toFixed(3));
        return {
            acordCode: item.acordCode,
            label: found?.label || item.label,
            description: found?.description || item.description,
            confidenceScore,
            normalizedConfidenceScore: confidenceScore,
            source: item.source,
            lexicalScore: Number(Math.min(1, item.score / topScore).toFixed(3)),
            semanticSimilarity: Number(item.semanticSimilarity.toFixed(3)),
            dictionaryScore: Number(item.dictionaryScore.toFixed(3)),
            heuristicScore: Number(item.heuristicScore.toFixed(3)),
        };
    });
}
function normalizeText(value) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}
function tokenize(value) {
    return normalizeText(value)
        .split(" ")
        .map((token) => token.trim())
        .filter((token) => token.length >= 3);
}
function clamp01(value) {
    if (!Number.isFinite(value))
        return 0;
    return Math.min(1, Math.max(0, value));
}
function ensureNonZeroFusionWeight(value) {
    if (!Number.isFinite(value) || value <= 0) {
        return WAVE8_MIN_FUSION_WEIGHT;
    }
    return value;
}
function isSelectionMarkText(text) {
    const normalized = normalizeText(text);
    return /^selection mark (selected|unselected)/.test(normalized);
}
function isSelectionMarkBlock(block) {
    return block.type === "checkbox" && isSelectionMarkText(block.text || "");
}
function distanceBetweenBlocks(left, right) {
    const leftCenterX = Number(left.boundingBox.x || 0) + Number(left.boundingBox.width || 0) / 2;
    const leftCenterY = Number(left.boundingBox.y || 0) + Number(left.boundingBox.height || 0) / 2;
    const rightCenterX = Number(right.boundingBox.x || 0) + Number(right.boundingBox.width || 0) / 2;
    const rightCenterY = Number(right.boundingBox.y || 0) + Number(right.boundingBox.height || 0) / 2;
    const dx = rightCenterX - leftCenterX;
    const dy = rightCenterY - leftCenterY;
    return Math.sqrt(dx * dx + dy * dy);
}
function resolveSelectionMarkPairings(blocks) {
    const pairings = new Map();
    const blocksByPage = new Map();
    for (const block of blocks) {
        const pageEntries = blocksByPage.get(block.page) || [];
        pageEntries.push(block);
        blocksByPage.set(block.page, pageEntries);
    }
    for (const pageBlocks of blocksByPage.values()) {
        const labelCandidates = pageBlocks.filter((entry) => !isSelectionMarkBlock(entry) && String(entry.text || "").trim().length >= 2);
        const selectionMarks = pageBlocks.filter((entry) => isSelectionMarkBlock(entry));
        for (const mark of selectionMarks) {
            const markBox = mark.boundingBox;
            let bestCandidate = null;
            for (const candidate of labelCandidates) {
                const candidateBox = candidate.boundingBox;
                const dx = Number(candidateBox.x || 0) - Number(markBox.x || 0);
                const dy = Math.abs(Number(candidateBox.y || 0) - Number(markBox.y || 0));
                const maxVerticalDistance = Math.max(16, Number(markBox.height || 0) * 2.2);
                if (dy > maxVerticalDistance) {
                    continue;
                }
                if (dx < -16 || dx > 280) {
                    continue;
                }
                const rightHandPreference = dx >= 0 ? 0 : 24;
                const score = dy * 1.45 +
                    Math.abs(dx) * 0.28 +
                    rightHandPreference +
                    distanceBetweenBlocks(mark, candidate) * 0.1;
                if (!bestCandidate || score < bestCandidate.score) {
                    bestCandidate = { block: candidate, score };
                }
            }
            if (bestCandidate) {
                pairings.set(mark.id, String(bestCandidate.block.text || "").trim());
            }
        }
    }
    return pairings;
}
function computeBoundingBoxIou(left, right) {
    const leftX1 = Number(left.x || 0);
    const leftY1 = Number(left.y || 0);
    const leftX2 = leftX1 + Math.max(0, Number(left.width || 0));
    const leftY2 = leftY1 + Math.max(0, Number(left.height || 0));
    const rightX1 = Number(right.x || 0);
    const rightY1 = Number(right.y || 0);
    const rightX2 = rightX1 + Math.max(0, Number(right.width || 0));
    const rightY2 = rightY1 + Math.max(0, Number(right.height || 0));
    const intersectionWidth = Math.max(0, Math.min(leftX2, rightX2) - Math.max(leftX1, rightX1));
    const intersectionHeight = Math.max(0, Math.min(leftY2, rightY2) - Math.max(leftY1, rightY1));
    const intersectionArea = intersectionWidth * intersectionHeight;
    if (intersectionArea <= 0) {
        return 0;
    }
    const leftArea = Math.max(0, leftX2 - leftX1) * Math.max(0, leftY2 - leftY1);
    const rightArea = Math.max(0, rightX2 - rightX1) * Math.max(0, rightY2 - rightY1);
    const denominator = leftArea + rightArea - intersectionArea;
    if (denominator <= 0) {
        return 0;
    }
    return intersectionArea / denominator;
}
function suppressOverlappingMappings(results) {
    const byPage = new Map();
    for (const mapping of results) {
        const pageEntries = byPage.get(mapping.page) || [];
        pageEntries.push(mapping);
        byPage.set(mapping.page, pageEntries);
    }
    for (const pageMappings of byPage.values()) {
        const sorted = [...pageMappings].sort((left, right) => Number(right.topCandidate?.confidenceScore || 0) - Number(left.topCandidate?.confidenceScore || 0) ||
            String(left.blockId).localeCompare(String(right.blockId)));
        for (let index = 0; index < sorted.length; index += 1) {
            const winner = sorted[index];
            const winnerProtected = Boolean(winner?.mappingDiagnostics?.contractorsInsuredNameResolverApplied ||
                String(winner?.mappingDiagnostics?.wave8TargetedAnchorPromoted || "").includes("insured_name"));
            const winnerConfidence = Number(winner.topCandidate?.confidenceScore || 0);
            if (winnerConfidence <= 0) {
                continue;
            }
            for (let challengerIndex = index + 1; challengerIndex < sorted.length; challengerIndex += 1) {
                const challenger = sorted[challengerIndex];
                const challengerProtected = Boolean(challenger?.mappingDiagnostics?.contractorsInsuredNameResolverApplied ||
                    String(challenger?.mappingDiagnostics?.wave8TargetedAnchorPromoted || "").includes("insured_name"));
                if (winnerProtected || challengerProtected) {
                    continue;
                }
                const challengerConfidence = Number(challenger.topCandidate?.confidenceScore || 0);
                if (challengerConfidence <= 0) {
                    continue;
                }
                const iou = computeBoundingBoxIou(winner.boundingBox, challenger.boundingBox);
                if (iou < WAVE8_OVERLAP_IOU_THRESHOLD) {
                    continue;
                }
                const sameTopCode = String(winner.topCandidate?.acordCode || "") &&
                    String(winner.topCandidate?.acordCode || "") ===
                        String(challenger.topCandidate?.acordCode || "");
                const suppressionEligible = sameTopCode || winnerConfidence >= challengerConfidence + WAVE8_OVERLAP_SUPPRESSION_MARGIN;
                if (!suppressionEligible) {
                    continue;
                }
                const filtered = (challenger.suggestions || []).filter((candidate) => {
                    const confidence = Number(candidate.confidenceScore || 0);
                    if (confidence < WAVE8_MIN_CONFIDENCE_FOR_RETAIN) {
                        return false;
                    }
                    if (sameTopCode && candidate.acordCode === winner.topCandidate?.acordCode) {
                        return false;
                    }
                    return true;
                });
                filtered.sort(compareSuggestion);
                challenger.suggestions = filtered;
                challenger.chosen = filtered[0];
                challenger.topCandidate = filtered[0];
                const diagnostics = challenger.mappingDiagnostics || {};
                challenger.mappingDiagnostics = {
                    ...diagnostics,
                    wave8OverlapSuppressed: true,
                    wave8OverlapIou: Number(iou.toFixed(3)),
                    wave8OverlapWinnerBlockId: winner.blockId,
                };
            }
        }
    }
    return results;
}
function applyContractorsInsuredNameResolver(results, familyId) {
    const normalizedFamily = normalizeText(String(familyId || ""));
    const isContractorsDoc = normalizedFamily.includes("contractors") ||
        results.some((mapping) => {
            const text = normalizeText(String(mapping.text || ""));
            return (/contractors\s+supplemental\s+application/.test(text) ||
                /to\s+be\s+submitted\s+with\s+acord\s+applications/.test(text));
        });
    if (!isContractorsDoc) {
        return results;
    }
    const MIN_SEMANTIC = 0.05;
    const MIN_DICTIONARY = 0.12;
    const isNarrativeText = (text) => {
        const normalized = normalizeText(text);
        if (normalized.length >= 90)
            return true;
        return /any person who knowingly|with intent to defraud|files an application for insurance|other person files|circumstance act error omission|have you had any claims/.test(normalized);
    };
    const insuredHeaderCandidates = results
        .filter((mapping) => {
        const text = normalizeText(mapping.text || "");
        return /^(applicant|insured|name of insured|named insured)\s*:?$/.test(text);
    })
        .sort((left, right) => left.page - right.page ||
        left.boundingBox.y - right.boundingBox.y ||
        left.boundingBox.x - right.boundingBox.x);
    const header = insuredHeaderCandidates[0];
    if (!header) {
        return results;
    }
    const seededNamedInsured = (0, acordDictionary_1.lookupAcordByCode)("NamedInsured_FullName") ||
        (0, acordDictionary_1.lookupAcordByCode)("NamedInsured_GivenName") ||
        safeDictionarySearch("named insured full name", 8)
            .map((hit) => hit.entry)
            .find((entry) => {
            const code = normalizeText(String(entry.acordCode || "")).replace(/\s+/g, "");
            return code.startsWith("namedinsured") && /(fullname|givenname)/.test(code);
        });
    if (seededNamedInsured) {
        const promotedCandidate = {
            acordCode: seededNamedInsured.acordCode,
            label: "GeneralInfo.NamedInsured Insured Name",
            description: seededNamedInsured.description,
            confidenceScore: 0.68,
            normalizedConfidenceScore: 0.68,
            source: "dictionary",
            lexicalScore: 0.5,
            semanticSimilarity: 0.16,
            dictionaryScore: 0.38,
            heuristicScore: 0.34,
            supervisionBoost: 0.82,
            wave8Gating: {
                passed: true,
                rejectReasons: [],
            },
        };
        const nextSuggestions = [
            promotedCandidate,
            ...(header.suggestions || []).filter((candidate) => candidate.acordCode !== promotedCandidate.acordCode),
        ];
        nextSuggestions.sort(compareSuggestion);
        header.suggestions = nextSuggestions;
        header.chosen = promotedCandidate;
        header.topCandidate = promotedCandidate;
        header.semanticLabel = "GeneralInfo.NamedInsured";
        const diagnostics = header.mappingDiagnostics || {};
        header.mappingDiagnostics = {
            ...diagnostics,
            contractorsInsuredNameResolverApplied: true,
            wave8TargetedAnchorPromoted: "insured_name_contractors_identity_resolver",
            contractorsResolverMode: "direct_header_force",
        };
        return results;
    }
    const identityRegion = {
        page: header.page,
        xMin: Math.max(0, Number(header.boundingBox.x || 0) - 40),
        xMax: Number(header.boundingBox.x || 0) + 500,
        yMin: Math.max(0, Number(header.boundingBox.y || 0) - 24),
        yMax: Number(header.boundingBox.y || 0) + 120,
    };
    const inIdentityRegion = (mapping) => {
        if (mapping.page !== identityRegion.page)
            return false;
        const x = Number(mapping.boundingBox?.x || 0);
        const y = Number(mapping.boundingBox?.y || 0);
        return x >= identityRegion.xMin && x <= identityRegion.xMax && y >= identityRegion.yMin && y <= identityRegion.yMax;
    };
    const resolverCandidates = results
        .filter((mapping) => inIdentityRegion(mapping))
        .map((mapping) => {
        const text = String(mapping.text || "");
        const normalizedText = normalizeText(text);
        const topCandidate = mapping.chosen || mapping.topCandidate || mapping.suggestions?.[0];
        const semanticScore = clamp01(Number(topCandidate?.semanticSimilarity || 0));
        const dictionaryScore = clamp01(Number(topCandidate?.dictionaryScore || 0) > 1
            ? Number(topCandidate?.dictionaryScore || 0) / 200
            : Number(topCandidate?.dictionaryScore || 0));
        const supervisionHint = (0, supervision_1.getWave8SemanticHintForText)(text, familyId);
        const supervisionBoost = (0, supervision_1.getWave8SupervisionAnchorBoost)(text, "NamedInsured_FullName", familyId);
        const canonicalPatternPresent = /^(applicant|insured|name of insured|named insured)\s*:?$/.test(normalizedText) ||
            /insured\s+name|named\s+insured|applicant\s+name/.test(normalizedText);
        const categoryModeSignal = supervisionHint?.categoryMode === "party_information" ||
            supervisionHint?.semanticLabel === "person_name";
        const narrative = isNarrativeText(text);
        const dy = Math.abs(Number(mapping.boundingBox?.y || 0) - Number(header.boundingBox?.y || 0));
        const dx = Math.max(0, Number(mapping.boundingBox?.x || 0) - Number(header.boundingBox?.x || 0));
        const proximityScore = clamp01(1 - Math.min(1, dy / 90) * 0.65 - Math.min(1, dx / 500) * 0.35);
        const score = proximityScore * 0.42 +
            (canonicalPatternPresent ? 0.28 : 0) +
            semanticScore * 0.08 +
            dictionaryScore * 0.08 +
            (supervisionBoost > 0 ? 0.1 : 0) +
            (categoryModeSignal ? 0.04 : 0);
        return {
            mapping,
            semanticScore,
            dictionaryScore,
            supervisionBoost,
            canonicalPatternPresent,
            categoryModeSignal,
            proximityScore,
            narrative,
            score,
        };
    });
    const narrativeRejectionReasons = [];
    for (const entry of resolverCandidates) {
        if (!entry.narrative)
            continue;
        if (entry.dictionaryScore < 0.2 ||
            entry.semanticScore < 0.12 ||
            entry.supervisionBoost <= 0) {
            narrativeRejectionReasons.push({
                blockId: entry.mapping.blockId,
                reason: "narrative_block_rejected",
            });
        }
    }
    const directHeaderSelection = resolverCandidates.find((entry) => entry.mapping.blockId === header.blockId && !entry.narrative);
    const selected = directHeaderSelection || resolverCandidates
        .filter((entry) => !entry.narrative)
        .filter((entry) => entry.canonicalPatternPresent || entry.categoryModeSignal)
        .filter((entry) => entry.semanticScore >= MIN_SEMANTIC || entry.canonicalPatternPresent)
        .filter((entry) => entry.dictionaryScore >= MIN_DICTIONARY || entry.canonicalPatternPresent)
        .filter((entry) => entry.supervisionBoost > 0 || entry.canonicalPatternPresent)
        .sort((left, right) => right.score - left.score || left.mapping.blockId.localeCompare(right.mapping.blockId))[0];
    if (!selected) {
        return results;
    }
    const namedInsuredHits = [
        ...safeDictionarySearch("named insured full name", 8),
        ...safeDictionarySearch("named insured given name", 6),
    ];
    const found = (0, acordDictionary_1.lookupAcordByCode)("NamedInsured_FullName") ||
        (0, acordDictionary_1.lookupAcordByCode)("NamedInsured_GivenName") ||
        namedInsuredHits
            .map((hit) => hit.entry)
            .find((entry) => {
            const code = normalizeText(String(entry.acordCode || "")).replace(/\s+/g, "");
            return /^namedinsured_(fullname|givenname)/.test(code);
        });
    if (!found) {
        return results;
    }
    const promotedCandidate = {
        acordCode: found.acordCode,
        label: "GeneralInfo.NamedInsured Insured Name",
        description: found.description,
        confidenceScore: 0.68,
        normalizedConfidenceScore: 0.68,
        source: "dictionary",
        lexicalScore: 0.5,
        semanticSimilarity: Math.max(0.12, selected.semanticScore),
        dictionaryScore: Math.max(0.35, selected.dictionaryScore),
        heuristicScore: 0.34,
        supervisionBoost: Number(Math.max(0.7, selected.supervisionBoost).toFixed(3)),
        wave8Gating: {
            passed: true,
            rejectReasons: [],
        },
    };
    const nextSuggestions = [
        promotedCandidate,
        ...(selected.mapping.suggestions || []).filter((candidate) => candidate.acordCode !== promotedCandidate.acordCode),
    ];
    nextSuggestions.sort(compareSuggestion);
    selected.mapping.suggestions = nextSuggestions;
    selected.mapping.chosen = promotedCandidate;
    selected.mapping.topCandidate = promotedCandidate;
    selected.mapping.semanticLabel = "GeneralInfo.NamedInsured";
    const diagnostics = selected.mapping.mappingDiagnostics || {};
    selected.mapping.mappingDiagnostics = {
        ...diagnostics,
        contractorsInsuredNameResolverApplied: true,
        wave8TargetedAnchorPromoted: "insured_name_contractors_identity_resolver",
        contractorsIdentityRegion: identityRegion,
        contractorsResolverSelectedScore: Number(selected.score.toFixed(3)),
        contractorsNarrativeRejections: narrativeRejectionReasons,
        contractorsResolverThresholds: {
            semanticMin: MIN_SEMANTIC,
            dictionaryMin: MIN_DICTIONARY,
            supervisionRequired: true,
        },
    };
    return results;
}
function promoteTargetedAnchorMappings(results, familyId) {
    const isNamedInsuredIdentityCode = (acordCode) => {
        const code = normalizeText(acordCode).replace(/\s+/g, "");
        if (!code.startsWith("namedinsured")) {
            return false;
        }
        return /(fullname|givenname|surname|othergivennameinitial)/.test(code);
    };
    const normalizedFamily = normalizeText(String(familyId || ""));
    if (!normalizedFamily) {
        return results;
    }
    const hasNamedInsuredChosen = results.some((mapping) => isNamedInsuredIdentityCode(String(mapping.chosen?.acordCode || mapping.topCandidate?.acordCode || "")));
    if (!hasNamedInsuredChosen) {
        const bestNamedInsured = results
            .map((mapping) => {
            const match = (mapping.suggestions || []).find((candidate) => isNamedInsuredIdentityCode(String(candidate.acordCode || "")));
            return { mapping, candidate: match };
        })
            .filter((entry) => Boolean(entry.candidate))
            .sort((left, right) => Number(right.candidate?.confidenceScore || 0) - Number(left.candidate?.confidenceScore || 0) ||
            String(left.mapping.blockId).localeCompare(String(right.mapping.blockId)))[0];
        if (bestNamedInsured?.candidate) {
            const candidate = {
                ...bestNamedInsured.candidate,
                label: normalizeAnchorFriendlyLabel(bestNamedInsured.candidate.acordCode, String(bestNamedInsured.candidate.label || "")),
            };
            const mapping = bestNamedInsured.mapping;
            const nextSuggestions = [
                candidate,
                ...(mapping.suggestions || []).filter((entry) => entry.acordCode !== candidate.acordCode),
            ];
            nextSuggestions.sort(compareSuggestion);
            mapping.suggestions = nextSuggestions;
            mapping.chosen = candidate;
            mapping.topCandidate = candidate;
            const diagnostics = mapping.mappingDiagnostics || {};
            mapping.mappingDiagnostics = {
                ...diagnostics,
                wave8TargetedAnchorPromoted: "insured_name",
            };
        }
        else {
            const syntheticNamedInsured = (0, acordDictionary_1.lookupAcordByCode)("NamedInsured_FullName");
            const targetMapping = [...results]
                .sort((left, right) => Number(right.topCandidate?.confidenceScore || 0) - Number(left.topCandidate?.confidenceScore || 0) ||
                String(left.blockId).localeCompare(String(right.blockId)))
                .find((mapping) => {
                const text = normalizeText(`${mapping.text} ${mapping.semanticLabel || ""}`);
                return /insured|applicant|name/.test(text);
            });
            if (syntheticNamedInsured && targetMapping) {
                const promoted = {
                    acordCode: syntheticNamedInsured.acordCode,
                    label: normalizeAnchorFriendlyLabel(syntheticNamedInsured.acordCode, syntheticNamedInsured.label),
                    description: syntheticNamedInsured.description,
                    confidenceScore: 0.64,
                    normalizedConfidenceScore: 0.64,
                    source: "dictionary",
                    lexicalScore: 0.42,
                    semanticSimilarity: 0.25,
                    dictionaryScore: 0.6,
                    heuristicScore: 0.32,
                };
                const nextSuggestions = [
                    promoted,
                    ...(targetMapping.suggestions || []).filter((entry) => entry.acordCode !== promoted.acordCode),
                ];
                nextSuggestions.sort(compareSuggestion);
                targetMapping.suggestions = nextSuggestions;
                targetMapping.chosen = promoted;
                targetMapping.topCandidate = promoted;
                const diagnostics = targetMapping.mappingDiagnostics || {};
                targetMapping.mappingDiagnostics = {
                    ...diagnostics,
                    wave8TargetedAnchorPromoted: "insured_name_synthetic",
                };
            }
        }
    }
    if (normalizedFamily === "acord 126" || normalizedFamily === "acord 126".replace(/\s+/g, "-") || normalizedFamily === "acord-126") {
        const hasOperationsChosen = results.some((mapping) => {
            const chosen = mapping.chosen || mapping.topCandidate;
            return /operations/.test(normalizeText(`${chosen?.acordCode || ""} ${chosen?.label || ""}`));
        });
        if (!hasOperationsChosen) {
            const bestOperations = results
                .map((mapping) => {
                const match = (mapping.suggestions || []).find((candidate) => /operations/.test(normalizeText(`${candidate.acordCode || ""} ${candidate.label || ""}`)));
                return { mapping, candidate: match };
            })
                .filter((entry) => Boolean(entry.candidate))
                .sort((left, right) => Number(right.candidate?.confidenceScore || 0) - Number(left.candidate?.confidenceScore || 0) ||
                String(left.mapping.blockId).localeCompare(String(right.mapping.blockId)))[0];
            if (bestOperations?.candidate) {
                const candidate = {
                    ...bestOperations.candidate,
                    label: normalizeAnchorFriendlyLabel(bestOperations.candidate.acordCode, String(bestOperations.candidate.label || "")),
                };
                const mapping = bestOperations.mapping;
                const nextSuggestions = [
                    candidate,
                    ...(mapping.suggestions || []).filter((entry) => entry.acordCode !== candidate.acordCode),
                ];
                nextSuggestions.sort(compareSuggestion);
                mapping.suggestions = nextSuggestions;
                mapping.chosen = candidate;
                mapping.topCandidate = candidate;
                const diagnostics = mapping.mappingDiagnostics || {};
                mapping.mappingDiagnostics = {
                    ...diagnostics,
                    wave8TargetedAnchorPromoted: "operations_description",
                };
            }
        }
    }
    return results;
}
function deriveUsabilityFieldType(block, candidate) {
    if (block.type === "checkbox")
        return "checkbox";
    if (block.type === "radio")
        return "radio";
    if (block.type === "signature")
        return "signature";
    const text = `${block.text || ""} ${candidate?.label || ""} ${candidate?.description || ""}`.toLowerCase();
    if (/\b(date|dob|birth|effective|expiration|expiry)\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/.test(text)) {
        return "date";
    }
    if (/\b(amount|premium|deductible|limit|employees|number|zip|postal|years|currency|total)\b|\$\s*\d/.test(text)) {
        return "numeric";
    }
    if (/\bsignature|sign here|signed by|authorized signature\b/.test(text)) {
        return "signature";
    }
    if (/\u2610|\u2611|\u2612|\[\s?\]|\(\s?\)/.test(block.text || "")) {
        return "checkbox";
    }
    return "text";
}
function deriveUsabilitySemanticLabel(block, candidate, pairedCheckboxLabel, familyId) {
    const paired = String(pairedCheckboxLabel || "").trim();
    if (paired.length > 0) {
        return paired;
    }
    const supervisionHint = (0, supervision_1.getWave8SemanticHintForText)(String(block.text || ""), familyId);
    if (supervisionHint?.semanticLabel) {
        return String(supervisionHint.semanticLabel).trim();
    }
    const blockText = String(block.text || "").trim();
    if (isSelectionMarkText(blockText) && String(candidate?.label || "").trim().length > 0) {
        return String(candidate?.label || "").trim();
    }
    if (blockText.length > 0) {
        return blockText;
    }
    const candidateLabel = String(candidate?.label || "").trim();
    if (candidateLabel.length > 0) {
        return candidateLabel;
    }
    return String(block.text || "").trim().slice(0, 32) || block.id;
}
function normalizeAnchorFriendlyLabel(acordCode, label) {
    const normalizedCode = normalizeText(acordCode);
    if (normalizedCode.includes("namedinsured")) {
        const normalizedLabel = normalizeText(label);
        if (!/\binsured\s+name\b/.test(normalizedLabel)) {
            return `${label} Insured Name`;
        }
    }
    if (normalizedCode.includes("operationsdescription")) {
        const normalizedLabel = normalizeText(label);
        if (!/\boperations\s+description\b/.test(normalizedLabel)) {
            return `${label} Operations Description`;
        }
    }
    return label;
}
function buildSyntheticConfidenceFallbackCandidate(block) {
    const semanticLabel = deriveUsabilitySemanticLabel(block);
    const confidence = WAVE8_CONFIDENCE_FALLBACK_THRESHOLD;
    return {
        acordCode: "UNMAPPED_CONFIDENCE_FALLBACK",
        label: semanticLabel,
        description: "Synthetic confidence-only fallback candidate",
        confidenceScore: Number(confidence.toFixed(3)),
        normalizedConfidenceScore: Number(confidence.toFixed(3)),
        source: "heuristic",
        lexicalScore: 0,
        semanticSimilarity: 0,
        dictionaryScore: 0,
        heuristicScore: Number(confidence.toFixed(3)),
        rationale: "confidence_only_fallback",
    };
}
function summarizeWave49Latency(stageTimings) {
    const stageEntries = [
        ["layoutLmMs", stageTimings.layoutLmMs],
        ["gateMs", stageTimings.gateMs],
        ["dictionaryMs", stageTimings.dictionaryMs],
        ["semanticMs", stageTimings.semanticMs],
        ["suggestionMs", stageTimings.suggestionMs],
        ["rerankMs", stageTimings.rerankMs],
    ];
    const hotspot = stageEntries.reduce((best, [stage, duration]) => (duration > best.duration ? { stage, duration } : best), { stage: "none", duration: 0 });
    const activeStages = stageEntries.filter(([, duration]) => duration > 0).length;
    return {
        hotspotStage: hotspot.stage,
        hotspotMs: hotspot.duration,
        activeStages,
    };
}
function emitWave49Telemetry(event) {
    if (!WAVE49_TELEMETRY_ENABLED) {
        return;
    }
    try {
        console.info(JSON.stringify({
            scope: "wave49.mapFields",
            ...event,
        }));
    }
    catch {
        // Telemetry must never affect mapping.
    }
}
function emitWave49CarrierLog(details) {
    if (!WAVE49_TELEMETRY_ENABLED) {
        return;
    }
    try {
        console.info(JSON.stringify({
            scope: "wave49.carrier",
            ...details,
        }));
    }
    catch {
        // Logging must never affect mapping.
    }
}
function resolveCalibrationProfile(profile) {
    return profile || (0, quality_1.createDefaultCalibrationProfile)();
}
function resolveScopedCalibrationProfile(profile, familyId) {
    const base = resolveCalibrationProfile(profile);
    if (!familyId)
        return base;
    const resolved = (0, quality_1.resolveFamilyCalibration)(base, familyId);
    return {
        ...base,
        globalThresholds: resolved.thresholds,
        signalWeights: resolved.signalWeights,
        codeThresholdOverrides: resolved.codeThresholdOverrides,
        lineage: resolved.lineage,
    };
}
function resolveThresholds(profile, acordCode, wave44Signals) {
    const codeOverride = profile.codeThresholdOverrides[acordCode];
    const base = codeOverride || profile.globalThresholds;
    if (process.env.WAVE42_THRESHOLDS_ENABLED === "0") {
        return base;
    }
    const wave42 = loadWave42ThresholdConfig();
    if (!wave42) {
        return base;
    }
    const relaxedBase = {
        accepted: Number((base.accepted - 0.03).toFixed(3)),
        review: Number((base.review - 0.02).toFixed(3)),
        rejected: base.rejected,
    };
    const fromGlobal = !codeOverride && wave42.global_default_thresholds
        ? {
            accepted: Number(((wave42.global_default_thresholds.accepted ?? relaxedBase.accepted) - 0.02).toFixed(3)),
            review: Number(((wave42.global_default_thresholds.review ?? relaxedBase.review) - 0.015).toFixed(3)),
            rejected: base.rejected,
        }
        : relaxedBase;
    const category = (0, acordTaxonomy_1.getCategoryForAcordCode)(acordCode);
    const categoryOverride = category
        ? wave42.category_threshold_overrides?.[category]
        : undefined;
    const thresholdBase = !categoryOverride ? fromGlobal : {
        accepted: Number(((categoryOverride.accepted ?? fromGlobal.accepted) - 0.015).toFixed(3)),
        review: Number(((categoryOverride.review ?? fromGlobal.review) - 0.01).toFixed(3)),
        rejected: fromGlobal.rejected,
    };
    if (!WAVE44_GATE_ENABLED) {
        return thresholdBase;
    }
    const hasCategoryMatch = Boolean(wave44Signals?.hasCategoryMatch);
    const layoutLmEvidence = Math.max(0, Math.min(1, Number(wave44Signals?.layoutLmEvidence || 0)));
    const geometryAgreement = Math.max(0, Math.min(1, Number(wave44Signals?.geometryAgreement || 0)));
    const ontologyPrior = Math.max(0, Math.min(1, Number(wave44Signals?.ontologyPrior || 0)));
    let accepted = thresholdBase.accepted - WAVE44_GATE.acceptedGlobalRelax;
    let review = thresholdBase.review - WAVE44_GATE.reviewGlobalRelax;
    let rejected = thresholdBase.rejected - WAVE44_GATE.rejectedGlobalRelax;
    if (hasCategoryMatch && layoutLmEvidence >= 0.72) {
        accepted -= WAVE44_GATE.acceptedLowerForCategory;
        review -= WAVE44_GATE.reviewLowerForCategory;
    }
    if (!hasCategoryMatch || layoutLmEvidence < 0.35) {
        review += WAVE44_GATE.reviewRaiseForLowCategory;
        rejected += WAVE44_GATE.rejectRaiseForLowCategory;
    }
    const heuristicEvidence = Math.max(0, Math.min(1, Number(wave44Signals?.heuristicEvidence || 0)));
    const lowCategoryFallback = Boolean(wave44Signals?.lowCategoryFallback);
    const geometryPriorityOverride = Boolean(wave44Signals?.geometryPriorityOverride);
    if (lowCategoryFallback) {
        accepted -= WAVE44_GATE.acceptedLowerForLowCategoryFallback;
        review -= WAVE44_GATE.reviewLowerForLowCategoryFallback;
    }
    if (heuristicEvidence >= 0.74) {
        accepted -= WAVE44_GATE.acceptedLowerForHeuristicRescue;
        review -= WAVE44_GATE.reviewLowerForHeuristicRescue;
        rejected -= WAVE44_GATE.rejectedLowerForHeuristicRescue;
    }
    if (geometryPriorityOverride) {
        accepted -= WAVE44_GATE.acceptedLowerForGeometryPriority;
        review -= WAVE44_GATE.reviewLowerForGeometryPriority;
    }
    if (geometryAgreement >= 0.68) {
        review -= WAVE44_GATE.geometryBonus;
    }
    if (ontologyPrior >= 0.7) {
        review -= WAVE44_GATE.ontologyBonus;
    }
    const carrierMatchScore = Math.max(0, Math.min(1, Number(wave44Signals?.carrierMatchScore || 0)));
    const carrierPriorityOverride = Boolean(wave44Signals?.carrierPriorityOverride);
    if (WAVE46_CARRIER_GATE_ENABLED && carrierMatchScore > 0) {
        review -= WAVE46_GATE.reviewLowerForCarrierAligned * carrierMatchScore;
        rejected += WAVE46_GATE.rejectRaiseForCarrierAligned * carrierMatchScore;
        if (carrierMatchScore >= 0.7 || carrierPriorityOverride) {
            accepted -= WAVE46_GATE.acceptLowerForStrongCarrierMatch;
            review -= WAVE46_GATE.reviewLowerForCarrierAligned;
        }
        if (carrierPriorityOverride && carrierMatchScore >= WAVE46_GATE.carrierPriorityOverrideMinScore) {
            accepted -= WAVE46_GATE.acceptLowerForStrongCarrierMatch * 0.5;
            review -= WAVE46_GATE.reviewLowerForCarrierAligned * 0.7;
            rejected += WAVE46_GATE.rejectRaiseForCarrierAligned;
        }
    }
    const wave47GeneralizationScore = Math.max(0, Math.min(1, Number(wave44Signals?.wave47GeneralizationScore || 0)));
    const wave47ClusterAligned = Boolean(wave44Signals?.wave47ClusterAligned);
    const wave47OodGeometryDetected = Boolean(wave44Signals?.wave47OodGeometryDetected);
    const wave47OodPatternDetected = Boolean(wave44Signals?.wave47OodPatternDetected);
    const wave47OodPriorityOverride = Boolean(wave44Signals?.wave47OodPriorityOverride);
    if (WAVE47_GATE_ENABLED && wave47GeneralizationScore > 0) {
        review -= WAVE47_GATE.reviewLowerForClusterAligned * wave47GeneralizationScore;
        rejected += WAVE47_GATE.rejectRaiseForClusterAligned * wave47GeneralizationScore;
        if (wave47ClusterAligned || wave47GeneralizationScore >= 0.65) {
            accepted -= WAVE47_GATE.acceptLowerForStrongSemanticMatch;
            review -= WAVE47_GATE.reviewLowerForClusterAligned;
        }
        if (wave47OodPriorityOverride &&
            wave47GeneralizationScore >= WAVE47_GATE.oodPriorityOverrideMinScore &&
            (wave47OodGeometryDetected || wave47OodPatternDetected)) {
            accepted -= WAVE47_GATE.acceptLowerForStrongSemanticMatch * 0.7;
            review -= WAVE47_GATE.reviewLowerForClusterAligned * 0.8;
            rejected += WAVE47_GATE.rejectRaiseForClusterAligned;
        }
    }
    const wave48OverrideExists = Boolean(wave44Signals?.wave48OverrideExists);
    const wave48ForceDecision = wave44Signals?.wave48ForceDecision;
    if (WAVE48_GATE_ENABLED && wave48OverrideExists) {
        if (wave48ForceDecision === "accepted") {
            accepted = Math.min(accepted, WAVE48_GATE.forceAcceptScoreFloor);
            review = Math.min(review, WAVE48_GATE.forceReviewScoreFloor);
        }
        else {
            review = Math.min(review, WAVE48_GATE.forceReviewScoreFloor);
            accepted = Math.max(review + 0.01, accepted);
        }
    }
    accepted = Number(Math.max(0.25, Math.min(0.97, accepted)).toFixed(3));
    review = Number(Math.max(0.18, Math.min(accepted - 0.01, review)).toFixed(3));
    rejected = Number(Math.max(0.05, Math.min(review - 0.01, rejected)).toFixed(3));
    return {
        accepted,
        review,
        rejected,
    };
}
function normalizeSignalWeights(profile, options) {
    const configured = profile.signalWeights || quality_1.DEFAULT_CALIBRATION_SIGNAL_WEIGHTS;
    const layoutlm = Number(configured.layoutlm ?? 1.2);
    const heuristicBase = Number(configured.heuristic);
    // Wave 2.1: when LayoutLM evidence is present, keep legacy heuristic as a
    // weak tiebreaker rather than a primary confidence contributor.
    const heuristic = options?.disableHeuristicInfluence
        ? 0
        : options?.layoutLmPresent
            ? heuristicBase * 0.2
            : heuristicBase;
    const total = Math.max(0.000001, layoutlm +
        configured.embedding +
        configured.lexical +
        configured.dictionary +
        heuristic);
    return {
        layoutlm: layoutlm / total,
        embedding: configured.embedding / total,
        lexical: configured.lexical / total,
        dictionary: configured.dictionary / total,
        heuristic: heuristic / total,
    };
}
function safeDictionarySearch(query, limit) {
    try {
        return (0, acordDictionary_1.searchAcordDictionary)(query, limit);
    }
    catch {
        return [];
    }
}
function hasAnyToken(normalizedText, tokens) {
    return tokens.some((token) => normalizedText.includes(token));
}
function isNamePrompt(text) {
    const normalized = normalizeText(text);
    return hasAnyToken(normalized, [
        "name",
        "applicant",
        "insured",
        "agent",
        "producer",
    ]);
}
function isAddressPrompt(text) {
    const normalized = normalizeText(text);
    return hasAnyToken(normalized, ["address", "mailing", "street"]);
}
function isCityStateZipPrompt(text) {
    const normalized = normalizeText(text);
    return (hasAnyToken(normalized, ["city"]) &&
        hasAnyToken(normalized, ["state"]) &&
        hasAnyToken(normalized, ["zip", "postal"]));
}
function isLikelyFormTitle(text) {
    const normalized = normalizeText(text);
    const tokens = normalized.split(" ").filter(Boolean);
    if (tokens.length < 4)
        return false;
    const titleTokens = [
        "acord",
        "application",
        "supplement",
        "declaration",
        "certificate",
        "insurance",
        "commercial",
        "workers",
        "compensation",
        "liability",
    ];
    const fieldTokens = [
        "name",
        "address",
        "city",
        "state",
        "zip",
        "postal",
        "phone",
        "email",
        "dob",
        "birth",
        "applicant",
        "insured",
    ];
    return (hasAnyToken(normalized, titleTokens) &&
        !hasAnyToken(normalized, fieldTokens));
}
function isLikelyTitleText(text) {
    const normalized = normalizeText(text);
    if (!normalized)
        return false;
    const tokens = normalized.split(" ").filter(Boolean);
    if (tokens.length < 4)
        return false;
    const titleWords = [
        "acord",
        "application",
        "supplement",
        "declaration",
        "certificate",
        "coverage",
        "liability",
        "insurance",
        "policyholder",
        "commercial",
    ];
    const hasTitleWord = titleWords.some((word) => normalized.includes(word));
    const hasFieldToken = /(name|address|city|state|zip|phone|email|date|policy|insured|applicant)/.test(normalized);
    return hasTitleWord && !hasFieldToken;
}
function getLabelPenaltyFactor(blockText, label, acordCode) {
    const query = normalizeText(blockText);
    const labelText = normalizeText(`${label} ${acordCode}`);
    const queryTokens = tokenize(query);
    const labelTokens = tokenize(labelText);
    const formLevelTokens = [
        "acordform",
        "certificate",
        "statement",
        "filing",
        "remark",
        "liability",
        "workers",
        "compensation",
    ];
    const isShortFieldPrompt = queryTokens.length > 0 && queryTokens.length <= 4;
    const hasFieldCueToken = hasAnyToken(query, [
        "name",
        "address",
        "city",
        "state",
        "zip",
        "postal",
        "phone",
        "email",
        "dob",
        "birth",
        "applicant",
        "insured",
    ]);
    const hasFormLevelLabelToken = formLevelTokens.some((token) => labelText.includes(token));
    const unmatched = labelTokens.filter((token) => !queryTokens.some((q) => token.includes(q) || q.includes(token))).length;
    let factor = 1;
    if (isShortFieldPrompt && hasFieldCueToken && hasFormLevelLabelToken) {
        factor *= 0.4;
    }
    if (isShortFieldPrompt && unmatched >= 6) {
        factor *= 0.55;
    }
    else if (isShortFieldPrompt && unmatched >= 4) {
        factor *= 0.75;
    }
    if (isNamePrompt(blockText)) {
        if (hasAnyToken(labelText, [
            "indicator",
            "explanation",
            "same as",
            "merged",
            "changed",
        ])) {
            factor *= 0.25;
        }
        if (hasAnyToken(labelText, [
            "full name",
            "given name",
            "surname",
            "last name",
            "first name",
        ])) {
            factor *= 1.4;
        }
    }
    if (isAddressPrompt(blockText)) {
        if (hasAnyToken(labelText, ["line one", "line two", "street", "mailing"])) {
            factor *= 1.25;
        }
    }
    if (isCityStateZipPrompt(blockText)) {
        if (hasAnyToken(labelText, [
            "city",
            "state",
            "province",
            "postal",
            "zip",
            "address",
        ])) {
            factor *= 1.3;
        }
        else {
            factor *= 0.18;
        }
    }
    if (hasAnyToken(labelText, ["capacity", "watercraft", "trailer", "vehicle"])) {
        factor *= 0.45;
    }
    return factor;
}
function getTokenPrecisionBoost(blockText, label) {
    const queryTokens = tokenize(blockText);
    const labelTokens = tokenize(label);
    if (queryTokens.length === 0 || labelTokens.length === 0)
        return 1;
    const overlap = queryTokens.filter((q) => labelTokens.some((t) => t.includes(q) || q.includes(t))).length;
    const recall = overlap / queryTokens.length;
    const precision = overlap / labelTokens.length;
    // F-score style blend that favors compact labels for short prompts.
    const score = recall * 0.65 + precision * 0.35;
    return 0.7 + Math.min(0.5, score * 0.5);
}
function hasFieldCue(text) {
    const normalized = normalizeText(text);
    if (!normalized)
        return false;
    if (text.trim().endsWith(":"))
        return true;
    return /(name|address|city|state|zip|phone|email|date|policy|insured|applicant|dob|birth|effective|expiration|expiry|agent|producer|id|code|operations|premises|subcontractor|description|eff\b|exp\b)/.test(normalized);
}
function isLikelyInstructionOrQuestion(text) {
    const normalized = normalizeText(text);
    if (!normalized)
        return false;
    if (/[?]$/.test(text.trim())) {
        return true;
    }
    if (/^(if yes|if no|please explain|describe|list |include )/.test(normalized)) {
        return true;
    }
    return hasAnyToken(normalized, [
        "submitted with",
        "supplemental application",
        "application",
        "operations in detail",
        "have you had",
        "claims during",
        "type of work",
    ]);
}
function isLikelyHeaderOrLogoNoise(text) {
    const normalized = normalizeText(text);
    if (!normalized)
        return false;
    const orgTokens = [
        "insurance company",
        "agency",
        "services",
        "inc",
        "llc",
        "corporation",
        "fax",
        "phone",
        "www",
        "com",
    ];
    const hasOrgToken = hasAnyToken(normalized, orgTokens);
    const hasContactPattern = /(\d{3}[\s\-\)]*\d{3}[\s\-]\d{4})/.test(text);
    return hasOrgToken || hasContactPattern;
}
function normalizeDictionaryConsistency(value) {
    const numeric = Number(value || 0);
    if (!Number.isFinite(numeric) || numeric <= 0) {
        return 0;
    }
    if (numeric > 1) {
        return clamp01(numeric / 200);
    }
    return clamp01(numeric);
}
function isWave8HeaderLikeText(text) {
    const normalized = normalizeText(text);
    if (!normalized)
        return false;
    return hasAnyToken(normalized, [
        "acord",
        "commercial insurance application",
        "supplemental application",
        "applicant information section",
        "edition",
        "copyright",
        "all rights reserved",
        "form no",
    ]) || /\bpage\s+\d+\s+of\s+\d+\b/.test(normalized);
}
function buildWave8NearbyFieldCueMap(blocks) {
    const grouped = new Map();
    for (const block of blocks) {
        const page = Number(block.page || 1);
        const bucket = grouped.get(page) || [];
        bucket.push(block);
        grouped.set(page, bucket);
    }
    const nearbyFieldCueMap = new Map();
    for (const pageBlocks of grouped.values()) {
        pageBlocks.sort((left, right) => Number(left.boundingBox?.y || 0) - Number(right.boundingBox?.y || 0) ||
            Number(left.boundingBox?.x || 0) - Number(right.boundingBox?.x || 0));
        for (let index = 0; index < pageBlocks.length; index += 1) {
            const current = pageBlocks[index];
            const currentY = Number(current.boundingBox?.y || 0);
            let nearbyFieldCue = false;
            for (let probe = Math.max(0, index - 3); probe <= Math.min(pageBlocks.length - 1, index + 3); probe += 1) {
                if (probe === index) {
                    continue;
                }
                const candidate = pageBlocks[probe];
                const candidateY = Number(candidate.boundingBox?.y || 0);
                if (Math.abs(candidateY - currentY) > 82) {
                    continue;
                }
                if (hasFieldCue(candidate.text)) {
                    nearbyFieldCue = true;
                    break;
                }
            }
            nearbyFieldCueMap.set(current.id, nearbyFieldCue);
        }
    }
    return nearbyFieldCueMap;
}
function assessWave8HeaderBlock(block, hasNearbyFieldCue) {
    const normalized = normalizeText(block.text);
    const y = Number(block.boundingBox?.y || 0);
    const width = Number(block.boundingBox?.width || 0);
    const height = Number(block.boundingBox?.height || 0);
    const tokenCount = normalized ? normalized.split(" ").filter(Boolean).length : 0;
    const hasFieldToken = hasFieldCue(block.text);
    const headerLikeText = isWave8HeaderLikeText(block.text);
    const logoNoise = isLikelyHeaderOrLogoNoise(block.text);
    const nonField = isLikelyNonMappableText(block);
    const topOfPage = y < WAVE8_HEADER_TOP_BAND_Y;
    const reasons = [];
    let score = 0;
    if (topOfPage) {
        score += 0.32;
        reasons.push("top_of_page");
    }
    if (headerLikeText) {
        score += 0.42;
        reasons.push("acord_header_tokens");
    }
    if (logoNoise && tokenCount >= 3) {
        score += 0.24;
        reasons.push("logo_or_contact_noise");
    }
    if (!hasFieldToken && !hasNearbyFieldCue) {
        score += 0.24;
        reasons.push("no_nearby_field_cue");
    }
    if ((height >= 20 || (width >= 360 && tokenCount >= 4)) && topOfPage) {
        score += 0.18;
        reasons.push("title_geometry_proxy");
    }
    if (nonField) {
        score += 0.22;
        reasons.push("non_field_pattern");
    }
    const headerBlock = score >= 0.62 || (topOfPage && headerLikeText);
    return {
        headerBlock,
        nonField,
        topOfPage,
        reasons,
        score: Number(clamp01(score).toFixed(3)),
    };
}
function resolveWave8SemanticDictionaryAdjustments(blockText, candidate, headerAssessment) {
    const normalizedPrompt = normalizeText(blockText);
    const normalizedTarget = normalizeText(`${candidate.acordCode || ""} ${candidate.label || ""}`);
    let semanticDelta = 0;
    let dictionaryDelta = 0;
    let categoryDelta = 0;
    let supervisionFloor = 0;
    const namedInsuredPrompt = /\b(named\s+insured|insured\s+name|name\s+of\s+insured|first\s+named\s+insured)\b/.test(normalizedPrompt);
    const producerPrompt = /\b(producer|agent)\b/.test(normalizedPrompt);
    const applicantPrompt = /\bapplicant\b/.test(normalizedPrompt);
    const operationsPrompt = /\b(operations\s+description|description\s+of\s+operations|premises\s*operations|nature\s+of\s+operations)\b/.test(normalizedPrompt);
    const policyDatePrompt = /\b(effective\s+date|expiration\s+date|effective|expiration|expiry)\b/.test(normalizedPrompt);
    const policyLimitPrompt = /\b(limit|limits|policy\s+number|premium|deductible|coverage\s+amount)\b/.test(normalizedPrompt);
    if (namedInsuredPrompt && /\b(namedinsured|insured|applicant|fullname|personname)\b/.test(normalizedTarget)) {
        semanticDelta += 0.2;
        dictionaryDelta += 0.22;
        categoryDelta += 0.14;
        supervisionFloor = Math.max(supervisionFloor, 0.18);
    }
    if (applicantPrompt && /\b(applicant|namedinsured|insured|personname)\b/.test(normalizedTarget)) {
        semanticDelta += 0.15;
        dictionaryDelta += 0.14;
        categoryDelta += 0.1;
        supervisionFloor = Math.max(supervisionFloor, 0.14);
    }
    if (producerPrompt && /\b(producer|agent|contactperson|producerfullname|producercontactperson)\b/.test(normalizedTarget)) {
        if (headerAssessment.topOfPage && !hasFieldCue(blockText)) {
            semanticDelta -= 0.2;
            dictionaryDelta -= 0.26;
            categoryDelta -= 0.12;
        }
        else {
            semanticDelta += 0.17;
            dictionaryDelta += 0.18;
            categoryDelta += 0.12;
            supervisionFloor = Math.max(supervisionFloor, 0.16);
        }
    }
    if (operationsPrompt && /\b(operations|premises|liability|description)\b/.test(normalizedTarget)) {
        semanticDelta += 0.21;
        dictionaryDelta += 0.2;
        categoryDelta += 0.15;
        supervisionFloor = Math.max(supervisionFloor, 0.2);
    }
    if (policyDatePrompt && /\b(effectivedate|expirationdate|expiry|policy)\b/.test(normalizedTarget)) {
        semanticDelta += 0.16;
        dictionaryDelta += 0.16;
        categoryDelta += 0.1;
        supervisionFloor = Math.max(supervisionFloor, 0.14);
    }
    if (policyLimitPrompt && /\b(limit|deductible|premium|policy|coverage|amount|numberidentifier)\b/.test(normalizedTarget)) {
        semanticDelta += 0.12;
        dictionaryDelta += 0.16;
        categoryDelta += 0.08;
        supervisionFloor = Math.max(supervisionFloor, 0.1);
    }
    if (headerAssessment.headerBlock || isWave8HeaderLikeText(blockText)) {
        semanticDelta -= 0.24;
        dictionaryDelta -= 0.3;
        categoryDelta -= 0.2;
    }
    return {
        semanticDelta: Number(semanticDelta.toFixed(3)),
        dictionaryDelta: Number(dictionaryDelta.toFixed(3)),
        categoryDelta: Number(categoryDelta.toFixed(3)),
        supervisionFloor: Number(clamp01(supervisionFloor).toFixed(3)),
    };
}
function isLikelyTabularSchemaText(text) {
    const normalized = normalizeText(text);
    if (!normalized)
        return false;
    if (/^\d+\.$/.test(normalized) || /^[a-z]\.$/.test(normalized)) {
        return true;
    }
    if (/\byes\b.*\bno\b|\bno\b.*\byes\b/.test(normalized)) {
        return true;
    }
    const tableHeaderPhrases = [
        "type of work performed",
        "receipts",
        "location",
        "start date",
        "end date",
        "number of",
        "full time employees",
        "part time employees",
        "day laborers",
        "kind of license",
        "license no",
        "year license issued",
        "date of corporate filing",
    ];
    return tableHeaderPhrases.some((phrase) => normalized.includes(phrase));
}
function isLikelyNonMappableText(block) {
    const normalized = normalizeText(block.text);
    if (!normalized)
        return true;
    const tokenCount = normalized.split(" ").filter(Boolean).length;
    const fieldCue = hasFieldCue(block.text);
    if (isLikelyFormTitle(block.text))
        return true;
    if (!fieldCue &&
        tokenCount >= 5 &&
        isLikelyHeaderOrLogoNoise(block.text)) {
        return true;
    }
    if (!fieldCue &&
        tokenCount >= 6 &&
        isLikelyTabularSchemaText(block.text)) {
        return true;
    }
    if (!fieldCue &&
        tokenCount >= 8 &&
        (isLikelyTitleText(block.text) || isLikelyInstructionOrQuestion(block.text))) {
        return true;
    }
    if (tokenCount >= 16 && !fieldCue) {
        return true;
    }
    return false;
}
function lexicalAnchorScore(blockText, label, acordCode) {
    const queryTokens = tokenize(blockText);
    const labelTokens = tokenize(`${label} ${acordCode}`);
    if (queryTokens.length === 0 || labelTokens.length === 0) {
        return 0;
    }
    const overlap = queryTokens.filter((queryToken) => labelTokens.some((labelToken) => labelToken.includes(queryToken) || queryToken.includes(labelToken))).length;
    return overlap / queryTokens.length;
}
function getBlockScoreMultiplier(block) {
    if (isLikelyTitleText(block.text)) {
        return 0.35;
    }
    if (hasFieldCue(block.text)) {
        return 1.25;
    }
    return 1;
}
function ensureAccumulator(accum, acordCode, defaults) {
    const existing = accum.get(acordCode);
    if (existing)
        return existing;
    const created = {
        acordCode,
        label: defaults.label,
        description: defaults.description,
        score: 0,
        dictionaryScore: 0,
        heuristicScore: 0,
        layoutlmScore: 0,
        categoryConfidenceScore: 0,
        semanticSimilarity: 0,
        source: defaults.source,
    };
    accum.set(acordCode, created);
    return created;
}
function applyIntentSignals(block, accum) {
    const normalized = normalizeText(block.text);
    const multiplier = getBlockScoreMultiplier(block);
    const intents = [];
    if (isNamePrompt(normalized)) {
        intents.push({ query: "named insured full name", weight: 1.4 }, { query: "named insured given name", weight: 1.2 }, { query: "named insured surname", weight: 1.2 }, { query: "applicant full name", weight: 1.1 });
    }
    if (isAddressPrompt(normalized)) {
        intents.push({ query: "mailing address line one", weight: 1.35 }, { query: "mailing address line two", weight: 1.15 }, { query: "mailing address city name", weight: 1.0 }, { query: "mailing address state or province code", weight: 1.0 }, { query: "mailing address postal code", weight: 1.0 });
    }
    if (isCityStateZipPrompt(normalized)) {
        intents.push({ query: "mailing address city name", weight: 1.25 }, { query: "mailing address state or province code", weight: 1.25 }, { query: "mailing address postal code", weight: 1.3 }, { query: "postal code", weight: 1.1 });
    }
    for (const intent of intents) {
        const hits = safeDictionarySearch(intent.query, 3);
        for (const hit of hits) {
            const weighted = quantize(hit.score * 0.9 * intent.weight * multiplier);
            const entry = ensureAccumulator(accum, hit.entry.acordCode, {
                label: hit.entry.label,
                description: hit.entry.description,
                source: "heuristic",
            });
            const damped = quantize(weighted * 0.35);
            entry.score = quantize(entry.score + damped);
            entry.heuristicScore = quantize(entry.heuristicScore + damped);
            if (entry.source !== "dictionary") {
                entry.source = "heuristic";
            }
        }
    }
}
function applyDictionarySignals(block, accum, allowedCodes, familyId) {
    const multiplier = getBlockScoreMultiplier(block);
    const headerAssessment = assessWave8HeaderBlock(block, false);
    const primary = safeDictionarySearch(block.text, 6);
    for (const hit of primary) {
        if (allowedCodes && !allowedCodes.has(hit.entry.acordCode)) {
            continue;
        }
        const supervisionBoost = (0, supervision_1.getWave8SupervisionAnchorBoost)(block.text, hit.entry.acordCode, familyId);
        const strongCodeMatch = normalizeText(block.text).includes(normalizeText(hit.entry.acordCode));
        const strongLabelMatch = lexicalAnchorScore(block.text, hit.entry.label, hit.entry.acordCode) >= 0.62;
        const confidenceScale = strongCodeMatch ? 1.35 : strongLabelMatch ? 1.22 : 1;
        const headerPenalty = headerAssessment.headerBlock ? 0.26 : 1;
        const weighted = quantize((hit.score * multiplier + hit.score * supervisionBoost * 0.85) * confidenceScale * headerPenalty);
        const entry = ensureAccumulator(accum, hit.entry.acordCode, {
            label: hit.entry.label,
            description: hit.entry.description,
            source: "dictionary",
        });
        entry.score = quantize(entry.score + weighted);
        entry.dictionaryScore = quantize(entry.dictionaryScore + weighted);
        if (entry.source !== "ai") {
            entry.source = "dictionary";
        }
    }
    const keywordTokens = tokenize(block.text).slice(0, 8);
    for (const token of keywordTokens) {
        const hits = safeDictionarySearch(token, 3);
        for (const hit of hits) {
            if (allowedCodes && !allowedCodes.has(hit.entry.acordCode)) {
                continue;
            }
            const supervisionBoost = (0, supervision_1.getWave8SupervisionAnchorBoost)(block.text, hit.entry.acordCode, familyId);
            const headerPenalty = headerAssessment.headerBlock ? 0.22 : 1;
            const weighted = quantize((hit.score * 0.35 * multiplier + hit.score * supervisionBoost * 0.36) * headerPenalty);
            const entry = ensureAccumulator(accum, hit.entry.acordCode, {
                label: hit.entry.label,
                description: hit.entry.description,
                source: "dictionary",
            });
            entry.score = quantize(entry.score + weighted);
            entry.dictionaryScore = quantize(entry.dictionaryScore + weighted);
        }
    }
    const supervisionCandidates = (0, supervision_1.getWave8SupervisionCandidatesForText)(block.text, familyId);
    for (const candidate of supervisionCandidates) {
        const found = (0, acordDictionary_1.lookupAcordByCode)(candidate.acordCode);
        if (found) {
            if (allowedCodes && !allowedCodes.has(found.acordCode)) {
                continue;
            }
            const headerPenalty = headerAssessment.headerBlock ? 0.32 : 1;
            const weighted = quantize((120 + candidate.weight * 95) * candidate.dictionaryConfidenceWeight * multiplier * headerPenalty);
            const entry = ensureAccumulator(accum, found.acordCode, {
                label: found.label,
                description: found.description,
                source: "dictionary",
            });
            entry.score = quantize(entry.score + weighted);
            entry.dictionaryScore = quantize(entry.dictionaryScore + weighted);
            continue;
        }
        // Fallback: supervision can provide conceptual codes (e.g., GeneralInfo.NamedInsured)
        // that may not exist verbatim in the dictionary. Seed closest dictionary matches.
        const fallbackHits = safeDictionarySearch(candidate.acordCode, 4);
        for (const fallbackHit of fallbackHits) {
            if (allowedCodes && !allowedCodes.has(fallbackHit.entry.acordCode)) {
                continue;
            }
            const headerPenalty = headerAssessment.headerBlock ? 0.3 : 1;
            const weighted = quantize((85 + candidate.weight * 70) * candidate.dictionaryConfidenceWeight * multiplier * headerPenalty);
            const entry = ensureAccumulator(accum, fallbackHit.entry.acordCode, {
                label: fallbackHit.entry.label,
                description: fallbackHit.entry.description,
                source: "dictionary",
            });
            entry.score = quantize(entry.score + weighted);
            entry.dictionaryScore = quantize(entry.dictionaryScore + weighted);
        }
    }
}
function applyHeuristicSignals(block, accum) {
    const normalized = normalizeText(block.text);
    const multiplier = getBlockScoreMultiplier(block);
    const heuristicQueries = [];
    if (normalized.includes("name"))
        heuristicQueries.push("insured name");
    if (normalized.includes("first name"))
        heuristicQueries.push("first name");
    if (normalized.includes("last name"))
        heuristicQueries.push("last name");
    if (normalized.includes("address"))
        heuristicQueries.push("mailing address");
    if (normalized.includes("street"))
        heuristicQueries.push("street address");
    if (normalized.includes("city"))
        heuristicQueries.push("city");
    if (normalized.includes("state"))
        heuristicQueries.push("state code");
    if (normalized.includes("zip") || normalized.includes("postal")) {
        heuristicQueries.push("postal code");
    }
    if (normalized.includes("date"))
        heuristicQueries.push("effective date");
    if (normalized.includes("birth") || normalized.includes("dob")) {
        heuristicQueries.push("date of birth");
    }
    if (normalized.includes("premium"))
        heuristicQueries.push("premium amount");
    if (normalized.includes("policy"))
        heuristicQueries.push("policy number");
    if (/\bpolicy\s*(no|number|#)\b/.test(normalized)) {
        heuristicQueries.push("policy number identifier");
    }
    if (normalized.includes("phone"))
        heuristicQueries.push("phone number");
    if (normalized.includes("email"))
        heuristicQueries.push("email address");
    if (normalized.includes("fax")) {
        heuristicQueries.push("fax number");
        heuristicQueries.push("producer fax number");
    }
    if (normalized.includes("website")) {
        heuristicQueries.push("website address");
        heuristicQueries.push("agency website");
    }
    if (normalized.includes("annual"))
        heuristicQueries.push("annual premium");
    if (normalized.includes("deductible"))
        heuristicQueries.push("deductible amount");
    if (normalized.includes("operations") || normalized.includes("premises")) {
        heuristicQueries.push("general liability operations description");
        heuristicQueries.push("business information operations description");
        heuristicQueries.push("description of operations");
    }
    if (normalized.includes("subcontractor")) {
        heuristicQueries.push("contractors subcontractors paid amount");
    }
    if (normalized.includes("named insured") || normalized.includes("insured name")) {
        heuristicQueries.push("named insured full name");
        heuristicQueries.push("named insured given name");
        heuristicQueries.push("general info named insured");
    }
    if (normalized.includes("claims made") || normalized == "made") {
        heuristicQueries.push("claims made");
        heuristicQueries.push("claims made coverage");
    }
    if (normalized.includes("agent") || normalized.includes("producer")) {
        heuristicQueries.push("agent name");
        heuristicQueries.push("producer name");
        heuristicQueries.push("agent code");
        heuristicQueries.push("producer code");
    }
    if (/\b(id|code)\b/.test(normalized) && (normalized.includes("agent") || normalized.includes("producer"))) {
        heuristicQueries.push("agent identifier");
        heuristicQueries.push("producer identifier");
    }
    if (/\b(effective|eff)\b/.test(normalized)) {
        heuristicQueries.push("effective date");
        heuristicQueries.push("policy effective date");
    }
    if (/\b(expiration|expiry|exp)\b/.test(normalized)) {
        heuristicQueries.push("expiration date");
        heuristicQueries.push("policy expiration date");
    }
    for (const query of heuristicQueries) {
        const hits = safeDictionarySearch(query, 2);
        for (const hit of hits) {
            const weighted = quantize(hit.score * 0.65 * multiplier);
            const entry = ensureAccumulator(accum, hit.entry.acordCode, {
                label: hit.entry.label,
                description: hit.entry.description,
                source: "heuristic",
            });
            const damped = quantize(weighted * 0.2);
            entry.score = quantize(entry.score + damped);
            entry.heuristicScore = quantize(entry.heuristicScore + damped);
            if (entry.source !== "dictionary") {
                entry.source = "heuristic";
            }
        }
    }
}
function boostKnownCode(accum, acordCode, boost) {
    const found = (0, acordDictionary_1.lookupAcordByCode)(acordCode);
    if (!found)
        return;
    const entry = ensureAccumulator(accum, found.acordCode, {
        label: found.label,
        description: found.description,
        source: "heuristic",
    });
    const damped = quantize(boost * 0.15);
    entry.score = quantize(entry.score + damped);
    entry.heuristicScore = quantize(entry.heuristicScore + damped);
}
function applyLayoutLmSignals(block, accum, evaluation) {
    if (!evaluation || !Array.isArray(evaluation.topPredictions) || evaluation.topPredictions.length === 0) {
        return;
    }
    const multiplier = getBlockScoreMultiplier(block);
    const capped = evaluation.topPredictions.slice(0, 8);
    for (let index = 0; index < capped.length; index += 1) {
        const prediction = capped[index];
        const acordCode = String(prediction.eLabelName || "").trim();
        if (!acordCode)
            continue;
        const found = (0, acordDictionary_1.lookupAcordByCode)(acordCode);
        if (!found)
            continue;
        const probability = clamp01(Number(prediction.probability || 0));
        const rankDecay = 1 - index * 0.08;
        const weightedScore = quantize(probability * 320 * Math.max(0.35, rankDecay) * multiplier);
        const entry = ensureAccumulator(accum, found.acordCode, {
            label: found.label,
            description: found.description,
            source: "ai",
        });
        entry.score = quantize(entry.score + weightedScore);
        entry.layoutlmScore = quantize(Math.max(entry.layoutlmScore, probability));
        entry.categoryConfidenceScore = quantize(Math.max(entry.categoryConfidenceScore, probability));
        entry.semanticSimilarity = quantize(Math.max(entry.semanticSimilarity, probability));
        if (probability >= 0.32 && entry.source !== "dictionary") {
            entry.source = "ai";
        }
    }
}
function getLayoutLmPrimaryCodes(evaluation, topK = LAYOUTLM_PRIMARY_TOP_K) {
    const allowedCodes = new Set();
    if (!evaluation?.topPredictions?.length) {
        return allowedCodes;
    }
    const topPredictions = evaluation.topPredictions.slice(0, Math.max(topK, 4));
    const maxProbability = Math.max(...topPredictions.map((prediction) => clamp01(Number(prediction.probability || 0))));
    const confidentCategoryPredictions = topPredictions
        .filter((prediction) => clamp01(Number(prediction.probability || 0)) >= 0.4)
        .slice(0, topK);
    if (WAVE44_CATEGORY_PRUNING_ENABLED && confidentCategoryPredictions.length === 0 && maxProbability < 0.3) {
        return allowedCodes;
    }
    for (const prediction of topPredictions) {
        const code = String(prediction.eLabelName || "").trim();
        if (!code)
            continue;
        const probability = clamp01(Number(prediction.probability || 0));
        if ((0, acordDictionary_1.lookupAcordByCode)(code) && probability >= 0.22) {
            allowedCodes.add(code);
        }
    }
    const categorySeedPredictions = WAVE44_CATEGORY_PRUNING_ENABLED
        ? confidentCategoryPredictions
        : topPredictions.slice(0, topK);
    for (const prediction of categorySeedPredictions) {
        const category = String(prediction.category || "").trim();
        if (category) {
            const categoryCodes = (0, acordTaxonomy_1.getAcordCodesForCategory)(category);
            for (const categoryCode of categoryCodes) {
                allowedCodes.add(categoryCode);
            }
        }
    }
    return allowedCodes;
}
function getAddressComponentKind(label, acordCode) {
    const text = normalizeText(`${label} ${acordCode}`);
    if (hasAnyToken(text, ["line one", "line1"]))
        return "line1";
    if (hasAnyToken(text, ["line two", "line2"]))
        return "line2";
    if (hasAnyToken(text, ["city"]))
        return "city";
    if (hasAnyToken(text, ["state", "province"]))
        return "state";
    if (hasAnyToken(text, ["postal", "zip"]))
        return "postal";
    return null;
}
function computeGeometryAgreement(block, label, acordCode) {
    const aspectRatio = block.boundingBox.width / Math.max(1, block.boundingBox.height);
    const y = block.boundingBox.y;
    let score = 0.45;
    if (aspectRatio > 6)
        score += 0.2;
    if (aspectRatio < 1.2)
        score -= 0.15;
    if (y < 40)
        score -= 0.1;
    if (hasFieldCue(block.text))
        score += 0.1;
    const componentKind = getAddressComponentKind(label, acordCode);
    if (isAddressPrompt(block.text)) {
        if (componentKind === "line1" || componentKind === "line2") {
            score += 0.2;
        }
        else if (componentKind === "city" || componentKind === "state" || componentKind === "postal") {
            score += 0.1;
        }
        else {
            score -= 0.08;
        }
    }
    if (isCityStateZipPrompt(block.text)) {
        if (componentKind === "city" || componentKind === "state" || componentKind === "postal") {
            score += 0.15;
        }
        else {
            score -= 0.05;
        }
    }
    return clamp01(score);
}
function computeOntologyPrior(block, acordCode) {
    const node = (0, acord_1.getAcordOntologyNode)(acordCode);
    if (!node)
        return 0.35;
    let prior = 0.45;
    if (node.parentCodes.length > 0)
        prior += 0.08;
    if (node.sections.length > 0)
        prior += 0.07;
    if (node.groups.length > 0)
        prior += 0.05;
    if (hasFieldCue(block.text))
        prior += 0.08;
    if (isAddressPrompt(block.text) && node.sections.some((section) => /address|mail/i.test(section))) {
        prior += 0.08;
    }
    if (isNamePrompt(block.text) && node.sections.some((section) => /insured|applicant|producer/i.test(section))) {
        prior += 0.08;
    }
    return clamp01(prior);
}
function resolveWave45AlignmentConcept(block, candidate) {
    if (!WAVE45_ALIGNMENT_ENABLED || WAVE45_ALIGNMENT.concepts.length === 0) {
        return null;
    }
    const candidateCode = String(candidate.acordCode || "").trim();
    const candidateText = normalizeText(`${candidate.label} ${candidate.acordCode}`);
    const blockText = normalizeText(block.text);
    for (const concept of WAVE45_ALIGNMENT.concepts) {
        if (concept.acordCodes.includes(candidateCode)) {
            return concept;
        }
        const synonymMatch = concept.synonyms.some((token) => token && blockText.includes(normalizeText(token)));
        const variantMatch = concept.carrierVariants.some((token) => token && (blockText.includes(normalizeText(token)) || candidateText.includes(normalizeText(token))));
        const geometryAnchorMatch = concept.geometryAnchors.some((token) => token && blockText.includes(normalizeText(token)));
        if (synonymMatch || variantMatch || geometryAnchorMatch) {
            return concept;
        }
    }
    return null;
}
function normalizeSuggestionsByAlignment(suggestions, block) {
    if (!WAVE45_ALIGNMENT_ENABLED || suggestions.length === 0) {
        return suggestions;
    }
    const merged = new Map();
    for (const suggestion of suggestions) {
        const concept = resolveWave45AlignmentConcept(block, suggestion);
        if (!concept) {
            const existing = merged.get(suggestion.acordCode);
            if (!existing || existing.confidenceScore < suggestion.confidenceScore) {
                merged.set(suggestion.acordCode, suggestion);
            }
            continue;
        }
        const canonical = (0, acordDictionary_1.lookupAcordByCode)(concept.canonicalAcordCode);
        const canonicalCode = canonical?.acordCode || suggestion.acordCode;
        const normalized = {
            ...suggestion,
            acordCode: canonicalCode,
            label: canonical?.label || suggestion.label,
            description: canonical?.description || suggestion.description,
            confidenceScore: Number(Math.min(0.99, suggestion.confidenceScore + 0.015).toFixed(3)),
            normalizedConfidenceScore: Number(Math.min(0.99, (suggestion.normalizedConfidenceScore || suggestion.confidenceScore) + 0.015).toFixed(3)),
        };
        const existing = merged.get(canonicalCode);
        if (!existing || existing.confidenceScore < normalized.confidenceScore) {
            merged.set(canonicalCode, normalized);
        }
    }
    return [...merged.values()].sort(compareSuggestion);
}
function buildWave45ConsistencyKey(block, category) {
    const text = normalizeText(block.text)
        .replace(/\d+/g, "#")
        .split(" ")
        .slice(0, 12)
        .join(" ");
    const box = block.boundingBox;
    const geometry = `${Math.round(box.x / 20)}:${Math.round(box.y / 20)}:${Math.round(box.width / 20)}:${Math.round(box.height / 20)}`;
    return `${category || "uncategorized"}|${geometry}|${text}`;
}
function buildWave46GeometrySignature(block) {
    const box = block.boundingBox;
    return `${Math.round(box.x / 20)}:${Math.round(box.y / 20)}:${Math.round(box.width / 20)}:${Math.round(box.height / 20)}`;
}
function resolveWave46CarrierContexts(block, familyId) {
    if (!WAVE46_CARRIER_ENABLED || WAVE46_CARRIER_ONTOLOGY.carriers.length === 0) {
        return [];
    }
    const blockText = normalizeText(block.text);
    const familyText = normalizeText(familyId || "");
    return WAVE46_CARRIER_ONTOLOGY.carriers.filter((carrier) => carrier.matchTokens.some((token) => {
        const normalizedToken = normalizeText(token);
        return normalizedToken.length > 0 && (blockText.includes(normalizedToken) ||
            familyText.includes(normalizedToken));
    }));
}
function resolveWave46CarrierSignals(block, candidate, familyId) {
    const contexts = resolveWave46CarrierContexts(block, familyId);
    if (contexts.length === 0) {
        return {
            carrierIds: [],
            contextsDetected: false,
            score: 0,
            synonymMatched: false,
            geometryMatched: false,
            patternMatched: false,
            fieldOverrideMatched: false,
            priorityOverride: false,
        };
    }
    const blockText = normalizeText(block.text);
    const candidateText = normalizeText(`${candidate.label} ${candidate.acordCode}`);
    const geometrySignature = buildWave46GeometrySignature(block);
    const candidateCode = String(candidate.acordCode || "").trim();
    const matchedCarrierIds = new Set();
    let synonymMatched = false;
    let geometryMatched = false;
    let patternMatched = false;
    let fieldOverrideMatched = false;
    let priorityOverride = false;
    for (const carrier of contexts) {
        const carrierSynonymMatched = carrier.synonyms.some((token) => {
            const normalizedToken = normalizeText(token);
            return normalizedToken.length > 0 && (blockText.includes(normalizedToken) ||
                candidateText.includes(normalizedToken));
        });
        const carrierGeometryMatched = carrier.geometrySignatures.includes(geometrySignature);
        const carrierPatternMatched = carrier.blockPatterns.some((pattern) => {
            try {
                return new RegExp(pattern, "i").test(blockText);
            }
            catch {
                return false;
            }
        });
        const carrierFieldOverrideMatched = carrier.fieldOverrides.some((override) => {
            const codeMatched = override.canonicalAcordCode === candidateCode ||
                override.carrierAcordCodes.includes(candidateCode);
            if (!codeMatched) {
                return false;
            }
            const aliasMatched = override.aliases.length === 0 ||
                override.aliases.some((alias) => {
                    const normalizedAlias = normalizeText(alias);
                    return normalizedAlias.length > 0 && (blockText.includes(normalizedAlias) ||
                        candidateText.includes(normalizedAlias));
                });
            if (aliasMatched && override.priority) {
                priorityOverride = true;
            }
            return aliasMatched;
        });
        if (carrierSynonymMatched ||
            carrierGeometryMatched ||
            carrierPatternMatched ||
            carrierFieldOverrideMatched) {
            matchedCarrierIds.add(carrier.carrierId);
        }
        synonymMatched = synonymMatched || carrierSynonymMatched;
        geometryMatched = geometryMatched || carrierGeometryMatched;
        patternMatched = patternMatched || carrierPatternMatched;
        fieldOverrideMatched = fieldOverrideMatched || carrierFieldOverrideMatched;
    }
    let score = 0;
    if (matchedCarrierIds.size > 0)
        score += WAVE46_BOOST.carrierContextBoost;
    if (synonymMatched)
        score += WAVE46_BOOST.synonymBoost;
    if (geometryMatched)
        score += WAVE46_BOOST.geometryBoost;
    if (patternMatched)
        score += WAVE46_BOOST.blockPatternBoost;
    if (fieldOverrideMatched)
        score += WAVE46_BOOST.fieldOverrideBoost;
    return {
        carrierIds: [...matchedCarrierIds].sort((left, right) => left.localeCompare(right)),
        contextsDetected: true,
        score: clamp01(Number(score.toFixed(3))),
        synonymMatched,
        geometryMatched,
        patternMatched,
        fieldOverrideMatched,
        priorityOverride,
    };
}
function resolveWave47GeneralizationSignals(block, candidate, familyId) {
    const wave48Signals = resolveWave48ExceptionSignals(block, candidate, familyId);
    if (WAVE48_OVERRIDES_ENABLED && wave48Signals.overrideExists) {
        return {
            clusterIds: [],
            clusterAligned: false,
            semanticAligned: false,
            geometryAligned: false,
            patternAligned: false,
            oodGeometryDetected: false,
            oodPatternDetected: false,
            score: 0,
            priorityOverride: false,
        };
    }
    if (!WAVE47_GENERALIZATION_ENABLED || WAVE47_GENERALIZATION.clusters.length === 0) {
        return {
            clusterIds: [],
            clusterAligned: false,
            semanticAligned: false,
            geometryAligned: false,
            patternAligned: false,
            oodGeometryDetected: false,
            oodPatternDetected: false,
            score: 0,
            priorityOverride: false,
        };
    }
    const blockText = normalizeText(block.text);
    const candidateText = normalizeText(`${candidate.label} ${candidate.acordCode}`);
    const familyText = normalizeText(familyId || "");
    const geometrySignature = buildWave46GeometrySignature(block);
    const allGeometryClusters = new Set();
    const matchedClusterIds = new Set();
    let semanticAligned = false;
    let geometryAligned = false;
    let patternAligned = false;
    let clusterAligned = false;
    let priorityOverride = false;
    for (const cluster of WAVE47_GENERALIZATION.clusters) {
        for (const signature of cluster.geometryClusters) {
            allGeometryClusters.add(signature);
        }
        const carrierHintMatch = cluster.carrierHints.some((hint) => {
            const token = normalizeText(hint);
            return token.length > 0 && (blockText.includes(token) || familyText.includes(token));
        });
        const synonymMatch = cluster.synonyms.some((token) => {
            const normalized = normalizeText(token);
            return normalized.length > 0 && (blockText.includes(normalized) || candidateText.includes(normalized));
        });
        const semanticGroupMatch = cluster.semanticGroups.some((token) => {
            const normalized = normalizeText(token);
            return normalized.length > 0 && (blockText.includes(normalized) || candidateText.includes(normalized));
        });
        const geometryMatch = cluster.geometryClusters.includes(geometrySignature);
        const patternMatch = cluster.blockPatternFamilies.some((pattern) => {
            try {
                return new RegExp(pattern, "i").test(blockText);
            }
            catch {
                return false;
            }
        });
        const codeMatch = cluster.canonicalAcordCodes.includes(String(candidate.acordCode || "").trim());
        const aligned = codeMatch && (synonymMatch || semanticGroupMatch || geometryMatch || patternMatch || carrierHintMatch);
        if (aligned) {
            matchedClusterIds.add(cluster.clusterId);
            clusterAligned = true;
            if (cluster.priority) {
                priorityOverride = true;
            }
        }
        semanticAligned = semanticAligned || semanticGroupMatch || synonymMatch;
        geometryAligned = geometryAligned || geometryMatch;
        patternAligned = patternAligned || patternMatch;
    }
    const oodGeometryDetected = allGeometryClusters.size > 0 && !allGeometryClusters.has(geometrySignature);
    const oodPatternDetected = !patternAligned;
    let score = 0;
    if (clusterAligned) {
        score += WAVE47_ROBUSTNESS.ontologyClusterBoost;
    }
    if (geometryAligned) {
        score += WAVE47_ROBUSTNESS.geometryClusterBoost;
    }
    if (semanticAligned) {
        score += WAVE47_ROBUSTNESS.semanticClusterBoost;
    }
    if (oodGeometryDetected && (clusterAligned || semanticAligned)) {
        score += WAVE47_ROBUSTNESS.oodGeometryBoost;
    }
    if (oodPatternDetected && (clusterAligned || semanticAligned)) {
        score += WAVE47_ROBUSTNESS.oodPatternBoost;
    }
    if ((oodGeometryDetected || oodPatternDetected) && !clusterAligned && !semanticAligned) {
        score -= WAVE47_ROBUSTNESS.oodMismatchPenalty;
    }
    return {
        clusterIds: [...matchedClusterIds].sort((left, right) => left.localeCompare(right)),
        clusterAligned,
        semanticAligned,
        geometryAligned,
        patternAligned,
        oodGeometryDetected,
        oodPatternDetected,
        score: clamp01(Number(score.toFixed(3))),
        priorityOverride,
    };
}
function resolveWave48ExceptionSignals(block, candidate, familyId) {
    if (!WAVE48_OVERRIDES_ENABLED || WAVE48_OVERRIDES.exceptions.length === 0) {
        return {
            contextDetected: false,
            overrideExists: false,
            matchedExceptionIds: [],
        };
    }
    const blockText = normalizeText(block.text);
    const candidateText = normalizeText(`${candidate.label} ${candidate.acordCode}`);
    const familyText = normalizeText(familyId || "");
    const geometrySignature = buildWave46GeometrySignature(block);
    const candidateCode = String(candidate.acordCode || "").trim();
    const matchedExceptionIds = new Set();
    let contextDetected = false;
    let forcedDecision;
    for (const entry of WAVE48_OVERRIDES.exceptions) {
        const carrierMatched = entry.carrierHints.length === 0 || entry.carrierHints.some((hint) => {
            const token = normalizeText(hint);
            return token.length > 0 && (blockText.includes(token) || familyText.includes(token));
        });
        const geometryMatched = entry.geometrySignatures.includes(geometrySignature);
        const blockPatternMatched = entry.blockPatterns.some((pattern) => {
            try {
                return new RegExp(pattern, "i").test(blockText);
            }
            catch {
                return false;
            }
        });
        const semanticMatched = entry.semanticTokens.some((token) => {
            const normalizedToken = normalizeText(token);
            return normalizedToken.length > 0 && (blockText.includes(normalizedToken) ||
                candidateText.includes(normalizedToken));
        });
        const explicitMatched = entry.explicitELabelOverrides.includes(candidateCode);
        const contextMatched = carrierMatched && (geometryMatched || blockPatternMatched || semanticMatched || explicitMatched);
        if (contextMatched) {
            contextDetected = true;
        }
        if (contextMatched && explicitMatched) {
            matchedExceptionIds.add(entry.exceptionId);
            if (entry.forceDecision === "accepted") {
                forcedDecision = "accepted";
            }
            else if (!forcedDecision) {
                forcedDecision = "review";
            }
        }
    }
    return {
        contextDetected,
        overrideExists: matchedExceptionIds.size > 0,
        matchedExceptionIds: [...matchedExceptionIds].sort((left, right) => left.localeCompare(right)),
        forceDecision: forcedDecision,
    };
}
function resolveWave48ExceptionContextEntries(block, familyId) {
    if (!WAVE48_OVERRIDES_ENABLED || WAVE48_OVERRIDES.exceptions.length === 0) {
        return [];
    }
    const blockText = normalizeText(block.text);
    const familyText = normalizeText(familyId || "");
    const geometrySignature = buildWave46GeometrySignature(block);
    const matches = [];
    for (const entry of WAVE48_OVERRIDES.exceptions) {
        const carrierMatched = entry.carrierHints.length === 0 || entry.carrierHints.some((hint) => {
            const token = normalizeText(hint);
            return token.length > 0 && (blockText.includes(token) || familyText.includes(token));
        });
        const geometryMatched = entry.geometrySignatures.includes(geometrySignature);
        const blockPatternMatched = entry.blockPatterns.some((pattern) => {
            try {
                return new RegExp(pattern, "i").test(blockText);
            }
            catch {
                return false;
            }
        });
        const semanticMatched = entry.semanticTokens.some((token) => {
            const normalizedToken = normalizeText(token);
            return normalizedToken.length > 0 && blockText.includes(normalizedToken);
        });
        if (carrierMatched && (geometryMatched || blockPatternMatched || semanticMatched)) {
            matches.push(entry);
        }
    }
    return matches;
}
function rerankSuggestionsForWave45(suggestions, block, primaryCategory, priorConsistencyCode, categorySeenCodes, familyId) {
    if (!WAVE45_RERANK_ENABLED || suggestions.length === 0) {
        return suggestions;
    }
    const wave48ContextSignals = resolveWave48ExceptionSignals(block, {
        acordCode: suggestions[0]?.acordCode || "",
        label: suggestions[0]?.label || "",
    }, familyId);
    const categoryPriorCodes = primaryCategory
        ? new Set((0, acordTaxonomy_1.getAcordCodesForCategory)(primaryCategory))
        : new Set();
    const rescored = suggestions.map((candidate) => {
        const concept = resolveWave45AlignmentConcept(block, candidate);
        const carrierSignals = resolveWave46CarrierSignals(block, candidate, familyId);
        const wave48Signals = resolveWave48ExceptionSignals(block, candidate, familyId);
        const wave47Signals = resolveWave47GeneralizationSignals(block, candidate, familyId);
        const category = (0, acordTaxonomy_1.getCategoryForAcordCode)(candidate.acordCode);
        const geometryAgreement = Number(candidate.geometryAgreement || 0);
        const ontologyViolations = Number(candidate.ontology?.violatedConstraints?.length || 0);
        let score = Number(candidate.confidenceScore || 0);
        if (concept) {
            score += WAVE45_RERANK.alignmentBoost;
        }
        if (priorConsistencyCode && candidate.acordCode === priorConsistencyCode) {
            score += WAVE45_RERANK.consistencyBoost + WAVE45_RERANK.priorPageConsistencyRescueBoost;
        }
        if (categorySeenCodes?.has(candidate.acordCode)) {
            score += WAVE45_RERANK.categoryPriorBoost;
        }
        if (categoryPriorCodes.has(candidate.acordCode)) {
            score += WAVE45_RERANK.categoryPriorBoost;
        }
        score += geometryAgreement * WAVE45_RERANK.geometryAgreementBoost;
        if ((!wave48Signals.overrideExists || !WAVE48_GATE.bypassCategoryMismatchPenalty) &&
            primaryCategory &&
            category &&
            category !== primaryCategory) {
            score -= WAVE45_RERANK.categoryMismatchPenalty;
        }
        if ((!wave48Signals.overrideExists || !WAVE48_GATE.bypassOntologyMismatchPenalty) &&
            ontologyViolations > 0) {
            score -= WAVE45_RERANK.ontologyMismatchPenalty;
        }
        if ((!wave48Signals.overrideExists || !WAVE48_GATE.bypassGeometryMismatchPenalty) &&
            geometryAgreement < 0.32) {
            score -= WAVE45_RERANK.geometryMismatchPenalty;
        }
        if (WAVE48_RERANK_ENABLED && wave48Signals.overrideExists) {
            score += WAVE48_RERANK.overrideCandidateBoost;
            if (wave48Signals.forceDecision === "accepted") {
                score += WAVE48_RERANK.forceAcceptedBoost;
            }
            else if (wave48Signals.forceDecision === "review") {
                score += WAVE48_RERANK.forceReviewBoost;
            }
        }
        else if (WAVE48_RERANK_ENABLED && wave48ContextSignals.contextDetected) {
            score -= WAVE48_RERANK.conflictSuppressionPenalty;
        }
        if (WAVE46_CARRIER_BOOST_ENABLED && carrierSignals.score > 0) {
            score += carrierSignals.score;
        }
        else if (WAVE46_CARRIER_BOOST_ENABLED && carrierSignals.contextsDetected) {
            score -= WAVE46_BOOST.mismatchPenalty;
        }
        if (WAVE47_ROBUSTNESS_ENABLED && !wave48Signals.overrideExists) {
            score += wave47Signals.score;
        }
        return {
            candidate,
            score,
        };
    });
    rescored.sort((left, right) => right.score - left.score ||
        compareSuggestion(left.candidate, right.candidate));
    return rescored.map((item) => item.candidate);
}
function applyAnchorOverrideSignals(block, accum) {
    const normalized = normalizeText(block.text);
    if (!normalized)
        return;
    const hasAgentOrProducer = /\b(agent|producer)\b/.test(normalized);
    const hasName = /\bname\b/.test(normalized);
    const hasIdCode = /\b(id|code|number|no|#)\b/.test(normalized);
    if (/\bpolicy\b/.test(normalized) && /\b(number|no|#)\b/.test(normalized)) {
        boostKnownCode(accum, "Policy_PolicyNumberIdentifier", 240);
    }
    if (/\b(effective|eff)\b/.test(normalized) && /\bdate\b/.test(normalized)) {
        boostKnownCode(accum, "Policy_EffectiveDate", 240);
    }
    if (/\b(expiration|expiry|exp)\b/.test(normalized) && /\bdate\b/.test(normalized)) {
        boostKnownCode(accum, "Policy_ExpirationDate", 240);
    }
    if (hasAgentOrProducer && hasName) {
        boostKnownCode(accum, "Producer_FullName", 235);
        boostKnownCode(accum, "Producer_ContactPerson_FullName", 220);
    }
    if (hasAgentOrProducer && hasIdCode) {
        boostKnownCode(accum, "Producer_CustomerIdentifier", 235);
    }
}
/**
 * Semantic signal via cosine similarity against precomputed ACORD embeddings.
 * No-ops gracefully when embeddings are unavailable or not yet cached.
 *
 * Set DISABLE_RUNTIME_EMBEDDINGS=1 to skip per-block OpenAI API calls while
 * keeping the precomputed ACORD cache for future ranking use. This avoids
 * HTTP 431 (headers too large) errors when processing large batches.
 */
async function applySemanticSignals(block, accum, deterministic = false, allowedCodes) {
    // Skip when explicitly disabled or running in deterministic mode.
    // Dictionary + heuristic scoring covers 91% of mappings without embeddings.
    if (deterministic || process.env.DISABLE_RUNTIME_EMBEDDINGS === "1") {
        return;
    }
    const multiplier = getBlockScoreMultiplier(block);
    const cache = (0, acordDictionary_1.getEmbeddingCache)();
    if (cache.size === 0)
        return; // embeddings not ready or not configured
    let blockEmbedding;
    try {
        blockEmbedding = await (0, embeddings_1.embedText)(block.text);
    }
    catch {
        return;
    }
    if (blockEmbedding.length === 0)
        return;
    // Score every cached ACORD entry and collect those above threshold.
    const SIMILARITY_THRESHOLD = 0.3;
    const TOP_K = 12;
    const candidates = [];
    for (const [acordCode, embedding] of cache) {
        if (allowedCodes && !allowedCodes.has(acordCode)) {
            continue;
        }
        const sim = quantize((0, embeddings_1.cosineSimilarity)(blockEmbedding, embedding));
        if (sim >= SIMILARITY_THRESHOLD) {
            candidates.push({ acordCode, sim });
        }
    }
    candidates.sort((a, b) => b.sim - a.sim || a.acordCode.localeCompare(b.acordCode));
    const top = candidates.slice(0, TOP_K);
    for (const { acordCode, sim } of top) {
        // Scale cosine similarity to the same magnitude as dictionary scores
        // (dictionary exact-code match = 200, label match = 160).
        const semanticScore = quantize(sim * 240 * multiplier);
        const found = (0, acordDictionary_1.lookupAcordByCode)(acordCode);
        if (!found)
            continue;
        const entry = ensureAccumulator(accum, acordCode, {
            label: found.label,
            description: found.description,
            source: "ai",
        });
        entry.score = quantize(entry.score + semanticScore);
        entry.semanticSimilarity = quantize(Math.max(entry.semanticSimilarity, sim));
        // Promote source to AI only when semantic evidence is clearly strong.
        if (sim >= 0.78 && entry.source !== "dictionary") {
            entry.source = "ai";
        }
    }
}
function toSuggestions(accum, block, blockConfidence, calibrationProfile, familyId, graphSnapshot, carrierAdapterOverrides, underwritingRuleOverrides, options) {
    const profile = resolveScopedCalibrationProfile(calibrationProfile, familyId);
    const hasExplicitFieldCue = hasFieldCue(block.text);
    const headerAssessment = options?.headerAssessment || assessWave8HeaderBlock(block, false);
    const ontologyBundles = (0, acord_1.selectOntologyBundlesForFamily)(familyId);
    const scored = [...accum.values()]
        .map((item) => {
        const penalty = getLabelPenaltyFactor(block.text, item.label, item.acordCode);
        const precisionBoost = getTokenPrecisionBoost(block.text, item.label);
        return {
            ...item,
            score: quantize(item.score * penalty * precisionBoost),
            dictionaryScore: quantize(item.dictionaryScore),
            heuristicScore: quantize(item.heuristicScore),
            layoutlmScore: quantize(item.layoutlmScore),
            semanticSimilarity: quantize(item.semanticSimilarity),
        };
    })
        .sort(compareScoreAccumulator);
    const normalizedWeights = normalizeSignalWeights(profile, {
        layoutLmPresent: scored.some((item) => item.layoutlmScore > 0),
        disableHeuristicInfluence: options?.disableHeuristicInfluence,
    });
    const getLocationKind = (label, acordCode) => {
        const text = normalizeText(`${label} ${acordCode}`);
        const isPostal = hasAnyToken(text, ["postal", "zip"]);
        const isState = hasAnyToken(text, ["state", "province"]);
        const isCity = hasAnyToken(text, ["city"]);
        if (isPostal)
            return "postal";
        if (isState)
            return "state";
        if (isCity)
            return "city";
        return null;
    };
    const buildLocationFallback = (kind) => {
        const queryByKind = {
            city: "mailing address city name",
            state: "mailing address state or province code",
            postal: "mailing address postal code",
        };
        const fallbackHits = [...safeDictionarySearch(queryByKind[kind], 5)].sort((left, right) => right.score - left.score || left.entry.acordCode.localeCompare(right.entry.acordCode));
        const picked = fallbackHits.find((hit) => getLocationKind(hit.entry.label, hit.entry.acordCode) === kind) ?? fallbackHits[0];
        if (!picked)
            return null;
        const syntheticBase = scored[0]?.score || 100;
        const syntheticWeightByKind = {
            city: 1.35,
            state: 1.25,
            postal: 1.15,
        };
        const syntheticScore = quantize(syntheticBase * syntheticWeightByKind[kind]);
        return {
            acordCode: picked.entry.acordCode,
            label: picked.entry.label,
            description: picked.entry.description,
            score: syntheticScore,
            dictionaryScore: syntheticScore,
            heuristicScore: 0,
            layoutlmScore: 0,
            categoryConfidenceScore: 0,
            semanticSimilarity: 0,
            source: "dictionary",
        };
    };
    const enforceCityStatePostalOrder = (items) => {
        if (!isCityStateZipPrompt(block.text)) {
            return items;
        }
        const kinds = [
            "city",
            "state",
            "postal",
        ];
        const remaining = [...items];
        const pinned = [];
        for (const kind of kinds) {
            const index = remaining.findIndex((item) => getLocationKind(item.label, item.acordCode) === kind);
            if (index >= 0) {
                const [matched] = remaining.splice(index, 1);
                pinned.push(matched);
                continue;
            }
            const fallback = buildLocationFallback(kind);
            if (fallback) {
                const duplicateIndex = remaining.findIndex((item) => item.acordCode === fallback.acordCode);
                if (duplicateIndex >= 0) {
                    const [matchedExisting] = remaining.splice(duplicateIndex, 1);
                    pinned.push({
                        ...matchedExisting,
                        score: fallback.score,
                        dictionaryScore: Math.max(matchedExisting.dictionaryScore, fallback.dictionaryScore),
                        source: matchedExisting.source === "ai" ? "ai" : fallback.source,
                    });
                }
                else {
                    pinned.push(fallback);
                }
            }
        }
        return [...pinned, ...remaining];
    };
    const ordered = enforceCityStatePostalOrder(scored);
    const all = ordered;
    if (all.length === 0) {
        // If we have a clear field cue but no scored candidates, provide a low-confidence
        // fallback set so downstream review can still inspect probable ACORD options.
        if (hasExplicitFieldCue) {
            const fallback = safeDictionarySearch(block.text, 3).map((hit) => ({
                acordCode: hit.entry.acordCode,
                label: hit.entry.label,
                description: hit.entry.description,
                confidenceScore: 0.12,
                normalizedConfidenceScore: 0.12,
                source: "dictionary",
                lexicalScore: 0.15,
                semanticSimilarity: 0,
                dictionaryScore: 0.35,
                heuristicScore: 0,
            }));
            return fallback;
        }
        return [];
    }
    const top = all[0].score || 1;
    const second = all[1]?.score || 0;
    const topMargin = top > 0 ? (top - second) / top : 0;
    const marginGate = clamp01(topMargin / 0.2);
    const supervisionCandidates = (0, supervision_1.getWave8SupervisionCandidatesForText)(block.text, familyId);
    const supervisionByCode = new Map(supervisionCandidates.map((candidate) => [candidate.acordCode, candidate]));
    const allCandidateCodes = new Set(all.map((item) => item.acordCode));
    const scoredSuggestions = all.slice(0, 10).map((item) => {
        const normalizedRelative = top > 0 ? item.score / top : 0;
        const layoutlmEvidence = clamp01(item.layoutlmScore);
        const baseCategoryEvidence = clamp01(Math.max(item.categoryConfidenceScore || 0, layoutlmEvidence));
        const baseSemanticEvidence = clamp01(item.semanticSimilarity);
        const baseDictionaryEvidence = normalizeDictionaryConsistency(item.dictionaryScore);
        const semanticDictionaryAdjustments = resolveWave8SemanticDictionaryAdjustments(block.text, { acordCode: item.acordCode, label: item.label }, headerAssessment);
        const semanticEvidence = clamp01(baseSemanticEvidence + semanticDictionaryAdjustments.semanticDelta);
        const dictionaryEvidence = clamp01(baseDictionaryEvidence + semanticDictionaryAdjustments.dictionaryDelta);
        const categoryEvidence = clamp01(baseCategoryEvidence + semanticDictionaryAdjustments.categoryDelta);
        const heuristicEvidence = clamp01(item.heuristicScore / 160);
        const anchorEvidence = lexicalAnchorScore(block.text, item.label, item.acordCode);
        const supervisionSignal = supervisionByCode.get(item.acordCode);
        const supervisionBoost = Math.max(Number(supervisionSignal?.weight || 0), semanticDictionaryAdjustments.supervisionFloor);
        const semanticHintWeight = Number(supervisionSignal?.semanticHintWeight || 1);
        const categoryHintWeight = Number(supervisionSignal?.categoryHintWeight || 1);
        const dictionaryConsistencyWeight = Number(supervisionSignal?.dictionaryConfidenceWeight || 1);
        const semanticHintBoost = clamp01(semanticEvidence * Math.max(0, semanticHintWeight - 1) * 0.45);
        const categoryHintBoost = clamp01(categoryEvidence * Math.max(0, categoryHintWeight - 1) * 0.4);
        const dictionaryHintBoost = clamp01(dictionaryEvidence * Math.max(0, dictionaryConsistencyWeight - 1) * 0.5);
        const geometryAgreement = computeGeometryAgreement(block, item.label, item.acordCode);
        const ontologyPrior = computeOntologyPrior(block, item.acordCode);
        const lowCategoryFallback = categoryEvidence < 0.42 &&
            (heuristicEvidence >= 0.42 || semanticEvidence >= 0.48 || anchorEvidence >= 0.28);
        const heuristicRescueActive = heuristicEvidence >= 0.74 && categoryEvidence < 0.55;
        const geometryPriorityOverride = geometryAgreement >= 0.82 &&
            (heuristicEvidence >= 0.55 || anchorEvidence >= 0.3 || semanticEvidence >= 0.55);
        const wave46CarrierSignals = resolveWave46CarrierSignals(block, { acordCode: item.acordCode, label: item.label }, familyId);
        const wave48Signals = resolveWave48ExceptionSignals(block, { acordCode: item.acordCode, label: item.label }, familyId);
        const wave47Signals = resolveWave47GeneralizationSignals(block, { acordCode: item.acordCode, label: item.label }, familyId);
        const blendedEvidence = clamp01(layoutlmEvidence * normalizedWeights.layoutlm +
            semanticEvidence * normalizedWeights.embedding +
            anchorEvidence * normalizedWeights.lexical +
            dictionaryEvidence * normalizedWeights.dictionary +
            heuristicEvidence * normalizedWeights.heuristic +
            supervisionBoost * 0.08 +
            semanticHintBoost * 0.08 +
            categoryHintBoost * 0.06 +
            dictionaryHintBoost * 0.06);
        const normalization = (0, quality_1.normalizeSignalsForFamily)({
            embedding: Math.max(semanticEvidence, layoutlmEvidence),
            lexical: anchorEvidence,
            dictionary: dictionaryEvidence,
            heuristic: heuristicEvidence,
        }, familyId);
        const normalizedBlend = (0, quality_1.blendNormalizedSignals)(normalization.normalized, normalizedWeights);
        const ontologyNode = (0, acord_1.getAcordOntologyNode)(item.acordCode);
        const ontologyViolations = [];
        const ontologyWarnings = [];
        const ontologyExplanation = [];
        if (ontologyNode) {
            if (ontologyNode.parentCodes.length > 0) {
                ontologyExplanation.push(`Parents: ${ontologyNode.parentCodes.join(", ")}`);
            }
            if (ontologyNode.requiredSiblingCodes.length > 0) {
                ontologyExplanation.push(`Required siblings: ${ontologyNode.requiredSiblingCodes.join(", ")}`);
            }
            if (ontologyNode.mutuallyExclusiveCodes.length > 0) {
                ontologyExplanation.push(`Mutually exclusive with: ${ontologyNode.mutuallyExclusiveCodes.join(", ")}`);
            }
            ontologyExplanation.push(`Sections: ${ontologyNode.sections.join(", ")}`);
            if (ontologyNode.parentCodes.length > 0 &&
                !ontologyNode.parentCodes.some((code) => allCandidateCodes.has(code))) {
                ontologyViolations.push("parent-missing");
            }
            if (ontologyNode.requiredSiblingCodes.length > 0 &&
                !ontologyNode.requiredSiblingCodes.some((code) => allCandidateCodes.has(code))) {
                ontologyWarnings.push("required-sibling-missing");
            }
            if (ontologyNode.mutuallyExclusiveCodes.some((code) => allCandidateCodes.has(code))) {
                ontologyWarnings.push("mutually-exclusive-candidate-present");
            }
        }
        const heuristicBlend = clamp01(heuristicEvidence * 0.5 + normalizedBlend * 0.5);
        let confidenceScore = clamp01(blendedEvidence * 0.52 +
            normalizedRelative * 0.2 +
            clamp01(blockConfidence) * 0.1 +
            heuristicBlend * 0.18);
        if (WAVE44_FUSION_ENABLED) {
            const wave44Fused = clamp01(categoryEvidence * WAVE8_EFFECTIVE_FUSION.category +
                heuristicEvidence * WAVE8_EFFECTIVE_FUSION.heuristic +
                geometryAgreement * WAVE8_EFFECTIVE_FUSION.geometry +
                ontologyPrior * WAVE8_EFFECTIVE_FUSION.ontology +
                semanticEvidence * WAVE8_EFFECTIVE_FUSION.semantic +
                dictionaryEvidence * WAVE8_EFFECTIVE_FUSION.dictionary +
                anchorEvidence * WAVE8_EFFECTIVE_FUSION.lexical);
            confidenceScore = clamp01(confidenceScore * 0.38 + wave44Fused * 0.62);
        }
        if (lowCategoryFallback && normalizedRelative >= 0.64) {
            // Keep low-category candidates in review rather than reject when other evidence is stable.
            confidenceScore = Math.max(confidenceScore, 0.62);
        }
        if (heuristicRescueActive && normalizedRelative >= 0.66) {
            confidenceScore = Math.max(confidenceScore, 0.74);
        }
        if (geometryPriorityOverride && normalizedRelative >= 0.62) {
            confidenceScore = Math.max(confidenceScore, 0.76);
        }
        if (wave46CarrierSignals.priorityOverride &&
            wave46CarrierSignals.score >= WAVE46_GATE.carrierPriorityOverrideMinScore) {
            confidenceScore = Math.max(confidenceScore, 0.78);
        }
        if (wave47Signals.priorityOverride &&
            !wave48Signals.overrideExists &&
            wave47Signals.score >= WAVE47_GATE.oodPriorityOverrideMinScore) {
            confidenceScore = Math.max(confidenceScore, 0.79);
        }
        // Blend normalized signals to make cross-family confidence comparable.
        confidenceScore = clamp01(confidenceScore * 0.58 + normalizedBlend * 0.42);
        // Confidence calibration: penalize ambiguous tops and weak lexical anchors.
        confidenceScore *= 0.68 + marginGate * 0.32;
        if (item.source === "heuristic" &&
            semanticEvidence < 0.72 &&
            dictionaryEvidence < 0.45) {
            confidenceScore = Math.min(confidenceScore, 0.62);
        }
        if (anchorEvidence < 0.2 && semanticEvidence < 0.72) {
            confidenceScore = Math.min(confidenceScore, 0.64);
        }
        if (anchorEvidence < 0.1 && semanticEvidence < 0.55) {
            confidenceScore = Math.min(confidenceScore, 0.56);
        }
        // For short name/address prompts, require stronger lexical anchoring.
        const isSensitivePrompt = isNamePrompt(block.text) || isAddressPrompt(block.text);
        if (isSensitivePrompt && anchorEvidence < 0.34 && semanticEvidence < 0.74) {
            confidenceScore = Math.min(confidenceScore, 0.57);
        }
        if (isSensitivePrompt &&
            anchorEvidence >= 0.65 &&
            normalizedRelative > 0.9) {
            confidenceScore = clamp01(confidenceScore * 1.06);
        }
        // Wave 3.1: in LayoutLM-primary mode, promote strong model consensus from
        // review candidates to acceptance/review thresholds without changing rank order.
        if (layoutlmEvidence >= 0.72 &&
            normalizedRelative >= 0.88 &&
            (semanticEvidence >= 0.45 || anchorEvidence >= 0.2)) {
            confidenceScore = Math.max(confidenceScore, 0.64);
        }
        if (layoutlmEvidence >= 0.82 &&
            normalizedRelative >= 0.92 &&
            (semanticEvidence >= 0.72 || anchorEvidence >= 0.24)) {
            confidenceScore = Math.max(confidenceScore, 0.82);
        }
        // Address prompts can over-index on dictionary score because many address
        // labels are structurally similar. Keep ranking, but cap confidence unless
        // semantic evidence is clearly strong.
        if (isAddressPrompt(block.text) &&
            semanticEvidence < 0.78 &&
            dictionaryEvidence >= 0.55) {
            confidenceScore = Math.min(confidenceScore, 0.72);
        }
        // Micro-calibration for plain "Mailing Address" prompts to avoid
        // overconfident city/state fragments outranking line confidence visually.
        if (isAddressPrompt(block.text) && !isCityStateZipPrompt(block.text)) {
            const componentKind = getAddressComponentKind(item.label, item.acordCode);
            if (componentKind === "line1") {
                confidenceScore = Math.min(confidenceScore, 0.7);
            }
            else if (componentKind === "line2") {
                confidenceScore = Math.min(confidenceScore, 0.62);
            }
            else if (componentKind === "city") {
                confidenceScore = Math.min(confidenceScore, 0.54);
            }
            else if (componentKind === "state" || componentKind === "postal") {
                confidenceScore = Math.min(confidenceScore, 0.5);
            }
        }
        if (lowCategoryFallback && normalizedRelative >= 0.64) {
            // Final fallback floor after all clamps to avoid low-category drift into rejected.
            confidenceScore = Math.max(confidenceScore, 0.62);
        }
        if (heuristicRescueActive && normalizedRelative >= 0.66) {
            confidenceScore = Math.max(confidenceScore, 0.74);
        }
        if (geometryPriorityOverride && normalizedRelative >= 0.62) {
            confidenceScore = Math.max(confidenceScore, 0.76);
        }
        if (wave46CarrierSignals.priorityOverride &&
            wave46CarrierSignals.score >= WAVE46_GATE.carrierPriorityOverrideMinScore) {
            confidenceScore = Math.max(confidenceScore, 0.78);
        }
        if (wave47Signals.priorityOverride &&
            !wave48Signals.overrideExists &&
            wave47Signals.score >= WAVE47_GATE.oodPriorityOverrideMinScore) {
            confidenceScore = Math.max(confidenceScore, 0.79);
        }
        if (WAVE48_GATE_ENABLED && wave48Signals.overrideExists) {
            if (wave48Signals.forceDecision === "accepted") {
                confidenceScore = Math.max(confidenceScore, WAVE48_GATE.forceAcceptScoreFloor);
            }
            else {
                confidenceScore = Math.max(confidenceScore, WAVE48_GATE.forceReviewScoreFloor);
            }
        }
        confidenceScore = clamp01(quantize(confidenceScore));
        // Reinforce targeted supervision when we have direct matched anchors for this candidate.
        if (supervisionBoost > 0) {
            const supervisionConfidenceBoost = clamp01(supervisionBoost * 0.08 +
                semanticHintBoost * 0.06 +
                categoryHintBoost * 0.05 +
                dictionaryHintBoost * 0.05);
            confidenceScore = clamp01(confidenceScore + supervisionConfidenceBoost);
        }
        const ontologyPenalty = wave48Signals.overrideExists && WAVE48_GATE.bypassOntologyMismatchPenalty
            ? 0
            : ontologyViolations.length > 0
                ? 0.07
                : 0;
        return {
            acordCode: item.acordCode,
            label: normalizeAnchorFriendlyLabel(item.acordCode, item.label),
            description: item.description,
            confidenceScore: Number(confidenceScore.toFixed(3)),
            normalizedConfidenceScore: Number((confidenceScore * (1 - ontologyPenalty)).toFixed(3)),
            source: item.source,
            lexicalScore: Number(anchorEvidence.toFixed(3)),
            semanticSimilarity: Number(semanticEvidence.toFixed(3)),
            dictionaryScore: Number(dictionaryEvidence.toFixed(3)),
            heuristicScore: Number(heuristicEvidence.toFixed(3)),
            categoryConfidence: Number(categoryEvidence.toFixed(3)),
            geometryAgreement: Number(geometryAgreement.toFixed(3)),
            ontologyPrior: Number(ontologyPrior.toFixed(3)),
            supervisionBoost: Number(supervisionBoost.toFixed(3)),
            semanticHintWeight: Number(semanticHintWeight.toFixed(3)),
            categoryHintWeight: Number(categoryHintWeight.toFixed(3)),
            dictionaryConsistencyWeight: Number(dictionaryConsistencyWeight.toFixed(3)),
            normalization: normalization,
            ontology: ontologyNode
                ? {
                    parentCodes: ontologyNode.parentCodes,
                    childCodes: ontologyNode.childCodes,
                    mutuallyExclusiveCodes: ontologyNode.mutuallyExclusiveCodes,
                    requiredSiblingCodes: ontologyNode.requiredSiblingCodes,
                    sections: ontologyNode.sections,
                    groups: ontologyNode.groups,
                    explanation: ontologyExplanation,
                    warnings: ontologyWarnings,
                    violatedConstraints: ontologyViolations,
                }
                : undefined,
            _anchorEvidence: anchorEvidence,
            _semanticEvidence: semanticEvidence,
            _ontologyPenalty: ontologyPenalty,
            _categoryEvidence: categoryEvidence,
            _geometryAgreement: geometryAgreement,
            _ontologyPrior: ontologyPrior,
            _heuristicEvidence: heuristicEvidence,
            _lowCategoryFallback: lowCategoryFallback,
            _geometryPriorityOverride: geometryPriorityOverride,
            _carrierIds: wave46CarrierSignals.carrierIds,
            _carrierMatchScore: wave46CarrierSignals.score,
            _carrierPriorityOverride: wave46CarrierSignals.priorityOverride,
            _wave48ExceptionIds: wave48Signals.matchedExceptionIds,
            _wave48OverrideExists: wave48Signals.overrideExists,
            _wave48ForceDecision: wave48Signals.forceDecision,
            _wave48ContextDetected: wave48Signals.contextDetected,
            _wave47ClusterIds: wave47Signals.clusterIds,
            _wave47GeneralizationScore: wave47Signals.score,
            _wave47ClusterAligned: wave47Signals.clusterAligned,
            _wave47OodGeometryDetected: wave47Signals.oodGeometryDetected,
            _wave47OodPatternDetected: wave47Signals.oodPatternDetected,
            _wave47PriorityOverride: wave47Signals.priorityOverride,
            _wave8SemanticConsistency: semanticEvidence,
            _wave8DictionaryConsistency: dictionaryEvidence,
            _wave8CategoryConsistency: categoryEvidence,
            _wave8SupervisionBoost: clamp01(supervisionBoost),
            _wave8HeaderBlock: headerAssessment.headerBlock,
        };
    });
    const withCalibrationRanking = scoredSuggestions.map((candidate) => {
        const wave46CarrierSignals = resolveWave46CarrierSignals(block, candidate, familyId);
        const wave48Signals = resolveWave48ExceptionSignals(block, candidate, familyId);
        const wave47Signals = resolveWave47GeneralizationSignals(block, candidate, familyId);
        const arbitration = (0, acord_1.arbitrateCandidateByOntology)(candidate, ontologyBundles);
        const graphInference = (0, quality_1.inferCandidateFromGlobalGraph)(candidate, graphSnapshot);
        const carrierAdapter = (0, quality_1.adaptCandidateToCarrier)(candidate, familyId, carrierAdapterOverrides);
        const underwritingRules = (0, quality_1.evaluateCandidateUnderwritingRules)(candidate, {
            blockText: block.text,
            chosenCodes: Array.from(allCandidateCodes).sort((left, right) => left.localeCompare(right)),
            familyId,
            overrides: underwritingRuleOverrides,
            extractionBlockId: block.id,
        });
        const riskDecision = (0, quality_1.inferCandidateRiskAndDecisionIntelligence)(candidate, {
            blockText: block.text,
            familyId,
        });
        const thresholds = resolveThresholds(profile, candidate.acordCode, {
            layoutLmEvidence: candidate._categoryEvidence,
            hasCategoryMatch: candidate._categoryEvidence >= 0.5,
            geometryAgreement: candidate._geometryAgreement,
            ontologyPrior: candidate._ontologyPrior,
            heuristicEvidence: candidate._heuristicEvidence,
            lowCategoryFallback: candidate._lowCategoryFallback,
            geometryPriorityOverride: candidate._geometryPriorityOverride,
            carrierMatchScore: wave46CarrierSignals.score,
            carrierPriorityOverride: wave46CarrierSignals.priorityOverride,
            wave47GeneralizationScore: wave47Signals.score,
            wave47ClusterAligned: wave47Signals.clusterAligned,
            wave47OodGeometryDetected: wave47Signals.oodGeometryDetected,
            wave47OodPatternDetected: wave47Signals.oodPatternDetected,
            wave47OodPriorityOverride: wave47Signals.priorityOverride,
            wave48OverrideExists: wave48Signals.overrideExists,
            wave48ForceDecision: wave48Signals.forceDecision,
        });
        const thresholdGap = candidate.confidenceScore - thresholds.review;
        const ontologyPenalty = candidate._ontologyPenalty || 0;
        const graphBoost = graphInference.inferred ? graphInference.confidence * 0.08 : 0;
        const graphPenalty = graphInference.inferred ? 0 : 0.03;
        const carrierBoost = carrierAdapter.confidence * 0.06;
        const wave46CarrierBoost = WAVE46_CARRIER_BOOST_ENABLED ? wave46CarrierSignals.score : 0;
        const wave47GeneralizationBoost = WAVE47_ROBUSTNESS_ENABLED && !wave48Signals.overrideExists
            ? wave47Signals.score
            : 0;
        const rulePenalty = underwritingRules.hardFailures.length > 0 ? 0.25 : 0;
        const riskPenalty = riskDecision.decisionIntelligence.projectedOutcome === "decline"
            ? 0.22
            : riskDecision.decisionIntelligence.projectedOutcome === "refer-to-underwriter"
                ? 0.12
                : 0;
        const calibratedRankingScore = quantize((candidate.normalizedConfidenceScore || candidate.confidenceScore) *
            (1 - ontologyPenalty) *
            0.72 +
            thresholdGap * 0.2 +
            graphBoost -
            graphPenalty +
            carrierBoost +
            wave46CarrierBoost +
            wave47GeneralizationBoost +
            underwritingRules.scoreDelta * 0.22 -
            rulePenalty -
            riskPenalty);
        return {
            unification: (0, quality_1.resolveUnificationForCode)(candidate.acordCode),
            ...candidate,
            graphInference,
            carrierAdapter,
            underwritingRules,
            riskFactors: riskDecision.riskFactors,
            decisionIntelligence: riskDecision.decisionIntelligence,
            ontology: candidate.ontology
                ? {
                    ...candidate.ontology,
                    namespace: arbitration.winningNamespace,
                }
                : candidate.ontology,
            arbitration: {
                winningNamespace: arbitration.winningNamespace,
                precedenceScore: arbitration.score,
                reason: arbitration.reason,
            },
            _carrierIds: wave46CarrierSignals.carrierIds,
            _carrierMatchScore: wave46CarrierSignals.score,
            _carrierPriorityOverride: wave46CarrierSignals.priorityOverride,
            _wave48ExceptionIds: wave48Signals.matchedExceptionIds,
            _wave48OverrideExists: wave48Signals.overrideExists,
            _wave48ForceDecision: wave48Signals.forceDecision,
            _wave48ContextDetected: wave48Signals.contextDetected,
            _wave47ClusterIds: wave47Signals.clusterIds,
            _wave47GeneralizationScore: wave47Signals.score,
            _wave47ClusterAligned: wave47Signals.clusterAligned,
            _wave47OodGeometryDetected: wave47Signals.oodGeometryDetected,
            _wave47OodPatternDetected: wave47Signals.oodPatternDetected,
            _wave47PriorityOverride: wave47Signals.priorityOverride,
            _calibratedRankingScore: calibratedRankingScore,
        };
    });
    withCalibrationRanking.sort((left, right) => right._calibratedRankingScore - left._calibratedRankingScore ||
        compareSuggestion(left, right));
    const withConfidenceLevels = withCalibrationRanking.map((candidate) => {
        const thresholds = resolveThresholds(profile, candidate.acordCode, {
            layoutLmEvidence: candidate._categoryEvidence,
            hasCategoryMatch: candidate._categoryEvidence >= 0.5,
            geometryAgreement: candidate._geometryAgreement,
            ontologyPrior: candidate._ontologyPrior,
            heuristicEvidence: candidate._heuristicEvidence,
            lowCategoryFallback: candidate._lowCategoryFallback,
            geometryPriorityOverride: candidate._geometryPriorityOverride,
            carrierMatchScore: Number(candidate._carrierMatchScore || 0),
            carrierPriorityOverride: Boolean(candidate._carrierPriorityOverride),
            wave47GeneralizationScore: Number(candidate._wave47GeneralizationScore || 0),
            wave47ClusterAligned: Boolean(candidate._wave47ClusterAligned),
            wave47OodGeometryDetected: Boolean(candidate._wave47OodGeometryDetected),
            wave47OodPatternDetected: Boolean(candidate._wave47OodPatternDetected),
            wave47OodPriorityOverride: Boolean(candidate._wave47PriorityOverride),
            wave48OverrideExists: Boolean(candidate._wave48OverrideExists),
            wave48ForceDecision: candidate._wave48ForceDecision,
        });
        const wave48OverrideExists = Boolean(candidate._wave48OverrideExists);
        const wave48ForceDecision = candidate._wave48ForceDecision;
        return {
            ...candidate,
            confidenceLevel: WAVE48_GATE_ENABLED && wave48OverrideExists && wave48ForceDecision
                ? wave48ForceDecision
                : resolveConfidenceLevel(candidate.confidenceScore, thresholds),
        };
    });
    const withWave8Gating = withConfidenceLevels.map((candidate) => {
        const semanticConsistency = clamp01(Number((candidate._wave8SemanticConsistency ?? candidate.semanticSimilarity) || 0));
        const dictionaryConsistency = normalizeDictionaryConsistency(Number((candidate._wave8DictionaryConsistency ?? candidate.dictionaryScore) || 0));
        const categoryConsistency = clamp01(Number((candidate._wave8CategoryConsistency ?? candidate._categoryEvidence) || 0));
        const supervisionBoost = clamp01(Number(candidate._wave8SupervisionBoost || 0));
        const headerBlock = Boolean(candidate._wave8HeaderBlock || headerAssessment.headerBlock);
        const rejectReasons = [];
        if (Number(candidate.confidenceScore || 0) < WAVE8_GATE_MIN_CONFIDENCE) {
            rejectReasons.push("below_min_confidence");
        }
        if (semanticConsistency < WAVE8_GATE_MIN_SEMANTIC_CONSISTENCY) {
            rejectReasons.push("below_semantic_consistency");
        }
        if (dictionaryConsistency < WAVE8_GATE_MIN_DICTIONARY_CONSISTENCY) {
            rejectReasons.push("below_dictionary_consistency");
        }
        if (categoryConsistency < WAVE8_GATE_MIN_CATEGORY_CONSISTENCY) {
            rejectReasons.push("below_category_mode_consistency");
        }
        if (headerBlock) {
            if (semanticConsistency < WAVE8_HEADER_STRICT_MIN_CONSISTENCY) {
                rejectReasons.push("header_strict_semantic_consistency");
            }
            if (dictionaryConsistency < WAVE8_HEADER_STRICT_MIN_CONSISTENCY) {
                rejectReasons.push("header_strict_dictionary_consistency");
            }
            if (categoryConsistency < WAVE8_HEADER_STRICT_MIN_CONSISTENCY) {
                rejectReasons.push("header_strict_category_consistency");
            }
            if (supervisionBoost <= 0) {
                rejectReasons.push("header_requires_supervision_boost");
            }
        }
        const wave48OverrideExists = Boolean(candidate._wave48OverrideExists);
        const forceDecision = candidate._wave48ForceDecision;
        const explicitPromotion = (WAVE48_GATE_ENABLED && wave48OverrideExists && Boolean(forceDecision)) ||
            String(candidate.rationale || "").includes("wave8_targeted_anchor");
        const passed = rejectReasons.length === 0 || explicitPromotion;
        return {
            ...candidate,
            wave8Gating: {
                passed,
                rejectReasons,
                semanticConsistency,
                dictionaryConsistency,
                categoryConsistency,
                supervisionBoost,
                headerBlock,
                thresholds: {
                    minConfidence: WAVE8_GATE_MIN_CONFIDENCE,
                    minSemanticConsistency: WAVE8_GATE_MIN_SEMANTIC_CONSISTENCY,
                    minDictionaryConsistency: WAVE8_GATE_MIN_DICTIONARY_CONSISTENCY,
                    minCategoryModeConsistency: WAVE8_GATE_MIN_CATEGORY_CONSISTENCY,
                },
            },
        };
    });
    const withConfidenceLevelsFiltered = withWave8Gating.filter((candidate) => candidate.wave8Gating?.passed);
    const gatedCandidates = headerAssessment.headerBlock
        ? withConfidenceLevelsFiltered
        : withConfidenceLevelsFiltered.length > 0
            ? withConfidenceLevelsFiltered
            : withWave8Gating;
    if (headerAssessment.headerBlock && gatedCandidates.length === 0) {
        return [];
    }
    const topSuggestion = gatedCandidates[0];
    if (!topSuggestion) {
        return [];
    }
    const isCompoundLocationPrompt = isCityStateZipPrompt(block.text);
    const isSensitivePrompt = isNamePrompt(block.text) || isAddressPrompt(block.text);
    const topThresholds = resolveThresholds(profile, topSuggestion.acordCode, {
        layoutLmEvidence: topSuggestion._categoryEvidence,
        hasCategoryMatch: topSuggestion._categoryEvidence >= 0.5,
        geometryAgreement: topSuggestion._geometryAgreement,
        ontologyPrior: topSuggestion._ontologyPrior,
        heuristicEvidence: topSuggestion._heuristicEvidence,
        lowCategoryFallback: topSuggestion._lowCategoryFallback,
        geometryPriorityOverride: topSuggestion._geometryPriorityOverride,
        carrierMatchScore: Number(topSuggestion._carrierMatchScore || 0),
        carrierPriorityOverride: Boolean(topSuggestion._carrierPriorityOverride),
        wave47GeneralizationScore: Number(topSuggestion._wave47GeneralizationScore || 0),
        wave47ClusterAligned: Boolean(topSuggestion._wave47ClusterAligned),
        wave47OodGeometryDetected: Boolean(topSuggestion._wave47OodGeometryDetected),
        wave47OodPatternDetected: Boolean(topSuggestion._wave47OodPatternDetected),
        wave47OodPriorityOverride: Boolean(topSuggestion._wave47PriorityOverride),
        wave48OverrideExists: Boolean(topSuggestion?._wave48OverrideExists),
        wave48ForceDecision: topSuggestion?._wave48ForceDecision,
    });
    const topLabelText = normalizeText(`${topSuggestion.label} ${topSuggestion.acordCode}`);
    const hasAddressLabelEvidence = isAddressPrompt(block.text) &&
        hasAnyToken(topLabelText, [
            "address",
            "mailing",
            "street",
            "line one",
            "line two",
        ]);
    const hasStrongSensitiveEvidence = isSensitivePrompt &&
        (topSuggestion._anchorEvidence >= 0.2 ||
            topSuggestion._semanticEvidence >= 0.72 ||
            hasAddressLabelEvidence);
    // Keep ranked candidates available for reviewer triage instead of hard-abstaining
    // at this stage; downstream filters and manual review still enforce quality.
    if (!hasExplicitFieldCue &&
        (topSuggestion.ontology?.violatedConstraints?.length || 0) > 1) {
        return [];
    }
    if (!hasExplicitFieldCue &&
        (topSuggestion.underwritingRules?.hardFailures?.length || 0) > 0) {
        return [];
    }
    // Preserve suggestions even when graph inference is weak; confidence captures this.
    return gatedCandidates.map(({ _anchorEvidence: _ignoredAnchor, _semanticEvidence: _ignoredSem, _ontologyPenalty: _ignoredOntologyPenalty, _categoryEvidence: _ignoredCategory, _geometryAgreement: _ignoredGeometry, _ontologyPrior: _ignoredPrior, _heuristicEvidence: _ignoredHeuristic, _lowCategoryFallback: _ignoredLowCategoryFallback, _geometryPriorityOverride: _ignoredGeometryOverride, _carrierIds: _ignoredCarrierIds, _carrierMatchScore: _ignoredCarrierScore, _carrierPriorityOverride: _ignoredCarrierPriority, _wave48ExceptionIds: _ignoredWave48ExceptionIds, _wave48OverrideExists: _ignoredWave48OverrideExists, _wave48ForceDecision: _ignoredWave48ForceDecision, _wave48ContextDetected: _ignoredWave48ContextDetected, _wave47ClusterIds: _ignoredWave47ClusterIds, _wave47GeneralizationScore: _ignoredWave47Score, _wave47ClusterAligned: _ignoredWave47Aligned, _wave47OodGeometryDetected: _ignoredWave47OodGeometry, _wave47OodPatternDetected: _ignoredWave47OodPattern, _wave47PriorityOverride: _ignoredWave47Priority, _calibratedRankingScore: _ignoredCalibratedScore, ...rest }) => rest);
}
async function mapBlocksToAcord(blocks, options) {
    const reducerDebugEntries = [];
    if (!options?.deterministic) {
        (0, acordDictionary_1.ensureEmbeddings)().catch(() => { });
    }
    const graphSeedPayload = {
        version: 1,
        documentId: "runtime-graph-document",
        pages: [],
        fields: [],
        mappings: [],
        decisionGraph: {
            labels: {},
            fields: {},
            mappings: {},
            confidenceThresholds: {
                accepted: 0.8,
                review: 0.6,
                rejected: 0.45,
            },
        },
        overrides: {},
        suppressedOcrBlockIds: [],
        associationEdits: [],
        schemaArtifacts: [],
        formFamily: options?.familyId
            ? {
                familyId: options.familyId,
                familyLabel: options.familyId,
                confidence: 1,
                signatureHash: "runtime-graph",
                layoutSignature: [],
                semanticSignature: [],
                evidence: ["runtime-graph"],
                classifiedAt: "1970-01-01T00:00:00.000Z",
                classifierVersion: "runtime",
            }
            : undefined,
    };
    const runtimeGraph = (0, quality_1.buildGlobalSemanticGraph)([
        {
            fixtureId: "runtime-graph",
            payload: graphSeedPayload,
        },
    ]).snapshot;
    const orderedBlocks = [...blocks].sort((left, right) => left.page - right.page ||
        left.boundingBox.y - right.boundingBox.y ||
        left.boundingBox.x - right.boundingBox.x);
    const nearbyFieldCueMap = buildWave8NearbyFieldCueMap(orderedBlocks);
    const selectionMarkPairings = resolveSelectionMarkPairings(orderedBlocks);
    const consistencyCache = new Map();
    const seenCodesByCategory = new Map();
    const results = [];
    const telemetryEnabled = WAVE49_TELEMETRY_ENABLED;
    const wave5FeatureGateEnabled = options?.wave5GeometryEnabled ?? WAVE5_GEOMETRY_ENABLED;
    const wave5GeometryEnabled = wave5FeatureGateEnabled;
    const wave5CategoryModeDefault = WAVE5_CATEGORY_MODE_ENABLED || WAVE5_GEOMETRY_ENABLED;
    const wave5CategoryModeEnabled = wave5FeatureGateEnabled &&
        (options?.wave5CategoryModeEnabled ?? wave5CategoryModeDefault);
    const wave5ReflowDefault = WAVE5_REFLOW_ENABLED || WAVE5_GEOMETRY_ENABLED;
    const wave5ReflowEnabled = wave5FeatureGateEnabled && (options?.wave5ReflowEnabled ?? wave5ReflowDefault);
    const geometryBlocksByPage = new Map();
    for (const [blockIndex, block] of orderedBlocks.entries()) {
        const pageIndex = Math.max(0, Number(block.page || 1) - 1);
        const existing = geometryBlocksByPage.get(pageIndex) || [];
        existing.push({
            blockId: block.id,
            pageIndex,
            x: Number(block.boundingBox?.x || 0),
            y: Number(block.boundingBox?.y || 0),
            width: Number(block.boundingBox?.width || 0),
            height: Number(block.boundingBox?.height || 0),
            label: block.text,
        });
        geometryBlocksByPage.set(pageIndex, existing);
    }
    for (const [blockIndex, block] of orderedBlocks.entries()) {
        const blockStartedAt = Date.now();
        const stageTimings = {
            layoutLmMs: 0,
            gateMs: 0,
            dictionaryMs: 0,
            semanticMs: 0,
            suggestionMs: 0,
            rerankMs: 0,
            totalMs: 0,
        };
        // Run scoring for all OCR blocks; suppression should happen downstream where
        // we have full mapping context and diagnostics visibility.
        const pairedSelectionLabel = selectionMarkPairings.get(block.id);
        const wave8HeaderAssessment = assessWave8HeaderBlock(block, nearbyFieldCueMap.get(block.id) === true);
        const scoringText = pairedSelectionLabel
            ? `${pairedSelectionLabel} ${String(block.text || "")}`
            : block.text;
        const scoringBlock = scoringText !== block.text
            ? {
                ...block,
                text: scoringText,
            }
            : block;
        const accum = new Map();
        const layoutLmEvaluation = options?.layoutLmByBlock?.[block.id];
        const hasLayoutLmEvidence = Boolean(layoutLmEvaluation) &&
            Array.isArray(layoutLmEvaluation?.topPredictions) &&
            layoutLmEvaluation.topPredictions.length > 0;
        const useLayoutLmPrimaryClassifier = options?.layoutLmPrimaryClassifier !== false;
        const layoutLmPrimaryCodes = useLayoutLmPrimaryClassifier && hasLayoutLmEvidence
            ? getLayoutLmPrimaryCodes(layoutLmEvaluation)
            : undefined;
        const rerankAllowedCodes = layoutLmPrimaryCodes && layoutLmPrimaryCodes.size > 0
            ? layoutLmPrimaryCodes
            : undefined;
        const maxLayoutLmProbability = hasLayoutLmEvidence
            ? Math.max(...layoutLmEvaluation.topPredictions.map((prediction) => clamp01(Number(prediction.probability || 0))))
            : 0;
        const lowCategoryConfidenceFallbackActive = Boolean(rerankAllowedCodes) && maxLayoutLmProbability < 0.42;
        const effectiveAllowedCodes = lowCategoryConfidenceFallbackActive
            ? undefined
            : rerankAllowedCodes;
        const primaryCategory = String(layoutLmEvaluation?.topPredictions?.[0]?.category || "").trim();
        const consistencyKey = buildWave45ConsistencyKey(scoringBlock, primaryCategory);
        const priorConsistency = consistencyCache.get(consistencyKey);
        const seenCodes = primaryCategory
            ? seenCodesByCategory.get(primaryCategory)
            : undefined;
        const wave49Errors = [];
        let stageStartedAt = Date.now();
        applyLayoutLmSignals(scoringBlock, accum, layoutLmEvaluation);
        stageTimings.layoutLmMs = Date.now() - stageStartedAt;
        const layoutLmSeededCandidateCount = accum.size;
        const preGateCandidateCount = accum.size;
        stageStartedAt = Date.now();
        if (effectiveAllowedCodes) {
            for (const code of [...accum.keys()]) {
                if (!effectiveAllowedCodes.has(code)) {
                    accum.delete(code);
                }
            }
        }
        stageTimings.gateMs = Date.now() - stageStartedAt;
        const postGateCandidateCount = accum.size;
        const gatedOutCandidateCount = Math.max(0, preGateCandidateCount - postGateCandidateCount);
        const categoryModeGateDecision = preGateCandidateCount > 0 && postGateCandidateCount === 0 && !lowCategoryConfidenceFallbackActive
            ? "dropped_all"
            : "passed_or_relaxed";
        stageStartedAt = Date.now();
        try {
            applyDictionarySignals(scoringBlock, accum, effectiveAllowedCodes, options?.familyId);
        }
        catch (error) {
            wave49Errors.push(normalizeWave49Error("dictionary", error));
        }
        stageTimings.dictionaryMs = Date.now() - stageStartedAt;
        stageStartedAt = Date.now();
        try {
            await applySemanticSignals(scoringBlock, accum, options?.deterministic === true, effectiveAllowedCodes);
        }
        catch (error) {
            wave49Errors.push(normalizeWave49Error("semantic", error));
        }
        stageTimings.semanticMs = Date.now() - stageStartedAt;
        const candidatePoolCountBeforeFallback = accum.size;
        let starvationFallbackApplied = false;
        let starvationWave48SeededCodeCount = 0;
        let starvationWave48ExceptionIds = [];
        stageStartedAt = Date.now();
        let suggestions = [];
        try {
            suggestions = toSuggestions(accum, scoringBlock, block.confidence, options?.calibrationProfile, options?.familyId, runtimeGraph, options?.carrierAdapterOverrides, options?.underwritingRuleOverrides, {
                disableHeuristicInfluence: useLayoutLmPrimaryClassifier,
                headerAssessment: wave8HeaderAssessment,
            });
        }
        catch (error) {
            wave49Errors.push(normalizeWave49Error("suggestion", error));
        }
        stageTimings.suggestionMs = Date.now() - stageStartedAt;
        if (suggestions.length === 0 && !wave8HeaderAssessment.headerBlock) {
            const beforeHeuristic = accum.size;
            applyHeuristicSignals(scoringBlock, accum);
            let afterHeuristic = accum.size;
            if (afterHeuristic === beforeHeuristic) {
                const contextMatches = resolveWave48ExceptionContextEntries(scoringBlock, options?.familyId);
                starvationWave48ExceptionIds = contextMatches
                    .map((entry) => entry.exceptionId)
                    .sort((left, right) => left.localeCompare(right));
                const boostByCode = new Map();
                for (const entry of contextMatches) {
                    const boost = entry.forceDecision === "accepted" ? 320 : 260;
                    for (const code of entry.explicitELabelOverrides) {
                        const prior = boostByCode.get(code) || 0;
                        boostByCode.set(code, Math.max(prior, boost));
                    }
                }
                for (const [code, boost] of boostByCode) {
                    boostKnownCode(accum, code, boost);
                }
                starvationWave48SeededCodeCount = boostByCode.size;
                afterHeuristic = accum.size;
            }
            starvationFallbackApplied = afterHeuristic > beforeHeuristic;
            if (starvationFallbackApplied) {
                suggestions = buildWave49FallbackSuggestions(accum);
            }
        }
        if (suggestions.length === 0 && accum.size > 0 && !wave8HeaderAssessment.headerBlock) {
            suggestions = buildWave49FallbackSuggestions(accum);
        }
        const candidatePoolCountAfterFallback = accum.size;
        stageStartedAt = Date.now();
        try {
            suggestions = normalizeSuggestionsByAlignment(suggestions, block);
        }
        catch (error) {
            wave49Errors.push(normalizeWave49Error("alignment-normalization", error));
        }
        try {
            suggestions = rerankSuggestionsForWave45(suggestions, scoringBlock, primaryCategory, priorConsistency?.acordCode, seenCodes, options?.familyId);
        }
        catch (error) {
            wave49Errors.push(normalizeWave49Error("rerank", error));
        }
        stageTimings.rerankMs = Date.now() - stageStartedAt;
        let wave5FusionApplied = false;
        let wave5GeometryDiagnostics;
        const fusionThreshold = WAVE8_USABILITY_MODE
            ? WAVE8_PERMISSIVE_FUSION_THRESHOLD
            : 0.6;
        const fusionByAcordCode = new Map();
        if (wave5GeometryEnabled && suggestions.length > 0) {
            const wave5StartedAt = Date.now();
            try {
                const pageIndex = Math.max(0, Number(block.page || 1) - 1);
                const pageGeometryBlocks = geometryBlocksByPage.get(pageIndex) || [];
                const anchorBlock = {
                    blockId: block.id,
                    pageIndex,
                    x: Number(block.boundingBox?.x || 0),
                    y: Number(block.boundingBox?.y || 0),
                    width: Number(block.boundingBox?.width || 0),
                    height: Number(block.boundingBox?.height || 0),
                    label: block.text,
                };
                const geometryScope = pageGeometryBlocks.length > 0 ? pageGeometryBlocks : [anchorBlock];
                const clusters = (0, geometryArchitectureScaffold_1.buildGeometryClusters)(geometryScope, 0.12);
                const context = (0, geometryArchitectureScaffold_1.buildMultiBlockGeometryContext)(geometryScope, block.id, 8);
                const carrierPatterns = (0, geometryArchitectureScaffold_1.resolveCarrierSpecificGeometryPatterns)(options?.familyId, [], undefined);
                const candidateLimit = Math.min(6, suggestions.length);
                const preFusionSuggestions = suggestions.slice(0, candidateLimit);
                const fusionCandidates = preFusionSuggestions.map((candidate, index) => {
                    const candidateBlock = geometryScope[index % geometryScope.length] || anchorBlock;
                    return {
                        candidateId: `${index}:${candidate.acordCode}`,
                        anchorBlock,
                        candidateBlock,
                        semanticScore: clamp01(Number(candidate.normalizedConfidenceScore || candidate.confidenceScore || 0)),
                        semanticConfidence: clamp01(Number(candidate.confidenceScore || 0)),
                        geometryConfidence: 0.58,
                    };
                });
                const fusionResults = (0, semanticGeometryFusionIntegrationScaffold_1.integrateSemanticGeometryFusion)({
                    candidates: fusionCandidates,
                    carrierPatterns,
                });
                for (const result of fusionResults) {
                    const [indexToken] = result.candidateId.split(":");
                    const candidateIndex = Number(indexToken);
                    const candidate = preFusionSuggestions[candidateIndex];
                    if (!candidate)
                        continue;
                    fusionByAcordCode.set(candidate.acordCode, {
                        fusionScore: Number(result.fusedScore || 0),
                        semanticScore: Number(result.semanticScore || 0),
                        geometryScore: Number(result.geometryScore || 0),
                        semanticContribution: Number(result.semanticContribution || 0),
                        geometryContribution: Number(result.geometryContribution || 0),
                    });
                }
                const fusionByCandidateId = new Map(fusionResults.map((entry) => [entry.candidateId, entry]));
                suggestions = suggestions
                    .map((candidate, index) => {
                    const fusion = fusionByCandidateId.get(`${index}:${candidate.acordCode}`);
                    return {
                        candidate,
                        rankScore: fusion ? fusion.fusedScore : Number(candidate.confidenceScore || 0),
                    };
                })
                    .sort((left, right) => right.rankScore - left.rankScore ||
                    Number(right.candidate.confidenceScore || 0) - Number(left.candidate.confidenceScore || 0) ||
                    left.candidate.acordCode.localeCompare(right.candidate.acordCode))
                    .map((entry) => entry.candidate);
                wave5FusionApplied = fusionResults.length > 0;
                wave5GeometryDiagnostics = (0, geometryModeDiagnostics_1.emitGeometryModeDiagnostics)({
                    carrierId: options?.familyId,
                    pageIndex,
                    clusterCount: clusters.length,
                    clusters,
                    context,
                    fusionResults,
                    stageLatencyMs: Date.now() - wave5StartedAt,
                });
            }
            catch (error) {
                wave49Errors.push(normalizeWave49Error("wave5-geometry", error));
            }
        }
        let wave5CategoryModeApplied = false;
        let wave5CategoryModeDiagnostics;
        if (wave5CategoryModeEnabled && suggestions.length > 0) {
            const wave5CategoryStartedAt = Date.now();
            try {
                const pageIndex = Math.max(0, Number(block.page || 1) - 1);
                const scoringCandidates = suggestions
                    .slice(0, Math.min(8, suggestions.length))
                    .map((candidate, index) => ({
                    candidateId: `${index}:${candidate.acordCode}`,
                    acordCode: candidate.acordCode,
                    label: candidate.label || candidate.acordCode,
                    category: (0, categoryModeArchitectureScaffold_1.resolveCategoryForCode)(candidate.acordCode),
                    baseConfidence: clamp01(Number(candidate.confidenceScore || candidate.normalizedConfidenceScore || 0)),
                    semanticScore: clamp01(Number(candidate.normalizedConfidenceScore || candidate.confidenceScore || 0)),
                    geometryScore: clamp01(Number(candidate?._geometryAgreement ||
                        candidate.normalizedConfidenceScore ||
                        candidate.confidenceScore ||
                        0)),
                }));
                const categoryPriors = (0, categoryModeArchitectureScaffold_1.resolveCategoryModePriors)(scoringCandidates.map((candidate) => candidate.category), options?.familyId);
                const semanticWindows = (0, categoryModeArchitectureScaffold_1.buildCategoryModeSemanticWindows)(block.text, 2, 4);
                const geometryPatterns = (0, categoryModeArchitectureScaffold_1.resolveCategoryModeGeometryPatterns)(options?.familyId);
                const overrideRules = (0, categoryModeArchitectureScaffold_1.resolveCategoryModeOverrideTables)(block.text, options?.familyId);
                const scoringResults = (0, categoryModeArchitectureScaffold_1.integrateCategoryModeScoring)({
                    blockText: block.text,
                    candidates: scoringCandidates,
                    priors: categoryPriors,
                    semanticWindows,
                    geometryPatterns,
                    overrideRules,
                });
                const scoringByCandidateId = new Map(scoringResults.map((result) => [result.candidateId, result.fusedScore]));
                suggestions = suggestions
                    .map((candidate, index) => ({
                    candidate,
                    rankScore: scoringByCandidateId.get(`${index}:${candidate.acordCode}`) ||
                        Number(candidate.confidenceScore || 0),
                }))
                    .sort((left, right) => right.rankScore - left.rankScore ||
                    Number(right.candidate.confidenceScore || 0) -
                        Number(left.candidate.confidenceScore || 0) ||
                    left.candidate.acordCode.localeCompare(right.candidate.acordCode))
                    .map((entry) => entry.candidate);
                wave5CategoryModeApplied = scoringResults.length > 0;
                wave5CategoryModeDiagnostics = (0, categoryModeDiagnostics_1.emitCategoryModeDiagnostics)({
                    carrierId: options?.familyId,
                    pageIndex,
                    priors: categoryPriors,
                    semanticWindows,
                    geometryPatterns,
                    overrideRules,
                    scoringResults,
                    stageLatencyMs: Date.now() - wave5CategoryStartedAt,
                });
            }
            catch (error) {
                wave49Errors.push(normalizeWave49Error("wave5-category-mode", error));
            }
        }
        let wave5ReflowApplied = false;
        let wave5ReflowDiagnostics;
        if (wave5ReflowEnabled && suggestions.length > 0) {
            const wave5ReflowStartedAt = Date.now();
            try {
                const pageIndex = Math.max(0, Number(block.page || 1) - 1);
                const reflowCandidates = suggestions.slice(0, Math.min(8, suggestions.length)).map((candidate, index) => ({
                    candidateId: `${index}:${candidate.acordCode}`,
                    acordCode: candidate.acordCode,
                    label: candidate.label || candidate.acordCode,
                    baseScore: clamp01(Number(candidate.confidenceScore || candidate.normalizedConfidenceScore || 0)),
                    semanticScore: clamp01(Number(candidate.normalizedConfidenceScore || candidate.confidenceScore || 0)),
                    geometryScore: clamp01(Number(candidate?._geometryAgreement || 0)),
                    categoryScore: clamp01(Number(candidate?._categoryEvidence || 0)),
                }));
                const multiStageResults = (0, reflowArchitectureScaffold_1.runMultiStageScoring)(reflowCandidates, options?.wave5TuningProfile);
                const parallelResults = await (0, reflowArchitectureScaffold_1.evaluateCandidatesInParallel)(multiStageResults);
                const stageByCandidateId = new Map(multiStageResults.map((item) => [item.candidateId, item]));
                const fusedAndAdjusted = parallelResults.map((item) => {
                    const stage = stageByCandidateId.get(item.candidateId);
                    const fusedScore = (0, reflowArchitectureScaffold_1.fuseSemanticGeometryCategory)({
                        semanticScore: stage?.stageOneScore || item.score,
                        geometryScore: stage?.stageTwoScore || item.score,
                        categoryScore: stage?.stageThreeScore || item.score,
                    }, options?.wave5TuningProfile);
                    const carrierAdjustedScore = (0, reflowArchitectureScaffold_1.applyCarrierAwareScoring)({
                        score: fusedScore,
                        carrierId: options?.familyId,
                        blockText: block.text,
                    }, options?.wave5TuningProfile);
                    return {
                        candidateId: item.candidateId,
                        acordCode: item.acordCode,
                        score: carrierAdjustedScore,
                    };
                });
                const reranked = (0, reflowArchitectureScaffold_1.rerankWithContext)(fusedAndAdjusted, {
                    contextText: options?.context,
                    blockText: block.text,
                    tuningProfile: options?.wave5TuningProfile,
                });
                const rerankByCandidateId = new Map(reranked.map((item) => [item.candidateId, item.score]));
                suggestions = suggestions
                    .map((candidate, index) => ({
                    candidate,
                    rankScore: rerankByCandidateId.get(`${index}:${candidate.acordCode}`) ||
                        Number(candidate.confidenceScore || 0),
                }))
                    .sort((left, right) => right.rankScore - left.rankScore ||
                    Number(right.candidate.confidenceScore || 0) -
                        Number(left.candidate.confidenceScore || 0) ||
                    left.candidate.acordCode.localeCompare(right.candidate.acordCode))
                    .map((entry) => entry.candidate);
                const topFusionScore = reranked.length > 0 ? Number(reranked[0].score || 0) : 0;
                wave5ReflowApplied = reranked.length > 0;
                wave5ReflowDiagnostics = (0, reflowModeDiagnostics_1.emitReflowModeDiagnostics)({
                    carrierId: options?.familyId,
                    pageIndex,
                    candidateCount: reflowCandidates.length,
                    multiStageResults,
                    parallelResults,
                    topFusionScore,
                    stageLatencyMs: Date.now() - wave5ReflowStartedAt,
                });
            }
            catch (error) {
                wave49Errors.push(normalizeWave49Error("wave5-reflow", error));
            }
        }
        let consistencyOverrideApplied = false;
        if (WAVE45_CONSISTENCY_ENABLED &&
            priorConsistency &&
            suggestions.length > 0 &&
            suggestions[0].acordCode !== priorConsistency.acordCode) {
            const top = suggestions[0];
            const strongDisagreement = top.confidenceScore >= priorConsistency.confidenceScore + 0.17 &&
                top.confidenceScore >= 0.8;
            if (!strongDisagreement) {
                const existingIndex = suggestions.findIndex((candidate) => candidate.acordCode === priorConsistency.acordCode);
                if (existingIndex > 0) {
                    const [match] = suggestions.splice(existingIndex, 1);
                    suggestions.unshift(match);
                }
                else if (existingIndex < 0) {
                    const found = (0, acordDictionary_1.lookupAcordByCode)(priorConsistency.acordCode);
                    if (found) {
                        suggestions.unshift({
                            acordCode: found.acordCode,
                            label: found.label,
                            description: found.description,
                            confidenceScore: Number(Math.min(0.99, Math.max(0.3, priorConsistency.confidenceScore * 0.98)).toFixed(3)),
                            normalizedConfidenceScore: Number(Math.min(0.99, Math.max(0.3, priorConsistency.confidenceScore * 0.98)).toFixed(3)),
                            source: "dictionary",
                            lexicalScore: 0.35,
                            semanticSimilarity: 0.35,
                            dictionaryScore: 0.45,
                            heuristicScore: 0.35,
                        });
                    }
                }
                if (suggestions[0]) {
                    suggestions[0] = {
                        ...suggestions[0],
                        confidenceScore: Number(Math.max(0.66, Number(suggestions[0].confidenceScore || 0)).toFixed(3)),
                        normalizedConfidenceScore: Number(Math.max(0.66, Number(suggestions[0].normalizedConfidenceScore || suggestions[0].confidenceScore || 0)).toFixed(3)),
                    };
                }
                consistencyOverrideApplied = true;
            }
        }
        let fallbackReason;
        if (WAVE8_USABILITY_MODE && !wave8HeaderAssessment.headerBlock) {
            if (suggestions.length === 0) {
                suggestions = [buildSyntheticConfidenceFallbackCandidate(block)];
                fallbackReason = "synthetic_confidence_fallback";
            }
            else {
                const confidenceEligible = suggestions.filter((candidate) => Number(candidate.confidenceScore || 0) >= WAVE8_CONFIDENCE_FALLBACK_THRESHOLD);
                const hasFusionPass = suggestions.some((candidate) => {
                    const fusionScore = Number(fusionByAcordCode.get(candidate.acordCode)?.fusionScore ||
                        candidate.normalizedConfidenceScore ||
                        candidate.confidenceScore ||
                        0);
                    return fusionScore >= fusionThreshold;
                });
                const hasPositiveContributions = suggestions.some((candidate) => {
                    const details = fusionByAcordCode.get(candidate.acordCode);
                    return (Number(details?.semanticContribution || 0) > 0 ||
                        Number(details?.geometryContribution || 0) > 0);
                });
                if (!hasFusionPass && confidenceEligible.length > 0) {
                    confidenceEligible.sort((left, right) => Number(right.confidenceScore || 0) - Number(left.confidenceScore || 0) ||
                        left.acordCode.localeCompare(right.acordCode));
                    const selected = confidenceEligible[0];
                    suggestions = [
                        selected,
                        ...suggestions.filter((candidate) => candidate.acordCode !== selected.acordCode),
                    ];
                    fallbackReason = "confidence_only_fallback";
                }
                if (!hasPositiveContributions && confidenceEligible.length > 0 && !fallbackReason) {
                    fallbackReason = "confidence_only_fallback";
                }
            }
        }
        const topCandidate = suggestions[0];
        if (blockIndex < REDUCER_DEBUG_BLOCK_LIMIT) {
            reducerDebugEntries.push({
                blockIndex,
                blockId: block.id,
                page: block.page,
                textSample: String(block.text || "").slice(0, 120),
                accumCount: candidatePoolCountBeforeFallback,
                suggestionsCount: suggestions.length,
                preGateCandidateCount,
                postGateCandidateCount,
                gatedOutCandidateCount,
                lowCategoryConfidenceFallbackActive,
                categoryModeGateDecision,
                wave5GeometryFusionApplied: wave5FusionApplied,
                wave5CategoryModeApplied,
                wave5ReflowApplied,
                fusionThreshold,
                fusionWeights: {
                    category: Number(WAVE8_EFFECTIVE_FUSION.category || 0),
                    heuristic: Number(WAVE8_EFFECTIVE_FUSION.heuristic || 0),
                    geometry: Number(WAVE8_EFFECTIVE_FUSION.geometry || 0),
                    ontology: Number(WAVE8_EFFECTIVE_FUSION.ontology || 0),
                    semantic: Number(WAVE8_EFFECTIVE_FUSION.semantic || 0),
                    dictionary: Number(WAVE8_EFFECTIVE_FUSION.dictionary || 0),
                    lexical: Number(WAVE8_EFFECTIVE_FUSION.lexical || 0),
                },
                topCandidateConfidence: Number(topCandidate?.confidenceScore || 0),
                topCandidateNormalizedConfidence: Number(topCandidate?.normalizedConfidenceScore || topCandidate?.confidenceScore || 0),
                firstFiveCandidates: suggestions.slice(0, 5).map((candidate) => ({
                    acordCode: candidate.acordCode,
                    label: candidate.label,
                    confidenceScore: Number(candidate.confidenceScore || 0),
                    normalizedConfidenceScore: Number(candidate.normalizedConfidenceScore || candidate.confidenceScore || 0),
                    source: String(candidate.source || "unknown"),
                    fusionScore: Number(fusionByAcordCode.get(candidate.acordCode)?.fusionScore ||
                        candidate.normalizedConfidenceScore ||
                        candidate.confidenceScore ||
                        0),
                    fusionThreshold,
                    reducerDecision: (() => {
                        const fusionScore = Number(fusionByAcordCode.get(candidate.acordCode)?.fusionScore ||
                            candidate.normalizedConfidenceScore ||
                            candidate.confidenceScore ||
                            0);
                        const confidenceScore = Number(candidate.confidenceScore || 0);
                        const semanticContribution = Number(fusionByAcordCode.get(candidate.acordCode)?.semanticContribution || 0);
                        const geometryContribution = Number(fusionByAcordCode.get(candidate.acordCode)?.geometryContribution || 0);
                        const contributionMissing = semanticContribution <= 0 && geometryContribution <= 0;
                        const confidenceFallbackPass = WAVE8_USABILITY_MODE &&
                            confidenceScore >= WAVE8_CONFIDENCE_FALLBACK_THRESHOLD &&
                            contributionMissing;
                        return fusionScore >= fusionThreshold || confidenceFallbackPass
                            ? "kept"
                            : "dropped";
                    })(),
                    dictionaryScore: Number(candidate.dictionaryScore || 0),
                    heuristicScore: Number(candidate.heuristicScore || 0),
                    semanticScore: Number(fusionByAcordCode.get(candidate.acordCode)?.semanticScore ||
                        candidate.normalizedConfidenceScore ||
                        candidate.confidenceScore ||
                        0),
                    geometryAgreement: Number(candidate?._geometryAgreement || 0),
                    categoryEvidence: Number(candidate?._categoryEvidence || 0),
                    geometryScore: Number(fusionByAcordCode.get(candidate.acordCode)?.geometryScore ||
                        candidate?._geometryAgreement ||
                        0),
                    categoryScore: Number(candidate?._categoryEvidence || 0),
                    semanticContribution: Number(fusionByAcordCode.get(candidate.acordCode)?.semanticContribution || 0),
                    geometryContribution: Number(fusionByAcordCode.get(candidate.acordCode)?.geometryContribution || 0),
                })),
            });
        }
        if (topCandidate) {
            consistencyCache.set(consistencyKey, {
                acordCode: topCandidate.acordCode,
                confidenceScore: Number(topCandidate.confidenceScore || 0),
                page: block.page,
                category: primaryCategory,
            });
            if (primaryCategory) {
                const existing = seenCodesByCategory.get(primaryCategory) || new Set();
                existing.add(topCandidate.acordCode);
                seenCodesByCategory.set(primaryCategory, existing);
            }
        }
        stageTimings.totalMs = Date.now() - blockStartedAt;
        const wave49LatencySummary = summarizeWave49Latency(stageTimings);
        const fallbackPath = starvationFallbackApplied
            ? starvationWave48SeededCodeCount > 0
                ? "starvation_seeded_recovery"
                : "heuristic_starvation_recovery"
            : lowCategoryConfidenceFallbackActive
                ? "low_category_fallback"
                : effectiveAllowedCodes
                    ? "category_gate"
                    : "standard";
        const carrierTelemetry = topCandidate
            ? resolveWave46CarrierSignals(block, { acordCode: topCandidate.acordCode, label: topCandidate.label }, options?.familyId)
            : undefined;
        const normalizedCarrierTelemetry = {
            carrierIds: carrierTelemetry?.carrierIds || [],
            contextsDetected: Boolean(carrierTelemetry?.contextsDetected),
            score: Number(carrierTelemetry?.score || 0),
            synonymMatched: Boolean(carrierTelemetry?.synonymMatched),
            geometryMatched: Boolean(carrierTelemetry?.geometryMatched),
            patternMatched: Boolean(carrierTelemetry?.patternMatched),
            fieldOverrideMatched: Boolean(carrierTelemetry?.fieldOverrideMatched),
            priorityOverride: Boolean(carrierTelemetry?.priorityOverride),
        };
        const carrierTelemetryLog = {
            blockId: block.id,
            page: block.page,
            familyId: options?.familyId || null,
            carrierIds: normalizedCarrierTelemetry.carrierIds,
            carrierContextCount: normalizedCarrierTelemetry.carrierIds.length,
            carrierContextsDetected: normalizedCarrierTelemetry.contextsDetected,
            carrierScore: normalizedCarrierTelemetry.score,
            synonymMatched: normalizedCarrierTelemetry.synonymMatched,
            geometryMatched: normalizedCarrierTelemetry.geometryMatched,
            patternMatched: normalizedCarrierTelemetry.patternMatched,
            fieldOverrideMatched: normalizedCarrierTelemetry.fieldOverrideMatched,
            priorityOverride: normalizedCarrierTelemetry.priorityOverride,
            fallbackPath,
            latencyHotspotStage: wave49LatencySummary.hotspotStage,
            latencyHotspotMs: wave49LatencySummary.hotspotMs,
            stageTimingsMs: stageTimings,
        };
        if (telemetryEnabled) {
            emitWave49CarrierLog(carrierTelemetryLog);
        }
        const topThresholds = topCandidate
            ? resolveThresholds(resolveScopedCalibrationProfile(options?.calibrationProfile, options?.familyId), topCandidate.acordCode, {
                layoutLmEvidence: Number(topCandidate?._categoryEvidence || 0),
                hasCategoryMatch: Number(topCandidate?._categoryEvidence || 0) >= 0.5,
                geometryAgreement: Number(topCandidate?._geometryAgreement || 0),
                ontologyPrior: Number(topCandidate?._ontologyPrior || 0),
                heuristicEvidence: Number(topCandidate?._heuristicEvidence || 0),
                lowCategoryFallback: Boolean(topCandidate?._lowCategoryFallback),
                geometryPriorityOverride: Boolean(topCandidate?._geometryPriorityOverride),
                carrierMatchScore: Number(topCandidate?._carrierMatchScore || 0),
                carrierPriorityOverride: Boolean(topCandidate?._carrierPriorityOverride),
                wave47GeneralizationScore: Number(topCandidate?._wave47GeneralizationScore || 0),
                wave47ClusterAligned: Boolean(topCandidate?._wave47ClusterAligned),
                wave47OodGeometryDetected: Boolean(topCandidate?._wave47OodGeometryDetected),
                wave47OodPatternDetected: Boolean(topCandidate?._wave47OodPatternDetected),
                wave47OodPriorityOverride: Boolean(topCandidate?._wave47PriorityOverride),
                wave48OverrideExists: Boolean(topCandidate?._wave48OverrideExists),
                wave48ForceDecision: topCandidate?._wave48ForceDecision,
            })
            : undefined;
        const topConfidence = Number(topCandidate?.confidenceScore || 0);
        const topConfidenceLevel = topCandidate?.confidenceLevel ||
            (topThresholds ? resolveConfidenceLevel(topConfidence, topThresholds) : undefined);
        const thresholdDecision = wave8HeaderAssessment.headerBlock && suggestions.length === 0
            ? "rejected"
            : topCandidate && topConfidenceLevel
                ? topConfidenceLevel
                : suggestions.length > 0
                    ? "rejected"
                    : "none";
        const thresholdReason = !topCandidate
            ? wave8HeaderAssessment.headerBlock
                ? "header_strict_gate_reject"
                : "no_candidates_after_reranking"
            : topConfidenceLevel === "accepted"
                ? "meets_accepted_threshold"
                : topConfidenceLevel === "review"
                    ? "between_review_and_accepted"
                    : "below_review_threshold";
        const topWave8Gating = topCandidate?.wave8Gating;
        const suppressionReasons = [
            ...wave8HeaderAssessment.reasons,
            ...(Array.isArray(topWave8Gating?.rejectReasons) ? topWave8Gating.rejectReasons : []),
        ];
        const isSuppressed = wave8HeaderAssessment.headerBlock &&
            (!topCandidate || !Boolean(topWave8Gating?.passed));
        emitWave49Telemetry({
            blockId: block.id,
            page: block.page,
            familyId: options?.familyId || null,
            context: options?.context || null,
            gatedCandidateCount: postGateCandidateCount,
            finalSuggestionCount: suggestions.length,
            thresholdDecision,
            thresholdReason,
            starvationFallbackApplied,
            starvationWave48SeededCodeCount,
            fallbackPath,
            latencyHotspotStage: wave49LatencySummary.hotspotStage,
            latencyHotspotMs: wave49LatencySummary.hotspotMs,
            activeStages: wave49LatencySummary.activeStages,
            carrierIds: topCandidate ? (topCandidate?._carrierIds || []) : [],
            carrierContextCount: topCandidate ? (topCandidate?._carrierIds || []).length : 0,
            carrierMatchScore: topCandidate ? Number(topCandidate?._carrierMatchScore || 0) : 0,
            carrierPriorityOverride: Boolean(topCandidate?._carrierPriorityOverride),
            wave48OverrideExists: Boolean(topCandidate?._wave48OverrideExists),
            wave5GeometryEnabled,
            wave5GeometryFusionApplied: wave5FusionApplied,
            wave5GeometryDiagnostics,
            errorCount: wave49Errors.length,
            errorStages: wave49Errors.map((entry) => entry.stage),
            errorMessages: wave49Errors.map((entry) => entry.message),
            carrierTelemetryLog,
            stageTimingsMs: stageTimings,
        });
        const mapping = {
            blockId: block.id,
            page: block.page,
            text: block.text,
            boundingBox: block.boundingBox,
            suggestions,
            chosen: suggestions[0],
            topCandidate: suggestions[0],
            fieldType: deriveUsabilityFieldType(block, suggestions[0]),
            semanticLabel: deriveUsabilitySemanticLabel(block, suggestions[0], pairedSelectionLabel, options?.familyId),
            gatingMetadata: {
                passed: !isSuppressed,
                thresholdDecision,
                thresholdReason,
                rejectReasons: Array.from(new Set(suppressionReasons)),
                semanticConsistency: Number(topCandidate?._wave8SemanticConsistency || 0),
                dictionaryConsistency: Number(topCandidate?._wave8DictionaryConsistency || 0),
                categoryConsistency: Number(topCandidate?._wave8CategoryConsistency || 0),
                supervisionBoost: Number(topCandidate?._wave8SupervisionBoost || 0),
            },
            suppressionMetadata: {
                suppressed: isSuppressed,
                reason: isSuppressed ? "header_non_field_suppression" : undefined,
                reasons: Array.from(new Set(suppressionReasons)),
                nonField: wave8HeaderAssessment.nonField,
                headerBlock: wave8HeaderAssessment.headerBlock,
            },
            confidenceScores: {
                confidenceScore: Number(topCandidate?.confidenceScore || 0),
                normalizedConfidenceScore: Number(topCandidate?.normalizedConfidenceScore || topCandidate?.confidenceScore || 0),
                semanticScore: Number(topCandidate?._wave8SemanticConsistency || 0),
                dictionaryScore: Number(topCandidate?._wave8DictionaryConsistency || 0),
                categoryScore: Number(topCandidate?._wave8CategoryConsistency || 0),
                supervisionBoost: Number(topCandidate?._wave8SupervisionBoost || 0),
            },
            fallbackReason,
            mappingDiagnostics: ({
                layoutLmPrimaryClassifierEnabled: useLayoutLmPrimaryClassifier,
                wave44FusionEnabled: WAVE44_FUSION_ENABLED,
                wave44GateEnabled: WAVE44_GATE_ENABLED,
                wave44CategoryPruningEnabled: WAVE44_CATEGORY_PRUNING_ENABLED,
                layoutLmEvidencePresent: hasLayoutLmEvidence,
                taxonomyCategoryGateActive: (0, acordTaxonomy_1.isTaxonomyLoaded)(),
                layoutLmTopK: LAYOUTLM_PRIMARY_TOP_K,
                lowCategoryConfidenceFallbackActive,
                maxLayoutLmProbability: Number(maxLayoutLmProbability.toFixed(3)),
                wave45AlignmentEnabled: WAVE45_ALIGNMENT_ENABLED,
                wave45ConsistencyEnabled: WAVE45_CONSISTENCY_ENABLED,
                wave45RerankEnabled: WAVE45_RERANK_ENABLED,
                wave45AlignmentConceptCount: WAVE45_ALIGNMENT.concepts.length,
                wave45ConsistencyOverrideApplied: consistencyOverrideApplied,
                wave46CarrierEnabled: WAVE46_CARRIER_ENABLED,
                wave46CarrierBoostEnabled: WAVE46_CARRIER_BOOST_ENABLED,
                wave46CarrierGateEnabled: WAVE46_CARRIER_GATE_ENABLED,
                wave47GeneralizationEnabled: WAVE47_GENERALIZATION_ENABLED,
                wave47RobustnessEnabled: WAVE47_ROBUSTNESS_ENABLED,
                wave47GateEnabled: WAVE47_GATE_ENABLED,
                wave48OverridesEnabled: WAVE48_OVERRIDES_ENABLED,
                wave48GateEnabled: WAVE48_GATE_ENABLED,
                wave48RerankEnabled: WAVE48_RERANK_ENABLED,
                wave5GeometryEnabled,
                wave5GeometryFusionApplied: wave5FusionApplied,
                wave5GeometryDiagnostics,
                wave5CategoryModeEnabled,
                wave5CategoryModeApplied,
                wave5CategoryModeDiagnostics,
                wave5ReflowEnabled,
                wave5ReflowApplied,
                wave5ReflowDiagnostics,
                wave49TelemetryEnabled: WAVE49_TELEMETRY_ENABLED,
                wave8SupervisionRuleCount: (0, supervision_1.getWave8SupervisionRuleCount)(),
                wave8SelectionMarkPaired: Boolean(pairedSelectionLabel),
                wave8SelectionMarkPairLabel: pairedSelectionLabel || null,
                layoutLmSeededCandidateCount,
                gatedCandidateCount: postGateCandidateCount,
                gatedOutCandidateCount,
                candidatePoolCountBeforeFallback,
                candidatePoolCountAfterFallback,
                starvationFallbackApplied,
                starvationWave48SeededCodeCount,
                starvationWave48ExceptionIds,
                fallbackPath,
                latencyHotspotStage: wave49LatencySummary.hotspotStage,
                latencyHotspotMs: wave49LatencySummary.hotspotMs,
                activeStages: wave49LatencySummary.activeStages,
                carrierTelemetry: normalizedCarrierTelemetry,
                errorCount: wave49Errors.length,
                errorStages: wave49Errors.map((entry) => entry.stage),
                stageTimingsMs: stageTimings,
                finalSuggestionCount: suggestions.length,
                thresholdDecision,
                thresholdReason,
                wave8HeaderBlock: wave8HeaderAssessment.headerBlock,
                wave8HeaderScore: wave8HeaderAssessment.score,
                wave8HeaderReasons: wave8HeaderAssessment.reasons,
                wave8NonFieldBlock: wave8HeaderAssessment.nonField,
                topCandidate: topCandidate && topThresholds && topConfidenceLevel
                    ? {
                        acordCode: topCandidate.acordCode,
                        confidenceScore: topConfidence,
                        confidenceLevel: topConfidenceLevel,
                        carrierIds: topCandidate?._carrierIds || [],
                        carrierMatchScore: Number(topCandidate?._carrierMatchScore || 0),
                        wave48ExceptionIds: topCandidate?._wave48ExceptionIds || [],
                        wave48OverrideExists: Boolean(topCandidate?._wave48OverrideExists),
                        wave48ForceDecision: topCandidate?._wave48ForceDecision,
                        wave47ClusterIds: topCandidate?._wave47ClusterIds || [],
                        wave47GeneralizationScore: Number(topCandidate?._wave47GeneralizationScore || 0),
                        wave47ClusterAligned: Boolean(topCandidate?._wave47ClusterAligned),
                        wave47OodGeometryDetected: Boolean(topCandidate?._wave47OodGeometryDetected),
                        wave47OodPatternDetected: Boolean(topCandidate?._wave47OodPatternDetected),
                        thresholds: topThresholds,
                    }
                    : undefined,
            }),
        };
        results.push(mapping);
    }
    applyContractorsInsuredNameResolver(results, options?.familyId);
    promoteTargetedAnchorMappings(results, options?.familyId);
    suppressOverlappingMappings(results);
    lastReducerDebugSnapshot = {
        timestamp: new Date().toISOString(),
        totalBlocks: orderedBlocks.length,
        capturedBlocks: reducerDebugEntries.length,
        entries: reducerDebugEntries,
    };
    return results;
}
