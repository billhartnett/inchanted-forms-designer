"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeAcordDictionary = initializeAcordDictionary;
exports.getAcordDictionaryState = getAcordDictionaryState;
exports.getAllAcordEntries = getAllAcordEntries;
exports.lookupAcordByCode = lookupAcordByCode;
exports.searchAcordDictionary = searchAcordDictionary;
exports.ensureEmbeddings = ensureEmbeddings;
exports.areEmbeddingsReady = areEmbeddingsReady;
exports.getEmbeddingCache = getEmbeddingCache;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const embeddings_1 = require("./embeddings");
const CSV_PATH = node_path_1.default.resolve(__dirname, "../../../data/acord-elabels.csv");
const FALLBACK_CSV_PATH = node_path_1.default.resolve(__dirname, "../../../data/ACORD elabels.csv");
let entries = [];
let index = [];
let codeIndex = new Map();
// ---------------------------------------------------------------------------
// Embedding cache – keyed by acordCode, populated asynchronously after load.
// ---------------------------------------------------------------------------
const embeddingCache = new Map();
let _embeddingLoadPromise = null;
let _embeddingsReady = false;
const state = {
    loaded: false,
    csvPath: CSV_PATH,
    rowCount: 0,
    malformedRows: 0,
    loadedAt: null,
};
function normalizeText(value) {
    return value
        .trim()
        .toLowerCase()
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201c\u201d]/g, '"')
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}
function safeTrim(value) {
    return typeof value === "string" ? value.trim() : "";
}
function splitKeywords(raw) {
    if (!raw) {
        return [];
    }
    return raw
        .split(";")
        .map((part) => safeTrim(part))
        .filter(Boolean);
}
function deriveLabel(acordCode) {
    return acordCode
        .replace(/_/g, " ")
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/\s+/g, " ")
        .trim();
}
function deriveDataType(acordCode) {
    const normalized = normalizeText(acordCode);
    if (normalized.includes("date") || normalized.includes("time")) {
        return "datetime";
    }
    if (normalized.includes("amount") || normalized.includes("rate")) {
        return "number";
    }
    if (normalized.includes("number") ||
        normalized.includes("identifier") ||
        normalized.endsWith("code")) {
        return "string";
    }
    if (normalized.endsWith("indicator") || normalized.startsWith("is ")) {
        return "boolean";
    }
    return "string";
}
function parseCsvLine(line) {
    const values = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
        const char = line[i];
        if (char === '"') {
            const next = line[i + 1];
            if (inQuotes && next === '"') {
                current += '"';
                i += 1;
            }
            else {
                inQuotes = !inQuotes;
            }
            continue;
        }
        if (char === "," && !inQuotes) {
            values.push(current);
            current = "";
            continue;
        }
        current += char;
    }
    values.push(current);
    return values.map((value) => value.trim());
}
function parseCsv(csv) {
    const rows = [];
    let row = "";
    let inQuotes = false;
    for (let i = 0; i < csv.length; i += 1) {
        const char = csv[i];
        if (char === '"') {
            const next = csv[i + 1];
            if (inQuotes && next === '"') {
                row += '"';
                i += 1;
            }
            else {
                inQuotes = !inQuotes;
                row += char;
            }
            continue;
        }
        if ((char === "\n" || char === "\r") && !inQuotes) {
            if (char === "\r" && csv[i + 1] === "\n") {
                i += 1;
            }
            if (row.trim()) {
                rows.push(parseCsvLine(row));
            }
            row = "";
            continue;
        }
        row += char;
    }
    if (row.trim()) {
        rows.push(parseCsvLine(row));
    }
    return rows;
}
function createEntry(columns) {
    const acordCode = safeTrim(columns[0]);
    const relatedGlossary = safeTrim(columns[1]);
    if (!acordCode) {
        return null;
    }
    const label = deriveLabel(acordCode);
    const description = relatedGlossary || label;
    const keywords = Array.from(new Set([
        ...splitKeywords(relatedGlossary),
        ...label
            .split(" ")
            .map((token) => token.trim())
            .filter((token) => token.length > 2),
    ]));
    return {
        acordCode,
        label,
        description,
        dataType: deriveDataType(acordCode),
        lob: "all",
        version: "current",
        keywords,
    };
}
function getScore(entry, queryText, queryTokens) {
    if (!queryText) {
        return 0;
    }
    let score = 0;
    if (entry.normalizedCode === queryText) {
        score += 200;
    }
    else if (entry.normalizedCode.startsWith(queryText)) {
        score += 140;
    }
    else if (entry.normalizedCode.includes(queryText)) {
        score += 100;
    }
    if (entry.normalizedLabel === queryText) {
        score += 160;
    }
    else if (entry.normalizedLabel.startsWith(queryText)) {
        score += 90;
    }
    else if (entry.normalizedLabel.includes(queryText)) {
        score += 70;
    }
    if (entry.normalizedDescription.includes(queryText)) {
        score += 50;
    }
    for (const token of queryTokens) {
        if (entry.normalizedCode.includes(token)) {
            score += 25;
        }
        if (entry.normalizedLabel.includes(token)) {
            score += 18;
        }
        if (entry.normalizedDescription.includes(token)) {
            score += 10;
        }
        if (entry.normalizedKeywords.some((keyword) => keyword.includes(token))) {
            score += 14;
        }
    }
    return score;
}
function loadCsvFromDisk() {
    const configuredPath = process.env.ACORD_DICTIONARY_CSV_PATH;
    if (configuredPath && node_fs_1.default.existsSync(configuredPath)) {
        state.csvPath = configuredPath;
        return node_fs_1.default.readFileSync(configuredPath, "utf8");
    }
    if (node_fs_1.default.existsSync(CSV_PATH)) {
        state.csvPath = CSV_PATH;
        return node_fs_1.default.readFileSync(CSV_PATH, "utf8");
    }
    if (node_fs_1.default.existsSync(FALLBACK_CSV_PATH)) {
        state.csvPath = FALLBACK_CSV_PATH;
        return node_fs_1.default.readFileSync(FALLBACK_CSV_PATH, "utf8");
    }
    throw new Error(`ACORD CSV not found. Tried: ${CSV_PATH} and ${FALLBACK_CSV_PATH}`);
}
function initializeAcordDictionary() {
    if (state.loaded) {
        return { ...state };
    }
    const csv = loadCsvFromDisk();
    const rows = parseCsv(csv);
    if (rows.length === 0) {
        throw new Error(`ACORD CSV is empty at ${state.csvPath}`);
    }
    const bodyRows = rows.slice(1);
    const parsedEntries = [];
    let malformed = 0;
    for (const row of bodyRows) {
        try {
            const entry = createEntry(row);
            if (!entry) {
                malformed += 1;
                continue;
            }
            parsedEntries.push(entry);
        }
        catch {
            malformed += 1;
        }
    }
    const byCode = new Map();
    const indexed = parsedEntries.map((entry) => {
        const normalizedCode = normalizeText(entry.acordCode);
        byCode.set(normalizedCode, entry);
        return {
            entry,
            normalizedCode,
            normalizedLabel: normalizeText(entry.label),
            normalizedDescription: normalizeText(entry.description),
            normalizedKeywords: entry.keywords.map((keyword) => normalizeText(keyword)),
        };
    });
    entries = parsedEntries;
    codeIndex = byCode;
    index = indexed;
    state.loaded = true;
    state.rowCount = parsedEntries.length;
    state.malformedRows = malformed;
    state.loadedAt = new Date().toISOString();
    return { ...state };
}
function getAcordDictionaryState() {
    return { ...state };
}
function getAllAcordEntries() {
    initializeAcordDictionary();
    return entries;
}
function lookupAcordByCode(acordCode) {
    initializeAcordDictionary();
    const key = normalizeText(acordCode);
    return codeIndex.get(key) || null;
}
function searchAcordDictionary(query, limit = 20) {
    initializeAcordDictionary();
    const queryText = normalizeText(query);
    if (!queryText) {
        return [];
    }
    const queryTokens = queryText
        .split(" ")
        .map((token) => token.trim())
        .filter((token) => token.length > 1);
    return index
        .map((entry) => ({
        entry: entry.entry,
        score: getScore(entry, queryText, queryTokens),
    }))
        .filter((result) => result.score > 0)
        .sort((a, b) => b.score - a.score ||
        a.entry.acordCode.localeCompare(b.entry.acordCode) ||
        a.entry.label.localeCompare(b.entry.label))
        .slice(0, Math.max(1, Math.min(limit, 100)));
}
// ---------------------------------------------------------------------------
// Embedding precompute – batched, non-blocking background job.
// ---------------------------------------------------------------------------
const EMBED_BATCH_SIZE = 100;
const EMBED_BATCH_DELAY_MS = 250;
async function precomputeEmbeddings() {
    if (!(0, embeddings_1.isEmbeddingsAvailable)()) {
        _embeddingsReady = true;
        return;
    }
    const snapshot = entries.slice(); // capture current list
    let completed = 0;
    for (let i = 0; i < snapshot.length; i += EMBED_BATCH_SIZE) {
        const batch = snapshot.slice(i, i + EMBED_BATCH_SIZE);
        const texts = batch.map((e) => `${e.label}: ${e.description}`);
        try {
            const embeddings = await (0, embeddings_1.embedBatch)(texts);
            for (let j = 0; j < batch.length; j += 1) {
                if (embeddings[j] && embeddings[j].length > 0) {
                    embeddingCache.set(batch[j].acordCode, embeddings[j]);
                }
            }
            completed += batch.length;
        }
        catch (err) {
            console.warn(`[acordDictionary] Embedding batch ${i}–${i + batch.length - 1} failed:`, err);
        }
        if (i + EMBED_BATCH_SIZE < snapshot.length) {
            await new Promise((resolve) => setTimeout(resolve, EMBED_BATCH_DELAY_MS));
        }
    }
    _embeddingsReady = true;
    console.info(`[acordDictionary] Embeddings precomputed for ${embeddingCache.size} / ${snapshot.length} entries`);
}
/**
 * Kick off embedding precompute if not already started.
 * Returns a promise that resolves when precompute is complete.
 * Safe to call multiple times — always returns the same promise.
 */
function ensureEmbeddings() {
    if (_embeddingLoadPromise)
        return _embeddingLoadPromise;
    _embeddingLoadPromise = precomputeEmbeddings();
    return _embeddingLoadPromise;
}
/** True once embedding precompute has finished (or embeddings are unavailable). */
function areEmbeddingsReady() {
    return _embeddingsReady;
}
/** The live embedding cache.  Keys are acordCode strings. */
function getEmbeddingCache() {
    return embeddingCache;
}
// Load dictionary once during cold start.
initializeAcordDictionary();
