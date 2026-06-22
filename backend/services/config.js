"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDocumentIntelligenceConfig = getDocumentIntelligenceConfig;
exports.getStorageConnectionString = getStorageConnectionString;
exports.getEmbeddingConfig = getEmbeddingConfig;
function getDocumentIntelligenceConfig() {
    const endpoint = (process.env.DI_ENDPOINT ?? "").trim();
    const key = (process.env.DI_KEY ?? "").trim();
    if (!endpoint || !key) {
        return null;
    }
    return { endpoint, key };
}
function getStorageConnectionString() {
    const connectionString = (process.env.AZURE_STORAGE_CONNECTION_STRING ?? "").trim();
    return connectionString || null;
}
function getEmbeddingConfig() {
    return {
        endpoint: (process.env.OPENAI_ENDPOINT ?? "").trim(),
        apiKey: (process.env.OPENAI_API_KEY ?? "").trim(),
        model: (process.env.EMBEDDING_MODEL ?? "").trim(),
    };
}
