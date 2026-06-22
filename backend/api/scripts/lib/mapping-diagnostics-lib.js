const fs = require("node:fs/promises");
const path = require("node:path");

const apiBase = (process.env.FIXTURE_API_BASE_URL || "http://localhost:7071").replace(/\/$/, "");
const requestTimeoutMs = Number.parseInt(process.env.FIXTURE_REQUEST_TIMEOUT_MS || "90000", 10);

const FAMILY_BY_FIXTURE = {
  "sample-Acord-125.pdf": "acord-125",
  "Contractors Supp App.pdf": "contractors-supplement",
  "Markel-Contractors-Supp.pdf": "contractors-supplement",
  "ANA_E-S_Contractors_Supplemental-Application_MKT0109_fillable.pdf": "contractors-supplement",
  "sample-Acord-126.pdf": "acord-126",
  "sample-Acord-127.pdf": "acord-127",
  "sample-Acord-140.pdf": "acord-140",
};

function normalizeOcrText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasAlphabetic(text) {
  return /[a-z]/i.test(String(text || ""));
}

function hasFieldCueToken(text) {
  const normalized = normalizeOcrText(text);
  if (!normalized) return false;

  return /(name|address|city|state|zip|postal|phone|email|dob|birth|date|policy|insured|applicant|license|years|employees|number of)/.test(
    normalized,
  );
}

function isLikelyFormHeaderLine(text) {
  const normalized = normalizeOcrText(text);
  if (!normalized) return false;

  if (/commercial insurance application|applicant information section|acord/.test(normalized)) {
    return true;
  }

  const tokens = normalized.split(" ").filter(Boolean);
  const upperOnly = String(text || "")
    .replace(/[^A-Za-z]/g, "")
    .split("")
    .every((char) => char === char.toUpperCase());

  return tokens.length >= 4 && upperOnly && !hasFieldCueToken(text);
}

function isLikelySectionTitle(text) {
  const normalized = normalizeOcrText(text);
  if (!normalized) return false;

  const tokens = normalized.split(" ").filter(Boolean);
  if (tokens.length < 3) return false;

  const hasTitleWords = /(application|supplemental|coverage|insurance|contractors)/.test(normalized);

  const uppercaseOnly = String(text || "")
    .replace(/[^A-Za-z]/g, "")
    .split("")
    .every((char) => char === char.toUpperCase());

  return hasTitleWords || uppercaseOnly;
}

function hasTokenOverlap(left, right) {
  const leftTokens = normalizeOcrText(left)
    .split(" ")
    .filter((token) => token.length >= 3);
  const rightTokens = normalizeOcrText(right)
    .split(" ")
    .filter((token) => token.length >= 3);

  if (leftTokens.length === 0 || rightTokens.length === 0) return false;

  return leftTokens.some((l) => rightTokens.some((r) => r.includes(l) || l.includes(r)));
}

function isCandidateCompatible(text, label) {
  const source = normalizeOcrText(text);
  const candidate = normalizeOcrText(label);

  if (!source || !candidate) return false;
  if (hasTokenOverlap(source, candidate)) return true;

  if (/\bname\b/.test(source) && /\b(name|insured|applicant|contact)\b/.test(candidate)) return true;
  if (/\baddress\b/.test(source) && /\b(address|street|city|state|postal|zip|location)\b/.test(candidate)) return true;
  if (/\b(city|state)\b/.test(source) && /\b(city|state|province|postal|zip|address)\b/.test(candidate)) return true;
  if (/\b(zip|postal)\b/.test(source) && /\b(zip|postal)\b/.test(candidate)) return true;
  if (/\b(phone|fax|email)\b/.test(source) && /\b(phone|fax|email|contact)\b/.test(candidate)) return true;
  if (/\b(date|dob|birth)\b/.test(source) && /\b(date|birth)\b/.test(candidate)) return true;

  return false;
}

function isHardMismatch(text, label) {
  const source = normalizeOcrText(text);
  const candidate = normalizeOcrText(label);

  if (/\bagent\b/.test(source) && /\bnamed insured|insured given|applicant given\b/.test(candidate)) {
    return true;
  }

  if (/\b(id|code|sub code|customer id|bureau)\b/.test(source) && /\bname|insured|applicant\b/.test(candidate)) {
    return true;
  }

  if (/\bzip|postal\b/.test(source) && !/\bzip|postal|address\b/.test(candidate)) {
    return true;
  }

  return false;
}

