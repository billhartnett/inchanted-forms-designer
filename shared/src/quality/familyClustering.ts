import type {
  CalibrationLineageEntry,
  CalibrationOverrideSuggestion,
  CalibrationProfile,
  CalibrationSignalWeights,
  FormFamilyMetadata,
  MappingPersistencePayload,
  ReviewConfidenceThresholds,
} from "../types";

const CLASSIFIER_VERSION = "family-cluster-v1";
const VECTOR_SIZE = 16;

export type FormFamilyPrototype = {
  familyId: string;
  familyLabel: string;
  keywords: string[];
  codePrefixes: string[];
  layoutBias: number[];
};

export type FormFamilyClusterReport = {
  generatedAt: string;
  classifierVersion: string;
  clusterHash: string;
  documents: Array<{
    fixtureId: string;
    family: FormFamilyMetadata;
  }>;
  families: Array<{
    familyId: string;
    familyLabel: string;
    documents: number;
    avgConfidence: number;
    signatureHash: string;
  }>;
};

export type ResolvedFamilyCalibration = {
  familyId: string;
  thresholds: ReviewConfidenceThresholds;
  signalWeights: CalibrationSignalWeights;
  codeThresholdOverrides: Record<string, ReviewConfidenceThresholds>;
  lineage: CalibrationLineageEntry[];
};

const FAMILY_PROTOTYPES: FormFamilyPrototype[] = [
  {
    familyId: "acord-125",
    familyLabel: "ACORD 125 Commercial Insurance Application",
    keywords: ["acord 125", "commercial insurance application", "applicant information", "premises information"],
    codePrefixes: ["GeneralInfo", "NamedInsured", "Policy", "Producer", "CommercialPolicy"],
    layoutBias: [0.9, 0.7, 0.5, 0.4],
  },
  {
    familyId: "acord-126",
    familyLabel: "ACORD 126 Commercial General Liability",
    keywords: ["acord 126", "commercial general liability", "general liability", "hazards"],
    codePrefixes: ["GeneralLiability", "Liability", "Contractors"],
    layoutBias: [0.8, 0.6, 0.6, 0.5],
  },
  {
    familyId: "acord-140",
    familyLabel: "ACORD 140 Property Section",
    keywords: ["acord 140", "property section", "building information", "premises"],
    codePrefixes: ["CommercialProperty", "CommercialStructure", "Building", "Location"],
    layoutBias: [0.7, 0.8, 0.5, 0.6],
  },
  {
    familyId: "acord-90",
    familyLabel: "ACORD 90 Personal Auto Application",
    keywords: ["acord 90", "personal auto", "driver information", "vehicle information"],
    codePrefixes: ["Vehicle", "Driver", "PersonalAuto", "AccidentConviction"],
    layoutBias: [0.7, 0.5, 0.8, 0.5],
  },
  {
    familyId: "contractors-supplement",
    familyLabel: "Contractors Supplemental Application",
    keywords: ["contractor", "supplemental application", "subcontractor", "operations", "work performed"],
    codePrefixes: ["Contractors", "ContractorsUnderwriting", "Construction", "GeneralLiability"],
    layoutBias: [0.6, 0.6, 0.7, 0.8],
  },
  {
    familyId: "general-supplement",
    familyLabel: "Supplemental Insurance Form",
    keywords: ["supplement", "additional information", "explain", "remarks"],
    codePrefixes: ["BusinessInformation", "AdditionalInterest", "OtherInsurance"],
    layoutBias: [0.5, 0.5, 0.5, 0.5],
  },
];

function quantize(value: number): number {
  return Number(value.toFixed(6));
}

function hashString(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function normalizeVector(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!magnitude) return vector.map(() => 0);
  return vector.map((value) => quantize(value / magnitude));
}

function cosineSimilarity(left: number[], right: number[]): number {
  const length = Math.min(left.length, right.length);
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] * left[index];
    rightMagnitude += right[index] * right[index];
  }
  if (!leftMagnitude || !rightMagnitude) return 0;
  return quantize(dot / Math.sqrt(leftMagnitude * rightMagnitude));
}

function hashFeatures(features: string[]): number[] {
  const vector = Array.from({ length: VECTOR_SIZE }, () => 0);
  for (const feature of features) {
    const hash = Number.parseInt(hashString(feature), 16) >>> 0;
    const index = hash % VECTOR_SIZE;
    const sign = ((hash >>> 8) & 1) === 0 ? 1 : -1;
    vector[index] += sign;
  }
  return normalizeVector(vector);
}

function collectDocumentText(payload: MappingPersistencePayload): string {
  const lines = payload.pages.flatMap((page) => page.lines.map((line) => line.content));
  const mappingText = payload.mappings.map((record) => record.mapping.text);
  return [...lines, ...mappingText].join(" ").toLowerCase();
}

function chosenCodes(payload: MappingPersistencePayload): string[] {
  return payload.mappings
    .map((record) =>
      payload.decisionGraph.mappings[record.extractionBlockId]?.chosenCandidateCode ||
      record.mapping.chosen?.acordCode ||
      "",
    )
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
}

