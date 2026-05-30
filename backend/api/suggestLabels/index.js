"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.suggestLabels = suggestLabels;
const functions_1 = require("@azure/functions");
const search_documents_1 = require("@azure/search-documents");
const openai_1 = __importDefault(require("openai"));
const searchEndpoint = process.env.SEARCH_ENDPOINT;
const searchKey = process.env.SEARCH_KEY;
const indexName = process.env.SEARCH_INDEX;
const openai = new openai_1.default({
    apiKey: process.env.OPENAI_API_KEY
});
async function suggestLabels(req, context) {
    try {
        const body = (await req.json());
        const text = body.text;
        const embeddingResponse = await openai.embeddings.create({
            model: "text-embedding-3-small",
            input: text
        });
        const embedding = embeddingResponse.data[0].embedding;
        const client = new search_documents_1.SearchClient(searchEndpoint, indexName, new search_documents_1.AzureKeyCredential(searchKey));
        const results = await client.search(text, {
            vectors: [
                {
                    value: embedding,
                    kNearestNeighborsCount: 5,
                    fields: ["embedding"]
                }
            ]
        });
        const labels = [];
        for await (const result of results.results) {
            if (result.document?.label) {
                labels.push(result.document.label);
            }
        }
        return { jsonBody: { labels } };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        context.error("suggestLabels error:", err);
        return { status: 500, jsonBody: { error: message } };
    }
}
functions_1.app.http("suggestLabels", {
    methods: ["POST"],
    authLevel: "anonymous",
    handler: suggestLabels
});
