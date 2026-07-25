const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "../../..");
const xfdlPath =
  process.env.WAVE13_ACORD125_GOLD_STANDARD_PATH ||
  path.join(
    rootDir,
    "backend",
    "api",
    "tests",
    "gold-standard",
    "acord-125",
    "ACORD 0125 2016-03r1.xfdl",
  );
const dynamicOutputPath = path.join(
  rootDir,
  "backend",
  "api",
  "tests",
  "generated",
  "acord125-xfdl-expectations.json",
);
const fixtureExpectationsPath = path.join(
  rootDir,
  "backend",
  "api",
  "tests",
  "fixture-expectations.json",
);

function parseItemLocation(block) {
  const absMatch = block.match(
    /<ae>\s*<ae>absolute<\/ae>\s*<ae>(-?\d+(?:\.\d+)?)<\/ae>\s*<ae>(-?\d+(?:\.\d+)?)<\/ae>\s*<\/ae>/i,
  );
  const extMatch = block.match(
    /<ae>\s*<ae>extent<\/ae>\s*<ae>(-?\d+(?:\.\d+)?)<\/ae>\s*<ae>(-?\d+(?:\.\d+)?)<\/ae>\s*<\/ae>/i,
  );
  const pageMatch = block.match(
    /<ae>\s*<ae>page<\/ae>\s*<ae>(\d+)<\/ae>\s*<\/ae>/i,
  );

  return {
    x: absMatch ? Number(absMatch[1]) : null,
    y: absMatch ? Number(absMatch[2]) : null,
    width: extMatch ? Number(extMatch[1]) : null,
    height: extMatch ? Number(extMatch[2]) : null,
    page: pageMatch ? Number(pageMatch[1]) : null,
  };
}

function parsePages(xml) {
  const pages = [];
  const pageRegex = /<page\s+sid="([^"]+)"[^>]*>([\s\S]*?)<\/page>/gi;
  let match;
  while ((match = pageRegex.exec(xml)) !== null) {
    const sid = match[1];
    const pageNumberMatch = sid.match(/(\d+)/);
    pages.push({
      sid,
      pageNumber: pageNumberMatch ? Number(pageNumberMatch[1]) : null,
      start: match.index,
      end: pageRegex.lastIndex,
    });
  }
  return pages;
}

function getPageForIndex(index, pages) {
  for (const page of pages) {
    if (index >= page.start && index <= page.end) {
      return {
        pageSid: page.sid,
        pageNumber: page.pageNumber,
      };
    }
  }
  return {
    pageSid: null,
    pageNumber: null,
  };
}

function parseFields(xml, pages) {
  const fields = [];
  const fieldRegex = /<field\s+sid="([^"]+)"[^>]*>([\s\S]*?)<\/field>/gi;
  let match;
  while ((match = fieldRegex.exec(xml)) !== null) {
    const sid = match[1];
    const body = match[2] || "";
    const helpMatch = body.match(/<help>([^<]+)<\/help>/i);
    const itemLocationMatch = body.match(/<itemlocation>([\s\S]*?)<\/itemlocation>/i);
    const page = getPageForIndex(match.index, pages);
    fields.push({
      sid,
      helpSid: helpMatch ? helpMatch[1].trim() : null,
      geometry: itemLocationMatch
        ? parseItemLocation(itemLocationMatch[1])
        : { x: null, y: null, width: null, height: null, page: null },
      pageSid: page.pageSid,
      pageNumber: page.pageNumber,
      index: match.index,
    });
  }
  return fields;
}

function parseLabels(xml, pages) {
  const labels = [];
  const labelRegex = /<label\s+sid="([^"]+)"[^>]*>([\s\S]*?)<\/label>/gi;
  let match;
  while ((match = labelRegex.exec(xml)) !== null) {
    const sid = match[1];
    const body = match[2] || "";
    const valueMatch = body.match(/<value>([\s\S]*?)<\/value>/i);
    const itemLocationMatch = body.match(/<itemlocation>([\s\S]*?)<\/itemlocation>/i);
    const value = valueMatch
      ? valueMatch[1].replace(/\s+/g, " ").trim()
      : "";
    const page = getPageForIndex(match.index, pages);
    labels.push({
      sid,
      value,
      geometry: itemLocationMatch
        ? parseItemLocation(itemLocationMatch[1])
        : { x: null, y: null, width: null, height: null, page: null },
      pageSid: page.pageSid,
      pageNumber: page.pageNumber,
      index: match.index,
    });
  }
  return labels;
}

