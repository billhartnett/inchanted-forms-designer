const fs = require("node:fs");
const path = require("node:path");

const CONTRACT_VERSION = "wave8.v1";
const DEFAULT_EXPECTATIONS_PATH = path.resolve(__dirname, "..", "phase3-endpoint-sweep.json");
const DEFAULT_HEADERS = {
  "x-actor-role": "viewer",
  "x-tenant-id": "aca-deploy",
};

const WAVE8_UI_SUPPORT_ENDPOINTS = [
  { method: "GET", route: "/api/wave9/contracts", expectedStatus: 200 },
  { method: "POST", route: "/api/wave9/acord/extraction", expectedStatus: 400 },
  { method: "POST", route: "/api/wave9/acord/semantic-inference", expectedStatus: 400 },
  { method: "POST", route: "/api/wave9/inference", expectedStatus: 400 },
  { method: "POST", route: "/api/wave9/arbitration", expectedStatus: 400 },
  { method: "POST", route: "/api/wave9/normalization", expectedStatus: 400 },
  { method: "POST", route: "/api/wave9/scoring", expectedStatus: 400 },
  { method: "POST", route: "/api/wave9/preview", expectedStatus: 400 },
];

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

  const baseline = parsed.results.map((item) => ({
    method: String(item.method || "GET").toUpperCase(),
    route: String(item.route || ""),
    expectedStatus: Number(item.status),
  }));

  return [...baseline, ...WAVE8_UI_SUPPORT_ENDPOINTS];
}

function allowedStatuses(route, expectedStatus) {
  if (route === "/api/extractText") {
    return [400, 500];
  }
  if (route === "/api/wave9/acord/extraction") {
    return [400, 500];
  }
  if (route === "/api/wave9/preview") {
    return [200, 400];
  }
  return [expectedStatus];
}

function isObject(value) {
  return Boolean(value) && !Array.isArray(value) && typeof value === "object";
}

function validateContractEnvelope(jsonBody, status) {
  if (!isObject(jsonBody)) {
    return { valid: false, reason: "response is not a JSON object" };
  }

  if (typeof jsonBody.ok !== "boolean") {
    return { valid: false, reason: "missing boolean ok" };
  }

  if (typeof jsonBody.status !== "number") {
    return { valid: false, reason: "missing numeric status" };
  }

  if (!isObject(jsonBody.contract)) {
    return { valid: false, reason: "missing contract object" };
  }

  if (jsonBody.contract.version !== CONTRACT_VERSION) {
    return {
      valid: false,
      reason: `contract.version mismatch: expected ${CONTRACT_VERSION} got ${String(jsonBody.contract.version)}`,
    };
  }

  if (!isObject(jsonBody.meta) || jsonBody.meta.contractVersion !== CONTRACT_VERSION) {
    return { valid: false, reason: "meta.contractVersion mismatch" };
  }

  if (status >= 400) {
    if (typeof jsonBody.error !== "string" || !jsonBody.error.trim()) {
      return { valid: false, reason: "error response missing string error" };
    }
    if (!isObject(jsonBody.errorEnvelope)) {
      return { valid: false, reason: "error response missing errorEnvelope" };
    }
  }

  return { valid: true, reason: null };
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

    let jsonBody = null;
    let parseError = null;
    if (bodyText.trim()) {
      try {
        jsonBody = JSON.parse(bodyText);
      } catch (error) {
        parseError = error instanceof Error ? error.message : String(error);
      }
    }

    const envelope = parseError
      ? { valid: false, reason: `invalid JSON: ${parseError}` }
      : validateContractEnvelope(jsonBody, response.status);

    return {
      method,
      route: expectation.route,
      status: response.status,
      expectedStatus: expectation.expectedStatus,
      allowedStatuses: allowedStatuses(expectation.route, expectation.expectedStatus),
      ok: true,
      latencyMs,
      contractValid: envelope.valid,
      contractError: envelope.reason,
      bodyPreview: bodyText.slice(0, 220),
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
      contractValid: false,
      contractError: "transport failure",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  const baseUrl = normalizeBaseUrl(process.env.BASE_URL);
  const environment = process.env.WAVE8_ENV || "staging";
  const expectationsPath = process.env.WAVE8_EXPECTATIONS_PATH
    ? path.resolve(process.cwd(), process.env.WAVE8_EXPECTATIONS_PATH)
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

    if (!result.contractValid) {
      failures.push(`${result.method} ${result.route} contract invalid: ${result.contractError}`);
    }
  }

  const summary = {
    environment,
    checked: results.length,
    transportFailures: results.filter((r) => !r.ok).length,
    statusMismatches: results.filter((r) => r.ok && !r.allowedStatuses.includes(r.status)).length,
    contractViolations: results.filter((r) => r.ok && !r.contractValid).length,
    failed: failures.length,
  };

  const report = {
    timestamp: new Date().toISOString(),
    contractVersion: CONTRACT_VERSION,
    environment,
    baseUrl,
    expectationsPath,
    summary,
    failures,
    results,
  };

  const outPath = process.env.WAVE8_REPORT_PATH
    ? path.resolve(process.cwd(), process.env.WAVE8_REPORT_PATH)
    : path.resolve(process.cwd(), `backend_validation_report.${environment}.wave8.json`);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log(`Wave 8 contract stability sweep checked ${summary.checked} routes against ${baseUrl}`);
  console.log(
    `Transport failures: ${summary.transportFailures}; status mismatches: ${summary.statusMismatches}; contract violations: ${summary.contractViolations}`,
  );
  console.log(`Report written: ${outPath}`);

  if (failures.length > 0) {
    console.error("Wave 8 contract sweep detected failures:");
    for (const failure of failures.slice(0, 30)) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