function getRejectionReason(block) {
  const text = String(block?.text || "").trim();
  const confidence = Number(block?.confidence || 0);
  const width = Number(block?.boundingBox?.width || 0);

  if (text.length < 2) return "text_too_short";
  if (!hasAlphabetic(text)) return "no_alpha_chars";
  if (confidence < 0.35) return "low_confidence";
  if (width < 10) return "narrow_noise";

  return null;
}

function normalizePagesToBlocks(pages) {
  const blocks = [];

  for (const page of pages || []) {
    const pageNumber = page.pageNumber || 1;
    const pageWidth = Number(page?.width || 0);
    const pageScale = pageWidth > 0 && pageWidth < 20 ? 100 : 1;
    const sortedLines = [...(page.lines || [])].sort((left, right) => {
      const leftY = typeof left?.boundingBox?.y === "number" ? left.boundingBox.y : 0;
      const rightY = typeof right?.boundingBox?.y === "number" ? right.boundingBox.y : 0;
      const leftX = typeof left?.boundingBox?.x === "number" ? left.boundingBox.x : 0;
      const rightX = typeof right?.boundingBox?.x === "number" ? right.boundingBox.x : 0;
      return leftY - rightY || leftX - rightX;
    });

    for (const line of sortedLines) {
      const text = typeof line.content === "string" ? line.content.trim() : "";
      if (!text) continue;

      const box = line.boundingBox || {};
      blocks.push({
        id: `line-${pageNumber}-${blocks.length + 1}`,
        page: pageNumber,
        type: "text",
        text,
        confidence: typeof line.confidence === "number" ? line.confidence : 0.65,
        boundingBox: {
          x:
            typeof box.x === "number"
              ? Number((box.x * pageScale).toFixed(4))
              : 0,
          y:
            typeof box.y === "number"
              ? Number((box.y * pageScale).toFixed(4))
              : 0,
          width:
            typeof box.width === "number"
              ? Number((box.width * pageScale).toFixed(4))
              : 0,
          height:
            typeof box.height === "number"
              ? Number((box.height * pageScale).toFixed(4))
              : 0,
        },
      });
    }
  }

  blocks.sort(
    (left, right) =>
      left.page - right.page ||
      left.boundingBox.y - right.boundingBox.y ||
      left.boundingBox.x - right.boundingBox.x ||
      left.text.localeCompare(right.text),
  );

  return blocks;
}

