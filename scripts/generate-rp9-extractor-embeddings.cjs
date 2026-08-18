const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "acord-artifacts", "rp9-extractor-embeddings.json");
const model = String(process.env.EMBEDDING_MODEL || "text-embedding-3-large").trim();
const deterministic = process.argv.includes("--deterministic");
const labels = ["AGENT NAME", "ADDRESS", "CITY", "STATE", "ZIP CODE", "PHONE", "FAX", "E-MAIL ADDRESS", "CODE", "SUB CODE", "AGENCY CUSTOMER ID", "AGENCY BILL"];
const sources = [
  ["cluster:ProducerInformation", "producer information agent name agency"],
  ["cluster:ProducerContact", "producer contact phone fax email address"],
  ["cluster:ProducerAddress", "producer address city state zip code"],
  ["cluster:ProducerCodes", "producer code sub code"],
  ["cluster:ProducerCustomerId", "producer agency customer identifier"],
  ["section:Section.ProducerInformation", "producer information producer agency agent name agency customer id agency bill"],
  ...labels.map((label) => [`label:${label}`, `producer ${label.toLowerCase()}`]),
];

const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const stable = (value) => {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
};
function featureVector(text) {
  const vector = Array(64).fill(0);
  for (const token of text.toLowerCase().match(/[a-z0-9]+/g) || []) {
    const digest = crypto.createHash("sha256").update(token).digest();
    vector[digest.readUInt16BE(0) % vector.length] += digest[2] % 2 ? -1 : 1;
  }
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => Number((value / magnitude).toFixed(6)));
}
async function liveVectors(inputs) {
  const key = String(process.env.OPENAI_API_KEY || "").trim();
  if (!key) throw new Error("OPENAI_API_KEY is required");
  const endpoint = String(process.env.OPENAI_ENDPOINT || "https://api.openai.com/v1").replace(/\/$/, "");
  const azure = !endpoint.startsWith("https://api.openai.com");
  const url = azure
    ? `${endpoint}/openai/deployments/${encodeURIComponent(model)}/embeddings?api-version=2024-02-15-preview`
    : `${endpoint}/embeddings`;
  const response = await fetch(url, {
    method: "POST",
    headers: azure ? { "Content-Type": "application/json", "api-key": key } : { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(azure ? { input: inputs } : { model, input: inputs }),
  });
  if (!response.ok) throw new Error(`Embedding generation failed (${response.status}): ${await response.text()}`);
  const payload = await response.json();
  return payload.data.sort((left, right) => left.index - right.index).map((item) => item.embedding.map((value) => Number(value.toFixed(6))));
}
async function main() {
  const inputs = sources.map(([, text]) => text);
  const vectors = deterministic ? inputs.map(featureVector) : await liveVectors(inputs);
  if (vectors.length !== sources.length || vectors.some((vector) => !vector.length)) throw new Error("Incomplete RP-9 embedding response");
  const payload = {
    schemaVersion: "rp9-extractor-embeddings.v1",
    restorePoint: "RP-9",
    activation: { state: "staging-active", scope: "staging", productionBaseline: "RP-8" },
    provider: deterministic ? "deterministic-feature-hash" : "openai",
    model: deterministic ? "feature-hash-64" : model,
    sourcePayloadSha256: hash(JSON.stringify(sources)),
    dimensions: vectors[0].length,
    entries: sources.map(([id, text], index) => ({ id, text, vector: vectors[index] })),
  };
  const artifact = { ...payload, integrity: { algorithm: "sha256", payloadSha256: hash(stable(payload)) } };
  fs.writeFileSync(output, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ output, provider: payload.provider, model: payload.model, dimensions: payload.dimensions, entryCount: payload.entries.length, payloadSha256: artifact.integrity.payloadSha256 }, null, 2));
}
main().catch((error) => { console.error(error.stack || error); process.exit(1); });
