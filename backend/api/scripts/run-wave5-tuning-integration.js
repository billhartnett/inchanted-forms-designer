#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("node:fs/promises");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const rootDir = path.resolve(__dirname, "../../..");
const reportDir = path.join(rootDir, "training-data", "acord-labeled");

const integrationReportPath = path.join(
  reportDir,
  "wave5_phase2_sprint5_tuning_integration_report.md",
);
const diagnosticsSummaryPath = path.join(
  reportDir,
  "wave5_phase2_sprint5_tuning_diagnostics_summary.json",
);
const regressionReportPath = path.join(
  reportDir,
  "wave5_phase2_sprint5_tuning_regression_report.json",
);
const validationReportPath = path.join(reportDir, "sprint5_tuning_validation_report.json");
const tuningMode =
  process.env.SPRINT5_TUNING_MODE === "strict_live_host_only"
    ? "strict_live_host_only"
    : "fast_deterministic";

function runValidationRunner() {
  const run = spawnSync(process.execPath, ["scripts/sprint5_tuning_validation_runner.js"], {
    cwd: path.resolve(__dirname, ".."),
    env: {
      ...process.env,
      SPRINT5_TUNING_MODE: tuningMode,
      WAVE5_GEOMETRY_ENABLED: "1",
      WAVE5_CATEGORY_MODE_ENABLED: "1",
      WAVE5_REFLOW_ENABLED: "1",
    },
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 64,
  });

  return {
    exitCode: run.status ?? 1,
    success: (run.status ?? 1) === 0,
    stdoutTail: (run.stdout || "").split(/\r?\n/).slice(-30),
    stderrTail: (run.stderr || "").split(/\r?\n/).slice(-30),
  };
}

async function readValidationReport() {
  const raw = await fs.readFile(validationReportPath, "utf8");
  return JSON.parse(raw);
}

function buildDiagnosticsSummary(validationReport) {
  return {
    generatedAt: new Date().toISOString(),
    mode: validationReport.mode || tuningMode,
    failureClass: validationReport.failureClass || null,
    hostHealthFailure: Boolean(validationReport.hostHealthFailure),
    mappingThresholdFailure: Boolean(validationReport.mappingThresholdFailure),
    pass: Boolean(validationReport.pass),
    selectedProfile: validationReport.selectedProfile || null,
    checks: validationReport.checks || {},
    aggregate: validationReport.aggregate || {},
    tuningEnvelopes: validationReport.tuningEnvelopes || {},
  };
}

function buildIntegrationMarkdown(validationReport, diagnosticsSummary, validationRun) {
  const aggregate = validationReport.aggregate || {};
  const checks = validationReport.checks || {};
  const envelopes = validationReport.tuningEnvelopes || {};
  return [
    "# wave5_phase2_sprint5_tuning_integration_report",
    "",
    "## Scope",
    "Wave 5 Phase 2 Sprint 5 tuning execution across stage-three, fusion, reranking, carrier-aware, and semantic-geometry-category fusion envelopes.",
    "",
    "## Validation Runner",
    `- Mode: ${validationReport.mode || tuningMode}`,
    `- Executed: ${validationRun.success}`,
    `- Exit code: ${validationRun.exitCode}`,
    `- failureClass: ${validationReport.failureClass || "none"}`,
    `- hostHealthFailure: ${Boolean(validationReport.hostHealthFailure)}`,
    `- mappingThresholdFailure: ${Boolean(validationReport.mappingThresholdFailure)}`,
    "",
    "## Selected Tuning Profile",
    `- Profile ID: ${validationReport.selectedProfile?.id || "none"}`,
    `- Pass: ${Boolean(validationReport.pass)}`,
    "",
    "## Aggregate Metrics",
    `- Reflow diagnostics coverage ratio: ${aggregate.reflowDiagnosticsCoverageRatio || 0}`,
    `- Mean stage-three score: ${aggregate.meanStageThreeScore || 0}`,
    `- Changed chosen rate overall: ${aggregate.changedChosenRateOverall || 0}`,
    `- Parallel hotspot rate: ${aggregate.parallelHotspotRate || 0}`,
    `- Fusion hotspot rate: ${aggregate.fusionHotspotRate || 0}`,
    "",
    "## Threshold Checks",
    `- diagnosticsCoveragePass: ${checks.diagnosticsCoveragePass}`,
    `- changedChosenRatePass: ${checks.changedChosenRatePass}`,
    `- parallelHotspotPass: ${checks.parallelHotspotPass}`,
    `- fusionHotspotPass: ${checks.fusionHotspotPass}`,
    `- meanStageThreeScorePass: ${checks.meanStageThreeScorePass}`,
    "",
    "## Tuning Envelopes",
    `- stage-three tuning envelope: ${Boolean(envelopes.stageThreeTuningEnvelope)}`,
    `- fusion tuning envelope: ${Boolean(envelopes.fusionTuningEnvelope)}`,
    `- reranking tuning envelope: ${Boolean(envelopes.rerankingTuningEnvelope)}`,
    `- carrier-aware tuning envelope: ${Boolean(envelopes.carrierAwareTuningEnvelope)}`,
    `- semantic-geometry-category fusion tuning envelope: ${Boolean(envelopes.semanticGeometryCategoryFusionTuningEnvelope)}`,
    "",
    "## Guardrails",
    "- Wave 4.8 replay baseline unchanged.",
    "- Wave 4 tuning remains closed.",
    "- Wave 5 architecture execution only.",
  ].join("\n");
}

async function main() {
  await fs.mkdir(reportDir, { recursive: true });

  const validationRun = runValidationRunner();
  const validationReport = await readValidationReport();
  const diagnosticsSummary = buildDiagnosticsSummary(validationReport);

  const integrationReport = buildIntegrationMarkdown(
    validationReport,
    diagnosticsSummary,
    validationRun,
  );

  const regressionReport = {
    generatedAt: new Date().toISOString(),
    validationRun,
    validationReport,
  };

  await fs.writeFile(regressionReportPath, `${JSON.stringify(regressionReport, null, 2)}\n`, "utf8");
  await fs.writeFile(diagnosticsSummaryPath, `${JSON.stringify(diagnosticsSummary, null, 2)}\n`, "utf8");
  await fs.writeFile(integrationReportPath, `${integrationReport}\n`, "utf8");

  console.log(JSON.stringify(regressionReport, null, 2));
  if (!validationRun.success || !validationReport.pass) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
