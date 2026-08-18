import { apiUrl } from "./runtimeConfig";
import { rp8BuildManifest } from "../generated/rp8BuildManifest";
import { rp9BuildManifest } from "../generated/rp9BuildManifest";

export type RuntimeSemanticStatus = {
  state: "loading" | "verified" | "mismatch";
  baseline: "RP-8" | "RP-9";
  label: string;
  details: string;
};

const requestedBaseline = String(import.meta.env.VITE_SEMANTIC_BASELINE || "RP-8").toUpperCase() === "RP-9" ? "RP-9" : "RP-8";

async function fetchJson(path: string) {
  const response = await fetch(apiUrl(path), { headers: { Accept: "application/json", "Cache-Control": "no-cache" }, cache: "no-store" });
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  return response.json();
}

export async function verifyRuntimeSemanticBaseline(): Promise<RuntimeSemanticStatus> {
  const manifest = requestedBaseline === "RP-9" ? rp9BuildManifest : rp8BuildManifest;
  try {
    const requests = [fetchJson("/semantic-truth/current"), fetchJson("/ontology-lineage/current"), fetchJson("/api/wave9/contracts")];
    if (requestedBaseline === "RP-9") requests.push(fetchJson("/category-bundles/current"));
    const [truth, lineage, contractEnvelope, bundles] = await Promise.all(requests);
    const contract = contractEnvelope.data || contractEnvelope;
    const matches = requestedBaseline === "RP-9"
      ? truth.restorePoint === "RP-9" && truth.activation?.state === "staging-active" && truth.activation?.scope === "staging" &&
        truth.integrity?.payloadSha256 === rp9BuildManifest.semanticTruthPayloadSha256 &&
        lineage.integrity?.payloadSha256 === rp9BuildManifest.ontologyLineagePayloadSha256 &&
        bundles?.integrity?.payloadSha256 === rp9BuildManifest.categoryBundlesPayloadSha256 &&
        contract.contractVersion === rp9BuildManifest.mappingContractVersion
      : truth.restorePoint === "RP-8" && truth.status === "active-production-baseline" && truth.activation?.state === "active" &&
        truth.integrity?.payloadSha256 === rp8BuildManifest.semanticTruthPayloadSha256 &&
        lineage.integrity?.payloadSha256 === rp8BuildManifest.ontologyLineagePayloadSha256 &&
        contract.contractVersion === rp8BuildManifest.mappingContractVersion;
    const groups = manifest.categoryBundles.groups.length;
    const sections = manifest.categoryBundles.sections.length;
    return {
      state: matches ? "verified" : "mismatch",
      baseline: requestedBaseline,
      label: matches ? `${requestedBaseline} · ${contract.contractVersion}` : `${requestedBaseline} contract mismatch`,
      details: matches
        ? `Truth ${truth.integrity.payloadSha256}; lineage ${lineage.integrity.payloadSha256}; ${groups} group bundles and ${sections} section bundles.${requestedBaseline === "RP-9" ? " Staging-active; RP-8 remains production." : ""}`
        : `Build ${manifest.mappingContractVersion}; runtime ${contract.contractVersion || "unknown"}.`,
    };
  } catch (error) {
    return {
      state: "mismatch",
      baseline: requestedBaseline,
      label: `${requestedBaseline} verification failed`,
      details: error instanceof Error ? error.message : "Unknown semantic runtime verification error",
    };
  }
}

export function configuredDesignerSemanticBaseline() { return requestedBaseline; }
