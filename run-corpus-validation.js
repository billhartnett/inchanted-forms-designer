const fs = require('fs');
const path = require('path');
const { validationOutput, externalPath } = require('./scripts/artifact-output-paths.cjs');

const versionArg = process.argv[2] || process.env.CORPUS_VALIDATION_VERSION;
const match = String(versionArg || '').match(/^(?:v)?(\d+)$/i);
if (!match) {
  throw new Error('Usage: node run-corpus-validation.js <version>, for example: node run-corpus-validation.js 57');
}

const version = Number(match[1]);
if (version < 50) {
  throw new Error('The external validation architecture applies to v50 and later.');
}

const runnerPath = path.join(__dirname, `corpus-validation-v${version}`, `run-corpus-validation-v${version}.js`);
if (!fs.existsSync(runnerPath)) {
  throw new Error(`Missing validation runner: ${runnerPath}`);
}

process.env.CORPUS_VALIDATION_OUTPUT = validationOutput(version);
process.stdout.write(`${JSON.stringify({
  version,
  runnerPath: runnerPath.replace(/\\/g, '/'),
  outputPath: externalPath(validationOutput(version)),
}, null, 2)}\n`);
require(runnerPath);