function parseHelpValues(xml) {
  const helpMap = {};
  const helpRegex = /<help\s+sid="([^"]+)"[^>]*>\s*<value>([\s\S]*?)<\/value>\s*<\/help>/gi;
  let match;
  while ((match = helpRegex.exec(xml)) !== null) {
    helpMap[match[1]] = String(match[2] || "").replace(/\s+/g, " ").trim();
  }
  return helpMap;
}

function semanticPathFromSid(sid) {
  return sid.replace(/_[A-Z]$/, "");
}

function codeFromSid(sid) {
  const base = semanticPathFromSid(sid);
  if (base === "NamedInsured_FullName") return "GeneralInfo.NamedInsured";
  if (base === "NamedInsured_MailingAddress_LineOne") return "GeneralInfo.MailingAddress";
  if (base === "NamedInsured_BusinessStartDate") return "BusinessInformation_BusinessStartDate";
  return base;
}

function tokenize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function toFieldCenter(geometry) {
  const x = Number(geometry?.x);
  const y = Number(geometry?.y);
  const width = Number(geometry?.width);
  const height = Number(geometry?.height);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return { x: null, y: null };
  }
  return {
    x: x + (Number.isFinite(width) ? width / 2 : 0),
    y: y + (Number.isFinite(height) ? height / 2 : 0),
  };
}

function inferClusterPrefix(sid) {
  if (/^NamedInsured_MailingAddress_/i.test(sid)) {
    return /^NamedInsured_MailingAddress_/i;
  }
  if (/^Policy_/i.test(sid)) {
    return /^Policy_/i;
  }
  if (/^Producer_/i.test(sid)) {
    return /^Producer_/i;
  }
  if (/^NamedInsured_/i.test(sid)) {
    return /^NamedInsured_/i;
  }
  return null;
}

function buildClusterContext(field, fields) {
  const sidRegex = inferClusterPrefix(field.sid);
  if (!sidRegex) {
    return { siblings: [field], bbox: field.geometry };
  }

  const siblings = fields.filter((candidate) => {
    if (!sidRegex.test(candidate.sid)) return false;
    if (field.pageSid && candidate.pageSid && field.pageSid !== candidate.pageSid) return false;
    return true;
  });

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const sibling of siblings) {
    const x = Number(sibling?.geometry?.x);
    const y = Number(sibling?.geometry?.y);
    const w = Number(sibling?.geometry?.width);
    const h = Number(sibling?.geometry?.height);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h)) continue;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  }

  const bbox =
    Number.isFinite(minX) && Number.isFinite(minY) && Number.isFinite(maxX) && Number.isFinite(maxY)
      ? { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
      : field.geometry;

  return { siblings, bbox };
}

function anchorProfile(def) {
  const profile = {
    keywords: [],
    antiKeywords: ["fraud", "penalties", "supplemental", "section", "description", "resolve"],
    bindOptionKeywords: [],
  };

  if (def.id === "named-insured") {
    profile.keywords = ["named", "insured", "first", "name"];
    profile.antiKeywords.push("email", "website", "policy");
  } else if (def.id === "mailing-address") {
    profile.keywords = ["mailing", "address", "zip"];
    profile.bindOptionKeywords = ["mailing", "address", "city", "state", "zip"];
    profile.antiKeywords.push("phone", "email", "website");
  } else if (def.id === "policy-number") {
    profile.keywords = ["policy", "number", "policy no"];
    profile.bindOptionKeywords = ["policy", "number", "effective", "expiration"];
    profile.antiKeywords.push("email", "website", "secondary", "city");
  } else if (def.id === "business-start-date") {
    profile.keywords = ["business", "started", "start", "date"];
    profile.bindOptionKeywords = ["date", "business", "started"];
  } else if (def.id === "city") {
    profile.keywords = ["city"];
    profile.bindOptionKeywords = ["city", "state", "zip", "mailing", "address"];
  } else if (def.id === "state") {
    profile.keywords = ["state", "province"];
    profile.bindOptionKeywords = ["city", "state", "zip", "mailing", "address"];
  } else if (def.id === "zip-code") {
    profile.keywords = ["zip", "postal", "code"];
    profile.bindOptionKeywords = ["city", "state", "zip", "mailing", "address"];
  } else if (def.id === "agent-name") {
    profile.keywords = ["agent", "producer", "agency", "name"];
    profile.bindOptionKeywords = ["producer", "agency", "agent", "name"];
    profile.antiKeywords.push("insured", "mailing");
  }

  return profile;
}