function buildLayoutSignature(payload: MappingPersistencePayload): number[] {
  const features: string[] = [];
  for (const page of [...payload.pages].sort((left, right) => left.pageNumber - right.pageNumber)) {
    features.push(`page-count:${payload.pages.length}`);
    features.push(`page-lines:${Math.min(20, Math.floor(page.lines.length / 10))}`);
    for (const line of page.lines) {
      const box = line.boundingBox;
      if (!box) continue;
      features.push(`x:${Math.floor(box.x / 10)}`);
      features.push(`y:${Math.floor(box.y / 10)}`);
      features.push(`w:${Math.floor(box.width / 10)}`);
      features.push(`tokens:${Math.min(12, line.content.trim().split(/\s+/).length)}`);
    }
  }
  return hashFeatures(features);
}

function buildSemanticSignature(payload: MappingPersistencePayload): number[] {
  const codes = chosenCodes(payload);
  const textTokens = collectDocumentText(payload)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4)
    .slice(0, 800);
  return hashFeatures([
    ...codes.map((code) => `code:${code.split(/[_.]/)[0]}`),
    ...textTokens.map((token) => `token:${token}`),
  ]);
}

function prototypeVector(prototype: FormFamilyPrototype): number[] {
  return hashFeatures([
    ...prototype.keywords.map((keyword) => `token:${keyword}`),
    ...prototype.codePrefixes.map((prefix) => `code:${prefix}`),
  ]);
}

export function classifyFormFamily(
  payload: MappingPersistencePayload,
  fixtureId = payload.documentId || "unknown-document",
): FormFamilyMetadata {
  const text = `${fixtureId} ${collectDocumentText(payload)}`.toLowerCase();
  const codes = chosenCodes(payload);
  const layoutSignature = buildLayoutSignature(payload);
  const semanticSignature = buildSemanticSignature(payload);

  const ranked = FAMILY_PROTOTYPES.map((prototype) => {
    const keywordHits = prototype.keywords.filter((keyword) => text.includes(keyword));
    const prefixHits = prototype.codePrefixes.filter((prefix) =>
      codes.some((code) => code.toLowerCase().startsWith(prefix.toLowerCase())),
    );
    const semanticSimilarity = cosineSimilarity(semanticSignature, prototypeVector(prototype));
    const filenameBoost = fixtureId.toLowerCase().includes(prototype.familyId.replace("-", " ")) ? 0.25 : 0;
    const score = quantize(
      Math.min(
        1,
        keywordHits.length * 0.16 + prefixHits.length * 0.08 + Math.max(0, semanticSimilarity) * 0.35 + filenameBoost,
      ),
    );
    return { prototype, score, keywordHits, prefixHits, semanticSimilarity };
  }).sort(
    (left, right) =>
      right.score - left.score || left.prototype.familyId.localeCompare(right.prototype.familyId),
  );

  const winner = ranked[0];
  const confidence = winner?.score || 0;
  const familyId = confidence >= 0.2 ? winner.prototype.familyId : "unclassified";
  const familyLabel = confidence >= 0.2 ? winner.prototype.familyLabel : "Unclassified Insurance Form";
  const evidence = winner
    ? [
        ...winner.keywordHits.map((keyword) => `keyword:${keyword}`),
        ...winner.prefixHits.map((prefix) => `acord-prefix:${prefix}`),
        `semantic-similarity:${winner.semanticSimilarity.toFixed(3)}`,
        `layout-pages:${payload.pages.length}`,
      ].sort((left, right) => left.localeCompare(right))
    : ["No family prototype evidence available."];
  const signatureHash = hashString(stableSerialize({ familyId, layoutSignature, semanticSignature }));

  return {
    familyId,
    familyLabel,
    confidence,
    signatureHash,
    layoutSignature,
    semanticSignature,
    evidence,
    classifiedAt: "deterministic",
    classifierVersion: CLASSIFIER_VERSION,
  };
}

export function clusterFormFamilies(
  documents: Array<{ fixtureId: string; payload: MappingPersistencePayload }>,
): FormFamilyClusterReport {
  const classified = documents
    .map((document) => ({
      fixtureId: document.fixtureId,
      family: classifyFormFamily(document.payload, document.fixtureId),
    }))
    .sort((left, right) => left.fixtureId.localeCompare(right.fixtureId));

  const byFamily = new Map<string, typeof classified>();
  for (const document of classified) {
    const entries = byFamily.get(document.family.familyId) || [];
    entries.push(document);
    byFamily.set(document.family.familyId, entries);
  }

  const families = Array.from(byFamily.entries())
    .map(([familyId, entries]) => ({
      familyId,
      familyLabel: entries[0].family.familyLabel,
      documents: entries.length,
      avgConfidence: quantize(
        entries.reduce((sum, entry) => sum + entry.family.confidence, 0) / entries.length,
      ),
      signatureHash: hashString(entries.map((entry) => entry.family.signatureHash).sort().join(":")),
    }))
    .sort((left, right) => left.familyId.localeCompare(right.familyId));

  return {
    generatedAt: "deterministic",
    classifierVersion: CLASSIFIER_VERSION,
    clusterHash: hashString(stableSerialize({ documents: classified, families })),
    documents: classified,
    families,
  };
}

