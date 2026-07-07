import fs from "node:fs";
import path from "node:path";

type SemanticHint = {
  semanticLabel: string;
  categoryMode: string;
};

type SupervisionRule = {
  source: "fixture_expectation" | "gold_label" | "anchor";
  fixtureName?: string;
  familyId?: string;
  anchorId?: string;
  expectedAcordCode: string;
  pattern: string;
  semanticHint: SemanticHint;
};

type CompiledRule = SupervisionRule & {
  normalizedPattern: string;
  regex: RegExp | null;
};

type Wave8StructureSuppressionKind = "section_heading" | "logo" | "layout_label";

type Wave8StructureSuppressionRule = {
  kind: Wave8StructureSuppressionKind;
  pattern: string;
  families?: string[];
};

type AnchorTuningProfile = {
  anchorWeightMultiplier: number;
  synonymVariantWeightBonus: number;
  dictionaryConfidenceWeight: number;
  semanticHintWeight: number;
  categoryHintWeight: number;
};

const FIXTURE_EXPECTATIONS_PATH = path.resolve(
  __dirname,
  "../api/tests/fixture-expectations.json",
);
const GOLD_LABEL_SUPERVISION_PATH = path.resolve(
  __dirname,
  "../api/tests/gold-label-supervision.example.json",
);
const GOLD_ANCHORS_PATH = path.resolve(
  __dirname,
  "../api/tests/gold-anchor-fields.json",
);

const FIXTURE_TO_FAMILY: Record<string, string> = {
  "sample-Acord-125.pdf": "acord-125",
  "sample-Acord-126.pdf": "acord-126",
  "sample-Acord-127.pdf": "acord-127",
  "sample-Acord-140.pdf": "acord-140",
  "sample-Contractors-Supplemental.pdf": "contractors-supplement",
  "Contractors Supp App.pdf": "contractors-supplement",
  "Markel-Contractors-Supp.pdf": "contractors-supplement",
  "ANA_E-S_Contractors_Supplemental-Application_MKT0109_fillable.pdf": "contractors-supplement",
};

const ANCHOR_CODE_HINTS: Record<string, string[]> = {
  insured_name: [
    "GeneralInfo.NamedInsured",
    "NamedInsured_FullName",
    "NamedInsured_FullName_AA",
    "NamedInsured_GivenName",
  ],
  mailing_address: [
    "GeneralInfo.MailingAddress.Line1",
    "GeneralInfo.MailingAddress.Street",
    "GeneralInfo.MailingAddress.City",
    "GeneralInfo.MailingAddress.State",
    "GeneralInfo.MailingAddress.PostalCode",
  ],
  location_address: [
    "CommercialProperty.Building.LocationAddress",
  ],
  operations_description: [
    "GeneralLiability_OperationsDescription",
    "BusinessInformation_OperationsDescription",
    "AgriculturalAviation_OtherStatesOperationsDescription",
    "BuildersRiskInstallation_Rigging_OperationsDescription",
  ],
};

const TARGETED_ANCHOR_PATTERN_VARIANTS: Record<string, string[]> = {
  insured_name: [
    "insured\\s+name",
    "name\\s+of\\s+(first\\s+)?named\\s+insured",
    "first\\s+named\\s+insured",
    "named\\s+insured",
    "name\\s+of\\s+insured",
    "applicant\\s+name",
    "name\\s+of\\s+applicant",
    "insured\s*mailing\s+address",
    "insured\\s*:\\s*",
  ],
  mailing_address: [
    "mailing\s+address",
    "mailing\s+address\s+line\s*1",
    "mailing\s+address\s+line\s*2",
    "insured\s+mailing\s+address",
    "mailing\s+city\s+state\s+zip",
  ],
  location_address: [
    "location\s+address",
    "premises\s+address",
    "risk\s+address",
    "street\s+address",
    "location\s+city\s+state\s+zip",
  ],
  operations_description: [
    "operations\\s+description",
    "premises\\s*\\/\\s*operations",
    "description\\s+of\\s+operations",
    "nature\\s+of\\s+operations",
    "business\s+description",
    "nature\s+of\s+business",
  ],
};

