import fs from "node:fs";
import path from "node:path";

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

export function buildVersionPayload() {
  return {
    gitCommitHash: readGitCommitHash(),
    buildTimestamp: process.env.BUILD_TIMESTAMP || new Date().toISOString(),
    wave9EngineVersion: process.env.WAVE9_ENGINE_VERSION || readPackageVersion(),
  };
}