function findNearestLabel(field, labels, profile, clusterCtx) {
  function looksLikeVisualLabel(value) {
    const text = String(value || "").trim();
    if (!text) return false;
    if (text.length > 90) return false;
    if (/^enter\s+/i.test(text)) return false;
    if (/fraudulent insurance act|criminal and civil penalties|not to exceed/i.test(text)) {
      return false;
    }
    const tokens = text.split(/\s+/).filter(Boolean);
    if (tokens.length > 14) return false;
    return true;
  }

  const scored = labels
    .filter((label) => {
      if (!looksLikeVisualLabel(label.value)) return false;
      if (!label.geometry || !field.geometry) return false;
      if (field.pageSid && label.pageSid && field.pageSid !== label.pageSid) return false;
      return true;
    })
    .map((label) => {
      const fieldCenter = toFieldCenter(field.geometry);
      const labelCenter = toFieldCenter(label.geometry);
      const dx = Math.abs((labelCenter.x || 0) - (fieldCenter.x || 0));
      const dy = Math.abs((labelCenter.y || 0) - (fieldCenter.y || 0));
      const isAboveOrAligned = (label.geometry.y || 0) <= (field.geometry.y || 0) + 12;
      const verticalWindowPenalty = dy > 90 ? 160 : 0;
      const horizontalWindowPenalty = dx > 360 ? 120 : 0;
      const orderPenalty = label.index > field.index ? 60 : 0;
      const belowPenalty = isAboveOrAligned ? 0 : 45;

      const labelTokens = tokenize(label.value);
      const keywordHits = profile.keywords.filter((word) =>
        labelTokens.some((token) => token.includes(word) || word.includes(token)),
      ).length;
      const antiHits = profile.antiKeywords.filter((word) =>
        labelTokens.some((token) => token.includes(word) || word.includes(token)),
      ).length;

      let clusterDistance = 0;
      if (clusterCtx?.siblings?.length) {
        let minSiblingDistance = Number.POSITIVE_INFINITY;
        for (const sibling of clusterCtx.siblings) {
          const siblingCenter = toFieldCenter(sibling.geometry);
          if (!Number.isFinite(siblingCenter.x) || !Number.isFinite(siblingCenter.y)) continue;
          const sdx = Math.abs((labelCenter.x || 0) - siblingCenter.x);
          const sdy = Math.abs((labelCenter.y || 0) - siblingCenter.y);
          minSiblingDistance = Math.min(minSiblingDistance, sdx * 0.35 + sdy * 1.5);
        }
        if (Number.isFinite(minSiblingDistance)) {
          clusterDistance = minSiblingDistance;
        }
      }

      const bindOptionHits = profile.bindOptionKeywords.filter((word) =>
        labelTokens.some((token) => token.includes(word) || word.includes(token)),
      ).length;

      const numericOnlyPenalty = /^\d+[\.:]?$/.test(String(label.value || "").trim()) ? 220 : 0;
      const weakTokenPenalty = labelTokens.length <= 1 && keywordHits === 0 ? 60 : 0;

      const score =
        dy * 2.3 +
        dx * 0.45 +
        clusterDistance * 0.3 +
        orderPenalty +
        belowPenalty +
        verticalWindowPenalty +
        horizontalWindowPenalty +
        antiHits * 150 +
        numericOnlyPenalty +
        weakTokenPenalty -
        keywordHits * 115 -
        bindOptionHits * 45;

      return { label, score };
    })
    .sort((a, b) => a.score - b.score);

  return scored[0] ? scored[0].label : null;
}

function findFieldBySidPattern(fields, regex) {
  return fields.find((field) => regex.test(field.sid));
}

function isLabelUsable(label) {
  const text = String(label?.value || "").trim();
  if (!text) return false;
  if (text.length > 120) return false;
  if (/fraudulent insurance act|criminal and civil penalties|not to exceed/i.test(text)) return false;
  return true;
}

function labelsOnSamePage(labels, pageSid) {
  return labels.filter((label) => {
    if (!isLabelUsable(label)) return false;
    if (pageSid && label.pageSid && label.pageSid !== pageSid) return false;
    return true;
  });
}

