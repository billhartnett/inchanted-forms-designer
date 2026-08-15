const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  autonomousRun,
  createRunId,
  externalPath,
  guardrails,
  repoRoot,
} = require('./artifact-output-paths.cjs');

const args = new Set(process.argv.slice(2));
const skipValidation = args.has('--skip-validation');
const dryRunFreeze = args.has('--dry-run-freeze');
const validationArg = process.argv.slice(2).find((arg) => arg.startsWith('--validation='));
const runArg = process.argv.slice(2).find((arg) => arg.startsWith('--run-id='));

function latestValidationVersion() {
  const versions = fs.readdirSync(repoRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^corpus-validation-v\d+$/.test(entry.name))
    .map((entry) => Number(entry.name.match(/\d+$/)[0]))
    .filter((version) => version >= 50)
    .filter((version) => fs.existsSync(path.join(repoRoot, `corpus-validation-v${version}`, `run-corpus-validation-v${version}.js`)));
  if (versions.length === 0) throw new Error('No v50+ corpus validation runner is available');
  return Math.max(...versions);
}

function runNode(args, env = process.env) {
  const result = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status}): node ${args.join(' ')}`);
  }
  return result.stdout.trim();
}

function main() {
  const startedAt = new Date().toISOString();
  const runId = runArg ? runArg.split('=')[1] : createRunId();
  const runRoot = autonomousRun(runId);
  const validationVersion = validationArg ? Number(validationArg.split('=')[1]) : latestValidationVersion();

  let validationOutput = null;
  if (!skipValidation) {
    validationOutput = runNode(['run-corpus-validation.js', String(validationVersion)]);
  }

  const autonomousOutput = runNode(
    ['corpus-validation-autonomous/run-corpus-validation-autonomous.js'],
    { ...process.env, ACORD_AUTONOMOUS_RUN_ID: runId },
  );

  const snapshotArgs = ['scripts/create-production-snapshot.cjs'];
  if (dryRunFreeze) snapshotArgs.push('--dry-run');
  const snapshotOutput = runNode(snapshotArgs);

  const report = {
    schemaVersion: 'discrepancy-automation-workflow.v1',
    startedAt,
    completedAt: new Date().toISOString(),
    runId,
    runPath: externalPath(runRoot),
    validationVersion: skipValidation ? null : validationVersion,
    validationSkipped: skipValidation,
    freezeDryRun: dryRunFreeze,
    stages: {
      validation: validationOutput,
      autonomousReduction: autonomousOutput,
      productionSnapshot: snapshotOutput,
    },
    guardrails,
  };
  fs.writeFileSync(path.join(runRoot, 'workflow-report.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
  process.stdout.write(JSON.stringify({
    runId,
    runPath: externalPath(runRoot),
    validationVersion: report.validationVersion,
    freezeDryRun: dryRunFreeze,
    workflowReport: externalPath(path.join(runRoot, 'workflow-report.json')),
    guardrails,
  }, null, 2) + '\n');
}

main();
