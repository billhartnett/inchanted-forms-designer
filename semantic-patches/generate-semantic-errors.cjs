const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const groundTruthDir = path.join(
  repoRoot,
  "training-data",
  "acord-labeled_XFDL",
  "ground-truth",
);
const mappingPath = path.join(groundTruthDir, "xfdl-pdf-mapping.json");
const outputDir = path.join(__dirname, "semantic-errors");
const snapshotDir = path.join(__dirname, "current-output");
const apiBase = String(process.env.SEMANTIC_PATCH_API_BASE_URL || "http://127.0.0.1:7089")
  .replace(/\/$/, "");

const args = new Set(process.argv.slice(2));
const limitArg = process.argv.slice(2).find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? Math.max(1, Number(limitArg.split("=")[1]) || 1) : Infinity;
const refresh = args.has("--refresh");
const includeReview = !args.has("--matched-only");
const append = args.has("--append");

const categoryDescriptions = {
  semantic_label_mismatch: "The predicted semantic label disagrees with the XFDL visual/help label.",
  candidate_ranking_error: "The expected XFDL semantic path is absent or not ranked first.",
  field_type_misclassification: "The predicted fillable type differs from the XFDL control/format type.",
  table_detection_error: "A ground-truth table cell is missing table, row, column, or compatible cell-type metadata.",
  checkbox_yes_no_pairing_error: "A checkbox or Yes/No control is missing its expected pairing/group evidence.",
  suppression_error: "Presentation text was promoted as fillable or a fillable XFDL control was suppressed.",
  grouping_error: "A field in an XFDL semantic/container group lacks compatible predicted grouping.",
  label_value_pairing_error: "A fillable control with an XFDL label lacks a compatible predicted label/value association.",
  unmapped_fillable_field: "An XFDL fillable control has no matched promoted backend field or no mapping candidate.",
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function normalizedText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[_/]+/g, " ")
    .replace(/[^a-z0-9%$]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value) {
  return new Set(normalizedText(value).split(" ").filter((token) => token.length > 1));
}

function tokenSimilarity(left, right) {
  const leftTokens = tokens(left);
  const rightTokens = tokens(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  let shared = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) shared += 1;
  }
  return (2 * shared) / (leftTokens.size + rightTokens.size);
}

function canonicalType(value) {
  const type = normalizedText(value);
  if (/check|boolean|yes no/.test(type)) return "checkbox";
  if (/percent/.test(type)) return "percent";
  if (/currency|money|amount/.test(type)) return "currency";
  if (/date/.test(type)) return "date";
  if (/number|numeric|integer|decimal/.test(type)) return "numeric";
  if (/signature/.test(type)) return "signature";
  return "text";
}

function truthPageDimensions(dataset) {
  return new Map(dataset.pages.map((page) => {
    const dpi = Number(page.dpi || 120);
    const printWidth = Number(page.printSize?.[0] || 8.5);
    const printHeight = Number(page.printSize?.[1] || 11);
    return [page.number, {
      width: Number(page.width) || printWidth * dpi,
      height: Number(page.height) || printHeight * dpi,
    }];
  }));
}

function predictionPageDimensions(payload) {
  const dimensions = payload.bboxNormalization?.pageDimensions || payload.pageDimensions || [];
  return new Map(dimensions.map((page) => [Number(page.page), {
    width: Number(page.width),
    height: Number(page.height),
  }]));
}

function normalizedBox(box, dimensions) {
  if (!box || !dimensions?.width || !dimensions?.height) return null;
  return {
    x: Number(box.x) / dimensions.width,
    y: Number(box.y) / dimensions.height,
    width: Number(box.width) / dimensions.width,
    height: Number(box.height) / dimensions.height,
  };
}

function boxDistance(left, right) {
  if (!left || !right) return Infinity;
  const leftCenterX = left.x + left.width / 2;
  const leftCenterY = left.y + left.height / 2;
  const rightCenterX = right.x + right.width / 2;
  const rightCenterY = right.y + right.height / 2;
  const center = Math.hypot(leftCenterX - rightCenterX, leftCenterY - rightCenterY);
  const extent = Math.abs(left.width - right.width) + Math.abs(left.height - right.height);
  return center + extent * 0.3;
}

function expectedSemanticCode(field) {
  return String(field.semantic?.semanticPath || field.sid || "").trim();
}

function topSuggestion(mapping) {
  return mapping?.topCandidate || mapping?.chosen || mapping?.suggestions?.[0] || null;
}

