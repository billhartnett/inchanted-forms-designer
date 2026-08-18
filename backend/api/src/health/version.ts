import fs from "node:fs";
import path from "node:path";
import { configuredSemanticBaseline, getActiveSemanticRuntime } from "../services/semanticOntologyRuntime";

type SemanticTruthArtifact = {
  restorePoint?: string;
  status?: string;
  activation?: { state?: string };
  phaseId?: string;
  evidence?: { roleSafeRepresentationEquivalences?: unknown[] };
  roleSafeEquivalences?: unknown[];
  integrity?: { payloadSha256?: string };
};

type OntologyLineageArtifact = {
  activeOntology?: string;
  canonicalOntology?: string;
  stabilizationPhase?: string;
  activeSemanticPolicy?: string;
  integrity?: { payloadSha256?: string };
};

function readPackageVersion(): string {
  try {
    const packagePath = path.resolve(process.cwd(), "package.json");
    const parsed = JSON.parse(fs.readFileSync(packagePath, "utf8")) as { version?: string };
    return parsed.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function readGitCommitHash(): string {
  if (process.env.GIT_COMMIT_HASH) return process.env.GIT_COMMIT_HASH;

  try {
    const gitDir = path.resolve(process.cwd(), "..", "..", "..", ".git");
    const headPath = path.join(gitDir, "HEAD");
    const head = fs.readFileSync(headPath, "utf8").trim();
    if (!head.startsWith("ref:")) return head;

    const refPath = path.join(gitDir, head.replace(/^ref:\s*/, ""));
    return fs.readFileSync(refPath, "utf8").trim();
  } catch {
    return "unknown";
  }
}

function readArtifact<T>(fileName: string): T | null {
  try {
    const artifactPath = path.resolve(process.cwd(), "..", "..", "acord-artifacts", fileName);
    return JSON.parse(fs.readFileSync(artifactPath, "utf8")) as T;
  } catch {
    return null;
  }
}

export function buildVersionPayload() {
  const semanticBaseline = configuredSemanticBaseline();
  const semanticTruth = readArtifact<SemanticTruthArtifact>(
    semanticBaseline === "RP-9" ? "authoritative-semantic-truth-rp9.json" : "authoritative-semantic-truth-rp8.json",
  );
  const ontologyLineage = readArtifact<OntologyLineageArtifact>(
    semanticBaseline === "RP-9" ? "rp9-ontology-lineage.json" : "rp8-ontology-lineage.json",
  );
  const runtime = getActiveSemanticRuntime();

  return {
    gitCommitHash: readGitCommitHash(),
    buildTimestamp: process.env.BUILD_TIMESTAMP || new Date().toISOString(),
    wave9EngineVersion: process.env.WAVE9_ENGINE_VERSION || readPackageVersion(),
    productionBaseline: process.env.PRODUCTION_BASELINE || "unassigned",
    semanticBaseline,
    semanticRuntime: runtime.metadata,
    semanticTruth: semanticTruth ? {
      restorePoint: semanticTruth.restorePoint || null,
      status: semanticTruth.status || null,
      activation: semanticTruth.activation?.state || null,
      phaseId: semanticTruth.phaseId || null,
      payloadSha256: semanticTruth.integrity?.payloadSha256 || null,
      roleSafeRepresentationEquivalences:
        semanticTruth.evidence?.roleSafeRepresentationEquivalences?.length ||
        semanticTruth.roleSafeEquivalences?.length || 0,
    } : null,
    ontologyLineage: ontologyLineage ? {
      activeOntology: ontologyLineage.activeOntology || null,
      canonicalOntology: ontologyLineage.canonicalOntology || null,
      stabilizationPhase: ontologyLineage.stabilizationPhase || null,
      activeSemanticPolicy: ontologyLineage.activeSemanticPolicy || null,
      payloadSha256: ontologyLineage.integrity?.payloadSha256 || null,
    } : null,
  };
}
