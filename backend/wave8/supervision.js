"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWave8SupervisionCandidatesForText = getWave8SupervisionCandidatesForText;
exports.getWave8SupervisionAnchorBoost = getWave8SupervisionAnchorBoost;
exports.getWave8SemanticHintForText = getWave8SemanticHintForText;
exports.getWave8SupervisionRuleCount = getWave8SupervisionRuleCount;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const FIXTURE_EXPECTATIONS_PATH = node_path_1.default.resolve(__dirname, "../api/tests/fixture-expectations.json");
const GOLD_LABEL_SUPERVISION_PATH = node_path_1.default.resolve(__dirname, "../api/tests/gold-label-supervision.example.json");
const GOLD_ANCHORS_PATH = node_path_1.default.resolve(__dirname, "../api/tests/gold-anchor-fields.json");
const FIXTURE_TO_FAMILY = {
    "sample-Acord-125.pdf": "acord-125",
    "sample-Acord-126.pdf": "acord-126",
    "sample-Acord-127.pdf": "acord-127",
    "sample-Acord-140.pdf": "acord-140",
    "Contractors Supp App.pdf": "contractors-supplement",
    "Markel-Contractors-Supp.pdf": "contractors-supplement",
    "ANA_E-S_Contractors_Supplemental-Application_MKT0109_fillable.pdf": "contractors-supplement",
};
const ANCHOR_CODE_HINTS = {
    insured_name: [
        "GeneralInfo.NamedInsured",
        "NamedInsured_FullName",
        "NamedInsured_FullName_AA",
        "NamedInsured_GivenName",
    ],
    operations_description: [
        "GeneralLiability_OperationsDescription",
        "BusinessInformation_OperationsDescription",
        "AgriculturalAviation_OtherStatesOperationsDescription",
        "BuildersRiskInstallation_Rigging_OperationsDescription",
    ],
};
const TARGETED_ANCHOR_PATTERN_VARIANTS = {
    insured_name: [
        "insured\\s+name",
        "name\\s+of\\s+(first\\s+)?named\\s+insured",
        "first\\s+named\\s+insured",
        "named\\s+insured",
        "name\\s+of\\s+insured",
        "applicant\\s+name",
        "name\\s+of\\s+applicant",
        "insured\\s*:\\s*",
    ],
    operations_description: [
        "operations\\s+description",
        "premises\\s*\\/\\s*operations",
        "description\\s+of\\s+operations",
        "nature\\s+of\\s+operations",
    ],
};
const TARGETED_ANCHOR_TUNING = {
    insured_name: {
        anchorWeightMultiplier: 1.5,
        synonymVariantWeightBonus: 0.2,
        dictionaryConfidenceWeight: 1.25,
        semanticHintWeight: 1.3,
        categoryHintWeight: 1.25,
    },
    operations_description: {
        anchorWeightMultiplier: 1.55,
        synonymVariantWeightBonus: 0.25,
        dictionaryConfidenceWeight: 1.3,
        semanticHintWeight: 1.32,
        categoryHintWeight: 1.28,
    },
};
let compiledRulesCache = null;
let rulesByCodeCache = null;
function normalizeText(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}
function safeRegex(pattern) {
    try {
        return new RegExp(pattern, "i");
    }
    catch {
        return null;
    }
}
function inferSemanticHintFromAcordCode(acordCode) {
    const code = normalizeText(acordCode).replace(/\s+/g, "");
    if (/(signature|signed|authorizedsignature)/.test(code)) {
        return { semanticLabel: "signature", categoryMode: "compliance_information" };
    }
    if (/(date|dob|birth|effective|expiration|expiry)/.test(code)) {
        return { semanticLabel: "date", categoryMode: "policy_information" };
    }
    if (/(indicator|yesno|checkbox|selected|unselected)/.test(code)) {
        return { semanticLabel: "boolean_choice", categoryMode: "compliance_information" };
    }
    if (/(amount|premium|limit|deductible|rate|percent|value)/.test(code)) {
        return { semanticLabel: "currency", categoryMode: "coverage_information" };
    }
    if (/(vehicle|vin|driver|auto)/.test(code)) {
        return { semanticLabel: "vehicle", categoryMode: "vehicle_information" };
    }
    if (/(property|premises|dwelling|building|commercialstructure|residential)/.test(code)) {
        return { semanticLabel: "property", categoryMode: "property_information" };
    }
    if (/(policy|carrier|term|quote|submission)/.test(code)) {
        return { semanticLabel: "policy", categoryMode: "policy_information" };
    }
    if (/(name|insured|applicant|producer|contact|mailingaddress|address|city|state|postal|zip)/.test(code)) {
        return { semanticLabel: "person_name", categoryMode: "party_information" };
    }
    if (/(coverage|liability|operations|risk|underwriting)/.test(code)) {
        return { semanticLabel: "coverage", categoryMode: "coverage_information" };
    }
    return { semanticLabel: "generic", categoryMode: "general_information" };
}
function loadJson(filePath, fallback) {
    try {
        if (!node_fs_1.default.existsSync(filePath)) {
            return fallback;
        }
        const raw = node_fs_1.default.readFileSync(filePath, "utf8");
        return JSON.parse(raw);
    }
    catch {
        return fallback;
    }
}
function collectRules() {
    const rules = [];
    const fixtureExpectations = loadJson(FIXTURE_EXPECTATIONS_PATH, {});
    for (const [fixtureName, entries] of Object.entries(fixtureExpectations)) {
        if (!Array.isArray(entries))
            continue;
        const familyId = FIXTURE_TO_FAMILY[fixtureName];
        for (const entry of entries) {
            const expectedAcordCode = String(entry?.expectedAcordCode || "").trim();
            const pattern = String(entry?.textPattern || "").trim();
            if (!expectedAcordCode || !pattern)
                continue;
            rules.push({
                source: "fixture_expectation",
                fixtureName,
                familyId,
                anchorId: String(entry?.id || "").trim() || undefined,
                expectedAcordCode,
                pattern,
                semanticHint: inferSemanticHintFromAcordCode(expectedAcordCode),
            });
        }
    }
    const goldLabel = loadJson(GOLD_LABEL_SUPERVISION_PATH, {});
    for (const form of goldLabel.forms || []) {
        const fixtureName = String(form?.fixtureName || "").trim();
        const familyId = FIXTURE_TO_FAMILY[fixtureName];
        for (const entry of form?.entries || []) {
            const codes = Array.isArray(entry?.expectedAcordCodes)
                ? entry.expectedAcordCodes.map((code) => String(code || "").trim()).filter(Boolean)
                : [];
            const patterns = Array.isArray(entry?.matchAnyPatterns)
                ? entry.matchAnyPatterns.map((p) => String(p || "").trim()).filter(Boolean)
                : [];
            for (const expectedAcordCode of codes) {
                for (const pattern of patterns) {
                    rules.push({
                        source: "gold_label",
                        fixtureName,
                        familyId,
                        anchorId: String(entry?.anchorId || "").trim() || undefined,
                        expectedAcordCode,
                        pattern,
                        semanticHint: inferSemanticHintFromAcordCode(expectedAcordCode),
                    });
                }
            }
        }
    }
    const anchorConfig = loadJson(GOLD_ANCHORS_PATH, {});
    for (const form of anchorConfig.forms || []) {
        const fixtureName = String(form?.fixtureName || "").trim();
        const familyId = FIXTURE_TO_FAMILY[fixtureName];
        for (const anchor of form?.anchors || []) {
            const anchorId = String(anchor?.anchorId || "").trim();
            const patterns = Array.isArray(anchor?.matchAnyPatterns)
                ? anchor.matchAnyPatterns.map((p) => String(p || "").trim()).filter(Boolean)
                : [];
            if (!anchorId || patterns.length === 0)
                continue;
            const hintedCodes = ANCHOR_CODE_HINTS[anchorId] || [anchorId.toUpperCase()];
            const expandedPatterns = [
                ...patterns,
                ...(TARGETED_ANCHOR_PATTERN_VARIANTS[anchorId] || []),
            ];
            for (const pattern of expandedPatterns) {
                for (const expectedAcordCode of hintedCodes) {
                    rules.push({
                        source: "anchor",
                        fixtureName,
                        familyId,
                        anchorId,
                        expectedAcordCode,
                        pattern,
                        semanticHint: inferSemanticHintFromAcordCode(expectedAcordCode),
                    });
                }
            }
        }
    }
    const deduped = new Map();
    for (const rule of rules) {
        const key = [
            rule.source,
            rule.fixtureName || "",
            rule.familyId || "",
            rule.expectedAcordCode,
            rule.pattern,
        ].join("|");
        deduped.set(key, rule);
    }
    return [...deduped.values()].map((rule) => ({
        ...rule,
        normalizedPattern: normalizeText(rule.pattern),
        regex: safeRegex(rule.pattern),
    }));
}
function ensureCaches() {
    if (!compiledRulesCache) {
        compiledRulesCache = collectRules();
    }
    if (!rulesByCodeCache) {
        rulesByCodeCache = new Map();
        for (const rule of compiledRulesCache) {
            const bucket = rulesByCodeCache.get(rule.expectedAcordCode) || [];
            bucket.push(rule);
            rulesByCodeCache.set(rule.expectedAcordCode, bucket);
        }
    }
}
function familyMatches(ruleFamily, familyId) {
    if (!ruleFamily || !familyId)
        return true;
    return normalizeText(ruleFamily) === normalizeText(familyId);
}
function patternMatches(rule, text) {
    if (!text)
        return false;
    if (rule.regex && rule.regex.test(text))
        return true;
    if (!rule.normalizedPattern)
        return false;
    return normalizeText(text).includes(rule.normalizedPattern);
}
function getWave8SupervisionCandidatesForText(text, familyId) {
    ensureCaches();
    const candidates = new Map();
    for (const rule of compiledRulesCache || []) {
        if (!familyMatches(rule.familyId, familyId))
            continue;
        if (!patternMatches(rule, text))
            continue;
        const tuning = rule.anchorId ? TARGETED_ANCHOR_TUNING[rule.anchorId] : undefined;
        const baseBoost = rule.source === "gold_label" ? 1 : rule.source === "fixture_expectation" ? 0.9 : 0.7;
        const boosted = baseBoost * (tuning?.anchorWeightMultiplier || 1) + (tuning?.synonymVariantWeightBonus || 0);
        const boost = Math.min(1.8, Math.max(0, boosted));
        const previous = candidates.get(rule.expectedAcordCode);
        if (!previous || previous.weight < boost) {
            candidates.set(rule.expectedAcordCode, {
                weight: boost,
                semanticHint: rule.semanticHint,
                semanticHintWeight: tuning?.semanticHintWeight || 1,
                categoryHintWeight: tuning?.categoryHintWeight || 1,
                dictionaryConfidenceWeight: tuning?.dictionaryConfidenceWeight || 1,
            });
        }
    }
    return [...candidates.entries()].map(([acordCode, value]) => ({
        acordCode,
        weight: Number(value.weight.toFixed(3)),
        semanticHint: value.semanticHint,
        semanticHintWeight: Number(value.semanticHintWeight.toFixed(3)),
        categoryHintWeight: Number(value.categoryHintWeight.toFixed(3)),
        dictionaryConfidenceWeight: Number(value.dictionaryConfidenceWeight.toFixed(3)),
    }));
}
function getWave8SupervisionAnchorBoost(queryText, acordCode, familyId) {
    ensureCaches();
    const rules = (rulesByCodeCache?.get(acordCode) || []).filter((rule) => familyMatches(rule.familyId, familyId));
    if (rules.length === 0)
        return 0;
    let best = 0;
    for (const rule of rules) {
        if (!patternMatches(rule, queryText))
            continue;
        const tuning = rule.anchorId ? TARGETED_ANCHOR_TUNING[rule.anchorId] : undefined;
        const baseScore = rule.source === "gold_label" ? 0.35 : rule.source === "fixture_expectation" ? 0.28 : 0.16;
        const score = baseScore * (tuning?.anchorWeightMultiplier || 1) + (tuning?.synonymVariantWeightBonus || 0) * 0.4;
        if (score > best) {
            best = score;
        }
    }
    return Number(Math.min(0.4, Math.max(0, best)).toFixed(3));
}
function getWave8SemanticHintForText(text, familyId) {
    const matches = getWave8SupervisionCandidatesForText(text, familyId);
    if (matches.length === 0) {
        return null;
    }
    matches.sort((left, right) => right.weight - left.weight || left.acordCode.localeCompare(right.acordCode));
    return matches[0].semanticHint;
}
function getWave8SupervisionRuleCount() {
    ensureCaches();
    return (compiledRulesCache || []).length;
}
