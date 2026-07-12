export type DocumentIntelligenceConfig = {
  endpoint: string;
  key: string;
};

export function getDocumentIntelligenceConfig(): DocumentIntelligenceConfig | null {
  const endpoint = (process.env.DI_ENDPOINT ?? "").trim();
  const key = (process.env.DI_KEY ?? "").trim();

  if (!endpoint || !key) {
    return null;
  }

  return { endpoint, key };
}

export function getStorageConnectionString(): string | null {
  const connectionString = (process.env.AZURE_STORAGE_CONNECTION_STRING ?? "").trim();
  return connectionString || null;
}

export function getEmbeddingConfig() {
  return {
    endpoint: (process.env.OPENAI_ENDPOINT ?? "").trim(),
    apiKey: (process.env.OPENAI_API_KEY ?? "").trim(),
    model: (process.env.EMBEDDING_MODEL ?? "").trim(),
  };
}