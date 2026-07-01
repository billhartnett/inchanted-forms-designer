#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("node:fs/promises");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const rootDir = path.resolve(__dirname, "../../..");
const reportDir = path.join(rootDir, "training-data", "acord-labeled");

const ingestionReportPath = path.join(reportDir, "wave6_phase1_replay_ingestion_report.json");
const structuralMissDeltaPath = path.join(reportDir, "wave6_phase1_structural_miss_delta.json");
const tuningEnvelopesPath = path.join(reportDir, "wave6_phase1_replay_tuning_envelopes.json");
const diagnosticsSummaryPath = path.join(reportDir, "wave6_phase1_replay_diagnostics_summary.json");
const validationReportPath = path.join(reportDir, "wave6_phase1_replay_validation_report.json");
const integrationReportPath = path.join(reportDir, "wave6_phase1_replay_integration_report.md");
const regressionReportPath = path.join(reportDir, "wave6_phase1_replay_regression_report.json");

const replayMode =
  process.env.WAVE6_REPLAY_MODE === "strict_live_host_only"
    ? "strict_live_host_only"
    : "fast_deterministic";

function runReplayTuningRunner() {
  const run = spawnSync(process.execPath, ["scripts/wave6_replay_tuning_runner.js"], {
    cwd: path.resolve(__dirname, ".."),
    env: {
      ...process.env,
      WAVE6_REPLAY_MODE: replayMode,
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

async function readJson(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    // If any report file is missing, return a fallback structure
    // This can happen if the runner crashed before writing files
    const baseName = path.basename(filePath);
    if (baseName === "wave6_phase1_replay_validation_report.json") {
      return {
        generatedAt: new Date().toISOString(),
        mode: replayMode,
        pass: false,
        failureClass: "runnerFailure",
        error: "Runner failed to produce validation report",
        checks: {},
        structuralMissTotals: {},
        structuralMissRates: {},
        tuningEnvelopes: {},
      };
    }
    if (baseName === "wave6_phase1_replay_ingestion_report.json") {
      return {
        generatedAt: new Date().toISOString(),
        mode: replayMode,
        replayBatchCount: 0,
        files: [],
        replayInputBlocks: 0,
        replayBatchBlocks: 0,
      };
    }
    if (baseName === "wave6_phase1_structural_miss_delta.json") {
      return {
        generatedAt: new Date().toISOString(),
        totals: {},
        rates: {},
        perFixture: [],
      };
    }
    if (baseName === "wave6_phase1_replay_tuning_envelopes.json") {
      return {
        generatedAt: new Date().toISOString(),
        tuningEnvelopes: {},
        selectedProfile: null,
      };
    }
    // Generic fallback
    return {};
  }
}

function buildIntegrationMarkdown(validationReport, ingestionReport, structuralMissDelta) {
  const rates = structuralMissDelta?.rates || {};
  const totals = structuralMissDelta?.totals || {};
  const checks = validationReport?.checks || {};
  const tunedRates = validationReport?.tunedRates || {};

  return [
    "# wave6_phase1_replay_integration_report",
    "",
    "## Scope",
    "Wave 6 Phase 1 replay-driven tuning execution across replay ingestion, structural-miss delta analysis, and multi-envelope tuning synthesis.",
    "",
    "## Mode",
    `- mode: ${validationReport.mode || replayMode}`,
    `- strictModeRequired: ${Boolean(validationReport.strictModeRequired)}`,
    `- pass: ${Boolean(validationReport.pass)}`,
    `- failureClass: ${validationReport.failureClass || "none"}`,
    "",
    "## Replay Ingestion",
    `- replayBatchCount: ${ingestionReport.replayBatchCount || 0}`,
    `- replayInputBlocks: ${ingestionReport.replayInputBlocks || 0}`,
    `- replayBatchBlocks: ${ingestionReport.replayBatchBlocks || 0}`,
    "",
    "## Structural-Miss Delta",
    `- missingFields: ${totals.missingFields || 0}`,
    `- misclassifications: ${totals.misclassifications || 0}`,
    `- geometryMismatches: ${totals.geometryMismatches || 0}`,
    `- categoryModeMismatches: ${totals.categoryModeMismatches || 0}`,
    `- replayCoverageRatio: ${rates.replayCoverageRatio || 0}`,
    `- missingFieldRate: ${rates.missingFieldRate || 0}`,
    `- misclassificationRate: ${rates.misclassificationRate || 0}`,
    `- geometryMismatchRate: ${rates.geometryMismatchRate || 0}`,
    `- categoryModeMismatchRate: ${rates.categoryModeMismatchRate || 0}`,
    "",
    "## Replay-Driven Tuning",
    `- selectedProfile: ${validationReport.selectedProfile?.id || "none"}`,
    `- tuned replayCoverageRatio: ${tunedRates.replayCoverageRatio || 0}`,
    `- tuned missingFieldRate: ${tunedRates.missingFieldRate || 0}`,
    `- tuned misclassificationRate: ${tunedRates.misclassificationRate || 0}`,
    `- tuned geometryMismatchRate: ${tunedRates.geometryMismatchRate || 0}`,
    `- tuned categoryModeMismatchRate: ${tunedRates.categoryModeMismatchRate || 0}`,
    "",
    "## Checks",
    `- replayCoveragePass: ${checks.replayCoveragePass}`,
    `- missingFieldPass: ${checks.missingFieldPass}`,
    `- misclassificationPass: ${checks.misclassificationPass}`,
    `- geometryMismatchPass: ${checks.geometryMismatchPass}`,
    `- categoryModeMismatchPass: ${checks.categoryModeMismatchPass}`,
    "",
    "## Guardrails",
    "- Wave 4.8 replay baseline unchanged.",
    "- Wave 4 tuning remains closed.",
    "- Wave 5 -> Wave 6 execution path only.",
  ].join("\n");
}

function buildDiagnosticsSummary(validationReport, structuralMissDelta, tuningEnvelopes) {
  return {
    generatedAt: new Date().toISOString(),
    mode: validationReport.mode || replayMode,
    pass: Boolean(validationReport.pass),
    failureClass: validationReport.failureClass || null,
    hostHealthFailure: Boolean(validationReport.hostHealthFailure),
    mappingThresholdFailure: Boolean(validationReport.mappingThresholdFailure),
    selectedProfile: validationReport.selectedProfile || null,
    structuralMissTotals: structuralMissDelta.totals || {},
    structuralMissRates: structuralMissDelta.rates || {},
    checks: validationReport.checks || {},
    tunedRates: validationReport.tunedRates || {},
    tuningEnvelopes: tuningEnvelopes.tuningEnvelopes || {},
    guardrails: {
      wave48BaselineUnchanged: true,
      wave4TuningReopened: false,
      executionPath: "wave5_to_wave6_only",
    },
  };
}

async function main() {
  await fs.mkdir(reportDir, { recursive: true });

  const validationRun = runReplayTuningRunner();

  const ingestionReport = await readJson(ingestionReportPath);
  const structuralMissDelta = await readJson(structuralMissDeltaPath);
  const tuningEnvelopes = await readJson(tuningEnvelopesPath);
  const validationReport = await readJson(validationReportPath);

  const diagnosticsSummary = buildDiagnosticsSummary(
    validationReport,
    structuralMissDelta,
    tuningEnvelopes,
  );

  const integrationReport = buildIntegrationMarkdown(
    validationReport,
    ingestionReport,
    structuralMissDelta,
  );

  const regressionReport = {
    generatedAt: new Date().toISOString(),
    validationRun,
    validationReport,
    structuralMissDelta,
    selectedProfile: validationReport.selectedProfile || null,
    guardrails: {
      wave48BaselineUnchanged: true,
      wave4TuningReopened: false,
      executionPath: "wave5_to_wave6_only",
    },
  };

  await fs.writeFile(diagnosticsSummaryPath, `${JSON.stringify(diagnosticsSummary, null, 2)}\n`, "utf8");
  await fs.writeFile(integrationReportPath, `${integrationReport}\n`, "utf8");
  await fs.writeFile(regressionReportPath, `${JSON.stringify(regressionReport, null, 2)}\n`, "utf8");

  console.log(JSON.stringify(regressionReport, null, 2));
  if (!validationRun.success || !validationReport.pass) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
