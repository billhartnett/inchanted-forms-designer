"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.acordDictionary = void 0;
exports.getAcordDictionaryEntries = getAcordDictionaryEntries;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const acordMappings_1 = require("./acordMappings");
function loadAcordSeed() {
    const jsonPath = node_path_1.default.resolve(__dirname, "../../../acord.json");
    if (!node_fs_1.default.existsSync(jsonPath)) {
        return [];
    }
    const raw = JSON.parse(node_fs_1.default.readFileSync(jsonPath, "utf8"));
    if (Array.isArray(raw)) {
        return raw;
    }
    if (raw &&
        typeof raw === "object" &&
        Array.isArray(raw.entries)) {
        return raw.entries;
    }
    return [];
}
const seedEntries = loadAcordSeed();
exports.acordDictionary = seedEntries
    .filter((entry) => {
    return Boolean(entry && typeof entry === "object" && "acordCode" in entry);
})
    .map((entry) => (0, acordMappings_1.normalizeAcordEntry)(entry));
function getAcordDictionaryEntries() {
    return exports.acordDictionary;
}