function pickSharedAddressHeaderForRow(pageLabels, rowY) {
  const candidate = pageLabels
    .filter((label) => {
      const text = String(label.value || "");
      if (!/mailing\s+address|address.*zip|named\s+insured/i.test(text)) return false;
      const y = Number(label?.geometry?.y);
      if (!Number.isFinite(y)) return false;
      return Math.abs(y - rowY) <= 120;
    })
    .map((label) => {
      const y = Number(label?.geometry?.y || 0);
      const x = Number(label?.geometry?.x || 0);
      const dy = Math.abs(y - rowY);
      const belowPenalty = y > rowY + 4 ? 60 : 0;
      const score = dy * 2 + x * 0.08 + belowPenalty;
      return { label, score };
    })
    .sort((a, b) => a.score - b.score);

  return candidate[0]?.label || null;
}

function pickRowMicroLabel(pageLabels, targetX, rowY, terms, antiTerms = []) {
  const candidate = pageLabels
    .filter((label) => {
      const text = String(label.value || "").toLowerCase();
      if (!terms.some((term) => text.includes(term))) return false;
      if (antiTerms.some((term) => text.includes(term))) return false;
      const y = Number(label?.geometry?.y);
      const x = Number(label?.geometry?.x);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
      return Math.abs(y - rowY) <= 55;
    })
    .map((label) => {
      const text = String(label.value || "").toLowerCase();
      const y = Number(label?.geometry?.y || 0);
      const x = Number(label?.geometry?.x || 0);
      const dx = Math.abs(x - targetX);
      const dy = Math.abs(y - rowY);
      const explicitTokenBoost = /\b(city|st|state|zip|postal)\b/.test(text) ? 45 : 0;
      const trustPenalty = /\btrust\b/.test(text) ? 160 : 0;
      const score = dx * 0.9 + dy * 1.6 + trustPenalty - explicitTokenBoost;
      return { label, score };
    })
    .sort((a, b) => a.score - b.score);

  return candidate[0]?.label || null;
}

function isExplicitStateTokenLabel(label) {
  const text = String(label?.value || "").trim().toLowerCase();
  if (!text) return false;
  return /\b(st|state|province)\b/.test(text);
}

function resolveAddressTripletLabels(fields, labels) {
  const cityField = findFieldBySidPattern(fields, /^NamedInsured_MailingAddress_CityName_A$/i);
  const stateField = findFieldBySidPattern(fields, /^NamedInsured_MailingAddress_StateOrProvinceCode_A$/i);
  const zipField = findFieldBySidPattern(fields, /^NamedInsured_MailingAddress_PostalCode_A$/i);

  if (!cityField || !stateField || !zipField) {
    return null;
  }

  const rowY = Number(cityField?.geometry?.y);
  if (!Number.isFinite(rowY)) {
    return null;
  }

  const pageLabels = labelsOnSamePage(labels, cityField.pageSid);
  const sharedHeader = pickSharedAddressHeaderForRow(pageLabels, rowY);

  const cityLabel =
    pickRowMicroLabel(pageLabels, Number(cityField?.geometry?.x || 0), rowY, ["city"], ["county"]) ||
    sharedHeader;

  const stateLabel =
    pickRowMicroLabel(pageLabels, Number(stateField?.geometry?.x || 0), rowY, ["state", "st", "province"], ["statement"]) ||
    sharedHeader;

  const strictStateLabel = isExplicitStateTokenLabel(stateLabel)
    ? stateLabel
    : sharedHeader || stateLabel;

  const zipLabel =
    pickRowMicroLabel(pageLabels, Number(zipField?.geometry?.x || 0), rowY, ["zip", "postal"], []) ||
    sharedHeader;

  return {
    sharedHeader,
    cityLabel,
    stateLabel: strictStateLabel,
    zipLabel,
  };
}