async function fetchJson(url, init, retries = 3) {
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Request failed (${response.status}) ${url}: ${body}`);
      }

      return response.json();
    } catch (error) {
      if (error && error.name === "AbortError") {
        lastError = new Error(`Request timed out after ${requestTimeoutMs}ms: ${url}`);
      } else {
        lastError = error;
      }

      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function waitForApiReady() {
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    try {
      await fetchJson(`${apiBase}/api/acord/all`, { method: "GET" }, 1);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  throw new Error(`API did not become ready at ${apiBase}`);
}

function evaluateMappingCandidate(mapping, useDiagnosticMode, confidenceFloor) {
  const chosen = mapping.chosen || mapping.suggestions?.[0];
  if (!chosen) return { accepted: false, reason: "no_candidate" };
  if (Number(chosen.confidenceScore || 0) < confidenceFloor) {
    return { accepted: false, reason: "below_confidence_floor" };
  }

  const text = String(mapping.text || "").trim();
  if (!text) return { accepted: false, reason: "empty_text" };
  if (isLikelyFormHeaderLine(text)) return { accepted: false, reason: "header_line" };

  const isPrompt = text.endsWith(":") || hasFieldCueToken(text);
  if (!isPrompt && isLikelySectionTitle(text)) {
    return { accepted: false, reason: "section_title" };
  }

  if (isHardMismatch(text, chosen.label || "")) {
    return { accepted: false, reason: "hard_mismatch" };
  }

  if (!useDiagnosticMode && !isCandidateCompatible(text, chosen.label || "")) {
    return { accepted: false, reason: "compatibility_mismatch" };
  }

  return { accepted: true, reason: "accepted" };
}

function runPipelineFromMappings(mappings, useDiagnosticMode, limit) {
  const stageRejectReasons = {};

  const strictStage = [];
  for (const mapping of mappings) {
    const decision = evaluateMappingCandidate(mapping, useDiagnosticMode, 0.3);
    if (decision.accepted) {
      strictStage.push(mapping);
    } else {
      stageRejectReasons[decision.reason] = (stageRejectReasons[decision.reason] || 0) + 1;
    }
  }

  let qualityMappings = strictStage;
  let usedFallback = false;

  if (strictStage.length < 20) {
    usedFallback = true;
    qualityMappings = [];
    for (const mapping of mappings) {
      const decision = evaluateMappingCandidate(mapping, true, 0.12);
      if (decision.accepted) {
        qualityMappings.push(mapping);
      }
    }
  }

  const finalMappings = qualityMappings.slice(0, Math.max(1, limit));

  const topCandidatesPerBlock = {};
  for (const mapping of mappings) {
    topCandidatesPerBlock[mapping.blockId] = (mapping.suggestions || []).slice(0, 5).map((item) => ({
      acordCode: item.acordCode,
      label: item.label,
      score: Number(item.confidenceScore || 0),
      source: item.source,
    }));
  }

  return {
    usedFallback,
    strictCount: strictStage.length,
    qualityCount: qualityMappings.length,
    finalCount: finalMappings.length,
    rejectionReasons: stageRejectReasons,
    finalMappings,
    topCandidatesPerBlock,
  };
}

async function runDiagnosticsForFixture({ fixtureName, limit = 120 }) {
  const rootDir = path.resolve(__dirname, "../../../..");
  const fixturePath = path.join(rootDir, "test-fixtures", "pdf", fixtureName);

  await waitForApiReady();

  const bytes = await fs.readFile(fixturePath);
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "application/pdf" }), fixtureName);

  const extract = await fetchJson(`${apiBase}/api/extractText`, {
    method: "POST",
    body: form,
  });

  const blocks = normalizePagesToBlocks(extract.pages || []);
  const filteredOut = [];
  const keptBlocks = [];

  for (const block of blocks) {
    const reason = getRejectionReason(block);
    if (reason) {
      filteredOut.push({ blockId: block.id, reason, text: block.text });
    } else {
      keptBlocks.push(block);
    }
  }

  const blocksForMapping = keptBlocks.length > 0 ? keptBlocks : blocks;

  const ocrRejections = {};
  for (const item of filteredOut) {
    ocrRejections[item.reason] = (ocrRejections[item.reason] || 0) + 1;
  }

  const mapResult = await fetchJson(`${apiBase}/api/mapFields`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      documentId: fixtureName,
      blocks: blocksForMapping,
      context: "Fixture mapping diagnostics",
      deterministic: false,
      familyId: FAMILY_BY_FIXTURE[fixtureName],
    }),
  });

  const mappings = Array.isArray(mapResult?.mappings) ? mapResult.mappings : [];

  const strict = runPipelineFromMappings(mappings, false, limit);
  const loose = runPipelineFromMappings(mappings, true, limit);

  const reportBase = {
    fixtureName,
    generatedAt: new Date().toISOString(),
    ocr: {
      extractedBlocks: blocks.length,
      keptBlocks: keptBlocks.length,
      filteredBlocks: filteredOut.length,
      usedRawBlocksFallback: keptBlocks.length === 0,
      rejectionReasons: ocrRejections,
    },
    mapping: {
      rawCandidates: mappings.length,
    },
  };

  const strictReport = {
    mode: "strict",
    diagnosticMode: false,
    ...reportBase,
    funnel: {
      candidatesAfterStrictFilter: strict.strictCount,
      candidatesAfterQualitySelection: strict.qualityCount,
      finalAccepted: strict.finalCount,
      usedFallback: strict.usedFallback,
      rejectionReasons: strict.rejectionReasons,
    },
    topCandidatesPerBlock: strict.topCandidatesPerBlock,
    finalMappings: strict.finalMappings,
  };

  const looseReport = {
    mode: "loose",
    diagnosticMode: true,
    ...reportBase,
    funnel: {
      candidatesAfterStrictFilter: loose.strictCount,
      candidatesAfterQualitySelection: loose.qualityCount,
      finalAccepted: loose.finalCount,
      usedFallback: loose.usedFallback,
      rejectionReasons: loose.rejectionReasons,
    },
    topCandidatesPerBlock: loose.topCandidatesPerBlock,
    finalMappings: loose.finalMappings,
  };

  const comparison = {
    fixtureName,
    generatedAt: new Date().toISOString(),
    ocr: strictReport.ocr,
    mappingRawCandidates: mappings.length,
    strictFinalAccepted: strict.finalCount,
    looseFinalAccepted: loose.finalCount,
    deltaFinalAccepted: loose.finalCount - strict.finalCount,
    compatibilityDropEstimate:
      (strict.rejectionReasons.compatibility_mismatch || 0) +
      (strict.rejectionReasons.below_confidence_floor || 0),
    strictUsedFallback: strict.usedFallback,
    looseUsedFallback: loose.usedFallback,
    strictRejectionReasons: strict.rejectionReasons,
    looseRejectionReasons: loose.rejectionReasons,
  };

  return {
    strictReport,
    looseReport,
    comparison,
  };
}

module.exports = {
  runDiagnosticsForFixture,
};
