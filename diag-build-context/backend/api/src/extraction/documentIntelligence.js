"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDocumentAnalysisClient = createDocumentAnalysisClient;
const ai_form_recognizer_1 = require("@azure/ai-form-recognizer");
const config_1 = require("../services/config");
function createDocumentAnalysisClient() {
    const config = (0, config_1.getDocumentIntelligenceConfig)();
    if (!config) {
        return null;
    }
    return new ai_form_recognizer_1.DocumentAnalysisClient(config.endpoint, new ai_form_recognizer_1.AzureKeyCredential(config.key));
}
