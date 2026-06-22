"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractText = extractText;
const functions_1 = require("@azure/functions");
const ai_form_recognizer_1 = require("@azure/ai-form-recognizer");
const extraction_1 = require("../../extraction");
function createClient() {
    const endpoint = process.env.DI_ENDPOINT;
    const key = process.env.DI_KEY;
    if (!endpoint || !key) {
        throw new Error("Document Intelligence is not configured. Set DI_ENDPOINT and DI_KEY in local.settings.json.");
    }
    return new ai_form_recognizer_1.DocumentAnalysisClient(endpoint, new ai_form_recognizer_1.AzureKeyCredential(key));
}
async function extractText(req, context) {
    try {
        const client = (0, extraction_1.createDocumentAnalysisClient)() || createClient();
        const form = await req.formData();
        const file = form.get("file");
        if (!file) {
            return { status: 400, jsonBody: { error: "No file uploaded" } };
        }
        const buffer = Buffer.from(await file.arrayBuffer());
        // Use the prebuilt layout model for text + bounding boxes
        const poller = await client.beginAnalyzeDocument("prebuilt-layout", buffer);
        const result = await poller.pollUntilDone();
        const pages = (0, extraction_1.normalizeExtractedPages)(result.pages ?? []);
        return {
            status: 200,
            jsonBody: {
                pages,
                raw: result, // optional: useful for debugging
            },
        };
    }
    catch (err) {
        context.error("extractText error:", err);
        return { status: 500, jsonBody: { error: err.message } };
    }
}
functions_1.app.http("extractText", {
    methods: ["POST"],
    authLevel: "anonymous",
    handler: extractText,
});
