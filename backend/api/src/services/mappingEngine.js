"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapBlocksToAcord = mapBlocksToAcord;
const acordDictionary_1 = require("./acordDictionary");
const embeddings_1 = require("./embeddings");
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
    return hasAnyToken(normalized, ["name", "applicant", "insured"]);
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
    return /(name|address|city|state|zip|phone|email|date|policy|insured|applicant|dob|birth|effective|expiration)/.test(normalized);
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
    if (isLikelyTitleText(block.text) && !fieldCue)
        return true;
    if (isLikelyInstructionOrQuestion(block.text) && !fieldCue)
        return true;
    if (isLikelyHeaderOrLogoNoise(block.text) && !fieldCue)
        return true;
    if (isLikelyTabularSchemaText(block.text) && !fieldCue)
        return true;
    if (tokenCount >= 10 && !fieldCue) {
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
            const weighted = hit.score * 0.9 * intent.weight * multiplier;
            const entry = ensureAccumulator(accum, hit.entry.acordCode, {
                label: hit.entry.label,
                description: hit.entry.description,
                source: "heuristic",
            });
            entry.score += weighted;
            entry.heuristicScore += weighted;
            if (entry.source !== "dictionary") {
                entry.source = "heuristic";
            }
        }
    }
}
function applyDictionarySignals(block, accum) {
    const multiplier = getBlockScoreMultiplier(block);
    const primary = safeDictionarySearch(block.text, 6);
    for (const hit of primary) {
        const weighted = hit.score * multiplier;
        const entry = ensureAccumulator(accum, hit.entry.acordCode, {
            label: hit.entry.label,
            description: hit.entry.description,
            source: "dictionary",
        });
        entry.score += weighted;
        entry.dictionaryScore += weighted;
        if (entry.source !== "ai") {
            entry.source = "dictionary";
        }
    }
    const keywordTokens = tokenize(block.text).slice(0, 8);
    for (const token of keywordTokens) {
        const hits = safeDictionarySearch(token, 3);
        for (const hit of hits) {
            const weighted = hit.score * 0.35 * multiplier;
            const entry = ensureAccumulator(accum, hit.entry.acordCode, {
                label: hit.entry.label,
                description: hit.entry.description,
                source: "dictionary",
            });
            entry.score += weighted;
            entry.dictionaryScore += weighted;
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
    if (normalized.includes("phone"))
        heuristicQueries.push("phone number");
    if (normalized.includes("email"))
        heuristicQueries.push("email address");
    for (const query of heuristicQueries) {
        const hits = safeDictionarySearch(query, 2);
        for (const hit of hits) {
            const weighted = hit.score * 0.65 * multiplier;
            const entry = ensureAccumulator(accum, hit.entry.acordCode, {
                label: hit.entry.label,
                description: hit.entry.description,
                source: "heuristic",
            });
            entry.score += weighted;
            entry.heuristicScore += weighted;
            if (entry.source !== "dictionary") {
                entry.source = "heuristic";
            }
        }
    }
}
/**
 * Semantic signal via cosine similarity against precomputed ACORD embeddings.
 * No-ops gracefully when embeddings are unavailable or not yet cached.
 */
async function applySemanticSignals(block, accum) {
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
    const SIMILARITY_THRESHOLD = 0.45;
    const TOP_K = 8;
    const candidates = [];
    for (const [acordCode, embedding] of cache) {
        const sim = (0, embeddings_1.cosineSimilarity)(blockEmbedding, embedding);
        if (sim >= SIMILARITY_THRESHOLD) {
            candidates.push({ acordCode, sim });
        }
    }
    candidates.sort((a, b) => b.sim - a.sim);
    const top = candidates.slice(0, TOP_K);
    for (const { acordCode, sim } of top) {
        // Scale cosine similarity to the same magnitude as dictionary scores
        // (dictionary exact-code match = 200, label match = 160).
        const semanticScore = sim * 240 * multiplier;
        const found = (0, acordDictionary_1.lookupAcordByCode)(acordCode);
        if (!found)
            continue;
        const entry = ensureAccumulator(accum, acordCode, {
            label: found.label,
            description: found.description,
            source: "ai",
        });
        entry.score += semanticScore;
        entry.semanticSimilarity = Math.max(entry.semanticSimilarity, sim);
        // Promote source to AI only when semantic evidence is clearly strong.
        if (sim >= 0.78 && entry.source !== "dictionary") {
            entry.source = "ai";
        }
    }
}
function toSuggestions(accum, block, blockConfidence) {
    const getAddressComponentKind = (label, acordCode) => {
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
    };
    const scored = [...accum.values()]
        .map((item) => {
        const penalty = getLabelPenaltyFactor(block.text, item.label, item.acordCode);
        const precisionBoost = getTokenPrecisionBoost(block.text, item.label);
        return {
            ...item,
            score: item.score * penalty * precisionBoost,
        };
    })
        .sort((a, b) => b.score - a.score);
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
        const fallbackHits = safeDictionarySearch(queryByKind[kind], 5);
        const picked = fallbackHits.find((hit) => getLocationKind(hit.entry.label, hit.entry.acordCode) === kind) ?? fallbackHits[0];
        if (!picked)
            return null;
        const syntheticBase = scored[0]?.score || 100;
        const syntheticWeightByKind = {
            city: 1.35,
            state: 1.25,
            postal: 1.15,
        };
        const syntheticScore = syntheticBase * syntheticWeightByKind[kind];
        return {
            acordCode: picked.entry.acordCode,
            label: picked.entry.label,
            description: picked.entry.description,
            score: syntheticScore,
            dictionaryScore: syntheticScore,
            heuristicScore: 0,
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
        return [];
    }
    const top = all[0].score || 1;
    const second = all[1]?.score || 0;
    const topMargin = top > 0 ? (top - second) / top : 0;
    const marginGate = clamp01(topMargin / 0.2);
    const scoredSuggestions = all.slice(0, 5).map((item) => {
        const normalizedRelative = top > 0 ? item.score / top : 0;
        const semanticEvidence = clamp01(item.semanticSimilarity);
        const dictionaryEvidence = clamp01(item.dictionaryScore / 200);
        const heuristicEvidence = clamp01(item.heuristicScore / 160);
        const anchorEvidence = lexicalAnchorScore(block.text, item.label, item.acordCode);
        const blendedEvidence = clamp01(semanticEvidence * 0.5 +
            dictionaryEvidence * 0.3 +
            heuristicEvidence * 0.2);
        let confidenceScore = clamp01(blendedEvidence * 0.6 +
            normalizedRelative * 0.25 +
            clamp01(blockConfidence) * 0.15);
        // Confidence calibration: penalize ambiguous tops and weak lexical anchors.
        confidenceScore *= 0.6 + marginGate * 0.4;
        if (item.source === "heuristic" &&
            semanticEvidence < 0.72 &&
            dictionaryEvidence < 0.45) {
            confidenceScore = Math.min(confidenceScore, 0.62);
        }
        if (anchorEvidence < 0.2 && semanticEvidence < 0.72) {
            confidenceScore = Math.min(confidenceScore, 0.58);
        }
        if (anchorEvidence < 0.1 && semanticEvidence < 0.55) {
            confidenceScore = Math.min(confidenceScore, 0.48);
        }
        // For short name/address prompts, require stronger lexical anchoring.
        const isSensitivePrompt = isNamePrompt(block.text) || isAddressPrompt(block.text);
        if (isSensitivePrompt && anchorEvidence < 0.34 && semanticEvidence < 0.74) {
            confidenceScore = Math.min(confidenceScore, 0.5);
        }
        if (isSensitivePrompt && anchorEvidence >= 0.65 && normalizedRelative > 0.9) {
            confidenceScore = clamp01(confidenceScore * 1.06);
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
        confidenceScore = clamp01(confidenceScore);
        return {
            acordCode: item.acordCode,
            label: item.label,
            description: item.description,
            confidenceScore: Number(confidenceScore.toFixed(3)),
            source: item.source,
            _anchorEvidence: anchorEvidence,
            _semanticEvidence: semanticEvidence,
        };
    });
    const topSuggestion = scoredSuggestions[0];
    if (!topSuggestion) {
        return [];
    }
    const isCompoundLocationPrompt = isCityStateZipPrompt(block.text);
    const isSensitivePrompt = isNamePrompt(block.text) || isAddressPrompt(block.text);
    const topLabelText = normalizeText(`${topSuggestion.label} ${topSuggestion.acordCode}`);
    const hasAddressLabelEvidence = isAddressPrompt(block.text) &&
        hasAnyToken(topLabelText, ["address", "mailing", "street", "line one", "line two"]);
    const hasStrongSensitiveEvidence = isSensitivePrompt &&
        (topSuggestion._anchorEvidence >= 0.2 ||
            topSuggestion._semanticEvidence >= 0.72 ||
            hasAddressLabelEvidence);
    // Abstain policy: prefer no suggestion over over-confident bad guesses.
    if (!isCompoundLocationPrompt &&
        !hasStrongSensitiveEvidence &&
        topSuggestion.confidenceScore < 0.45) {
        return [];
    }
    if (!isCompoundLocationPrompt &&
        !hasStrongSensitiveEvidence &&
        topMargin < 0.08 &&
        topSuggestion.confidenceScore < 0.72) {
        return [];
    }
    if (!isCompoundLocationPrompt &&
        !hasStrongSensitiveEvidence &&
        topSuggestion._anchorEvidence < 0.12 &&
        topSuggestion._semanticEvidence < 0.65) {
        return [];
    }
    return scoredSuggestions.map(({ _anchorEvidence: _ignoredAnchor, _semanticEvidence: _ignoredSem, ...rest }) => rest);
}
async function mapBlocksToAcord(blocks, options) {
    // Kick off embedding precompute if not already started.  We do NOT await it
    // here — early requests use dictionary + heuristic scoring, and once the
    // cache warms up subsequent requests gain semantic scoring too.
    (0, acordDictionary_1.ensureEmbeddings)().catch(() => { });
    return Promise.all(blocks.map(async (block) => {
        if (isLikelyNonMappableText(block)) {
            return {
                blockId: block.id,
                page: block.page,
                text: block.text,
                boundingBox: block.boundingBox,
                suggestions: [],
                chosen: undefined,
            };
        }
        const accum = new Map();
        applyIntentSignals(block, accum);
        applyDictionarySignals(block, accum);
        applyHeuristicSignals(block, accum);
        await applySemanticSignals(block, accum);
        const suggestions = toSuggestions(accum, block, block.confidence);
        return {
            blockId: block.id,
            page: block.page,
            text: block.text,
            boundingBox: block.boundingBox,
            suggestions,
            chosen: suggestions[0],
        };
    }));
}