const TARGETED_ANCHOR_TUNING: Record<string, AnchorTuningProfile> = {
  insured_name: {
    anchorWeightMultiplier: 1.5,
    synonymVariantWeightBonus: 0.2,
    dictionaryConfidenceWeight: 1.25,
    semanticHintWeight: 1.3,
    categoryHintWeight: 1.25,
  },
  mailing_address: {
    anchorWeightMultiplier: 1.46,
    synonymVariantWeightBonus: 0.2,
    dictionaryConfidenceWeight: 1.24,
    semanticHintWeight: 1.26,
    categoryHintWeight: 1.22,
  },
  location_address: {
    anchorWeightMultiplier: 1.44,
    synonymVariantWeightBonus: 0.18,
    dictionaryConfidenceWeight: 1.22,
    semanticHintWeight: 1.24,
    categoryHintWeight: 1.2,
  },
  operations_description: {
    anchorWeightMultiplier: 1.55,
    synonymVariantWeightBonus: 0.25,
    dictionaryConfidenceWeight: 1.3,
    semanticHintWeight: 1.32,
    categoryHintWeight: 1.28,
  },
  producer_agent: {
    anchorWeightMultiplier: 1.45,
    synonymVariantWeightBonus: 0.2,
    dictionaryConfidenceWeight: 1.24,
    semanticHintWeight: 1.26,
    categoryHintWeight: 1.22,
  },
  applicant_name: {
    anchorWeightMultiplier: 1.42,
    synonymVariantWeightBonus: 0.18,
    dictionaryConfidenceWeight: 1.2,
    semanticHintWeight: 1.24,
    categoryHintWeight: 1.2,
  },
  policy_dates: {
    anchorWeightMultiplier: 1.36,
    synonymVariantWeightBonus: 0.16,
    dictionaryConfidenceWeight: 1.18,
    semanticHintWeight: 1.22,
    categoryHintWeight: 1.2,
  },
  policy_limits: {
    anchorWeightMultiplier: 1.34,
    synonymVariantWeightBonus: 0.15,
    dictionaryConfidenceWeight: 1.18,
    semanticHintWeight: 1.2,
    categoryHintWeight: 1.18,
  },
};

const WAVE8_SYNTHETIC_SUPERVISION_RULES: Array<{
  familyId?: string;
  expectedAcordCode: string;
  pattern: string;
  semanticHint: SemanticHint;
  anchorId: keyof typeof TARGETED_ANCHOR_TUNING;
}> = [
  {
    expectedAcordCode: "GeneralInfo.NamedInsured",
    pattern: "named\\s+insured|insured\\s+name|name\\s+of\\s+insured|first\\s+named\\s+insured",
    semanticHint: { semanticLabel: "person_name", categoryMode: "party_information" },
    anchorId: "insured_name",
  },
  {
    expectedAcordCode: "Producer_FullName",
    pattern: "producer\\s+name|agent\\s+name|producer\\s*[:]|agent\\s*[:]",
    semanticHint: { semanticLabel: "person_name", categoryMode: "party_information" },
    anchorId: "producer_agent",
  },
  {
    expectedAcordCode: "Applicant_FullName",
    pattern: "applicant\\s+name|name\\s+of\\s+applicant",
    semanticHint: { semanticLabel: "person_name", categoryMode: "party_information" },
    anchorId: "applicant_name",
  },
  {
    expectedAcordCode: "GeneralLiability_OperationsDescription",
    pattern: "operations\\s+description|description\\s+of\\s+operations|nature\\s+of\\s+operations|premises\\s*\\/?\\s*operations",
    semanticHint: { semanticLabel: "coverage", categoryMode: "coverage_information" },
    anchorId: "operations_description",
  },
  {
    expectedAcordCode: "Policy_EffectiveDate",
    pattern: "effective\\s+date|eff\\.?\\s+date",
    semanticHint: { semanticLabel: "date", categoryMode: "policy_information" },
    anchorId: "policy_dates",
  },
  {
    expectedAcordCode: "Policy_ExpirationDate",
    pattern: "expiration\\s+date|expiry\\s+date|exp\\.?\\s+date",
    semanticHint: { semanticLabel: "date", categoryMode: "policy_information" },
    anchorId: "policy_dates",
  },
  {
    expectedAcordCode: "Policy_Limit",
    pattern: "policy\\s+limits?|limits?|coverage\\s+limits?|deductible|premium",
    semanticHint: { semanticLabel: "currency", categoryMode: "coverage_information" },
    anchorId: "policy_limits",
  },
];

