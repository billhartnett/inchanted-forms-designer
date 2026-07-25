const fs = require("node:fs/promises");
const path = require("node:path");

const { runDiagnosticsForFixture } = require("./lib/mapping-diagnostics-lib");

function textContainsPattern(text, pattern) {
  try {
    return new RegExp(pattern, "i").test(String(text || ""));
  } catch {
    return String(text || "")
      .toLowerCase()
      .includes(String(pattern || "").toLowerCase());
  }
}

function scoreAnchorMatch(mapping, patterns) {
  const chosen = mapping.chosen || mapping.suggestions?.[0] || null;
  const chosenSearch = [
    chosen?.label,
    chosen?.acordCode,
    chosen?.description,
  ]
    .filter(Boolean)
    .join(" | ");

  const allSuggestions = (mapping.suggestions || [])
    .slice(0, 10)
    .map((candidate) => [candidate.label, candidate.acordCode, candidate.description].filter(Boolean).join(" | "));

  const expandedPatterns = [...patterns];
  if (patterns.some((pattern) => /insured\s*name|named\s*insured|GeneralInfo\.NamedInsured/i.test(pattern))) {
    expandedPatterns.push(
      "named\\s+insured",
      "name\\s+of\\s+insured",
      "applicant\\s+name",
      "name\\s+of\\s+applicant",
    );
  }

  let score = 0;
  for (const pattern of expandedPatterns) {
    if (textContainsPattern(mapping.text, pattern)) {
      score += 3;
    }
    if (chosenSearch && textContainsPattern(chosenSearch, pattern)) {
      score += 2;
    }
    if (allSuggestions.some((entry) => textContainsPattern(entry, pattern))) {
      score += 1;
    }
  }

  return score;
}

async function loadTargetAnchors(rootDir) {
  const targets = (process.env.WAVE8_TARGET_ANCHORS || "operations_description,insured_name")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const anchorPath = path.join(rootDir, "backend", "api", "tests", "gold-anchor-fields.json");
  const raw = JSON.parse(await fs.readFile(anchorPath, "utf8"));
  const forms = Array.isArray(raw.forms) ? raw.forms : [];

  const selected = [];
  for (const form of forms) {
    const fixtureName = String(form?.fixtureName || "").trim();
    const anchors = Array.isArray(form?.anchors) ? form.anchors : [];
    for (const anchor of anchors) {
      const anchorId = String(anchor?.anchorId || "").trim();
      if (!targets.includes(anchorId)) {
        continue;
      }
      selected.push({
        fixtureName,
        anchorId,
        matchAnyPatterns: Array.isArray(anchor?.matchAnyPatterns)
          ? anchor.matchAnyPatterns.map((entry) => String(entry || "").trim()).filter(Boolean)
          : [],
      });
    }
  }

  return selected;
}

function buildCandidateDiagnostics(mapping) {
  return (mapping?.suggestions || []).slice(0, 10).map((candidate) => ({
    acordCode: candidate.acordCode,
    label: candidate.label,
    confidenceScore: Number(candidate.confidenceScore || 0),
    semanticScore: Number(candidate.semanticSimilarity || 0),
    dictionaryScore: Number(candidate.dictionaryScore || 0),
    supervisionBoost: Number(candidate.supervisionBoost || 0),
    semanticHintWeight: Number(candidate.semanticHintWeight || 0),
    categoryHintWeight: Number(candidate.categoryHintWeight || 0),
    dictionaryConsistencyWeight: Number(candidate.dictionaryConsistencyWeight || 0),
    wave8GatingPassed: Boolean(candidate?.wave8Gating?.passed),
    wave8GatingRejectReasons: Array.isArray(candidate?.wave8Gating?.rejectReasons)
      ? candidate.wave8Gating.rejectReasons
      : [],
  }));
}

