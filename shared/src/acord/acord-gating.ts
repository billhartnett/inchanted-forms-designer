import type { AcordDictionaryEntry } from "./acordTypes";
import { getAcordOntologyNode } from "./ontology";
import { ACORD_ONTOLOGY_REGISTRY } from "./acord-ontology";

export type FieldPrediction = {
  blockId: string;
  page: number;
  text: string;
  eLabelName: string;
  probability: number;
  logit?: number;
  category?: string;
  refinementPath?: string;
};

export type GateContext = {
  familyId?: string;
  formId?: string;
};

export type GatedFieldPrediction = FieldPrediction & {
  acordCode: string;
  modelConfidence: number;
  gatingValid: boolean;
  cluster: string;
  family: string;
  aliases: string[];
  checkboxGroup?: string;
  formMembership: string[];
  reasons: string[];
};

export type OntologySemanticMetadata = {
  acordCode: string;
  eLabelName: string;
  label: string;
  description: string;
  aliases: string[];
  family: string;
  xmlPath: string;
  cluster: string;
  formMembership: string[];
};

export type GateDecision = {
  accepted: boolean;
  prediction: GatedFieldPrediction;
};

const EXPLICIT_FAMILY_FORMS: Record<string, string[]> = {
  "acord-125": ["ACORD_125", "acord-125", "commercial-lines"],
  "acord-126": ["ACORD_126", "acord-126", "commercial-lines"],
  "acord-127": ["ACORD_127", "acord-127", "commercial-lines"],
  "acord-130": ["ACORD_130", "acord-130", "commercial-lines"],
  "acord-140": ["ACORD_140", "acord-140", "commercial-lines"],
  carrier: ["carrier", "carrier-form", "commercial-lines"],
  unknown: ["unknown", "commercial-lines"],
};

const CLASS_TO_FAMILY: Record<string, string> = {
  Producer: "acord-125",
  NamedInsured: "acord-125",
  Policy: "acord-125",
  Insurer: "acord-125",
  Location: "acord-125",
  Coverage: "acord-125",
  PolicyStatus: "acord-125",
};

const classByCode = new Map<string, string>();
const labelByCode = new Map<string, string>();
const aliasToCode = new Map<string, string>();
const formMembershipByCode = new Map<string, string[]>();

function normalizeText(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeFamily(value: string | undefined): string {
  return normalizeText(value || "").replace(/[_.]+/g, "-").replace(/\s+/g, "-");
}

function splitTokens(value: string): string[] {
  return normalizeText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0))).sort((a, b) =>
    a.localeCompare(b),
  );
}

function inferCluster(code: string): string {
  const trimmed = String(code || "").trim();
  if (trimmed.includes("_")) {
    return trimmed.split("_")[0] || "General";
  }
  if (trimmed.includes(".")) {
    return trimmed.split(".")[0] || "General";
  }
  return "General";
}

function inferCheckboxGroup(code: string): string | undefined {
  if (!/Indicator$/i.test(code)) {
    return undefined;
  }
  return code.replace(/Indicator$/i, "");
}

function inferFamilyFromCode(code: string): string {
  const cluster = inferCluster(code);
  return CLASS_TO_FAMILY[cluster] || "acord";
}

export function deriveOntologyClusterFromCode(code: string): string {
  seedOntologyIndexes();
  const trimmed = String(code || "").trim();
  if (!trimmed) {
    return "General";
  }

  return classByCode.get(trimmed) || inferCluster(trimmed);
}

function inferXmlPath(code: string): string {
  const trimmed = String(code || "").trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.includes(".")) {
    return trimmed;
  }
  if (trimmed.includes("_")) {
    return trimmed.replace(/_/g, ".");
  }
  return trimmed;
}

function evidenceToCode(evidence: string, className: string, propertyName: string): string | null {
  const token = String(evidence || "").trim();
  if (!token || token.includes("*")) {
    return null;
  }
  if (token.includes("_") || token.includes(".")) {
    return token;
  }
  if (/^[A-Za-z][A-Za-z0-9]*$/.test(token)) {
    return `${className}_${propertyName.charAt(0).toUpperCase()}${propertyName.slice(1)}`;
  }
  return null;
}