function buildAnchorExpectations(fields, labels, helpMap) {
  const anchorDefs = [
    {
      id: "named-insured",
      sidPattern: /^NamedInsured_FullName_A$/i,
      expectedTopN: 3,
      textPattern: "named\\s+insured|first\\s+named\\s+insured",
    },
    {
      id: "mailing-address",
      sidPattern: /^NamedInsured_MailingAddress_LineOne_A$/i,
      expectedTopN: 5,
      textPattern: "mailing\\s+address",
    },
    {
      id: "policy-number",
      sidPattern: /^Policy_PolicyNumberIdentifier_A$/i,
      expectedTopN: 5,
      textPattern: "policy\\s+(number|no)",
    },
    {
      id: "business-start-date",
      sidPattern: /^NamedInsured_BusinessStartDate_A$/i,
      expectedTopN: 5,
      textPattern: "business\\s+start|date\\s+business\\s+started",
    },
    {
      id: "city",
      sidPattern: /^NamedInsured_MailingAddress_CityName_A$/i,
      expectedTopN: 5,
      textPattern: "\\bcity\\b",
    },
    {
      id: "state",
      sidPattern: /^NamedInsured_MailingAddress_StateOrProvinceCode_A$/i,
      expectedTopN: 5,
      textPattern: "\\bstate\\b|province",
    },
    {
      id: "zip-code",
      sidPattern: /^NamedInsured_MailingAddress_PostalCode_A$/i,
      expectedTopN: 5,
      textPattern: "zip|postal",
    },
    {
      id: "agent-name",
      sidPattern: /^Producer_FullName_A$/i,
      expectedTopN: 5,
      textPattern: "agent\\s+name|producer\\s+name|agent",
    },
  ];

  const expectations = [];
  const triplet = resolveAddressTripletLabels(fields, labels);

  for (const def of anchorDefs) {
    const field = findFieldBySidPattern(fields, def.sidPattern);
    if (!field) continue;
    const profile = anchorProfile(def);
    const clusterCtx = buildClusterContext(field, fields);
    let nearestLabel = findNearestLabel(field, labels, profile, clusterCtx);

    if (triplet) {
      if (def.id === "city" && triplet.cityLabel) nearestLabel = triplet.cityLabel;
      if (def.id === "state" && triplet.stateLabel) nearestLabel = triplet.stateLabel;
      if (def.id === "zip-code" && triplet.zipLabel) nearestLabel = triplet.zipLabel;
    }

    const semanticPath = semanticPathFromSid(field.sid);
    expectations.push({
      id: def.id,
      textPattern: def.textPattern,
      expectedAcordCode: codeFromSid(field.sid),
      expectedTopN: def.expectedTopN,
      anchorSid: field.sid,
      semanticPath,
      anchorLabel: nearestLabel ? nearestLabel.value : null,
      anchorLabelSid: nearestLabel ? nearestLabel.sid : null,
      pageSid: field.pageSid || null,
      pageNumber: field.geometry?.page || field.pageNumber || null,
      geometry: field.geometry,
      helpText: field.helpSid ? helpMap[field.helpSid] || null : null,
      sharedAddressHeader:
        triplet && (def.id === "city" || def.id === "state" || def.id === "zip-code") && triplet.sharedHeader
          ? triplet.sharedHeader.value
          : null,
      sharedAddressHeaderSid:
        triplet && (def.id === "city" || def.id === "state" || def.id === "zip-code") && triplet.sharedHeader
          ? triplet.sharedHeader.sid
          : null,
    });
  }

  return expectations;
}

function upsertFixtureExpectations(acord125Expectations) {
  const fixture = JSON.parse(fs.readFileSync(fixtureExpectationsPath, "utf8"));
  fixture["sample-Acord-125.pdf"] = acord125Expectations;
  fs.writeFileSync(fixtureExpectationsPath, `${JSON.stringify(fixture, null, 2)}\n`);
}

function main() {
  if (!fs.existsSync(xfdlPath)) {
    throw new Error(`Gold-standard XFDL not found: ${xfdlPath}`);
  }

  const xml = fs.readFileSync(xfdlPath, "utf8");
  const pages = parsePages(xml);
  const fields = parseFields(xml, pages);
  const labels = parseLabels(xml, pages);
  const helpMap = parseHelpValues(xml);

  const expectations = buildAnchorExpectations(fields, labels, helpMap);
  if (expectations.length === 0) {
    throw new Error("No ACORD-125 expectations could be derived from XFDL");
  }

  const dynamic = {
    generatedAt: new Date().toISOString(),
    source: {
      xfdlPath: path.relative(rootDir, xfdlPath).replace(/\\/g, "/"),
      bytes: fs.statSync(xfdlPath).size,
      pages: pages.length,
      derivedFields: fields.length,
      derivedLabels: labels.length,
      derivedHelps: Object.keys(helpMap).length,
    },
    fixture: "sample-Acord-125.pdf",
    expectations,
  };

  fs.mkdirSync(path.dirname(dynamicOutputPath), { recursive: true });
  fs.writeFileSync(dynamicOutputPath, `${JSON.stringify(dynamic, null, 2)}\n`);

  upsertFixtureExpectations(expectations);

  console.log(
    JSON.stringify(
      {
        out: path.relative(rootDir, dynamicOutputPath).replace(/\\/g, "/"),
        fixtureExpectationsUpdated: "backend/api/tests/fixture-expectations.json",
        expectations: expectations.length,
        expectationIds: expectations.map((item) => item.id),
      },
      null,
      2,
    ),
  );
}

main();
