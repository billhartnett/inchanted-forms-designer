const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "acord-artifacts", "rp9-extractor-embeddings.json");
const model = String(process.env.EMBEDDING_MODEL || "text-embedding-3-large").trim();
const deterministic = process.argv.includes("--deterministic");
const labels = [
  ["AGENT NAME", "cluster:ProducerInformation"], ["ADDRESS", "cluster:ProducerAddress"], ["CITY", "cluster:ProducerAddress"],
  ["STATE", "cluster:ProducerAddress"], ["ZIP CODE", "cluster:ProducerAddress"], ["PHONE", "cluster:ProducerContact"],
  ["FAX", "cluster:ProducerContact"], ["E-MAIL ADDRESS", "cluster:ProducerContact"], ["CODE", "cluster:ProducerCodes"],
  ["SUB CODE", "cluster:ProducerCodes"], ["AGENCY CUSTOMER ID", "cluster:ProducerCustomerId"], ["AGENCY BILL", "cluster:ProducerInformation"],
  ["PREMISES INFORMATION", "cluster:PremisesInformation"], ["PREMISES #", "cluster:PremisesInformation"], ["STREET ADDRESS", "cluster:PremisesAddress"],
  ["% OCCUPIED", "cluster:PremisesOccupancy"], ["INTENDED USE", "cluster:PremisesOccupancy"], ["CONSTRUCTION TYPE", "cluster:PremisesConstruction"],
  ["FIRE DISTRICT/CODE NUMBER", "cluster:PremisesFire"], ["HEATING BOILER ON PREMISES?", "cluster:PremisesFire"], ["BURGLARY", "cluster:PremisesBurglary"],
  ["CENTRAL STATION", "cluster:PremisesProtection"], ["NATURE OF BUSINESS - DESCRIPTION OF OPERATIONS", "cluster:GeneralOperations"],
  ["ANY CATASTROPHE EXPOSURE?", "cluster:GeneralExposure"], ["HAZARDOUS MATERIAL?", "cluster:GeneralHazards"],
  ["BUSINESS DETAILS", "cluster:GeneralBusinessDetails"], ["ACORD QUESTION", "cluster:Question"], ["YES", "cluster:YesNoAnswer"], ["NO", "cluster:YesNoAnswer"],
];
const labelContext = (cluster) => {
  const normalized = cluster.replace("cluster:", "").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  if (cluster === "cluster:Question") return "acord underwriting application question text";
  if (cluster === "cluster:YesNoAnswer") return "acord yes no boolean answer checkbox";
  return normalized;
};
const sources = [
  ["cluster:ProducerInformation", "producer information agent name agency"],
  ["cluster:ProducerContact", "producer contact phone fax email address"],
  ["cluster:ProducerAddress", "producer address city state zip code"],
  ["cluster:ProducerCodes", "producer code sub code"],
  ["cluster:ProducerCustomerId", "producer agency customer identifier"],
  ["section:Section.ProducerInformation", "producer information producer agency agent name agency customer id agency bill"],
  ["cluster:PremisesInformation", "premises information property location building"],
  ["cluster:PremisesAddress", "premises address street city state postal"],
  ["cluster:PremisesOccupancy", "premises occupancy occupied intended use"],
  ["cluster:PremisesConstruction", "premises building construction type valuation"],
  ["cluster:PremisesProtection", "premises protection security alarm central station"],
  ["cluster:PremisesFire", "premises fire boiler sprinkler hydrant fire district"],
  ["cluster:PremisesBurglary", "premises burglary theft watchman security"],
  ["cluster:GeneralInformation", "general information application business questions"],
  ["cluster:GeneralOperations", "general information business operations description"],
  ["cluster:GeneralExposure", "general information insurance exposure catastrophe risk"],
  ["cluster:GeneralHazards", "general information hazard hazardous material risk"],
  ["cluster:GeneralBusinessDetails", "general information business details nature"],
  ["cluster:Question", "acord underwriting application question text"],
  ["cluster:YesNoQuestion", "acord binary yes no question"],
  ["cluster:YesNoAnswer", "acord boolean answer yes no checkbox"],
  ["section:Section.PremisesInformation", "premises information property section location building"],
  ["section:Section.GeneralInformation", "general information underwriting questions operations exposures hazards"],
  ...labels.map(([label, cluster]) => [`label:${label}`, `${labelContext(cluster)} ${label.toLowerCase()}`]),
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
function cosine(left, right) {
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] * left[index];
    rightMagnitude += right[index] * right[index];
  }
  return dot / ((Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude)) || 1);
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
  const vectorById = new Map(sources.map(([id], index) => [id, vectors[index]]));
  const clusterIds = sources.map(([id]) => id).filter((id) => id.startsWith("cluster:"));
  const validationCases = labels.map(([label, expectedCluster]) => {
    const labelVector = vectorById.get(`label:${label}`);
    const ranked = clusterIds.map((clusterId) => ({ clusterId, similarity: cosine(labelVector, vectorById.get(clusterId)) })).sort((left, right) => right.similarity - left.similarity);
    const expectedSimilarity = ranked.find((item) => item.clusterId === expectedCluster)?.similarity ?? -1;
    return { label, expectedCluster, topCluster: ranked[0].clusterId, expectedSimilarity: Number(expectedSimilarity.toFixed(6)), passed: ranked[0].clusterId === expectedCluster || expectedSimilarity >= ranked[0].similarity - 0.08 };
  });
  if (validationCases.some((item) => !item.passed)) throw new Error(`RP-9 embedding similarity validation failed: ${JSON.stringify(validationCases.filter((item) => !item.passed))}`);
  const payload = {
    schemaVersion: "rp9-extractor-embeddings.v1",
    restorePoint: "RP-9",
    activation: { state: "staging-active", scope: "staging", productionBaseline: "RP-8" },
    provider: deterministic ? "deterministic-feature-hash" : "openai",
    model: deterministic ? "feature-hash-64" : model,
    sourcePayloadSha256: hash(JSON.stringify(sources)),
    dimensions: vectors[0].length,
    validation: { valid: true, caseCount: validationCases.length, cases: validationCases },
    entries: sources.map(([id, text], index) => ({ id, text, vector: vectors[index] })),
  };
  const artifact = { ...payload, integrity: { algorithm: "sha256", payloadSha256: hash(stable(payload)) } };
  fs.writeFileSync(output, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ output, provider: payload.provider, model: payload.model, dimensions: payload.dimensions, entryCount: payload.entries.length, validationCaseCount: validationCases.length, payloadSha256: artifact.integrity.payloadSha256 }, null, 2));
}
main().catch((error) => { console.error(error.stack || error); process.exit(1); });