function pushAlias(code: string, alias: string): void {
  const normalizedAlias = normalizeText(alias);
  if (!normalizedAlias || aliasToCode.has(normalizedAlias)) {
    return;
  }
  aliasToCode.set(normalizedAlias, code);
}

function seedOntologyIndexes(): void {
  if (classByCode.size > 0) {
    return;
  }

  const classRegistry =
    ACORD_ONTOLOGY_REGISTRY &&
    typeof ACORD_ONTOLOGY_REGISTRY === "object" &&
    "classes" in ACORD_ONTOLOGY_REGISTRY &&
    ACORD_ONTOLOGY_REGISTRY.classes &&
    typeof ACORD_ONTOLOGY_REGISTRY.classes === "object"
      ? ACORD_ONTOLOGY_REGISTRY.classes
      : {};

  for (const [className, classEntry] of Object.entries(classRegistry)) {
    const classFamily = CLASS_TO_FAMILY[className] || "acord";
    for (const property of classEntry.properties) {
      for (const evidence of property.evidence || []) {
        const code = evidenceToCode(evidence, className, property.name);
        if (!code) {
          continue;
        }

        classByCode.set(code, className);
        labelByCode.set(code, property.name);

        const forms = EXPLICIT_FAMILY_FORMS[classFamily] || [classFamily, "commercial-lines"];
        formMembershipByCode.set(code, unique([...(formMembershipByCode.get(code) || []), ...forms]));

        pushAlias(code, code);
        pushAlias(code, property.name);
        pushAlias(code, `${className} ${property.name}`);

        const ontologyNode = getAcordOntologyNode(code);
        for (const alias of ontologyNode?.aliases || []) {
          pushAlias(code, alias);
        }
        for (const synonym of ontologyNode?.synonyms || []) {
          pushAlias(code, synonym);
        }
      }
    }
  }
}

export function getOntologyDictionaryEntries(): AcordDictionaryEntry[] {
  seedOntologyIndexes();
  const entries: AcordDictionaryEntry[] = [];

  for (const [code, className] of classByCode.entries()) {
    const label = labelByCode.get(code) || code;
    const ontologyNode = getAcordOntologyNode(code);
    entries.push({
      acordCode: code,
      label,
      description: `${className} ${label}`,
      dataType: "string",
      lob: "all",
      version: "ontology",
      keywords: unique([className, ...splitTokens(label), ...(ontologyNode?.synonyms || [])]),
    });
  }

  return entries.sort((left, right) => left.acordCode.localeCompare(right.acordCode));
}

export function resolveOntologySemanticMetadata(acordCode: string): OntologySemanticMetadata {
  seedOntologyIndexes();

  const code = String(acordCode || "").trim();
  const resolvedCode = code || "Unknown";
  const cluster = classByCode.get(resolvedCode) || inferCluster(resolvedCode);
  const family = inferFamilyFromCode(resolvedCode);
  const ontologyNode = getAcordOntologyNode(resolvedCode);
  const label = labelByCode.get(resolvedCode) || resolvedCode;
  const aliases = unique([
    resolvedCode,
    ...(ontologyNode?.aliases || []),
    ...(ontologyNode?.synonyms || []),
  ]);

  const formMembership =
    formMembershipByCode.get(resolvedCode) ||
    EXPLICIT_FAMILY_FORMS[family] ||
    [
      family,
      "acord-125",
      "acord-126",
      "acord-127",
      "acord-130",
      "acord-140",
      "carrier",
      "unknown",
      "commercial-lines",
    ];

  return {
    acordCode: resolvedCode,
    eLabelName: resolvedCode,
    label,
    description: `${cluster} ${label}`,
    aliases,
    family,
    xmlPath: inferXmlPath(resolvedCode),
    cluster,
    formMembership: unique(formMembership),
  };
}

