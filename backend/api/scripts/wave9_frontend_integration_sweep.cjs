const fs = require("node:fs");
const path = require("node:path");

const CONTRACT_VERSION = "wave8.v1";
const DEFAULT_HEADERS = {
  "x-actor-role": "viewer",
  "x-tenant-id": "wave9-integration",
};

const ENDPOINTS = [
  { method: "GET", route: "/api/wave9/contracts", expectedStatuses: [200] },
  { method: "POST", route: "/api/wave9/acord/extraction", expectedStatuses: [400, 500] },
  { method: "POST", route: "/api/wave9/acord/semantic-inference", expectedStatuses: [400] },
  { method: "POST", route: "/api/wave9/semantic-summary", expectedStatuses: [400] },
  { method: "POST", route: "/api/wave9/acord/validate", expectedStatuses: [200, 400] },
  { method: "POST", route: "/api/wave9/inference", expectedStatuses: [400] },
  { method: "POST", route: "/api/wave9/arbitration", expectedStatuses: [400] },
  { method: "POST", route: "/api/wave9/arbitration/trace", expectedStatuses: [400] },
  { method: "POST", route: "/api/wave9/normalization", expectedStatuses: [400] },
  { method: "POST", route: "/api/wave9/scoring", expectedStatuses: [400] },
  { method: "POST", route: "/api/wave9/preview", expectedStatuses: [200, 400] },
  { method: "POST", route: "/api/wave9/mapping/flow", expectedStatuses: [200, 400] },
];

function normalizeBaseUrl(input) {
  const trimmed = String(input || "").trim();
  if (!trimmed) {
    throw new Error("BASE_URL is required, e.g. http://127.0.0.1:8080");
  }
  return trimmed.replace(/\/$/, "");
}

function isObject(value) {
  return Boolean(value) && !Array.isArray(value) && typeof value === "object";
}

function validateEnvelope(jsonBody, status) {
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

async function probe(baseUrl, endpoint) {
  const url = `${baseUrl}${endpoint.route}`;
  const headers = { ...DEFAULT_HEADERS };
  const request = { method: endpoint.method, headers };

  if (endpoint.method !== "GET" && endpoint.method !== "HEAD") {
    headers["content-type"] = "application/json";
    request.body = "{}";
  }

  const startedAt = Date.now();
  try {
    const response = await fetch(url, request);
    const elapsedMs = Date.now() - startedAt;
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
      : validateEnvelope(jsonBody, response.status);

    return {
      ...endpoint,
      status: response.status,
      ok: true,
      latencyMs: elapsedMs,
      statusValid: endpoint.expectedStatuses.includes(response.status),
      contractValid: envelope.valid,
      contractError: envelope.reason,
      bodyPreview: bodyText.slice(0, 220),
    };
  } catch (error) {
    return {
      ...endpoint,
      status: null,
      ok: false,
      latencyMs: Date.now() - startedAt,
      statusValid: false,
      contractValid: false,
      contractError: "transport failure",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  const baseUrl = normalizeBaseUrl(process.env.BASE_URL);
  const reportPath = process.env.WAVE9_REPORT_PATH
    ? path.resolve(process.cwd(), process.env.WAVE9_REPORT_PATH)
    : path.resolve(process.cwd(), "designer_wave9_frontend_integration_report.json");

  const results = [];
  const failures = [];

  for (const endpoint of ENDPOINTS) {
    const result = await probe(baseUrl, endpoint);
    results.push(result);

    if (!result.ok) {
      failures.push(`${result.method} ${result.route} transport failure: ${result.error}`);
      continue;
    }
    if (!result.statusValid) {
      failures.push(
        `${result.method} ${result.route} expected ${result.expectedStatuses.join(" or ")} but got ${result.status}`,
      );
    }
    if (!result.contractValid) {
      failures.push(`${result.method} ${result.route} contract invalid: ${result.contractError}`);
    }
  }

  const summary = {
    checked: results.length,
    transportFailures: results.filter((r) => !r.ok).length,
    statusMismatches: results.filter((r) => r.ok && !r.statusValid).length,
    contractViolations: results.filter((r) => r.ok && !r.contractValid).length,
    failed: failures.length,
  };

  const report = {
    timestamp: new Date().toISOString(),
    baseUrl,
    contractVersion: CONTRACT_VERSION,
    summary,
    failures,
    results,
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(`Wave 9 frontend integration sweep checked ${summary.checked} endpoints against ${baseUrl}`);
  console.log(
    `Transport failures: ${summary.transportFailures}; status mismatches: ${summary.statusMismatches}; contract violations: ${summary.contractViolations}`,
  );
  console.log(`Report written: ${reportPath}`);

  if (failures.length > 0) {
    console.error("Wave 9 frontend integration sweep detected failures:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
