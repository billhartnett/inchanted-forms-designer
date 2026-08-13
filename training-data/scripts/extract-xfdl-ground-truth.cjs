const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const zlib = require("zlib");

const rootDir = path.resolve(__dirname, "../..");
const sourceDir = process.argv[2] ? path.resolve(process.argv[2]) : path.join(rootDir, "training-data");
const outputDir = process.argv[3]
  ? path.resolve(process.argv[3])
  : path.join(rootDir, "training-data", "acord-labeled_XFDL", "ground-truth");
const schemaVersion = "xfdl-ground-truth.v1";
const append = process.argv.includes("--append");
const fillableTags = new Set(["field", "check"]);
const presentationTags = new Set(["label", "line", "box", "spacer", "image"]);
const operationalTags = new Set(["button"]);

function decodeXml(value) {
  return String(value || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number(decimal)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function textValue(value) {
  return decodeXml(String(value || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function attrValue(attributes, name) {
  const match = String(attributes || "").match(new RegExp(`\\b${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i"));
  return match ? decodeXml(match[2]) : null;
}

function elementBody(body, tag) {
  const match = String(body || "").match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? match[1] : null;
}

function elementRecord(body, tag) {
  const match = String(body || "").match(new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)<\\/${tag}>`, "i"));
  if (!match) return null;
  return { attributes: match[1], body: match[2] };
}

function directAeValues(body) {
  const values = [];
  const regex = /<ae(?:\s[^>]*)?>([\s\S]*?)<\/ae>/gi;
  let match;
  while ((match = regex.exec(String(body || ""))) !== null) {
    if (!/<ae\b/i.test(match[1])) values.push(textValue(match[1]));
  }
  return values;
}

function parseLocation(body) {
  const location = elementBody(body, "itemlocation");
  if (!location) return null;
  const operation = (name, argumentCount) => {
    const argumentsPattern = Array.from(
      { length: argumentCount },
      () => "\\s*<ae(?:\\s[^>]*)?>([^<]*)<\\/ae>",
    ).join("");
    const match = location.match(
      new RegExp(
        `<ae(?:\\s[^>]*)?>\\s*<ae(?:\\s[^>]*)?>${name}<\\/ae>${argumentsPattern}\\s*<\\/ae>`,
        "i",
      ),
    );
    if (!match) return [];
    return match.slice(1).map((value) => {
      const normalized = textValue(value);
      const number = Number(normalized);
      return normalized !== "" && Number.isFinite(number) ? number : normalized;
    });
  };
  const absolute = operation("absolute", 2);
  const extent = operation("extent", 2);
  const page = operation("page", 1);
  const within = operation("within", 1);
  const operations = [
    ["absolute", absolute],
    ["extent", extent],
    ["page", page],
    ["within", within],
  ].filter(([, args]) => args.length).map(([operationName, args]) => ({ operation: operationName, args }));
  return {
    x: Number.isFinite(absolute[0]) ? absolute[0] : null,
    y: Number.isFinite(absolute[1]) ? absolute[1] : null,
    width: Number.isFinite(extent[0]) ? extent[0] : null,
    height: Number.isFinite(extent[1]) ? extent[1] : null,
    page: Number.isFinite(page[0]) ? page[0] : null,
    within: within[0] == null ? null : String(within[0]),
    operations,
    coordinateSystem: "xfdl-layout-units",
    provenance: "explicit",
  };
}

function parseState(body, tag, defaultValue = null) {
  const record = elementRecord(body, tag);
  if (!record) return { initial: defaultValue, expression: null, explicit: false };
  return {
    initial: textValue(record.body) || defaultValue,
    expression: attrValue(record.attributes, "compute"),
    explicit: true,
  };
}

function parseFormat(body) {
  const format = elementBody(body, "format");
  if (!format) return null;
  const values = directAeValues(format);
  return {
    dataType: values[0] || null,
    requirement: values[1] || null,
    presentation: textValue(elementBody(format, "presentation")),
    rawValues: values,
    provenance: "explicit",
  };
}

function normalizeFieldType(tag, body, sid) {
  if (tag === "check") return "checkbox";
  const explicit = textValue(elementBody(body, "fieldtype")).toLowerCase();
  const format = parseFormat(body);
  const typeText = `${explicit} ${format?.dataType || ""} ${format?.presentation || ""} ${sid}`.toLowerCase();
  if (/signature/.test(typeText)) return "signature";
  if (/date|mm\/dd|yyyy/.test(typeText)) return "date";
  if (/currency|money|amount|decimal|integer|number|numeric|percent/.test(typeText)) return "numeric";
  if (/combo|drop|select|choice|list/.test(typeText)) return "dropdown";
  return "text";
}

function semanticParts(sid) {
  const match = String(sid || "").match(/^(.*)_([A-Z]{1,3}|\d+)$/);
  const semanticPath = match ? match[1] : sid;
  const repeatKey = match ? match[2] : null;
  const family = String(semanticPath || "").split("_")[0] || null;
  return { semanticPath, repeatKey, family, mapped: !/^unmapped_/i.test(sid) };
}

function parsePages(xml) {
  const pages = [];
  const regex = /<page\b([^>]*)>([\s\S]*?)<\/page>/gi;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    const sid = attrValue(match[1], "sid") || `page-${pages.length + 1}`;
    const numberMatch = sid.match(/(\d+)/);
    const global = elementBody(match[2], "global") || "";
    const printSize = textValue(elementBody(global, "vfd_printsize"));
    pages.push({
      sid,
      index: pages.length,
      number: numberMatch ? Number(numberMatch[1]) : pages.length + 1,
      width: Number(attrValue(match[1], "width")) || null,
      height: Number(attrValue(match[1], "height")) || null,
      pageSize: textValue(elementBody(global, "vfd_pagesize")) || null,
      dpi: Number(textValue(elementBody(global, "vfd_pagedpi"))) || null,
      printSize: printSize ? printSize.split(";").map(Number) : null,
      startOffset: match.index,
      endOffset: regex.lastIndex,
    });
  }
  return pages;
}

function pageForOffset(offset, pages) {
  return pages.find((page) => offset >= page.startOffset && offset < page.endOffset) || null;
}

function parseHelp(xml) {
  const help = new Map();
  const regex = /<help\b([^>]*)>([\s\S]*?)<\/help>/gi;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    const sid = attrValue(match[1], "sid");
    if (sid) help.set(sid, textValue(elementBody(match[2], "value")));
  }
  return help;
}

function parseBindings(xml) {
  const bindings = [];
  const regex = /<bind\b([^>]*)>([\s\S]*?)<\/bind>/gi;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    const dataPath = textValue(elementBody(match[2], "ref"));
    const boundOption = textValue(elementBody(match[2], "boundoption"));
    const optionMatch = boundOption.match(/(?:^|\.)([^.]+)\.(?:value|activated|selection)$/i);
    const pathNames = [...dataPath.matchAll(/\[[^:\]]+:([^\]]+)\]/g)].map((item) => item[1]);
    bindings.push({
      dataPath: dataPath || null,
      boundOption: boundOption || null,
      fieldSid: optionMatch?.[1] || pathNames.at(-1) || null,
      instancePath: pathNames,
      provenance: "explicit",
    });
  }
  return bindings;
}