export function buildOntologySemanticText(metadata: OntologySemanticMetadata): string {
  return [
    metadata.eLabelName,
    metadata.label,
    metadata.description,
    metadata.aliases.join(" "),
    metadata.family,
    metadata.xmlPath,
    metadata.cluster,
    metadata.formMembership.join(" "),
  ]
    .join(" ")
    .trim();
}

function resolveAcordCode(value: string): string | null {
  seedOntologyIndexes();
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  for (const code of classByCode.keys()) {
    if (normalizeText(code) === normalized) {
      return code;
    }
  }

  return aliasToCode.get(normalized) || null;
}

function allowByFormMembership(code: string, familyId: string | undefined): boolean {
  if (!familyId) {
    return true;
  }

  const normalizedFamily = normalizeFamily(familyId);
  const memberships = formMembershipByCode.get(code) || [inferFamilyFromCode(code)];
  return memberships.some((member) => normalizeFamily(member) === normalizedFamily);
}

function allowBySemanticRule(prediction: FieldPrediction, code: string): boolean {
  const isIndicatorCode = /Indicator$/i.test(code);
  const text = normalizeText(prediction.text);
  const looksBoolean = /\b(yes|no|true|false|y|n)\b/.test(text);

  if (isIndicatorCode && !looksBoolean && text.length > 0) {
    return false;
  }

  return true;
}

export function gateField(prediction: FieldPrediction, context?: GateContext): GateDecision {
  const acordCode = resolveAcordCode(prediction.eLabelName);
  const reasons: string[] = [];

  if (!acordCode) {
    reasons.push("unknown_acord_code");
  }

  if (acordCode && !allowByFormMembership(acordCode, context?.familyId)) {
    reasons.push("form_membership_rejected");
  }

  if (acordCode && !allowBySemanticRule(prediction, acordCode)) {
    reasons.push("semantic_rule_rejected");
  }

  const code = acordCode || prediction.eLabelName;
  const cluster = classByCode.get(code) || inferCluster(code);
  const family = inferFamilyFromCode(code);
  const aliases = unique([
    code,
    ...(getAcordOntologyNode(code)?.aliases || []),
    ...(getAcordOntologyNode(code)?.synonyms || []),
  ]);

  const gatedPrediction: GatedFieldPrediction = {
    ...prediction,
    acordCode: code,
    modelConfidence: Number(prediction.probability || 0),
    gatingValid: reasons.length === 0,
    cluster,
    family,
    aliases,
    checkboxGroup: inferCheckboxGroup(code),
    formMembership: formMembershipByCode.get(code) || [family],
    reasons,
  };

  return {
    accepted: gatedPrediction.gatingValid,
    prediction: gatedPrediction,
  };
}

export function gatePredictions(
  predictions: FieldPrediction[],
  context?: GateContext,
): { accepted: GatedFieldPrediction[]; rejected: GatedFieldPrediction[] } {
  const accepted: GatedFieldPrediction[] = [];
  const rejected: GatedFieldPrediction[] = [];

  const byCheckboxGroup = new Map<string, GatedFieldPrediction>();

  for (const candidate of predictions) {
    const decision = gateField(candidate, context);
    if (!decision.accepted) {
      rejected.push(decision.prediction);
      continue;
    }

    const checkboxGroup = decision.prediction.checkboxGroup;
    if (!checkboxGroup) {
      accepted.push(decision.prediction);
      continue;
    }

    const prior = byCheckboxGroup.get(`${decision.prediction.blockId}:${checkboxGroup}`);
    if (!prior || decision.prediction.modelConfidence > prior.modelConfidence) {
      byCheckboxGroup.set(`${decision.prediction.blockId}:${checkboxGroup}`, decision.prediction);
    }
  }

  accepted.push(...byCheckboxGroup.values());

  accepted.sort((left, right) => right.modelConfidence - left.modelConfidence);
  rejected.sort((left, right) => right.modelConfidence - left.modelConfidence);

  return { accepted, rejected };
}
