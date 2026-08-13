const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { pathToFileURL } = require("url");

const rootDir = path.resolve(__dirname, "../..");
const datasetDir = path.join(rootDir, "training-data", "acord-labeled_XFDL", "ground-truth");
const pdfDir = process.argv[2] ? path.resolve(process.argv[2]) : path.join(rootDir, "test-fixtures", "pdf");
const outputPath = process.argv[3]
  ? path.resolve(process.argv[3])
  : path.join(datasetDir, "xfdl-pdf-mapping.json");
const manifestPath = path.join(datasetDir, "manifest.json");
const append = process.argv.includes("--append");

const stopWords = new Set([
  "acord", "application", "commercial", "company", "fillabl", "fillable", "form", "insurance",
  "pdf", "sample", "section", "test", "updated", "xfdl",
]);

function round(value, digits = 4) {
  return Number(Number(value || 0).toFixed(digits));
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function tokens(value) {
  return String(value || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/\br(\d+)\b/g, "$1")
    .replace(/\b0+(\d+)\b/g, "$1")
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((token) => token && !stopWords.has(token));
}

function diceSimilarity(left, right) {
  const a = new Set(tokens(left));
  const b = new Set(tokens(right));
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return (2 * intersection) / (a.size + b.size);
}

function formIdentity(value) {
  const normalized = String(value || "").toLowerCase();
  const acord = normalized.match(/acord[^0-9]{0,4}0*(\d{2,4})\b/i);
  const states = [...normalized.matchAll(/(?:^|[\s_-])(ca|fl|ny)(?:[\s_.-]|$)/gi)].map((match) => match[1].toUpperCase());
  return {
    acordNumber: acord ? String(Number(acord[1])) : null,
    states: [...new Set(states)],
  };
}

function terminalFieldName(fieldName) {
  const cleaned = String(fieldName || "").replace(/\[\d+\]/g, "");
  const segments = cleaned.split(/[/.]/).filter(Boolean);
  return (segments.at(-1) || cleaned).toLowerCase();
}

function pageDimensions(dataset, pageIndex) {
  const page = dataset.pages[pageIndex];
  if (!page) return null;
  const dpi = Number(page.dpi) || 120;
  const printWidth = Number(page.printSize?.[0]);
  const printHeight = Number(page.printSize?.[1]);
  const fields = dataset.fields.filter((field) => field.pageIndex === pageIndex && field.geometry);
  return {
    width: Number(page.width) || (printWidth > 0 ? printWidth * dpi : Math.max(1, ...fields.map((field) => field.geometry.x + field.geometry.width))),
    height: Number(page.height) || (printHeight > 0 ? printHeight * dpi : Math.max(1, ...fields.map((field) => field.geometry.y + field.geometry.height))),
  };
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function compareGeometry(dataset, pdf) {
  const xfdlBySid = new Map(dataset.fields.map((field) => [field.sid.toLowerCase(), field]));
  const shared = pdf.widgets
    .map((widget) => ({ widget, field: xfdlBySid.get(terminalFieldName(widget.fieldName)) }))
    .filter((entry) => entry.field && entry.field.geometry && entry.widget.rect?.length === 4);
  if (!shared.length) {
    return { sharedFieldCount: 0, score: 0, normalizedRmse: null, translation: null };
  }

  const samples = [];
  for (const { widget, field } of shared) {
    const pdfPage = pdf.pages[widget.page - 1];
    const xfdlSize = pageDimensions(dataset, field.pageIndex);
    if (!pdfPage || !xfdlSize) continue;
    const [x1, y1, x2, y2] = widget.rect;
    const pdfX = Math.min(x1, x2) / pdfPage.width;
    const pdfY = (pdfPage.height - Math.max(y1, y2)) / pdfPage.height;
    const pdfWidth = Math.abs(x2 - x1) / pdfPage.width;
    const pdfHeight = Math.abs(y2 - y1) / pdfPage.height;
    const xfdlX = field.geometry.x / xfdlSize.width;
    const xfdlY = field.geometry.y / xfdlSize.height;
    const xfdlWidth = field.geometry.width / xfdlSize.width;
    const xfdlHeight = field.geometry.height / xfdlSize.height;
    samples.push({ pdfX, pdfY, pdfWidth, pdfHeight, xfdlX, xfdlY, xfdlWidth, xfdlHeight });
  }
  const translationX = median(samples.map((sample) => sample.xfdlX - sample.pdfX));
  const translationY = median(samples.map((sample) => sample.xfdlY - sample.pdfY));
  const squaredErrors = samples.flatMap((sample) => [
    (sample.pdfX + translationX - sample.xfdlX) ** 2,
    (sample.pdfY + translationY - sample.xfdlY) ** 2,
    (sample.pdfWidth - sample.xfdlWidth) ** 2,
    (sample.pdfHeight - sample.xfdlHeight) ** 2,
  ]);
  const rmse = Math.sqrt(squaredErrors.reduce((sum, value) => sum + value, 0) / squaredErrors.length);
  return {
    sharedFieldCount: samples.length,
    score: round(Math.exp(-rmse * 30)),
    normalizedRmse: round(rmse, 6),
    translation: { x: round(translationX, 6), y: round(translationY, 6) },
  };
}

function compareFieldNames(dataset, pdf) {
  const xfdlNames = new Set(dataset.fields.map((field) => field.sid.toLowerCase()));
  const pdfNames = new Set(pdf.widgets.map((widget) => terminalFieldName(widget.fieldName)).filter(Boolean));
  let shared = 0;
  for (const name of xfdlNames) if (pdfNames.has(name)) shared += 1;
  return {
    xfdlFieldCount: xfdlNames.size,
    pdfWidgetNameCount: pdfNames.size,
    sharedFieldCount: shared,
    xfdlCoverage: round(shared / Math.max(1, xfdlNames.size)),
    pdfCoverage: round(shared / Math.max(1, pdfNames.size)),
    score: round(shared / Math.max(1, Math.min(xfdlNames.size, pdfNames.size))),
  };
}

function broadFieldType(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "btn" || normalized === "checkbox") return "checkbox";
  return "text";
}

function compareLayoutGeometry(dataset, pdf, enabled) {
  if (!enabled || !pdf.widgets.length) {
    return { available: false, score: 0, medianDistance: null, comparedPages: 0 };
  }
  const pageScores = [];
  const commonPageCount = Math.min(dataset.pages.length, pdf.pages.length);
  for (let pageIndex = 0; pageIndex < commonPageCount; pageIndex += 1) {
    const xfdlSize = pageDimensions(dataset, pageIndex);
    const pdfPage = pdf.pages[pageIndex];
    const xfdlPoints = dataset.fields
      .filter((field) => field.pageIndex === pageIndex && field.geometry)
      .map((field) => ({
        type: broadFieldType(field.fieldType),
        x: (field.geometry.x + field.geometry.width / 2) / xfdlSize.width,
        y: (field.geometry.y + field.geometry.height / 2) / xfdlSize.height,
        width: field.geometry.width / xfdlSize.width,
        height: field.geometry.height / xfdlSize.height,
      }));
    const pdfPoints = pdf.widgets
      .filter((widget) => widget.page === pageIndex + 1 && widget.rect?.length === 4)
      .map((widget) => {
        const [x1, y1, x2, y2] = widget.rect;
        return {
          type: broadFieldType(widget.fieldType),
          x: (Math.min(x1, x2) + Math.abs(x2 - x1) / 2) / pdfPage.width,
          y: (pdfPage.height - Math.max(y1, y2) + Math.abs(y2 - y1) / 2) / pdfPage.height,
          width: Math.abs(x2 - x1) / pdfPage.width,
          height: Math.abs(y2 - y1) / pdfPage.height,
        };
      });
    if (!xfdlPoints.length || !pdfPoints.length) continue;
    const translationX = median(xfdlPoints.map((point) => point.x)) - median(pdfPoints.map((point) => point.x));
    const translationY = median(xfdlPoints.map((point) => point.y)) - median(pdfPoints.map((point) => point.y));
    const nearestDistances = xfdlPoints.map((left) => {
      let nearest = Number.POSITIVE_INFINITY;
      for (const right of pdfPoints) {
        if (left.type !== right.type) continue;
        const distance =
          Math.abs(left.x - (right.x + translationX)) +
          Math.abs(left.y - (right.y + translationY)) +
          Math.abs(left.width - right.width) * 0.5 +
          Math.abs(left.height - right.height) * 0.5;
        nearest = Math.min(nearest, distance);
      }
      return nearest;
    }).filter(Number.isFinite);
    if (!nearestDistances.length) continue;
    const medianDistance = median(nearestDistances);
    const countRatio = Math.min(xfdlPoints.length, pdfPoints.length) / Math.max(xfdlPoints.length, pdfPoints.length);
    pageScores.push({
      distance: medianDistance,
      score: Math.exp(-medianDistance * 24) * Math.sqrt(countRatio),
    });
  }
  if (!pageScores.length) {
    return { available: false, score: 0, medianDistance: null, comparedPages: 0 };
  }
  const pageCoverage = commonPageCount / Math.max(dataset.pages.length, pdf.pages.length);
  return {
    available: true,
    score: round((pageScores.reduce((sum, page) => sum + page.score, 0) / pageScores.length) * pageCoverage),
    medianDistance: round(median(pageScores.map((page) => page.distance)), 6),
    comparedPages: pageScores.length,
    pageCoverage: round(pageCoverage),
    provenance: "page-normalized-nearest-field-layout",
  };
}

function metadataEvidence(dataset, pdf) {
  const xfdlText = [
    dataset.source.fileName,
    dataset.form.identifier,
    dataset.form.edition,
    dataset.form.formName,
    dataset.form.title,
  ].filter(Boolean).join(" ");
  const pdfText = [
    pdf.fileName,
    pdf.metadata.Title,
    pdf.metadata.Subject,
    pdf.metadata.Keywords,
    ...pdf.pages.slice(0, 2).map((page) => page.text.slice(0, 1000)),
  ].filter(Boolean).join(" ");
  const xfdlTokens = new Set(tokens(xfdlText));
  const pdfTokens = new Set(tokens(pdfText));
  let shared = 0;
  for (const token of xfdlTokens) if (pdfTokens.has(token)) shared += 1;
  return round(shared / Math.max(1, xfdlTokens.size));
}

function scorePair(dataset, pdf) {
  const xfdlIdentity = formIdentity(`${dataset.source.fileName} ${dataset.form.identifier || ""} ${dataset.form.formName || ""}`);
  const pdfIdentity = formIdentity(`${pdf.fileName} ${pdf.metadata.Title || ""} ${pdf.pages[0]?.text || ""}`);
  const sameAcordNumber = Boolean(xfdlIdentity.acordNumber && xfdlIdentity.acordNumber === pdfIdentity.acordNumber);
  const differentAcordNumber = Boolean(xfdlIdentity.acordNumber && pdfIdentity.acordNumber && xfdlIdentity.acordNumber !== pdfIdentity.acordNumber);
  const stateConflict = Boolean(
    sameAcordNumber && xfdlIdentity.states.length && pdfIdentity.states.length &&
    !xfdlIdentity.states.some((state) => pdfIdentity.states.includes(state)),
  );
  const filenameScore = diceSimilarity(dataset.source.fileName, pdf.fileName);
  const metadataScore = metadataEvidence(dataset, pdf);
  const pageDifference = Math.abs(dataset.pages.length - pdf.numPages);
  const pageScore = pageDifference === 0 ? 1 : Math.max(0, 1 - pageDifference / Math.max(dataset.pages.length, pdf.numPages));
  const fieldNames = compareFieldNames(dataset, pdf);
  const geometry = compareGeometry(dataset, pdf);
  const layoutGeometry = compareLayoutGeometry(
    dataset,
    pdf,
    fieldNames.sharedFieldCount < 10 && (sameAcordNumber || filenameScore >= 0.45),
  );
  const fieldCountScore = pdf.widgets.length
    ? Math.min(dataset.fields.length, pdf.widgets.length) / Math.max(dataset.fields.length, pdf.widgets.length)
    : 0;
  let score;
  if (pdf.widgets.length && fieldNames.sharedFieldCount >= 10) {
    score = filenameScore * 0.25 + metadataScore * 0.1 + pageScore * 0.15 + fieldNames.score * 0.3 + geometry.score * 0.15 + fieldCountScore * 0.05;
  } else if (pdf.widgets.length) {
    score = filenameScore * 0.3 + metadataScore * 0.1 + pageScore * 0.15 + layoutGeometry.score * 0.25 + fieldCountScore * 0.1;
  } else {
    score = filenameScore * 0.55 + metadataScore * 0.2 + pageScore * 0.25;
  }
  if (sameAcordNumber) score += 0.18;
  if (differentAcordNumber) score -= 0.3;
  if (stateConflict) score -= 0.5;
  score = Math.max(0, Math.min(1, score));
  return {
    pdfFile: pdf.fileName,
    score: round(score),
    hardConflict: differentAcordNumber || stateConflict,
    evidence: {
      filenameSimilarity: round(filenameScore),
      metadataSimilarity: metadataScore,
      sameAcordNumber,
      stateConflict,
      pageCount: { xfdl: dataset.pages.length, pdf: pdf.numPages, exact: pageDifference === 0, score: round(pageScore) },
      fields: fieldNames,
      geometry,
      layoutGeometry,
      pdfWidgetCount: pdf.widgets.length,
      fieldCountScore: round(fieldCountScore),
    },
  };
}

async function loadPdfs() {
  console.warn = () => {};
  const pdfjsPath = path.join(rootDir, "frontend", "node_modules", "pdfjs-dist", "legacy", "build", "pdf.mjs");
  const pdfjs = await import(pathToFileURL(pdfjsPath).href);
  const pdfFiles = fs.readdirSync(pdfDir).filter((name) => path.extname(name).toLowerCase() === ".pdf").sort();
  const pdfs = [];
  for (const fileName of pdfFiles) {
    const fullPath = path.join(pdfDir, fileName);
    const bytes = new Uint8Array(fs.readFileSync(fullPath));
    const document = await pdfjs.getDocument({ data: bytes, disableWorker: true, verbosity: 0 }).promise;
    const metadata = await document.getMetadata().catch(() => ({}));
    const pages = [];
    const widgets = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const annotations = await page.getAnnotations();
      for (const annotation of annotations) {
        if (annotation.subtype === "Widget") {
          widgets.push({
            page: pageNumber,
            fieldName: annotation.fieldName || null,
            fieldType: annotation.fieldType || null,
            rect: annotation.rect || null,
          });
        }
      }
      let text = "";
      if (pageNumber <= 2) {
        const textContent = await page.getTextContent();
        text = textContent.items.map((item) => item.str).join(" ").replace(/\s+/g, " ").trim();
      }
      pages.push({
        number: pageNumber,
        width: round(viewport.width, 2),
        height: round(viewport.height, 2),
        rotation: viewport.rotation,
        text,
      });
    }
    pdfs.push({
      fileName,
      relativePath: path.relative(rootDir, fullPath).replace(/\\/g, "/"),
      bytes: bytes.length,
      sha256: sha256(fullPath),
      numPages: document.numPages,
      metadata: metadata.info || {},
      pages,
      widgets,
    });
  }
  return pdfs;
}