const WAVE8_PHASE3_TARGET_FAMILIES = [
  "acord-125",
  "acord-126",
  "acord-140",
  "contractors-supplement",
];

const WAVE8_STRUCTURE_SUPPRESSION_RULES: Wave8StructureSuppressionRule[] = [
  {
    kind: "logo",
    pattern: "\bacord\b|\bthe\s+acord\s+name\s+and\s+logo\s+are\s+registered\s+marks\b|\ball\s+rights\s+reserved\b|\bcopyright\b",
  },
  {
    kind: "layout_label",
    pattern: "\bpage\s+\d+\s+of\s+\d+\b|\bform\s+no\b|\bedition\b|\bacord\s*\d+\b",
  },
  {
    kind: "section_heading",
    pattern: "\bapplicant\s+information\b|\bgeneral\s+information\b|\bpremises\s+information\b|\bbuilding\s+information\b|\bpolicy\s+information\b|\bcoverage\s+information\b|\bloss\s+history\b|\bprior\s+carrier\b|\boperations\s+description\b|\bnature\s+of\s+operations\b",
    families: ["acord-125", "acord-126", "acord-140", "contractors-supplement"],
  },
  {
    kind: "section_heading",
    pattern: "\bcontractors?\s+supp(lemental)?\s+application\b|\bto\s+be\s+submitted\s+with\s+acord\s+applications\b",
    families: ["contractors-supplement"],
  },
  {
    kind: "layout_label",
    pattern: "\bcontinued\s+on\s+next\s+page\b|\battach\s+(additional\s+)?pages\b|\bsee\s+supplement\b",
    families: ["acord-125", "acord-126", "acord-140", "contractors-supplement"],
  },
];

let compiledRulesCache: CompiledRule[] | null = null;
let rulesByCodeCache: Map<string, CompiledRule[]> | null = null;

function normalizeText(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safeRegex(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern, "i");
  } catch {
    return null;
  }
}

function inferSemanticHintFromAcordCode(acordCode: string): SemanticHint {
  const code = normalizeText(acordCode).replace(/\s+/g, "");

  if (/(signature|signed|authorizedsignature)/.test(code)) {
    return { semanticLabel: "signature", categoryMode: "compliance_information" };
  }
  if (/(date|dob|birth|effective|expiration|expiry)/.test(code)) {
    return { semanticLabel: "date", categoryMode: "policy_information" };
  }
  if (/(indicator|yesno|checkbox|selected|unselected)/.test(code)) {
    return { semanticLabel: "boolean_choice", categoryMode: "compliance_information" };
  }
  if (/(amount|premium|limit|deductible|rate|percent|value)/.test(code)) {
    return { semanticLabel: "currency", categoryMode: "coverage_information" };
  }
  if (/(vehicle|vin|driver|auto)/.test(code)) {
    return { semanticLabel: "vehicle", categoryMode: "vehicle_information" };
  }
  if (/(property|premises|dwelling|building|commercialstructure|residential)/.test(code)) {
    return { semanticLabel: "property", categoryMode: "property_information" };
  }
  if (/(policy|carrier|term|quote|submission)/.test(code)) {
    return { semanticLabel: "policy", categoryMode: "policy_information" };
  }
  if (/(name|insured|applicant|producer|contact|mailingaddress|address|city|state|postal|zip)/.test(code)) {
    return { semanticLabel: "person_name", categoryMode: "party_information" };
  }
  if (/(coverage|liability|operations|risk|underwriting)/.test(code)) {
    return { semanticLabel: "coverage", categoryMode: "coverage_information" };
  }

  return { semanticLabel: "generic", categoryMode: "general_information" };
}