function formDataForPdf(pdfPath) {
  const form = new FormData();
  const bytes = fs.readFileSync(pdfPath);
  form.append("file", new Blob([bytes], { type: "application/pdf" }), path.basename(pdfPath));
  return form;
}

function unwrap(payload) {
  return payload?.data && typeof payload.data === "object" ? payload.data : payload;
}

async function responseJson(response, operation) {
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`${operation} returned non-JSON (${response.status}): ${text.slice(0, 500)}`);
  }
  if (!response.ok) {
    throw new Error(`${operation} failed (${response.status}): ${JSON.stringify(payload)}`);
  }
  return unwrap(payload);
}

async function replayPdf(pair) {
  const snapshotPath = path.join(snapshotDir, `${path.parse(pair.xfdlDatasetFile).name}.json`);
  if (!refresh && fs.existsSync(snapshotPath)) return readJson(snapshotPath);

  const pdfPath = path.join(repoRoot, pair.pdfRelativePath);
  const extractionResponse = await fetch(`${apiBase}/api/wave9/extraction/hybrid`, {
    method: "POST",
    headers: { "x-file-name": pair.pdfFile, "x-actor-role": "admin" },
    body: formDataForPdf(pdfPath),
  });
  const extraction = await responseJson(extractionResponse, `extraction for ${pair.pdfFile}`);
  const mappingResponse = await fetch(`${apiBase}/api/wave9/mapping/flow`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-actor-role": "admin" },
    body: JSON.stringify({
      documentId: extraction.documentId || pair.pdfFile,
      sourceDocumentName: pair.pdfFile,
      lockSourceDocument: true,
      blocks: extraction.blocks || [],
      fieldCatalog: extraction.fieldCatalog || [],
      groupedStructures: extraction.groupedStructures || {},
      bboxNormalization: extraction.bboxNormalization || {},
      pageDimensions: extraction.pageDimensions || [],
      context: "Phase 2 semantic-error corpus replay",
      deterministic: true,
    }),
  });
  const mapping = await responseJson(mappingResponse, `mapping for ${pair.pdfFile}`);
  const snapshot = {
    generatedAt: new Date().toISOString(),
    apiBase,
    pair: {
      xfdlFile: pair.xfdlFile,
      pdfFile: pair.pdfFile,
      pdfSha256: pair.pdfSha256,
      status: pair.status,
      confidence: pair.confidence,
    },
    extraction,
    mapping,
  };
  writeJson(snapshotPath, snapshot);
  return snapshot;
}

function matchFields(dataset, snapshot) {
  const truthDimensions = truthPageDimensions(dataset);
  const predictionDimensions = predictionPageDimensions(snapshot.extraction);
  const mappings = snapshot.mapping.mappings || [];
  const mappingById = new Map(mappings.map((mapping) => [mapping.blockId, mapping]));
  const promotedIds = new Set((snapshot.mapping.mappedFields || []).map((mapping) => mapping.blockId));
  const predictions = (snapshot.extraction.fieldCatalog || [])
    .filter((entry) => entry.semanticValueRegion && ["input", "checkbox", "table-cell", "value-region"].includes(entry.role))
    .map((entry) => ({
      ...entry,
      mapping: mappingById.get(entry.id),
      promoted: promotedIds.has(entry.id),
      normalizedGeometry: normalizedBox(
        entry.semanticValueRegion || entry.boundingBox,
        predictionDimensions.get(Number(entry.page)),
      ),
    }));
  const usedPredictionIds = new Set();
  const matches = [];

  for (const truth of dataset.fields) {
    const truthGeometry = normalizedBox(truth.geometry, truthDimensions.get(Number(truth.pageNumber)));
    const expectedType = canonicalType(truth.fieldType);
    const candidates = predictions
      .filter((prediction) => prediction.page === truth.pageNumber && !usedPredictionIds.has(prediction.id))
      .map((prediction) => {
        const geometryDistance = boxDistance(truthGeometry, prediction.normalizedGeometry);
        const typePenalty = canonicalType(prediction.valueType) === expectedType ? 0 : 0.025;
        const predictedLabel = `${prediction.semanticLabel || ""} ${prediction.text || ""}`;
        const labelScore = Math.max(
          tokenSimilarity(truth.label?.visualLabel, predictedLabel),
          tokenSimilarity(truth.label?.helpLabel, predictedLabel),
          tokenSimilarity(truth.sid, predictedLabel),
        );
        return { prediction, geometryDistance, labelScore, score: geometryDistance + typePenalty - labelScore * 0.015 };
      })
      .filter((candidate) => candidate.geometryDistance <= 0.08)
      .sort((left, right) => left.score - right.score);
    const best = candidates[0];
    if (best) usedPredictionIds.add(best.prediction.id);
    matches.push({
      truth,
      prediction: best?.prediction || null,
      geometryDistance: best?.geometryDistance ?? null,
      labelSimilarity: best?.labelScore ?? 0,
    });
  }
  return { matches, predictions, usedPredictionIds };
}

