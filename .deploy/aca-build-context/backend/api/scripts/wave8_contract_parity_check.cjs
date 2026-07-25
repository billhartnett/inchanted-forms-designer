const fs = require("node:fs");
const path = require("node:path");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function routeKey(result) {
  return `${result.method} ${result.route}`;
}

function buildRouteMap(results) {
  const map = new Map();
  for (const result of results || []) {
    map.set(routeKey(result), result);
  }
  return map;
}

function main() {
  const stagingPath = process.env.WAVE8_STAGING_REPORT
    ? path.resolve(process.cwd(), process.env.WAVE8_STAGING_REPORT)
    : path.resolve(process.cwd(), "backend_validation_report.staging.wave8.json");
  const productionPath = process.env.WAVE8_PRODUCTION_REPORT
    ? path.resolve(process.cwd(), process.env.WAVE8_PRODUCTION_REPORT)
    : path.resolve(process.cwd(), "backend_validation_report.production.wave8.json");
  const outPath = process.env.WAVE8_PARITY_REPORT
    ? path.resolve(process.cwd(), process.env.WAVE8_PARITY_REPORT)
    : path.resolve(process.cwd(), "backend_validation_report.parity.wave8.json");

  const staging = readJson(stagingPath);
  const production = readJson(productionPath);

  const stagingMap = buildRouteMap(staging.results);
  const productionMap = buildRouteMap(production.results);

  const allKeys = new Set([...stagingMap.keys(), ...productionMap.keys()]);
  const mismatches = [];

  for (const key of allKeys) {
    const s = stagingMap.get(key);
    const p = productionMap.get(key);

    if (!s || !p) {
      mismatches.push({ key, issue: "route missing in one environment" });
      continue;
    }

    if (s.status !== p.status) {
      mismatches.push({ key, issue: "status mismatch", stagingStatus: s.status, productionStatus: p.status });
    }

    if (Boolean(s.contractValid) !== Boolean(p.contractValid)) {
      mismatches.push({ key, issue: "contract validity mismatch", stagingContractValid: s.contractValid, productionContractValid: p.contractValid });
    }
  }

  const summary = {
    stagingChecked: staging.results?.length || 0,
    productionChecked: production.results?.length || 0,
    compared: allKeys.size,
    mismatches: mismatches.length,
    parityPass: mismatches.length === 0,
  };

  const report = {
    timestamp: new Date().toISOString(),
    stagingReport: stagingPath,
    productionReport: productionPath,
    summary,
    mismatches,
  };

  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log(`Wave 8 parity compared ${summary.compared} routes`);
  console.log(`Mismatches: ${summary.mismatches}`);
  console.log(`Report written: ${outPath}`);

  if (!summary.parityPass) {
    process.exit(1);
  }
}

main();
