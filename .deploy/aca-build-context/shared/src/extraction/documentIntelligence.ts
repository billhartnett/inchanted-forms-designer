import { AzureKeyCredential, DocumentAnalysisClient } from "@azure/ai-form-recognizer";
import { getDocumentIntelligenceConfig } from "../services";

export function createDocumentAnalysisClient() {
  const config = getDocumentIntelligenceConfig();
  if (!config) {
    return null;
  }

  return new DocumentAnalysisClient(
    config.endpoint,
    new AzureKeyCredential(config.key),
  );
}