function loadJson<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) {
      return fallback;
    }
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function collectRules(): CompiledRule[] {
  const rules: SupervisionRule[] = [];

  const fixtureExpectations = loadJson<Record<string, any[]>>(FIXTURE_EXPECTATIONS_PATH, {});
  for (const [fixtureName, entries] of Object.entries(fixtureExpectations)) {
    if (!Array.isArray(entries)) continue;
    const familyId = FIXTURE_TO_FAMILY[fixtureName];
    for (const entry of entries) {
      const expectedAcordCode = String(entry?.expectedAcordCode || "").trim();
      const pattern = String(entry?.textPattern || "").trim();
      if (!expectedAcordCode || !pattern) continue;
      rules.push({
        source: "fixture_expectation",
        fixtureName,
        familyId,
        anchorId: String(entry?.id || "").trim() || undefined,
        expectedAcordCode,
        pattern,
        semanticHint: inferSemanticHintFromAcordCode(expectedAcordCode),
      });
    }
  }

  const goldLabel = loadJson<{ forms?: any[] }>(GOLD_LABEL_SUPERVISION_PATH, {});
  for (const form of goldLabel.forms || []) {
    const fixtureName = String(form?.fixtureName || "").trim();
    const familyId = FIXTURE_TO_FAMILY[fixtureName];
    for (const entry of form?.entries || []) {
      const codes = Array.isArray(entry?.expectedAcordCodes)
        ? entry.expectedAcordCodes.map((code: any) => String(code || "").trim()).filter(Boolean)
        : [];
      const patterns = Array.isArray(entry?.matchAnyPatterns)
        ? entry.matchAnyPatterns.map((p: any) => String(p || "").trim()).filter(Boolean)
        : [];
      for (const expectedAcordCode of codes) {
        for (const pattern of patterns) {
          rules.push({
            source: "gold_label",
            fixtureName,
            familyId,
            anchorId: String(entry?.anchorId || "").trim() || undefined,
            expectedAcordCode,
            pattern,
            semanticHint: inferSemanticHintFromAcordCode(expectedAcordCode),
          });
        }
      }
    }
  }

  rules.push(
    {
      source: "gold_label",
      expectedAcordCode: "GeneralInfo.MailingAddress.Line1",
      pattern: "mailing\\s+address|mailing\\s+address\\s+line\\s*1|mailing\\s+address\\s+line\\s*2|insured\\s+mailing\\s+address",
      semanticHint: { semanticLabel: "address", categoryMode: "party_information" },
      anchorId: "mailing_address",
    },
    {
      source: "gold_label",
      expectedAcordCode: "CommercialProperty.Building.LocationAddress",
      pattern: "location\\s+address|premises\\s+address|risk\\s+address|street\\s+address|location\\s+city\\s+state\\s+zip",
      semanticHint: { semanticLabel: "address", categoryMode: "property_information" },
      anchorId: "location_address",
    },
  );

  const anchorConfig = loadJson<{ forms?: any[] }>(GOLD_ANCHORS_PATH, {});
  for (const form of anchorConfig.forms || []) {
    const fixtureName = String(form?.fixtureName || "").trim();
    const familyId = FIXTURE_TO_FAMILY[fixtureName];
    for (const anchor of form?.anchors || []) {
      const anchorId = String(anchor?.anchorId || "").trim();
      const patterns = Array.isArray(anchor?.matchAnyPatterns)
        ? anchor.matchAnyPatterns.map((p: any) => String(p || "").trim()).filter(Boolean)
        : [];
      if (!anchorId || patterns.length === 0) continue;
      const hintedCodes = ANCHOR_CODE_HINTS[anchorId] || [anchorId.toUpperCase()];
      const expandedPatterns = [
        ...patterns,
        ...(TARGETED_ANCHOR_PATTERN_VARIANTS[anchorId] || []),
      ];
      for (const pattern of expandedPatterns) {
        for (const expectedAcordCode of hintedCodes) {
          rules.push({
            source: "anchor",
            fixtureName,
            familyId,
            anchorId,
            expectedAcordCode,
            pattern,
            semanticHint: inferSemanticHintFromAcordCode(expectedAcordCode),
          });
        }
      }
    }
  }

  const deduped = new Map<string, SupervisionRule>();
  for (const synthetic of WAVE8_SYNTHETIC_SUPERVISION_RULES) {
    rules.push({
      source: "anchor",
      fixtureName: undefined,
      familyId: synthetic.familyId,
      anchorId: synthetic.anchorId,
      expectedAcordCode: synthetic.expectedAcordCode,
      pattern: synthetic.pattern,
      semanticHint: synthetic.semanticHint,
    });
  }
  for (const rule of rules) {
    const key = [
      rule.source,
      rule.fixtureName || "",
      rule.familyId || "",
      rule.expectedAcordCode,
      rule.pattern,
    ].join("|");
    deduped.set(key, rule);
  }

  return [...deduped.values()].map((rule) => ({
    ...rule,
    normalizedPattern: normalizeText(rule.pattern),
    regex: safeRegex(rule.pattern),
  }));
}

