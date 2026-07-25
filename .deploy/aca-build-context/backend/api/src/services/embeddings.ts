/**
 * Embeddings provider for ACORD semantic mapping.
 *
 * Supports standard OpenAI and Azure OpenAI.  When no API key is configured
 * every function returns empty arrays so callers can degrade gracefully to
 * dictionary + heuristic scoring.
 *
 * Environment variables (via local.settings.json / app settings):
 *   OPENAI_API_KEY      – Required.  Key for OpenAI or Azure OpenAI.
 *   OPENAI_ENDPOINT     – Optional.  Defaults to https://api.openai.com/v1.
 *                         Set to an Azure endpoint to use Azure OpenAI.
 *   OPENAI_API_VERSION  – Optional.  Required for Azure (e.g. 2024-02-15-preview).
 *   EMBEDDING_MODEL     – Optional.  Defaults to text-embedding-3-small.
 */

import OpenAI, { AzureOpenAI } from "openai";

const DEFAULT_OAI_BASE = "https://api.openai.com/v1";
const DEFAULT_MODEL = "text-embedding-3-small";
const MAX_INPUT_CHARS = 32_000; // ~8 191 tokens, conservative cap
const EMBEDDING_PRECISION = 6;

// Lazy singleton — initialised once on first use.
let _client: OpenAI | AzureOpenAI | null | undefined = undefined;
const _textEmbeddingCache = new Map<string, number[]>();

function quantize(value: number, digits = EMBEDDING_PRECISION): number {
  return Number(value.toFixed(digits));
}

function normalizeInputText(value: string): string {
  return value.trim().slice(0, MAX_INPUT_CHARS);
}

function quantizeVector(vector: number[] | undefined): number[] {
  if (!Array.isArray(vector) || vector.length === 0) {
    return [];
  }

  return vector.map((value) => quantize(value));
}

function getTextCacheKey(model: string, text: string): string {
  return `${model}::${text}`;
}

function buildClient(): OpenAI | AzureOpenAI | null {
  const apiKey = (process.env.OPENAI_API_KEY ?? "").trim();
  if (!apiKey) {
    return null; // embeddings unavailable — callers will use fallback
  }

  const endpoint = (process.env.OPENAI_ENDPOINT ?? DEFAULT_OAI_BASE).trim();
  const apiVersion = (
    process.env.OPENAI_API_VERSION ?? "2024-02-15-preview"
  ).trim();

  const isAzure =
    endpoint.length > 0 && !endpoint.startsWith("https://api.openai.com");

  if (isAzure) {
    return new AzureOpenAI({
      apiKey,
      endpoint,
      apiVersion,
      dangerouslyAllowBrowser: false,
    });
  }

  return new OpenAI({
    apiKey,
    baseURL: endpoint || DEFAULT_OAI_BASE,
  });
}

function getClient(): OpenAI | AzureOpenAI | null {
  if (_client !== undefined) return _client;
  _client = buildClient();
  return _client;
}

/** True when an API key is present and a client can be created. */
export function isEmbeddingsAvailable(): boolean {
  return getClient() !== null;
}

/**
 * Embed a single text string.
 * Returns [] when embeddings are not configured or the call fails.
 */
export async function embedText(text: string): Promise<number[]> {
  const client = getClient();
  if (!client) return [];

  const model = (process.env.EMBEDDING_MODEL ?? "").trim() || DEFAULT_MODEL;
  const normalized = normalizeInputText(text);
  const cacheKey = getTextCacheKey(model, normalized);
  const cached = _textEmbeddingCache.get(cacheKey);
  if (cached) {
    return [...cached];
  }

  try {
    const response = await client.embeddings.create({
      model,
      input: normalized,
    });

    const embedding = quantizeVector(response.data[0]?.embedding);
    _textEmbeddingCache.set(cacheKey, embedding);
    return [...embedding];
  } catch (err) {
    console.warn("[embeddings] embedText failed:", err);
    return [];
  }
}

/**
 * Embed a batch of texts in a single API call.
 * Returns a parallel array of embedding vectors (or empty arrays on failure).
 * Callers should split very large arrays into chunks before calling this.
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const client = getClient();
  if (!client) return texts.map(() => []);

  const model = (process.env.EMBEDDING_MODEL ?? "").trim() || DEFAULT_MODEL;

  const safe = texts.map((t) => normalizeInputText(t));
  const output: number[][] = texts.map(() => []);
  const missingIndexes: number[] = [];

  for (let index = 0; index < safe.length; index += 1) {
    const key = getTextCacheKey(model, safe[index]);
    const cached = _textEmbeddingCache.get(key);
    if (cached) {
      output[index] = [...cached];
    } else {
      missingIndexes.push(index);
    }
  }

  if (missingIndexes.length === 0) {
    return output;
  }

  const missingInputs = missingIndexes.map((index) => safe[index]);

  try {
    const response = await client.embeddings.create({
      model,
      input: missingInputs,
    });

    // API guarantees ordering by index; sort defensively.
    const sorted = [...response.data].sort((a, b) => a.index - b.index);
    for (let index = 0; index < missingIndexes.length; index += 1) {
      const source = sorted[index]?.embedding;
      const quantized = quantizeVector(source);
      const targetIndex = missingIndexes[index];
      output[targetIndex] = quantized;
      _textEmbeddingCache.set(getTextCacheKey(model, safe[targetIndex]), quantized);
    }

    return output;
  } catch (err) {
    console.warn("[embeddings] embedBatch failed:", err);
    return texts.map(() => []);
  }
}

/**
 * Compute cosine similarity between two embedding vectors.
 * Returns a value in [0, 1].  Returns 0 for zero/mismatched vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length !== a.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;

  return Math.max(0, Math.min(1, dot / denom));
}
