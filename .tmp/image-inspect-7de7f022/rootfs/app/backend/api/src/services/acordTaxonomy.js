"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCategoryForAcordCode = getCategoryForAcordCode;
exports.getAcordCodesForCategory = getAcordCodesForCategory;
exports.isTaxonomyLoaded = isTaxonomyLoaded;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const AUGMENTED_JSON_PATH = node_path_1.default.resolve(__dirname, "../../../data/acord-elabels-with-categories.json");
let loaded = false;
const codeToCategory = new Map();
const categoryToCodes = new Map();
function loadOnce() {
    if (loaded)
        return;
    if (!node_fs_1.default.existsSync(AUGMENTED_JSON_PATH)) {
        loaded = true;
        return;
    }
    try {
        const raw = node_fs_1.default.readFileSync(AUGMENTED_JSON_PATH, "utf8");
        const payload = JSON.parse(raw);
        if (!Array.isArray(payload)) {
            loaded = true;
            return;
        }
        for (const item of payload) {
            const code = typeof item?.eLabelName === "string" ? item.eLabelName.trim() : "";
            const category = typeof item?.category === "string" ? item.category.trim() : "";
            if (!code)
                continue;
            const normalizedCategory = category || "Miscellaneous";
            codeToCategory.set(code, normalizedCategory);
            const current = categoryToCodes.get(normalizedCategory) || [];
            current.push(code);
            categoryToCodes.set(normalizedCategory, current);
        }
        for (const [key, value] of categoryToCodes.entries()) {
            const deduped = Array.from(new Set(value)).sort((a, b) => a.localeCompare(b));
            categoryToCodes.set(key, deduped);
        }
    }
    catch {
        // Fail-open: taxonomy is optional at runtime.
    }
    loaded = true;
}
function getCategoryForAcordCode(acordCode) {
    loadOnce();
    return codeToCategory.get(acordCode);
}
function getAcordCodesForCategory(category) {
    loadOnce();
    const codes = categoryToCodes.get(category) || [];
    return new Set(codes);
}
function isTaxonomyLoaded() {
    loadOnce();
    return codeToCategory.size > 0;
}
