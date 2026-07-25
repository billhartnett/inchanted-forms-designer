"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadWave9Models = loadWave9Models;
exports.inferWave9RoleContext = inferWave9RoleContext;
exports.applyWave9FamilyConstraints = applyWave9FamilyConstraints;
exports.applyWave9ConsistencyAndGeometryRerank = applyWave9ConsistencyAndGeometryRerank;
exports.inferWave9FieldTypeOverride = inferWave9FieldTypeOverride;
exports.inferWave9Suppression = inferWave9Suppression;
exports.resolveWave9ThresholdDecision = resolveWave9ThresholdDecision;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const DEFAULT_WAVE9_THRESHOLDS = {
    accepted: 0.78,
    review: 0.5,
    reject: 0.28,
};
let cachedWave9 = null;
function normalizeText(text) {
    return String(text || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}
function scoreTokenWeights(text, tokenWeights) {
    if (!tokenWeights)
        return 0;
    const tokens = normalizeText(text).split(" ").filter(Boolean);
    let score = 0;
    for (const token of tokens) {
        score += Number(tokenWeights[token] || 0);
    }
    return score;
}
function scoreGeometry(block, centroid) {
    if (!centroid)
        return 0;
    const x = Number(block.boundingBox?.x || 0);
    const y = Number(block.boundingBox?.y || 0);
    const sigmaX = Math.max(1, Number(centroid.sigmaX || 80));
    const sigmaY = Math.max(1, Number(centroid.sigmaY || 80));
    const dx = (x - Number(centroid.centroidX || 0)) / sigmaX;
    const dy = (y - Number(centroid.centroidY || 0)) / sigmaY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return Math.max(0, 1 - Math.min(1.5, distance));
}
function readJsonSafe(filePath) {
    try {
        if (!node_fs_1.default.existsSync(filePath))
            return undefined;
        return JSON.parse(node_fs_1.default.readFileSync(filePath, "utf8"));
    }
    catch {
        return undefined;
    }
}
function loadWave9Models() {
    if (cachedWave9) {
        return cachedWave9;
    }
    const enabled = process.env.WAVE9_MODELS_ENABLED !== "0";
    if (!enabled) {
        cachedWave9 = { enabled: false, bundle: {} };
        return cachedWave9;
    }
    const baseDir = process.env.WAVE9_MODELS_DIR || node_path_1.default.resolve(__dirname, "../../../../training-data/acord-labeled/wave9");
    const bundle = {
        roleClassifier: readJsonSafe(node_path_1.default.join(baseDir, "role_classifier.json")),
        familyOntologyResolver: readJsonSafe(node_path_1.default.join(baseDir, "family_ontology_resolver.json")),
        fieldTypeModel: readJsonSafe(node_path_1.default.join(baseDir, "field_type_model.json")),
        suppressionModel: readJsonSafe(node_path_1.default.join(baseDir, "suppression_model.json")),
        geometryModel: readJsonSafe(node_path_1.default.join(baseDir, "geometry_model.json")),
        consistencyModel: readJsonSafe(node_path_1.default.join(baseDir, "consistency_model.json")),
        confidenceCalibration: readJsonSafe(node_path_1.default.join(baseDir, "confidence_calibration.json")),
    };
    cachedWave9 = {
        enabled: true,
        bundle,
    };
    return cachedWave9;
}
function inferWave9RoleContext(block, fallbackRole) {
    const model = loadWave9Models();
    const roles = model.bundle.roleClassifier?.roles;
    if (!model.enabled || !roles || Object.keys(roles).length === 0) {
        return fallbackRole;
    }
    const scored = Object.entries(roles)
        .map(([role, payload]) => {
        const tokenScore = scoreTokenWeights(block.text, payload.tokenWeights);
        const geometryScore = scoreGeometry(block, payload.geometry);
        return {
            role,
            score: tokenScore * 0.7 + geometryScore * 0.3,
        };
    })
        .sort((left, right) => right.score - left.score || left.role.localeCompare(right.role));
    if (scored.length === 0 || scored[0].score < 0.08) {
        return fallbackRole;
    }
    return scored[0].role;
}
function applyWave9FamilyConstraints(suggestions, familyId) {
    if (suggestions.length === 0)
        return suggestions;
    const model = loadWave9Models();
    const resolver = model.bundle.familyOntologyResolver;
    if (!model.enabled || !familyId || !resolver?.familyToCodes || !resolver.codeToFamilies) {
        return suggestions;
    }
    const normalizedFamily = normalizeText(familyId).replace(/\s+/g, "-");
    const allowedCodes = new Set((resolver.hardConstraints?.[normalizedFamily] || resolver.familyToCodes[normalizedFamily] || [])
        .map((code) => String(code || "")));
    if (allowedCodes.size === 0) {
        return suggestions;
    }
    const filtered = suggestions.filter((candidate) => {
        const code = String(candidate.acordCode || "");
        if (!code)
            return false;
        if (/^LawyersProfessionalLiability_/i.test(code) && !/lawyer/.test(normalizedFamily)) {
            return false;
        }
        return allowedCodes.has(code);
    });
    return filtered.length > 0 ? filtered : suggestions;
}
function applyWave9ConsistencyAndGeometryRerank(suggestions, block, predictedRole) {
    if (suggestions.length <= 1)
        return suggestions;
    const model = loadWave9Models();
    if (!model.enabled)
        return suggestions;
    const canonicalCode = model.bundle.consistencyModel?.textToCanonicalCode?.[normalizeText(block.text)];
    const roleCentroid = predictedRole
        ? model.bundle.geometryModel?.roleCentroids?.[predictedRole]
        : undefined;
    return suggestions
        .map((candidate) => {
        const base = Number(candidate.confidenceScore || 0);
        const consistencyBoost = canonicalCode && candidate.acordCode === canonicalCode ? 0.08 : 0;
        let geometryBoost = 0;
        if (roleCentroid) {
            const gScore = scoreGeometry(block, {
                centroidX: roleCentroid.x,
                centroidY: roleCentroid.y,
                sigmaX: roleCentroid.sigmaX,
                sigmaY: roleCentroid.sigmaY,
            });
            geometryBoost = gScore * 0.04;
        }
        const adjusted = Math.min(0.999, base + consistencyBoost + geometryBoost);
        return {
            ...candidate,
            confidenceScore: Number(adjusted.toFixed(3)),
            normalizedConfidenceScore: Number(Math.max(adjusted, Number(candidate.normalizedConfidenceScore || candidate.confidenceScore || 0)).toFixed(3)),
        };
    })
        .sort((left, right) => Number(right.confidenceScore || 0) - Number(left.confidenceScore || 0) ||
        left.acordCode.localeCompare(right.acordCode));
}
function inferWave9FieldTypeOverride(blockText, topCandidate) {
    const model = loadWave9Models();
    if (!model.enabled)
        return undefined;
    const fieldTypeModel = model.bundle.fieldTypeModel;
    if (!fieldTypeModel)
        return undefined;
    const code = String(topCandidate?.acordCode || "");
    const direct = code ? fieldTypeModel.byCode?.[code] : undefined;
    if (direct) {
        if (direct === "numeric")
            return "numeric";
        if (direct === "boolean")
            return "checkbox";
        if (direct === "date")
            return "date";
        return "text";
    }
    const normalized = normalizeText(blockText);
    const rules = (fieldTypeModel.byTextPattern || [])
        .slice()
        .sort((left, right) => Number(right.priority || 0) - Number(left.priority || 0));
    for (const rule of rules) {
        try {
            if (new RegExp(rule.pattern, "i").test(normalized)) {
                if (rule.fieldType === "numeric")
                    return "numeric";
                if (rule.fieldType === "boolean")
                    return "checkbox";
                if (rule.fieldType === "date")
                    return "date";
                return "text";
            }
        }
        catch {
            continue;
        }
    }
    return undefined;
}
function inferWave9Suppression(block) {
    const model = loadWave9Models();
    if (!model.enabled) {
        return { suppress: false, reasons: [] };
    }
    const normalized = normalizeText(block.text);
    const suppression = model.bundle.suppressionModel;
    const reasons = [];
    let score = 0;
    if (suppression?.topBandYThreshold && Number(block.boundingBox?.y || 0) <= suppression.topBandYThreshold) {
        score += 0.3;
        reasons.push("wave9_top_band");
    }
    for (const pattern of suppression?.suppressTextPatterns || []) {
        try {
            if (new RegExp(pattern.pattern, "i").test(normalized)) {
                score += Number(pattern.weight || 0.4);
                reasons.push(pattern.reason || `wave9_pattern:${pattern.pattern}`);
            }
        }
        catch {
            continue;
        }
    }
    return {
        suppress: score >= 0.55,
        reasons,
    };
}
function resolveWave9ThresholdDecision(confidenceScore, predictedRole) {
    const model = loadWave9Models();
    const calibration = model.bundle.confidenceCalibration;
    const roleThresholds = predictedRole && calibration?.byRole?.[predictedRole]
        ? calibration.byRole[predictedRole]
        : calibration?.global;
    const thresholds = roleThresholds || DEFAULT_WAVE9_THRESHOLDS;
    if (confidenceScore >= Number(thresholds.accepted || DEFAULT_WAVE9_THRESHOLDS.accepted)) {
        return "accepted";
    }
    if (confidenceScore >= Number(thresholds.review || DEFAULT_WAVE9_THRESHOLDS.review)) {
        return "review";
    }
    return "rejected";
}
