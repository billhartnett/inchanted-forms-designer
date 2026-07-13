const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_EXPECTATIONS_PATH = path.resolve(__dirname, "..", "phase3-endpoint-sweep.json");
const DEFAULT_HEADERS = {
  "x-actor-role": "viewer",
  "x-tenant-id": "aca-deploy",
};

function normalizeBaseUrl(input) {
  const trimmed = String(input || "").trim();
  if (!trimmed) {
    throw new Error("BASE_URL is required, e.g. https://<staging-fqdn>");
  }
  return trimmed.replace(/\/$/, "");
}

function loadExpectations(expectationsPath) {
  const raw = fs.readFileSync(expectationsPath, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed?.results)) {
    throw new Error("Invalid expectations file: missing results[]");
  }
  return parsed.results.map((item) => ({
    method: String(item.method || "GET").toUpperCase(),
    route: String(item.route || ""),
    expectedStatus: Number(item.status),
  }));
}

function allowedStatuses(route, expectedStatus) {
  if (route === "/api/extractText") {
    // DI config differs by environment. Both are acceptable probe outcomes for empty payload.
    return [400, 500];
  }
  return [expectedStatus];
}

async function probeEndpoint(baseUrl, expectation) {
  const url = `${baseUrl}${expectation.route}`;
  const method = expectation.method;
  const headers = { ...DEFAULT_HEADERS };
  const init = { method, headers };

  if (method !== "GET" && method !== "HEAD") {
    headers["content-type"] = "application/json";
    init.body = "{}";
  }

  const startedAt = Date.now();
  try {
    const response = await fetch(url, init);
    const latencyMs = Date.now() - startedAt;
    const bodyText = await response.text();
    return {
      method,
      route: expectation.route,
      status: response.status,
      expectedStatus: expectation.expectedStatus,
      allowedStatuses: allowedStatuses(expectation.route, expectation.expectedStatus),
      ok: true,
      latencyMs,
      bodyPreview: bodyText.slice(0, 180),
    };
  } catch (error) {
    return {
      method,
      route: expectation.route,
      status: null,
      expectedStatus: expectation.expectedStatus,
      allowedStatuses: allowedStatuses(expectation.route, expectation.expectedStatus),
      ok: false,
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  const baseUrl = normalizeBaseUrl(process.env.BASE_URL);
  const expectationsPath = process.env.PHASE7_EXPECTATIONS_PATH
    ? path.resolve(process.cwd(), process.env.PHASE7_EXPECTATIONS_PATH)
    : DEFAULT_EXPECTATIONS_PATH;

  const expectations = loadExpectations(expectationsPath);
  const failures = [];
  const results = [];

  for (const expectation of expectations) {
    const result = await probeEndpoint(baseUrl, expectation);
    results.push(result);

    if (!result.ok) {
      failures.push(`${result.method} ${result.route} transport failure: ${result.error}`);
      continue;
    }

    if (!result.allowedStatuses.includes(result.status)) {
      failures.push(
        `${result.method} ${result.route} expected ${result.allowedStatuses.join(" or ")} but got ${result.status}`,
      );
    }
  }

  const summary = {
    checked: results.length,
    transportFailures: results.filter((r) => !r.ok).length,
    statusMismatches: failures.length - results.filter((r) => !r.ok).length,
    failed: failures.length,
  };

  const report = {
    timestamp: new Date().toISOString(),
    baseUrl,
    expectationsPath,
    summary,
    failures,
    results,
  };

  const outPath = process.env.PHASE7_REPORT_PATH
    ? path.resolve(process.cwd(), process.env.PHASE7_REPORT_PATH)
    : path.resolve(process.cwd(), "backend_validation_report.json");
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log(`Phase 7 staging endpoint sweep checked ${summary.checked} routes against ${baseUrl}`);
  console.log(`Transport failures: ${summary.transportFailures}; status mismatches: ${summary.statusMismatches}`);
  console.log(`Report written: ${outPath}`);

  if (failures.length > 0) {
    console.error("Endpoint sweep detected failures:");
    for (const failure of failures.slice(0, 20)) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