function classifyMatch(best, second) {
  if (!best || best.hardConflict) return { status: "unmatched", confidence: "none" };
  if (best.score < 0.48) {
    return best.evidence.sameAcordNumber && best.score >= 0.35
      ? { status: "review", confidence: "low" }
      : { status: "unmatched", confidence: "none" };
  }
  const margin = best.score - (second?.score || 0);
  const strongFields = best.evidence.fields.score >= 0.75 && best.evidence.geometry.score >= 0.75;
  const exactIdentity = best.evidence.sameAcordNumber || best.evidence.filenameSimilarity >= 0.75;
  if (best.score >= 0.82 && margin >= 0.2 && (strongFields || (exactIdentity && best.evidence.pageCount.exact))) {
    return { status: "matched", confidence: "high" };
  }
  if (best.score >= 0.62 && margin >= 0.12) return { status: "matched", confidence: "medium" };
  return { status: "review", confidence: "low" };
}

async function main() {
  if (!fs.existsSync(manifestPath)) throw new Error(`Ground-truth manifest not found: ${manifestPath}`);
  if (!fs.existsSync(pdfDir)) throw new Error(`PDF directory not found: ${pdfDir}`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const datasets = manifest.forms.map((entry) => JSON.parse(fs.readFileSync(path.join(datasetDir, entry.datasetFile), "utf8")));
  const pdfs = await loadPdfs();
  const existingOutput = append && fs.existsSync(outputPath)
    ? JSON.parse(fs.readFileSync(outputPath, "utf8"))
    : null;
  const existingMappings = Array.isArray(existingOutput?.mappings) ? existingOutput.mappings : [];
  const knownXfdlHashes = new Set(existingMappings.map((entry) => entry.xfdlSha256));
  const mappings = [...existingMappings];
  const assignedPdfs = new Set(existingMappings.map((entry) => entry.pdfFile).filter(Boolean));
  const datasetsToPair = append
    ? datasets.filter((dataset) => !knownXfdlHashes.has(dataset.source.sha256))
    : datasets;

  const rankedForms = datasetsToPair.map((dataset) => ({
    dataset,
    candidates: pdfs.map((pdf) => scorePair(dataset, pdf)).sort((left, right) => right.score - left.score),
  })).sort((left, right) => right.candidates[0].score - left.candidates[0].score);

  for (const { dataset, candidates } of rankedForms) {
    const available = candidates.filter((candidate) => !assignedPdfs.has(candidate.pdfFile));
    const best = available[0] || null;
    const second = available[1] || null;
    const classification = classifyMatch(best, second);
    const matched = classification.status !== "unmatched" && best;
    if (matched) assignedPdfs.add(best.pdfFile);
    const notes = [];
    if (!matched) notes.push("No non-conflicting PDF candidate passed the minimum evidence threshold.");
    if (matched && !best.evidence.pageCount.exact) notes.push(`Page-count mismatch: XFDL ${best.evidence.pageCount.xfdl}, PDF ${best.evidence.pageCount.pdf}.`);
    if (matched && classification.status === "review" && best.evidence.sameAcordNumber) {
      notes.push("ACORD form number matches, but edition/layout evidence is insufficient for exact equivalence; manual review is required.");
    }
    if (matched && best.evidence.pdfWidgetCount === 0) notes.push("PDF has no AcroForm widgets; field-name and widget-geometry comparison is unavailable.");
    if (matched && best.evidence.fields.sharedFieldCount === 0 && best.evidence.pdfWidgetCount > 0) {
      notes.push(
        best.evidence.layoutGeometry.available
          ? "PDF widget names do not use XFDL semantic SIDs; page-normalized field-layout geometry was used instead."
          : "PDF widget names do not use XFDL semantic SIDs; geometry could not be compared by shared field identity.",
      );
    }
    mappings.push({
      xfdlFile: dataset.source.fileName,
      xfdlDatasetFile: path.basename(dataset.source.relativePath).toLowerCase().endsWith(".xfdl")
        ? manifest.forms.find((entry) => entry.sourceFile === dataset.source.fileName)?.datasetFile || null
        : null,
      xfdlSha256: dataset.source.sha256,
      pdfFile: matched ? best.pdfFile : null,
      pdfRelativePath: matched ? pdfs.find((pdf) => pdf.fileName === best.pdfFile).relativePath : null,
      pdfSha256: matched ? pdfs.find((pdf) => pdf.fileName === best.pdfFile).sha256 : null,
      status: classification.status,
      confidence: classification.confidence,
      score: matched ? best.score : null,
      scoreMargin: matched ? round(best.score - (second?.score || 0)) : null,
      evidence: matched ? best.evidence : null,
      notes,
      topCandidates: candidates.slice(0, 3).map((candidate) => ({
        pdfFile: candidate.pdfFile,
        score: candidate.score,
        hardConflict: candidate.hardConflict,
        pageCountExact: candidate.evidence.pageCount.exact,
        sharedFieldCount: candidate.evidence.fields.sharedFieldCount,
        geometryScore: candidate.evidence.geometry.score,
        layoutGeometryScore: candidate.evidence.layoutGeometry.score,
      })),
    });
  }

  mappings.sort((left, right) => left.xfdlFile.localeCompare(right.xfdlFile));
  const unmatchedPdfs = pdfs.filter((pdf) => !assignedPdfs.has(pdf.fileName)).map((pdf) => ({
    pdfFile: pdf.fileName,
    relativePath: pdf.relativePath,
    sha256: pdf.sha256,
    pageCount: pdf.numPages,
    widgetCount: pdf.widgets.length,
  }));
  const output = {
    schemaVersion: "xfdl-pdf-mapping.v1",
    generatedAt: new Date().toISOString(),
    source: {
      xfdlManifest: path.relative(rootDir, manifestPath).replace(/\\/g, "/"),
      pdfDirectory: path.relative(rootDir, pdfDir).replace(/\\/g, "/"),
      xfdlCount: datasets.length,
      pdfCount: pdfs.length,
    },
    methodology: {
      signals: ["filename similarity", "form metadata and first-page text", "page count", "exact widget/SID overlap", "affine-normalized field geometry"],
      assignment: "One PDF may be assigned to at most one XFDL. ACORD form-number and jurisdiction conflicts are hard exclusions.",
      confidence: "High requires strong unique evidence; medium allows edition or metadata drift; review indicates a plausible but weak pair; unmatched means no candidate passed threshold.",
    },
    summary: {
      matched: mappings.filter((item) => item.status === "matched").length,
      review: mappings.filter((item) => item.status === "review").length,
      unmatchedXfdl: mappings.filter((item) => item.status === "unmatched").length,
      unmatchedPdf: unmatchedPdfs.length,
      highConfidence: mappings.filter((item) => item.confidence === "high").length,
      mediumConfidence: mappings.filter((item) => item.confidence === "medium").length,
      lowConfidence: mappings.filter((item) => item.confidence === "low").length,
      appendedXfdl: datasetsToPair.length,
    },
    mappings,
    unmatchedPdfs,
  };
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
