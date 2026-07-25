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

export async function embedText(): Promise<number[]> {
  return [];
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  return texts.map(() => []);
}

export function isEmbeddingsAvailable(): boolean {
  return false;
}