async function main() {
  const rootDir = path.resolve(__dirname, "../../..");
  const outputDir = path.join(rootDir, "backend", "api", "tests", "diagnostics");
  await fs.mkdir(outputDir, { recursive: true });

  const selectedAnchors = await loadTargetAnchors(rootDir);
  if (selectedAnchors.length === 0) {
    throw new Error("No target anchors found in gold-anchor-fields.json");
  }

  const groupedByFixture = new Map();
  for (const entry of selectedAnchors) {
    const existing = groupedByFixture.get(entry.fixtureName) || [];
    existing.push(entry);
    groupedByFixture.set(entry.fixtureName, existing);
  }

  const diagnostics = {
    generatedAt: new Date().toISOString(),
    targets: selectedAnchors.map((entry) => ({ fixtureName: entry.fixtureName, anchorId: entry.anchorId })),
    results: [],
  };

  for (const [fixtureName, anchors] of groupedByFixture.entries()) {
    const { strictReport, rawMappings } = await runDiagnosticsForFixture({
      fixtureName,
      limit: Number.parseInt(process.env.ANCHOR_MAPPING_LIMIT || "80", 10),
    });
    const strictBlockIds = new Set((strictReport.finalMappings || []).map((mapping) => mapping.blockId));

    for (const anchor of anchors) {
      const ranked = (rawMappings || [])
        .map((mapping) => ({
          mapping,
          matchScore: scoreAnchorMatch(mapping, anchor.matchAnyPatterns),
          confidence: Number((mapping.chosen || mapping.suggestions?.[0])?.confidenceScore || 0),
        }))
        .sort(
          (left, right) =>
            right.matchScore - left.matchScore ||
            right.confidence - left.confidence ||
            String(left.mapping.blockId).localeCompare(String(right.mapping.blockId)),
        );

      const best = ranked[0];
      const bestMapping = best && best.matchScore > 0 ? best.mapping : null;
      const chosen = bestMapping ? bestMapping.chosen || bestMapping.suggestions?.[0] : null;
      const mappingDiagnostics = bestMapping?.mappingDiagnostics || {};

      diagnostics.results.push({
        fixtureName,
        anchorId: anchor.anchorId,
        patterns: anchor.matchAnyPatterns,
        selectedBlockId: bestMapping?.blockId || null,
        selectedText: bestMapping?.text || null,
        selectedInStrictFinalMappings: bestMapping ? strictBlockIds.has(bestMapping.blockId) : false,
        strictRejectionReason:
          bestMapping && strictReport?.strictDecisionByBlockId
            ? strictReport.strictDecisionByBlockId[bestMapping.blockId]?.reason || null
            : null,
        anchorMatchScore: Number(best?.matchScore || 0),
        chosenCandidate: chosen
          ? {
              acordCode: chosen.acordCode,
              label: chosen.label,
              confidenceScore: Number(chosen.confidenceScore || 0),
              semanticScore: Number(chosen.semanticSimilarity || 0),
              dictionaryScore: Number(chosen.dictionaryScore || 0),
              supervisionBoost: Number(chosen.supervisionBoost || 0),
              wave8GatingPassed: Boolean(chosen?.wave8Gating?.passed),
              wave8GatingRejectReasons: Array.isArray(chosen?.wave8Gating?.rejectReasons)
                ? chosen.wave8Gating.rejectReasons
                : [],
            }
          : null,
        top10Candidates: buildCandidateDiagnostics(bestMapping),
        overlapSuppression: {
          suppressed: Boolean(mappingDiagnostics?.wave8OverlapSuppressed),
          iou: Number(mappingDiagnostics?.wave8OverlapIou || 0),
          winnerBlockId: mappingDiagnostics?.wave8OverlapWinnerBlockId || null,
        },
        gatingSummary: {
          thresholdDecision: mappingDiagnostics?.thresholdDecision || null,
          thresholdReason: mappingDiagnostics?.thresholdReason || null,
          finalSuggestionCount: Number(mappingDiagnostics?.finalSuggestionCount || 0),
        },
      });
    }
  }

  const outputPath = path.join(outputDir, "wave8-anchor-diagnostics.json");
  await fs.writeFile(outputPath, `${JSON.stringify(diagnostics, null, 2)}\n`, "utf8");

  console.log(`[wave8-anchor-diagnostics] wrote ${diagnostics.results.length} anchor diagnostics to ${outputPath}`);
  for (const item of diagnostics.results) {
    const chosenCode = item?.chosenCandidate?.acordCode || "none";
    const chosenConf = Number(item?.chosenCandidate?.confidenceScore || 0).toFixed(3);
    const strictState = item.selectedInStrictFinalMappings ? "strict-final" : "not-strict-final";
    console.log(
      `[wave8-anchor-diagnostics] ${item.fixtureName} :: ${item.anchorId} => ${chosenCode} @ ${chosenConf} (${strictState})`,
    );
  }
}

main().catch((error) => {
  console.error("[wave8-anchor-diagnostics] Failed:", error);
  process.exitCode = 1;
});