function parseControls(xml, pages, helpMap, bindingMap) {
  const controls = [];
  const regex = /<(field|check|button|label|line|box|spacer|image)\b([^>]*\bsid\s*=\s*(["'])[^"']+\3[^>]*)>([\s\S]*?)<\/\1>/gi;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    const tag = match[1].toLowerCase();
    const sid = attrValue(match[2], "sid");
    const body = match[4] || "";
    const page = pageForOffset(match.index, pages);
    const geometry = parseLocation(body);
    const helpSid = textValue(elementBody(body, "help")) || null;
    const value = textValue(elementBody(body, "value"));
    const visible = parseState(body, "visible", "on");
    const readonly = parseState(body, "readonly", "off");
    const active = parseState(body, "active", "on");
    const semantic = semanticParts(sid);
    const binding = bindingMap.get(sid) || null;
    const isFillable = fillableTags.has(tag);
    const suppressionReasons = [];
    if (presentationTags.has(tag)) suppressionReasons.push("presentation-element");
    if (operationalTags.has(tag)) suppressionReasons.push("operational-control");
    if (visible.initial && /^(off|false|0)$/i.test(visible.initial)) suppressionReasons.push("hidden-by-default");
    if (readonly.initial && /^(on|true|1)$/i.test(readonly.initial)) suppressionReasons.push("readonly-by-default");
    controls.push({
      sid,
      tag,
      role: isFillable ? "fillable-field" : tag === "label" ? "semantic-label-anchor" : "presentation",
      pageIndex: page?.index ?? null,
      pageNumber: geometry?.page ?? page?.number ?? null,
      pageSid: page?.sid ?? null,
      geometry,
      value: value || null,
      imageRef: textValue(elementBody(body, "image")) || null,
      helpSid,
      helpText: helpSid ? helpMap.get(helpSid) || null : null,
      nextSid: textValue(elementBody(body, "next")) || null,
      fieldType: isFillable ? normalizeFieldType(tag, body, sid) : null,
      sourceFieldType: textValue(elementBody(body, "fieldtype")) || tag,
      format: parseFormat(body),
      semantic: isFillable ? semantic : null,
      binding,
      behavior: { visible, readonly, active },
      suppression: {
        excludedFromFillableGroundTruth: !isFillable,
        suppressedByDefault: suppressionReasons.some((reason) => reason.endsWith("by-default")),
        conditional: Boolean(visible.expression || readonly.expression || active.expression),
        reasons: suppressionReasons,
        provenance: suppressionReasons.length ? "explicit-rule" : "none",
      },
      sourceOffset: match.index,
    });
  }
  return controls;
}

function center(geometry) {
  if (!geometry || !Number.isFinite(geometry.x) || !Number.isFinite(geometry.y)) return null;
  return {
    x: geometry.x + (Number.isFinite(geometry.width) ? geometry.width / 2 : 0),
    y: geometry.y + (Number.isFinite(geometry.height) ? geometry.height / 2 : 0),
  };
}

function semanticTokens(value) {
  const stopWords = new Set([
    "a", "an", "and", "as", "at", "box", "code", "enter", "field", "for", "if", "in", "is",
    "name", "number", "of", "on", "or", "the", "this", "to", "value",
  ]);
  return String(value || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1 && !stopWords.has(token));
}

function rectangleDistance(left, right) {
  const leftRight = left.x + (left.width || 0);
  const rightRight = right.x + (right.width || 0);
  const leftBottom = left.y + (left.height || 0);
  const rightBottom = right.y + (right.height || 0);
  return {
    dx: Math.max(0, left.x - rightRight, right.x - leftRight),
    dy: Math.max(0, left.y - rightBottom, right.y - leftBottom),
  };
}

function associateLabels(fields, labels) {
  for (const field of fields) {
    const fieldCenter = center(field.geometry);
    if (!fieldCenter) {
      field.label = { visualLabelSid: null, visualLabel: null, helpLabel: field.helpText, confidence: 0, provenance: "unresolved" };
      continue;
    }
    const evidenceTokens = new Set([
      ...semanticTokens(field.sid),
      ...semanticTokens(field.helpText),
    ]);
    const candidates = labels
      .filter((label) => label.pageIndex === field.pageIndex && label.value && center(label.geometry))
      .map((label) => {
        const { dx, dy } = rectangleDistance(field.geometry, label.geometry);
        const labelTokens = semanticTokens(label.value);
        const overlap = labelTokens.filter((token) => evidenceTokens.has(token));
        const belowPenalty = label.geometry.y > field.geometry.y + (field.geometry.height || 0) ? 60 : 0;
        const longPenalty = label.value.length > 160 ? 120 : 0;
        const lexicalBoost = Math.min(3, overlap.length) * 105;
        return {
          label,
          score: dx * 0.4 + dy * 1.7 + belowPenalty + longPenalty - lexicalBoost,
          dx,
          dy,
          overlap,
        };
      })
      .filter((candidate) => candidate.dx <= 180 && candidate.dy <= 130 && candidate.overlap.length > 0)
      .sort((left, right) => left.score - right.score);
    const best = candidates[0];
    field.label = {
      visualLabelSid: best?.label.sid || null,
      visualLabel: best?.label.value || null,
      visualLabelGeometry: best?.label.geometry || null,
      helpLabel: field.helpText,
      confidence: best
        ? Number(Math.max(0.35, Math.min(0.98, 0.58 + best.overlap.length * 0.12 - Math.max(0, best.score) / 900)).toFixed(3))
        : 0,
      provenance: best ? "spatial-inference" : field.helpText ? "help-text-only" : "unresolved",
    };
  }
}

function clusterRows(fields) {
  const rows = [];
  const sorted = fields.filter((field) => center(field.geometry)).sort((a, b) => center(a.geometry).y - center(b.geometry).y || center(a.geometry).x - center(b.geometry).x);
  for (const field of sorted) {
    const fieldCenter = center(field.geometry);
    const tolerance = Math.max(5, Math.min(14, (field.geometry.height || 12) * 0.65));
    let row = rows.find((candidate) => Math.abs(candidate.centerY - fieldCenter.y) <= tolerance);
    if (!row) {
      row = { centerY: fieldCenter.y, fields: [] };
      rows.push(row);
    }
    row.fields.push(field);
    row.centerY = row.fields.reduce((sum, item) => sum + center(item.geometry).y, 0) / row.fields.length;
  }
  return rows.map((row, rowIndex) => ({
    rowIndex,
    y: Number(row.centerY.toFixed(3)),
    fieldSids: row.fields.sort((a, b) => a.geometry.x - b.geometry.x).map((field) => field.sid),
    xAnchors: row.fields.map((field) => Number(field.geometry.x.toFixed(3))).sort((a, b) => a - b),
  }));
}

function alignedColumns(left, right) {
  const tolerance = 18;
  const matches = left.xAnchors.filter((x) => right.xAnchors.some((other) => Math.abs(x - other) <= tolerance)).length;
  return matches / Math.max(left.xAnchors.length, right.xAnchors.length) >= 0.5;
}

function inferTables(fields, pageIndex) {
  const rows = clusterRows(fields).filter((row) => row.fieldSids.length >= 2);
  const runs = [];
  let run = [];
  for (const row of rows) {
    const previous = run.at(-1);
    const close = previous && row.y - previous.y <= 90;
    if (!previous || (close && alignedColumns(previous, row))) run.push(row);
    else {
      if (run.length >= 2) runs.push(run);
      run = [row];
    }
  }
  if (run.length >= 2) runs.push(run);
  return runs.map((tableRows, tableIndex) => {
    const xValues = tableRows.flatMap((row) => row.xAnchors).sort((a, b) => a - b);
    const columns = [];
    for (const x of xValues) {
      const column = columns.find((candidate) => Math.abs(candidate.x - x) <= 18);
      if (column) {
        column.values.push(x);
        column.x = column.values.reduce((sum, value) => sum + value, 0) / column.values.length;
      } else columns.push({ x, values: [x] });
    }
    const tableId = `page-${pageIndex + 1}-table-${tableIndex + 1}`;
    const cells = [];
    tableRows.forEach((row, rowIndex) => {
      row.fieldSids.forEach((fieldSid) => {
        const field = fields.find((candidate) => candidate.sid === fieldSid);
        const columnIndex = columns.reduce((best, column, index) => Math.abs(column.x - field.geometry.x) < Math.abs(columns[best].x - field.geometry.x) ? index : best, 0);
        cells.push({ fieldSid, rowIndex, columnIndex });
        field.tableCell = { tableId, rowIndex, columnIndex, provenance: "spatial-inference" };
      });
    });
    return {
      id: tableId,
      pageIndex,
      rowCount: tableRows.length,
      columnCount: columns.length,
      rows: tableRows.map((row, index) => ({ index, y: row.y, fieldSids: row.fieldSids })),
      columns: columns.map((column, index) => ({ index, x: Number(column.x.toFixed(3)) })),
      cells,
      confidence: Number(Math.min(0.95, 0.55 + tableRows.length * 0.04).toFixed(3)),
      provenance: "spatial-inference",
    };
  });
}

function inferGroups(fields) {
  const containerGroups = new Map();
  for (const field of fields) {
    if (!field.geometry?.within) continue;
    const key = `${field.pageIndex}:${field.geometry.within}`;
    if (!containerGroups.has(key)) containerGroups.set(key, []);
    containerGroups.get(key).push(field.sid);
  }
  const explicitGroups = [...containerGroups.entries()].map(([key, fieldSids], index) => {
    const separator = key.indexOf(":");
    return {
      id: `container-group-${index + 1}`,
      type: "xfdl-within-container",
      pageIndex: Number(key.slice(0, separator)),
      containerSid: key.slice(separator + 1),
      fieldSids,
      confidence: 1,
      provenance: "explicit",
    };
  });

  const semanticGroups = new Map();
  for (const field of fields) {
    const key = `${field.pageIndex}:${field.semantic.family || "Unmapped"}`;
    if (!semanticGroups.has(key)) semanticGroups.set(key, []);
    semanticGroups.get(key).push(field.sid);
  }
  const inferredGroups = [...semanticGroups.entries()]
    .filter(([, fieldSids]) => fieldSids.length >= 2)
    .map(([key, fieldSids], index) => {
      const [pageIndex, family] = key.split(":");
      return {
        id: `semantic-group-${index + 1}`,
        type: "semantic-family",
        pageIndex: Number(pageIndex),
        family,
        fieldSids,
        confidence: family === "Unmapped" ? 0.4 : 0.9,
        provenance: "semantic-sid-inference",
      };
    });
  return [...explicitGroups, ...inferredGroups];
}

function metadata(xml, file) {
  return {
    title: textValue(elementBody(elementBody(xml, "formid"), "title")) || null,
    serialNumber: textValue(elementBody(elementBody(xml, "formid"), "serialnumber")) || null,
    version: textValue(elementBody(elementBody(xml, "formid"), "version")) || null,
    publisher: textValue(elementBody(xml, "custom:publisher")) || null,
    distributor: textValue(elementBody(xml, "custom:distributor")) || null,
    identifier: textValue(elementBody(xml, "custom:identifier")) || null,
    edition: textValue(elementBody(xml, "custom:edition")) || null,
    formName: textValue(elementBody(xml, "custom:formname")) || null,
    sourceKind: /^ACORD\s/i.test(file.name) ? "acord" : "carrier",
  };
}

function safeName(fileName) {
  return fileName.replace(/\.[^.]+$/, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
}

function extract(file) {
  const bytes = fs.readFileSync(file.fullPath);
  const sourceText = bytes.toString("latin1");
  const isBase64Gzip = /^application\/vnd\.xfdl;content-encoding=["']?base64-gzip["']?/i.test(sourceText);
  const xmlBytes = isBase64Gzip
    ? zlib.gunzipSync(Buffer.from(sourceText.replace(/^[^\r\n]+[\r\n]+/, "").replace(/\s+/g, ""), "base64"))
    : bytes;
  const xml = xmlBytes.toString("latin1");
  const pages = parsePages(xml);
  const helpMap = parseHelp(xml);
  const bindings = parseBindings(xml);
  const bindingMap = new Map(bindings.filter((binding) => binding.fieldSid).map((binding) => [binding.fieldSid, binding]));
  const controls = parseControls(xml, pages, helpMap, bindingMap);
  const fields = controls.filter((control) => fillableTags.has(control.tag));
  const labels = controls.filter((control) => control.tag === "label").map((label) => ({
    sid: label.sid,
    pageIndex: label.pageIndex,
    pageNumber: label.pageNumber,
    pageSid: label.pageSid,
    value: label.value,
    imageRef: label.imageRef,
    geometry: label.geometry,
    role: "semantic-label-anchor",
    suppression: { excludedFromFillableGroundTruth: true, reason: "label-is-context-not-overlay" },
  }));
  associateLabels(fields, labels);
  const tables = pages.flatMap((page) => inferTables(fields.filter((field) => field.pageIndex === page.index), page.index));
  const groups = inferGroups(fields);
  const suppressedElements = controls.filter((control) => !fillableTags.has(control.tag)).map((control) => ({
    sid: control.sid,
    tag: control.tag,
    pageIndex: control.pageIndex,
    geometry: control.geometry,
    reasons: control.suppression.reasons,
  }));
  const diagnostics = [];
  for (const field of fields) {
    if (!field.sid) diagnostics.push({ severity: "error", code: "FIELD_SID_MISSING" });
    if (field.pageIndex == null) diagnostics.push({ severity: "error", code: "FIELD_PAGE_MISSING", fieldSid: field.sid });
    if (!field.geometry) diagnostics.push({ severity: "warning", code: "FIELD_GEOMETRY_MISSING", fieldSid: field.sid });
    else if (!(field.geometry.width > 0 && field.geometry.height > 0)) diagnostics.push({ severity: "warning", code: "FIELD_EXTENT_INVALID", fieldSid: field.sid });
    if (field.helpSid && !field.helpText) diagnostics.push({ severity: "warning", code: "HELP_REFERENCE_UNRESOLVED", fieldSid: field.sid, helpSid: field.helpSid });
  }
  const boundFieldCount = fields.filter((field) => field.binding).length;
  return {
    schemaVersion,
    generatedAt: new Date().toISOString(),
    source: {
      fileName: file.name,
      relativePath: path.relative(rootDir, file.fullPath).replace(/\\/g, "/"),
      bytes: bytes.length,
      sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
      encoding: "ISO-8859-1",
      containerEncoding: isBase64Gzip ? "base64-gzip" : "plain-xml",
      decodedBytes: xmlBytes.length,
    },
    form: metadata(xml, file),
    pages: pages.map(({ startOffset, endOffset, ...page }) => page),
    fields,
    labels,
    tables,
    groups,
    dataModel: { bindings },
    suppression: {
      policy: "Only XFDL field/check controls are fillable. Labels remain semantic anchors and are never canvas overlays.",
      suppressedElements,
      conditionallySuppressedFieldSids: fields.filter((field) => field.suppression.conditional || field.suppression.suppressedByDefault).map((field) => field.sid),
      unmappedButFillableFieldSids: fields.filter((field) => !field.semantic.mapped).map((field) => field.sid),
    },
    statistics: {
      pageCount: pages.length,
      fieldCount: fields.length,
      fieldTypeCounts: Object.fromEntries([...new Set(fields.map((field) => field.fieldType))].sort().map((type) => [type, fields.filter((field) => field.fieldType === type).length])),
      labelCount: labels.length,
      bindingCount: bindings.length,
      boundFieldCount,
      tableCount: tables.length,
      groupCount: groups.length,
      suppressedElementCount: suppressedElements.length,
      conditionalSuppressionCount: fields.filter((field) => field.suppression.conditional || field.suppression.suppressedByDefault).length,
      unmappedFillableCount: fields.filter((field) => !field.semantic.mapped).length,
      fieldsWithGeometry: fields.filter((field) => field.geometry?.width > 0 && field.geometry?.height > 0).length,
      fieldsWithResolvedLabels: fields.filter((field) => field.label.visualLabel || field.label.helpLabel).length,
    },
    provenance: {
      explicit: ["pages", "fields.sid", "fields.geometry", "fields.format", "fields.binding", "fields.behavior", "fields.helpText", "labels", "dataModel.bindings"],
      inferred: ["fields.fieldType", "fields.semantic", "fields.label.visualLabel", "tables", "groups"],
      note: "Inferred records include confidence and provenance. XFDL compute expressions are preserved, not executed.",
    },
    diagnostics,
  };
}

function main() {
  if (!fs.existsSync(sourceDir)) throw new Error(`Source directory does not exist: ${sourceDir}`);
  const sourceFiles = fs.readdirSync(sourceDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === ".xfdl")
    .map((entry) => ({ name: entry.name, fullPath: path.join(sourceDir, entry.name) }))
    .sort((left, right) => left.name.localeCompare(right.name));
  if (!sourceFiles.length) throw new Error(`No XFDL files found directly in ${sourceDir}`);
  fs.mkdirSync(outputDir, { recursive: true });
  const manifestPath = path.join(outputDir, "manifest.json");
  const existingManifest = append && fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
    : null;
  const existingForms = Array.isArray(existingManifest?.forms) ? existingManifest.forms : [];
  const knownHashes = new Set(existingForms.map((form) => form.sha256));
  const knownDatasetFiles = new Set(existingForms.map((form) => form.datasetFile));
  const forms = [...existingForms];
  let appendedCount = 0;
  for (const file of sourceFiles) {
    const sourceBytes = fs.readFileSync(file.fullPath);
    const sourceHash = crypto.createHash("sha256").update(sourceBytes).digest("hex");
    if (append && knownHashes.has(sourceHash)) continue;
    const dataset = extract(file);
    const outputName = `${safeName(file.name)}.ground-truth.json`;
    if (append && (knownDatasetFiles.has(outputName) || fs.existsSync(path.join(outputDir, outputName)))) {
      throw new Error(`Append would overwrite an existing dataset: ${outputName}`);
    }
    fs.writeFileSync(path.join(outputDir, outputName), `${JSON.stringify(dataset, null, 2)}\n`);
    forms.push({
      sourceFile: file.name,
      datasetFile: outputName,
      sha256: dataset.source.sha256,
      statistics: dataset.statistics,
      diagnosticCounts: {
        errors: dataset.diagnostics.filter((item) => item.severity === "error").length,
        warnings: dataset.diagnostics.filter((item) => item.severity === "warning").length,
      },
    });
    knownHashes.add(dataset.source.sha256);
    knownDatasetFiles.add(outputName);
    appendedCount += 1;
  }
  forms.sort((left, right) => left.sourceFile.localeCompare(right.sourceFile));
  const manifest = {
    schemaVersion,
    generatedAt: new Date().toISOString(),
    sourceDirectory: path.relative(rootDir, sourceDir).replace(/\\/g, "/"),
    outputDirectory: path.relative(rootDir, outputDir).replace(/\\/g, "/"),
    formCount: forms.length,
    totals: {
      pages: forms.reduce((sum, form) => sum + form.statistics.pageCount, 0),
      fields: forms.reduce((sum, form) => sum + form.statistics.fieldCount, 0),
      labels: forms.reduce((sum, form) => sum + form.statistics.labelCount, 0),
      bindings: forms.reduce((sum, form) => sum + form.statistics.bindingCount, 0),
      tables: forms.reduce((sum, form) => sum + form.statistics.tableCount, 0),
      groups: forms.reduce((sum, form) => sum + form.statistics.groupCount, 0),
      diagnostics: forms.reduce((sum, form) => sum + form.diagnosticCounts.errors + form.diagnosticCounts.warnings, 0),
    },
    forms,
    append: append ? {
      previousFormCount: existingForms.length,
      appendedFormCount: appendedCount,
    } : undefined,
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify(manifest, null, 2));
}

main();