function ensureCaches(): void {
  if (!compiledRulesCache) {
    compiledRulesCache = collectRules();
  }
  if (!rulesByCodeCache) {
    rulesByCodeCache = new Map<string, CompiledRule[]>();
    for (const rule of compiledRulesCache) {
      const bucket = rulesByCodeCache.get(rule.expectedAcordCode) || [];
      bucket.push(rule);
      rulesByCodeCache.set(rule.expectedAcordCode, bucket);
    }
  }
}

function familyMatches(ruleFamily: string | undefined, familyId: string | undefined): boolean {
  if (!ruleFamily || !familyId) return true;
  return normalizeText(ruleFamily) === normalizeText(familyId);
}

function normalizeFamilyAlias(value: string | undefined): string {
  const normalized = normalizeText(String(value || ""));
  return normalized.replace(/\s+/g, "-");
}

function isWave8Phase3TargetFamily(familyId?: string): boolean {
  const normalized = normalizeFamilyAlias(familyId);
  if (!normalized) {
    return false;
  }

  if (WAVE8_PHASE3_TARGET_FAMILIES.includes(normalized)) {
    return true;
  }

  return (
    normalized.includes("acord-125") ||
    normalized.includes("acord-126") ||
    normalized.includes("acord-140") ||
    normalized.includes("contractors")
  );
}

function structureRuleFamilyMatches(rule: Wave8StructureSuppressionRule, familyId?: string): boolean {
  if (!rule.families || rule.families.length === 0) {
    return true;
  }
  const normalized = normalizeFamilyAlias(familyId);
  if (!normalized) {
    return false;
  }

  return rule.families.some((family) => {
    const familyAlias = normalizeFamilyAlias(family);
    return normalized === familyAlias || normalized.includes(familyAlias);
  });
}

function patternMatches(rule: CompiledRule, text: string): boolean {
  if (!text) return false;
  if (rule.regex && rule.regex.test(text)) return true;
  if (!rule.normalizedPattern) return false;
  return normalizeText(text).includes(rule.normalizedPattern);
}