export function resolveFamilyCalibration(
  profile: CalibrationProfile,
  familyId: string,
): ResolvedFamilyCalibration {
  const family = profile.familyOverrides?.[familyId];
  const thresholds: ReviewConfidenceThresholds = {
    accepted: family?.thresholds?.accepted ?? profile.globalThresholds.accepted,
    review: family?.thresholds?.review ?? profile.globalThresholds.review,
    rejected: family?.thresholds?.rejected ?? profile.globalThresholds.rejected,
  };
  const signalWeights: CalibrationSignalWeights = {
    embedding: family?.signalWeights?.embedding ?? profile.signalWeights.embedding,
    lexical: family?.signalWeights?.lexical ?? profile.signalWeights.lexical,
    dictionary: family?.signalWeights?.dictionary ?? profile.signalWeights.dictionary,
    heuristic: family?.signalWeights?.heuristic ?? profile.signalWeights.heuristic,
  };
  const lineage: CalibrationLineageEntry[] = [];
  for (const [property, value] of Object.entries(thresholds)) {
    lineage.push({
      scope: family?.thresholds?.[property as keyof ReviewConfidenceThresholds] !== undefined ? "family" : "global",
      sourceId: family?.thresholds?.[property as keyof ReviewConfidenceThresholds] !== undefined ? familyId : profile.profileId,
      property: `thresholds.${property}`,
      value,
    });
  }
  for (const [property, value] of Object.entries(signalWeights)) {
    lineage.push({
      scope: family?.signalWeights?.[property as keyof CalibrationSignalWeights] !== undefined ? "family" : "global",
      sourceId: family?.signalWeights?.[property as keyof CalibrationSignalWeights] !== undefined ? familyId : profile.profileId,
      property: `signalWeights.${property}`,
      value,
    });
  }

  return {
    familyId,
    thresholds,
    signalWeights,
    codeThresholdOverrides: {
      ...profile.codeThresholdOverrides,
      ...(family?.codeThresholdOverrides || {}),
    },
    lineage: lineage.sort((left, right) => left.property.localeCompare(right.property)),
  };
}

export function suggestFamilyCalibrationOverrides(
  payload: MappingPersistencePayload,
  profile: CalibrationProfile,
  family: FormFamilyMetadata,
): CalibrationOverrideSuggestion[] {
  const resolved = resolveFamilyCalibration(profile, family.familyId);
  const byCode = new Map<string, { confidences: number[]; disagreements: number }>();
  for (const record of payload.mappings) {
    const code =
      payload.decisionGraph.mappings[record.extractionBlockId]?.chosenCandidateCode ||
      record.mapping.chosen?.acordCode;
    if (!code) continue;
    const candidate = record.mapping.suggestions.find((item) => item.acordCode === code) || record.mapping.chosen;
    if (!candidate) continue;
    const values = byCode.get(code) || { confidences: [], disagreements: 0 };
    values.confidences.push(candidate.confidenceScore);
    const signals = [
      candidate.semanticSimilarity || 0,
      candidate.lexicalScore || 0,
      candidate.dictionaryScore || 0,
      candidate.heuristicScore || 0,
    ];
    if (Math.max(...signals) - Math.min(...signals) > 0.5) values.disagreements += 1;
    byCode.set(code, values);
  }

  const suggestions = Array.from(byCode.entries())
    .filter(([, values]) => values.confidences.length >= 2)
    .reduce<CalibrationOverrideSuggestion[]>((items, [acordCode, values]) => {
      const average = values.confidences.reduce((sum, value) => sum + value, 0) / values.confidences.length;
      const disagreementRate = values.disagreements / values.confidences.length;
      if (average >= resolved.thresholds.accepted && disagreementRate < 0.35) return items;
      const accepted = quantize(Math.max(resolved.thresholds.review, Math.min(0.95, average + 0.08)));
      items.push({
        suggestionId: hashString(`${family.familyId}:${acordCode}:${accepted}`),
        familyId: family.familyId,
        acordCode,
        kind: "threshold" as const,
        reason: `Average confidence ${average.toFixed(3)}; rationale disagreement ${(disagreementRate * 100).toFixed(0)}%.`,
        confidence: quantize(Math.min(1, values.confidences.length / 5 + disagreementRate * 0.4)),
        proposedThresholds: {
          accepted,
          review: quantize(Math.min(accepted, resolved.thresholds.review)),
          rejected: resolved.thresholds.rejected,
        },
      });
      return items;
    }, []);

  return suggestions
    .sort((left, right) => right.confidence - left.confidence || (left.acordCode || "").localeCompare(right.acordCode || ""))
    .slice(0, 12);
}