function errorRecord(category, pair, match, details) {
  const truth = match?.truth;
  const prediction = match?.prediction;
  return {
    id: [category, path.parse(pair.xfdlDatasetFile).name, truth?.sid || prediction?.id || "form"]
      .join(":")
      .replace(/\s+/g, "-"),
    category,
    description: categoryDescriptions[category],
    form: {
      xfdlFile: pair.xfdlFile,
      xfdlDatasetFile: pair.xfdlDatasetFile,
      pdfFile: pair.pdfFile,
      pairStatus: pair.status,
      pairConfidence: pair.confidence,
    },
    field: {
      truthSid: truth?.sid || null,
      predictionId: prediction?.id || null,
      page: truth?.pageNumber || prediction?.page || null,
      geometryDistance: match?.geometryDistance ?? null,
    },
    expected: details.expected,
    actual: details.actual,
    rationale: details.rationale,
    evidence: details.evidence || {},
  };
}

function analyzePair(pair, dataset, snapshot) {
  const errors = [];
  const { matches, predictions, usedPredictionIds } = matchFields(dataset, snapshot);
  const labelPairs = new Set(
    (snapshot.extraction.groupedStructures?.labelInputPairs || []).map((entry) => entry.inputBlockId),
  );
  const checkboxGroups = new Set(
    (snapshot.extraction.groupedStructures?.checkboxGroups || [])
      .flatMap((entry) => entry.checkboxFieldIds || []),
  );
  const truthGroupsByField = new Map();
  const truthFieldBySid = new Map(dataset.fields.map((field) => [field.sid, field]));
  const truthGroupedCheckboxIds = new Set();
  for (const group of dataset.groups || []) {
    const fieldSids = group.fieldSids || group.members || [];
    const checkboxSids = fieldSids.filter((fieldSid) =>
      canonicalType(truthFieldBySid.get(fieldSid)?.fieldType) === "checkbox"
    );
    if (checkboxSids.length > 1) {
      for (const fieldSid of checkboxSids) truthGroupedCheckboxIds.add(fieldSid);
    }
    for (const fieldSid of fieldSids) {
      const values = truthGroupsByField.get(fieldSid) || [];
      values.push(group.id);
      truthGroupsByField.set(fieldSid, values);
    }
  }

  for (const match of matches) {
    const { truth, prediction } = match;
    const expectedLabel = truth.label?.visualLabel || truth.label?.helpLabel || truth.sid;
    if (!prediction) {
      errors.push(errorRecord("unmapped_fillable_field", pair, match, {
        expected: { fillable: true, sid: truth.sid, type: truth.fieldType, label: expectedLabel },
        actual: { matchedPrediction: false },
        rationale: "No current backend fillable field was found within the normalized geometry threshold.",
        evidence: { geometryThreshold: 0.08 },
      }));
      errors.push(errorRecord("suppression_error", pair, match, {
        expected: { suppressed: false, fillable: true },
        actual: { promoted: false, matchedPrediction: false },
        rationale: "The XFDL explicitly identifies this control as fillable, but the backend did not promote it.",
      }));
      continue;
    }

    const actualLabel = prediction.semanticLabel || prediction.text;
    if (expectedLabel && match.labelSimilarity < 0.35) {
      errors.push(errorRecord("semantic_label_mismatch", pair, match, {
        expected: { label: expectedLabel, helpLabel: truth.label?.helpLabel || null },
        actual: { label: actualLabel },
        rationale: "Normalized label token similarity is below 0.35 for geometry-matched fields.",
        evidence: { tokenSimilarity: Number(match.labelSimilarity.toFixed(4)) },
      }));
    }

    const expectedType = canonicalType(truth.fieldType);
    const actualType = canonicalType(prediction.valueType);
    if (expectedType !== actualType) {
      errors.push(errorRecord("field_type_misclassification", pair, match, {
        expected: { type: expectedType, sourceType: truth.fieldType, format: truth.format },
        actual: { type: actualType, sourceType: prediction.valueType },
        rationale: "XFDL control/format typing and backend typed-blank classification disagree.",
      }));
    }

    const expectedCode = expectedSemanticCode(truth);
    const suggestion = topSuggestion(prediction.mapping);
    const suggestionCodes = (prediction.mapping?.suggestions || []).map((entry) => entry.acordCode);
    if (truth.semantic?.mapped && normalizedText(suggestion?.acordCode) !== normalizedText(expectedCode)) {
      errors.push(errorRecord("candidate_ranking_error", pair, match, {
        expected: { topAcordCode: expectedCode },
        actual: { topAcordCode: suggestion?.acordCode || null, rankedCodes: suggestionCodes },
        rationale: suggestionCodes.some((code) => normalizedText(code) === normalizedText(expectedCode))
          ? "The expected XFDL semantic path is present but ranked below another candidate."
          : "The expected XFDL semantic path is absent from the ranked candidates.",
      }));
    }

    if (!prediction.promoted || !suggestion) {
      errors.push(errorRecord("unmapped_fillable_field", pair, match, {
        expected: { promoted: true, mapped: truth.semantic?.mapped !== false, semanticPath: expectedCode },
        actual: { promoted: prediction.promoted, topCandidate: suggestion?.acordCode || null },
        rationale: "A geometry-matched fillable field was not promoted with a mapping candidate.",
      }));
    }

    if (truth.tableCell) {
      const expectedTable = truth.tableCell;
      if (
        !prediction.tableId ||
        Number(prediction.rowIndex) !== Number(expectedTable.rowIndex) ||
        Number(prediction.columnIndex) !== Number(expectedTable.columnIndex)
      ) {
        errors.push(errorRecord("table_detection_error", pair, match, {
          expected: expectedTable,
          actual: {
            tableId: prediction.tableId || null,
            rowIndex: prediction.rowIndex ?? null,
            columnIndex: prediction.columnIndex ?? null,
            valueType: prediction.valueType,
          },
          rationale: "The geometry-matched backend field does not preserve the XFDL table coordinates.",
        }));
      }
    }

    if (
      expectedType === "checkbox" &&
      truthGroupedCheckboxIds.has(truth.sid) &&
      !checkboxGroups.has(prediction.id)
    ) {
      errors.push(errorRecord("checkbox_yes_no_pairing_error", pair, match, {
        expected: { grouped: true, label: expectedLabel },
        actual: { grouped: false, semanticLabel: actualLabel },
        rationale: "The XFDL checkbox is fillable but is absent from backend checkbox groups.",
      }));
    }

    const truthGroupIds = truthGroupsByField.get(truth.sid) || [];
    if (truthGroupIds.length > 0 && !prediction.groupId) {
      errors.push(errorRecord("grouping_error", pair, match, {
        expected: { groupIds: truthGroupIds },
        actual: { groupId: null },
        rationale: "The XFDL field belongs to an explicit or inferred semantic group, but backend grouping is absent.",
      }));
    }

    if (expectedType !== "checkbox" && truth.label?.visualLabel && !labelPairs.has(prediction.id)) {
      errors.push(errorRecord("label_value_pairing_error", pair, match, {
        expected: { paired: true, label: truth.label.visualLabel },
        actual: { paired: false, semanticLabel: actualLabel },
        rationale: "The XFDL visual label is associated with the fillable control, but no backend label/input pair references it.",
      }));
    }
  }

  const truthSuppressed = (dataset.suppression?.suppressedElements || [])
    .filter((element) => element.geometry && element.pageNumber);
  const truthDimensions = truthPageDimensions(dataset);
  const predictionDimensions = predictionPageDimensions(snapshot.extraction);
  for (const prediction of predictions.filter((entry) => !usedPredictionIds.has(entry.id) && entry.promoted)) {
    const predictionBox = normalizedBox(
      prediction.semanticValueRegion || prediction.boundingBox,
      predictionDimensions.get(Number(prediction.page)),
    );
    const suppressedMatch = truthSuppressed
      .filter((element) => Number(element.pageNumber) === Number(prediction.page))
      .map((element) => ({
        element,
        distance: boxDistance(
          normalizedBox(element.geometry, truthDimensions.get(Number(element.pageNumber))),
          predictionBox,
        ),
      }))
      .filter((candidate) => candidate.distance <= 0.035)
      .sort((left, right) => left.distance - right.distance)[0];
    if (suppressedMatch) {
      errors.push(errorRecord("suppression_error", pair, { prediction, geometryDistance: suppressedMatch.distance }, {
        expected: {
          suppressed: true,
          sourceTag: suppressedMatch.element.tag,
          text: suppressedMatch.element.text,
          reasons: suppressedMatch.element.reasons,
        },
        actual: { promoted: true, role: prediction.role, text: prediction.text },
        rationale: "A promoted backend field aligns with an XFDL presentation/operational element.",
      }));
    }
  }

  return {
    schemaVersion: "semantic-errors.v1",
    generatedAt: new Date().toISOString(),
    form: {
      xfdlFile: pair.xfdlFile,
      xfdlDatasetFile: pair.xfdlDatasetFile,
      pdfFile: pair.pdfFile,
      pairStatus: pair.status,
      pairConfidence: pair.confidence,
    },
    counts: {
      truthFields: dataset.fields.length,
      predictedFillableFields: predictions.length,
      matchedFields: matches.filter((match) => match.prediction).length,
      promotedFields: predictions.filter((prediction) => prediction.promoted).length,
      errors: errors.length,
    },
    categoryCounts: Object.fromEntries(
      Object.keys(categoryDescriptions).map((category) => [
        category,
        errors.filter((error) => error.category === category).length,
      ]),
    ),
    errors,
  };
}