export function getWave8SupervisionCandidatesForText(
  text: string,
  familyId?: string,
): Array<{
  acordCode: string;
  weight: number;
  semanticHint: SemanticHint;
  semanticHintWeight: number;
  categoryHintWeight: number;
  dictionaryConfidenceWeight: number;
}> {
  ensureCaches();
  const candidates = new Map<
    string,
    {
      weight: number;
      semanticHint: SemanticHint;
      semanticHintWeight: number;
      categoryHintWeight: number;
      dictionaryConfidenceWeight: number;
    }
  >();
  for (const rule of compiledRulesCache || []) {
    if (!familyMatches(rule.familyId, familyId)) continue;
    if (!patternMatches(rule, text)) continue;
    const tuning = rule.anchorId ? TARGETED_ANCHOR_TUNING[rule.anchorId] : undefined;
    const baseBoost = rule.source === "gold_label" ? 1 : rule.source === "fixture_expectation" ? 0.9 : 0.7;
    const boosted = baseBoost * (tuning?.anchorWeightMultiplier || 1) + (tuning?.synonymVariantWeightBonus || 0);
    const boost = Math.min(1.8, Math.max(0, boosted));
    const previous = candidates.get(rule.expectedAcordCode);
    if (!previous || previous.weight < boost) {
      candidates.set(rule.expectedAcordCode, {
        weight: boost,
        semanticHint: rule.semanticHint,
        semanticHintWeight: tuning?.semanticHintWeight || 1,
        categoryHintWeight: tuning?.categoryHintWeight || 1,
        dictionaryConfidenceWeight: tuning?.dictionaryConfidenceWeight || 1,
      });
    }
  }

  return [...candidates.entries()].map(([acordCode, value]) => ({
    acordCode,
    weight: Number(value.weight.toFixed(3)),
    semanticHint: value.semanticHint,
    semanticHintWeight: Number(value.semanticHintWeight.toFixed(3)),
    categoryHintWeight: Number(value.categoryHintWeight.toFixed(3)),
    dictionaryConfidenceWeight: Number(value.dictionaryConfidenceWeight.toFixed(3)),
  }));
}

export function getWave8SupervisionAnchorBoost(
  queryText: string,
  acordCode: string,
  familyId?: string,
): number {
  ensureCaches();
  const rules = (rulesByCodeCache?.get(acordCode) || []).filter((rule) =>
    familyMatches(rule.familyId, familyId),
  );
  if (rules.length === 0) return 0;

  let best = 0;
  for (const rule of rules) {
    if (!patternMatches(rule, queryText)) continue;
    const tuning = rule.anchorId ? TARGETED_ANCHOR_TUNING[rule.anchorId] : undefined;
    const baseScore =
      rule.source === "gold_label" ? 0.35 : rule.source === "fixture_expectation" ? 0.28 : 0.16;
    const score =
      baseScore * (tuning?.anchorWeightMultiplier || 1) + (tuning?.synonymVariantWeightBonus || 0) * 0.4;
    if (score > best) {
      best = score;
    }
  }

  return Number(Math.min(0.4, Math.max(0, best)).toFixed(3));
}

export function getWave8SemanticHintForText(
  text: string,
  familyId?: string,
): SemanticHint | null {
  const matches = getWave8SupervisionCandidatesForText(text, familyId);
  if (matches.length === 0) {
    return null;
  }

  matches.sort((left, right) => right.weight - left.weight || left.acordCode.localeCompare(right.acordCode));
  return matches[0].semanticHint;
}

export function getWave8StructureSuppressionSignals(
  text: string,
  familyId?: string,
): {
  matched: boolean;
  kinds: Wave8StructureSuppressionKind[];
  reasons: string[];
  score: number;
} {
  const source = String(text || "");
  if (!source.trim() || !isWave8Phase3TargetFamily(familyId)) {
    return {
      matched: false,
      kinds: [],
      reasons: [],
      score: 0,
    };
  }

  const normalizedText = normalizeText(source);
  const tokenCount = normalizedText.split(" ").filter(Boolean).length;
  const kinds = new Set<Wave8StructureSuppressionKind>();
  const reasons = new Set<string>();
  let score = 0;

  for (const rule of WAVE8_STRUCTURE_SUPPRESSION_RULES) {
    if (!structureRuleFamilyMatches(rule, familyId)) {
      continue;
    }
    const regex = safeRegex(rule.pattern);
    if (!regex || !regex.test(source)) {
      continue;
    }

    kinds.add(rule.kind);
    reasons.add(`phase3_${rule.kind}`);

    if (rule.kind === "logo") {
      score += 0.44;
    } else if (rule.kind === "section_heading") {
      score += tokenCount >= 2 && tokenCount <= 10 ? 0.32 : 0.24;
    } else {
      score += 0.26;
    }
  }

  return {
    matched: kinds.size > 0,
    kinds: [...kinds],
    reasons: [...reasons],
    score: Number(Math.min(1, Math.max(0, score)).toFixed(3)),
  };
}

export function getWave8SupervisionRuleCount(): number {
  ensureCaches();
  return (compiledRulesCache || []).length;
}