async function main() {
  const mapping = readJson(mappingPath);
  const indexPath = path.join(outputDir, "index.json");
  const existingIndex = append && fs.existsSync(indexPath) ? readJson(indexPath) : null;
  const existingDatasetFiles = new Set(
    (existingIndex?.forms || []).map((entry) => entry.form?.xfdlDatasetFile).filter(Boolean),
  );
  const eligiblePairs = mapping.mappings
    .filter((pair) => pair.pdfFile && (pair.status === "matched" || (includeReview && pair.status === "review")))
    .filter((pair) => !append || !existingDatasetFiles.has(pair.xfdlDatasetFile))
    .slice(0, limit);
  if (eligiblePairs.length === 0) {
    process.stdout.write("No new paired XFDL/PDF records are eligible for replay.\n");
    return;
  }

  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(snapshotDir, { recursive: true });
  const formReports = [];
  for (const [index, pair] of eligiblePairs.entries()) {
    process.stdout.write(`[${index + 1}/${eligiblePairs.length}] ${pair.xfdlFile} -> ${pair.pdfFile}\n`);
    const dataset = readJson(path.join(groundTruthDir, pair.xfdlDatasetFile));
    const snapshot = await replayPdf(pair);
    const report = analyzePair(pair, dataset, snapshot);
    const reportPath = path.join(
      outputDir,
      `${path.parse(pair.xfdlDatasetFile).name}.semantic-errors.json`,
    );
    writeJson(reportPath, report);
    formReports.push({ file: path.relative(repoRoot, reportPath).replace(/\\/g, "/"), ...report });
  }

  const existingForms = append ? (existingIndex?.forms || []) : [];
  const mergedForms = [
    ...existingForms,
    ...formReports.map((report) => ({
      file: report.file,
      form: report.form,
      counts: report.counts,
      categoryCounts: report.categoryCounts,
    })),
  ].sort((left, right) => left.form.xfdlFile.localeCompare(right.form.xfdlFile));
  const categoryCounts = Object.fromEntries(
    Object.keys(categoryDescriptions).map((category) => [
      category,
      mergedForms.reduce((total, report) => total + report.categoryCounts[category], 0),
    ]),
  );
  const index = {
    schemaVersion: "semantic-errors-index.v1",
    generatedAt: new Date().toISOString(),
    apiBase,
    methodology: {
      truth: "XFDL explicit controls, geometry, formats, labels, bindings, tables, suppression, and groups",
      prediction: "Current wave9 hybrid extraction followed by mapping flow",
      fieldMatching: "One-to-one, page-normalized geometry with type and semantic-label tie-breakers",
      geometryThreshold: 0.08,
      labelMismatchThreshold: 0.35,
      pairStatusesIncluded: includeReview ? ["matched", "review"] : ["matched"],
    },
    categories: categoryDescriptions,
    summary: {
      forms: mergedForms.length,
      appendedForms: formReports.length,
      truthFields: mergedForms.reduce((total, report) => total + report.counts.truthFields, 0),
      predictedFillableFields: mergedForms.reduce((total, report) => total + report.counts.predictedFillableFields, 0),
      matchedFields: mergedForms.reduce((total, report) => total + report.counts.matchedFields, 0),
      errors: Object.values(categoryCounts).reduce((total, count) => total + count, 0),
      categoryCounts,
    },
    forms: mergedForms,
  };
  writeJson(indexPath, index);
  process.stdout.write(`${JSON.stringify(index.summary, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});