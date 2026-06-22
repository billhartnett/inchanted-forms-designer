import {
  searchAcordDictionary,
  lookupAcordByCode,
  getEmbeddingCache,
  ensureEmbeddings,
} from "./acordDictionary";
import { embedText, cosineSimilarity } from "./embeddings";
import type {
  AcordLabelCandidate as AcordSuggestion,
  CarrierAdapterOverride,
  GlobalSemanticGraphSnapshot,
  UnderwritingRuleOverride,
} from "shared/acord";
import {
  arbitrateCandidateByOntology,
  getAcordOntologyNode,
  selectOntologyBundlesForFamily,
} from "shared/acord";
import {
  buildGlobalSemanticGraph,
  createDefaultCalibrationProfile,
  DEFAULT_CALIBRATION_SIGNAL_WEIGHTS,
  blendNormalizedSignals,
  adaptCandidateToCarrier,
  evaluateCandidateUnderwritingRules,
  inferCandidateRiskAndDecisionIntelligence,
  inferCandidateFromGlobalGraph,
  normalizeSignalsForFamily,
  resolveUnificationForCode,
  resolveFamilyCalibration,
} from "shared/quality";
import type {
  CalibrationProfile,
  ExtractedBlock,
  FieldMapping,
  MappingPersistencePayload,
  ReviewConfidenceThresholds,
} from "shared/types";

export type { AcordSuggestion, ExtractedBlock, FieldMapping };

type ScoreAccumulator = {
  acordCode: string;
  label: string;
  description?: string;
  score: number;
  dictionaryScore: number;
  heuristicScore: number;
  semanticSimilarity: number;
  source: "ai" | "dictionary" | "heuristic";
};

const SCORE_PRECISION = 6;

function quantize(value: number, digits = SCORE_PRECISION): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Number(value.toFixed(digits));
}

function compareScoreAccumulator(left: ScoreAccumulator, right: ScoreAccumulator): number {
  return (
    right.score - left.score ||
    right.semanticSimilarity - left.semanticSimilarity ||
    right.dictionaryScore - left.dictionaryScore ||
    right.heuristicScore - left.heuristicScore ||
    left.acordCode.localeCompare(right.acordCode) ||
    left.label.localeCompare(right.label)
  );
}

function compareSuggestion(
  left: Pick<
    AcordSuggestion,
    "confidenceScore" | "acordCode" | "lexicalScore" | "semanticSimilarity" | "dictionaryScore" | "heuristicScore"
  >,
  right: Pick<
    AcordSuggestion,
    "confidenceScore" | "acordCode" | "lexicalScore" | "semanticSimilarity" | "dictionaryScore" | "heuristicScore"
  >,
): number {
  return (
    right.confidenceScore - left.confidenceScore ||
    right.semanticSimilarity - left.semanticSimilarity ||
    right.lexicalScore - left.lexicalScore ||
    right.dictionaryScore - left.dictionaryScore ||
    right.heuristicScore - left.heuristicScore ||
    left.acordCode.localeCompare(right.acordCode)
  );
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function resolveCalibrationProfile(profile: CalibrationProfile | undefined): CalibrationProfile {
  return profile || createDefaultCalibrationProfile();
}

function resolveScopedCalibrationProfile(
  profile: CalibrationProfile | undefined,
  familyId: string | undefined,
): CalibrationProfile {
  const base = resolveCalibrationProfile(profile);
  if (!familyId) return base;
  const resolved = resolveFamilyCalibration(base, familyId);
  return {
    ...base,
    globalThresholds: resolved.thresholds,
    signalWeights: resolved.signalWeights,
    codeThresholdOverrides: resolved.codeThresholdOverrides,
    lineage: resolved.lineage,
  };
}

function resolveThresholds(
  profile: CalibrationProfile,
  acordCode: string,
): ReviewConfidenceThresholds {
  return profile.codeThresholdOverrides[acordCode] || profile.globalThresholds;
}

function normalizeSignalWeights(profile: CalibrationProfile) {
  const configured = profile.signalWeights || DEFAULT_CALIBRATION_SIGNAL_WEIGHTS;
  const total = Math.max(
    0.000001,
    configured.embedding +
      configured.lexical +
      configured.dictionary +
      configured.heuristic,
  );
  return {
    embedding: configured.embedding / total,
    lexical: configured.lexical / total,
    dictionary: configured.dictionary / total,
    heuristic: configured.heuristic / total,
  };
}

function safeDictionarySearch(query: string, limit: number) {
  try {
    return searchAcordDictionary(query, limit);
  } catch {
    return [] as ReturnType<typeof searchAcordDictionary>;
  }
}

function hasAnyToken(normalizedText: string, tokens: string[]): boolean {
  return tokens.some((token) => normalizedText.includes(token));
}

function isNamePrompt(text: string): boolean {
  const normalized = normalizeText(text);
  return hasAnyToken(normalized, [
    "name",
    "applicant",
    "insured",
    "agent",
    "producer",
  ]);
}

function isAddressPrompt(text: string): boolean {
  const normalized = normalizeText(text);
  return hasAnyToken(normalized, ["address", "mailing", "street"]);
}

function isCityStateZipPrompt(text: string): boolean {
  const normalized = normalizeText(text);
  return (
    hasAnyToken(normalized, ["city"]) &&
    hasAnyToken(normalized, ["state"]) &&
    hasAnyToken(normalized, ["zip", "postal"])
  );
}

function isLikelyFormTitle(text: string): boolean {
  const normalized = normalizeText(text);
  const tokens = normalized.split(" ").filter(Boolean);

  if (tokens.length < 4) return false;

  const titleTokens = [
    "acord",
    "application",
    "supplement",
    "declaration",
    "certificate",
    "insurance",
    "commercial",
    "workers",
    "compensation",
    "liability",
  ];

  const fieldTokens = [
    "name",
    "address",
    "city",
    "state",
    "zip",
    "postal",
    "phone",
    "email",
    "dob",
    "birth",
    "applicant",
    "insured",
  ];

  return (
    hasAnyToken(normalized, titleTokens) &&
    !hasAnyToken(normalized, fieldTokens)
  );
}

function isLikelyTitleText(text: string): boolean {
  const normalized = normalizeText(text);
  if (!normalized) return false;

  const tokens = normalized.split(" ").filter(Boolean);
  if (tokens.length < 4) return false;

  const titleWords = [
    "acord",
    "application",
    "supplement",
    "declaration",
    "certificate",
    "coverage",
    "liability",
    "insurance",
    "policyholder",
    "commercial",
  ];

  const hasTitleWord = titleWords.some((word) => normalized.includes(word));
  const hasFieldToken =
    /(name|address|city|state|zip|phone|email|date|policy|insured|applicant)/.test(
      normalized,
    );

  return hasTitleWord && !hasFieldToken;
}

function getLabelPenaltyFactor(
  blockText: string,
  label: string,
  acordCode: string,
): number {
  const query = normalizeText(blockText);
  const labelText = normalizeText(`${label} ${acordCode}`);
  const queryTokens = tokenize(query);
  const labelTokens = tokenize(labelText);

  const formLevelTokens = [
    "acordform",
    "certificate",
    "statement",
    "filing",
    "remark",
    "liability",
    "workers",
    "compensation",
  ];

  const isShortFieldPrompt = queryTokens.length > 0 && queryTokens.length <= 4;
  const hasFieldCueToken = hasAnyToken(query, [
    "name",
    "address",
    "city",
    "state",
    "zip",
    "postal",
    "phone",
    "email",
    "dob",
    "birth",
    "applicant",
    "insured",
  ]);

  const hasFormLevelLabelToken = formLevelTokens.some((token) =>
    labelText.includes(token),
  );

  const unmatched = labelTokens.filter(
    (token) => !queryTokens.some((q) => token.includes(q) || q.includes(token)),
  ).length;

  let factor = 1;

  if (isShortFieldPrompt && hasFieldCueToken && hasFormLevelLabelToken) {
    factor *= 0.4;
  }

  if (isShortFieldPrompt && unmatched >= 6) {
    factor *= 0.55;
  } else if (isShortFieldPrompt && unmatched >= 4) {
    factor *= 0.75;
  }

  if (isNamePrompt(blockText)) {
    if (
      hasAnyToken(labelText, [
        "indicator",
        "explanation",
        "same as",
        "merged",
        "changed",
      ])
    ) {
      factor *= 0.25;
    }

    if (
      hasAnyToken(labelText, [
        "full name",
        "given name",
        "surname",
        "last name",
        "first name",
      ])
    ) {
      factor *= 1.4;
    }
  }

  if (isAddressPrompt(blockText)) {
    if (hasAnyToken(labelText, ["line one", "line two", "street", "mailing"])) {
      factor *= 1.25;
    }
  }

  if (isCityStateZipPrompt(blockText)) {
    if (
      hasAnyToken(labelText, [
        "city",
        "state",
        "province",
        "postal",
        "zip",
        "address",
      ])
    ) {
      factor *= 1.3;
    } else {
      factor *= 0.18;
    }
  }

  if (
    hasAnyToken(labelText, ["capacity", "watercraft", "trailer", "vehicle"])
  ) {
    factor *= 0.45;
  }

  return factor;
}

function getTokenPrecisionBoost(blockText: string, label: string): number {
  const queryTokens = tokenize(blockText);
  const labelTokens = tokenize(label);

  if (queryTokens.length === 0 || labelTokens.length === 0) return 1;

  const overlap = queryTokens.filter((q) =>
    labelTokens.some((t) => t.includes(q) || q.includes(t)),
  ).length;

  const recall = overlap / queryTokens.length;
  const precision = overlap / labelTokens.length;

  // F-score style blend that favors compact labels for short prompts.
  const score = recall * 0.65 + precision * 0.35;
  return 0.7 + Math.min(0.5, score * 0.5);
}

function hasFieldCue(text: string): boolean {
  const normalized = normalizeText(text);
  if (!normalized) return false;

  if (text.trim().endsWith(":")) return true;

  return /(name|address|city|state|zip|phone|email|date|policy|insured|applicant|dob|birth|effective|expiration|expiry|agent|producer|id|code|eff\b|exp\b)/.test(
    normalized,
  );
}

function isLikelyInstructionOrQuestion(text: string): boolean {
  const normalized = normalizeText(text);
  if (!normalized) return false;

  if (/[?]$/.test(text.trim())) {
    return true;
  }

  if (
    /^(if yes|if no|please explain|describe|list |include )/.test(normalized)
  ) {
    return true;
  }

  return hasAnyToken(normalized, [
    "submitted with",
    "supplemental application",
    "application",
    "operations in detail",
    "have you had",
    "claims during",
    "type of work",
  ]);
}

function isLikelyHeaderOrLogoNoise(text: string): boolean {
  const normalized = normalizeText(text);
  if (!normalized) return false;

  const orgTokens = [
    "insurance company",
    "agency",
    "services",
    "inc",
    "llc",
    "corporation",
    "fax",
    "phone",
    "www",
    "com",
  ];

  const hasOrgToken = hasAnyToken(normalized, orgTokens);
  const hasContactPattern = /(\d{3}[\s\-\)]*\d{3}[\s\-]\d{4})/.test(text);

  return hasOrgToken || hasContactPattern;
}

function isLikelyTabularSchemaText(text: string): boolean {
  const normalized = normalizeText(text);
  if (!normalized) return false;

  if (/^\d+\.$/.test(normalized) || /^[a-z]\.$/.test(normalized)) {
    return true;
  }

  if (/\byes\b.*\bno\b|\bno\b.*\byes\b/.test(normalized)) {
    return true;
  }

  const tableHeaderPhrases = [
    "type of work performed",
    "receipts",
    "location",
    "start date",
    "end date",
    "number of",
    "full time employees",
    "part time employees",
    "day laborers",
    "kind of license",
    "license no",
    "year license issued",
    "date of corporate filing",
  ];

  return tableHeaderPhrases.some((phrase) => normalized.includes(phrase));
}

function isLikelyNonMappableText(block: ExtractedBlock): boolean {
  const normalized = normalizeText(block.text);
  if (!normalized) return true;

  const tokenCount = normalized.split(" ").filter(Boolean).length;
  const fieldCue = hasFieldCue(block.text);

  if (isLikelyFormTitle(block.text)) return true;
  if (
    !fieldCue &&
    tokenCount >= 5 &&
    isLikelyHeaderOrLogoNoise(block.text)
  ) {
    return true;
  }

  if (
    !fieldCue &&
    tokenCount >= 6 &&
    isLikelyTabularSchemaText(block.text)
  ) {
    return true;
  }

  if (
    !fieldCue &&
    tokenCount >= 8 &&
    (isLikelyTitleText(block.text) || isLikelyInstructionOrQuestion(block.text))
  ) {
    return true;
  }

  if (tokenCount >= 16 && !fieldCue) {
    return true;
  }

  return false;
}

function lexicalAnchorScore(
  blockText: string,
  label: string,
  acordCode: string,
) {
  const queryTokens = tokenize(blockText);
  const labelTokens = tokenize(`${label} ${acordCode}`);
  if (queryTokens.length === 0 || labelTokens.length === 0) {
    return 0;
  }

  const overlap = queryTokens.filter((queryToken) =>
    labelTokens.some(
      (labelToken) =>
        labelToken.includes(queryToken) || queryToken.includes(labelToken),
    ),
  ).length;

  return overlap / queryTokens.length;
}

function getBlockScoreMultiplier(block: ExtractedBlock): number {
  if (isLikelyTitleText(block.text)) {
    return 0.35;
  }

  if (hasFieldCue(block.text)) {
    return 1.25;
  }

  return 1;
}

function ensureAccumulator(
  accum: Map<string, ScoreAccumulator>,
  acordCode: string,
  defaults: {
    label: string;
    description?: string;
    source: "ai" | "dictionary" | "heuristic";
  },
): ScoreAccumulator {
  const existing = accum.get(acordCode);
  if (existing) return existing;

  const created: ScoreAccumulator = {
    acordCode,
    label: defaults.label,
    description: defaults.description,
    score: 0,
    dictionaryScore: 0,
    heuristicScore: 0,
    semanticSimilarity: 0,
    source: defaults.source,
  };

  accum.set(acordCode, created);
  return created;
}

function applyIntentSignals(
  block: ExtractedBlock,
  accum: Map<string, ScoreAccumulator>,
) {
  const normalized = normalizeText(block.text);
  const multiplier = getBlockScoreMultiplier(block);

  const intents: Array<{ query: string; weight: number }> = [];

  if (isNamePrompt(normalized)) {
    intents.push(
      { query: "named insured full name", weight: 1.4 },
      { query: "named insured given name", weight: 1.2 },
      { query: "named insured surname", weight: 1.2 },
      { query: "applicant full name", weight: 1.1 },
    );
  }

  if (isAddressPrompt(normalized)) {
    intents.push(
      { query: "mailing address line one", weight: 1.35 },
      { query: "mailing address line two", weight: 1.15 },
      { query: "mailing address city name", weight: 1.0 },
      { query: "mailing address state or province code", weight: 1.0 },
      { query: "mailing address postal code", weight: 1.0 },
    );
  }

  if (isCityStateZipPrompt(normalized)) {
    intents.push(
      { query: "mailing address city name", weight: 1.25 },
      { query: "mailing address state or province code", weight: 1.25 },
      { query: "mailing address postal code", weight: 1.3 },
      { query: "postal code", weight: 1.1 },
    );
  }

  for (const intent of intents) {
    const hits = safeDictionarySearch(intent.query, 3);
    for (const hit of hits) {
      const weighted = quantize(hit.score * 0.9 * intent.weight * multiplier);
      const entry = ensureAccumulator(accum, hit.entry.acordCode, {
        label: hit.entry.label,
        description: hit.entry.description,
        source: "heuristic",
      });
      entry.score = quantize(entry.score + weighted);
      entry.heuristicScore = quantize(entry.heuristicScore + weighted);
      if (entry.source !== "dictionary") {
        entry.source = "heuristic";
      }
    }
  }
}

function applyDictionarySignals(
  block: ExtractedBlock,
  accum: Map<string, ScoreAccumulator>,
) {
  const multiplier = getBlockScoreMultiplier(block);
  const primary = safeDictionarySearch(block.text, 6);
  for (const hit of primary) {
    const weighted = quantize(hit.score * multiplier);
    const entry = ensureAccumulator(accum, hit.entry.acordCode, {
      label: hit.entry.label,
      description: hit.entry.description,
      source: "dictionary",
    });
    entry.score = quantize(entry.score + weighted);
    entry.dictionaryScore = quantize(entry.dictionaryScore + weighted);
    if (entry.source !== "ai") {
      entry.source = "dictionary";
    }
  }

  const keywordTokens = tokenize(block.text).slice(0, 8);
  for (const token of keywordTokens) {
    const hits = safeDictionarySearch(token, 3);
    for (const hit of hits) {
      const weighted = quantize(hit.score * 0.35 * multiplier);
      const entry = ensureAccumulator(accum, hit.entry.acordCode, {
        label: hit.entry.label,
        description: hit.entry.description,
        source: "dictionary",
      });
      entry.score = quantize(entry.score + weighted);
      entry.dictionaryScore = quantize(entry.dictionaryScore + weighted);
    }
  }
}

function applyHeuristicSignals(
  block: ExtractedBlock,
  accum: Map<string, ScoreAccumulator>,
) {
  const normalized = normalizeText(block.text);
  const multiplier = getBlockScoreMultiplier(block);

  const heuristicQueries: string[] = [];
  if (normalized.includes("name")) heuristicQueries.push("insured name");
  if (normalized.includes("first name")) heuristicQueries.push("first name");
  if (normalized.includes("last name")) heuristicQueries.push("last name");
  if (normalized.includes("address")) heuristicQueries.push("mailing address");
  if (normalized.includes("street")) heuristicQueries.push("street address");
  if (normalized.includes("city")) heuristicQueries.push("city");
  if (normalized.includes("state")) heuristicQueries.push("state code");
  if (normalized.includes("zip") || normalized.includes("postal")) {
    heuristicQueries.push("postal code");
  }
  if (normalized.includes("date")) heuristicQueries.push("effective date");
  if (normalized.includes("birth") || normalized.includes("dob")) {
    heuristicQueries.push("date of birth");
  }
  if (normalized.includes("premium")) heuristicQueries.push("premium amount");
  if (normalized.includes("policy")) heuristicQueries.push("policy number");
  if (/\bpolicy\s*(no|number|#)\b/.test(normalized)) {
    heuristicQueries.push("policy number identifier");
  }
  if (normalized.includes("phone")) heuristicQueries.push("phone number");
  if (normalized.includes("email")) heuristicQueries.push("email address");
  if (normalized.includes("agent") || normalized.includes("producer")) {
    heuristicQueries.push("agent name");
    heuristicQueries.push("producer name");
    heuristicQueries.push("agent code");
    heuristicQueries.push("producer code");
  }
  if (/\b(id|code)\b/.test(normalized) && (normalized.includes("agent") || normalized.includes("producer"))) {
    heuristicQueries.push("agent identifier");
    heuristicQueries.push("producer identifier");
  }
  if (/\b(effective|eff)\b/.test(normalized)) {
    heuristicQueries.push("effective date");
    heuristicQueries.push("policy effective date");
  }
  if (/\b(expiration|expiry|exp)\b/.test(normalized)) {
    heuristicQueries.push("expiration date");
    heuristicQueries.push("policy expiration date");
  }

  for (const query of heuristicQueries) {
    const hits = safeDictionarySearch(query, 2);
    for (const hit of hits) {
      const weighted = quantize(hit.score * 0.65 * multiplier);
      const entry = ensureAccumulator(accum, hit.entry.acordCode, {
        label: hit.entry.label,
        description: hit.entry.description,
        source: "heuristic",
      });
      entry.score = quantize(entry.score + weighted);
      entry.heuristicScore = quantize(entry.heuristicScore + weighted);
      if (entry.source !== "dictionary") {
        entry.source = "heuristic";
      }
    }
  }
}

function boostKnownCode(
  accum: Map<string, ScoreAccumulator>,
  acordCode: string,
  boost: number,
) {
  const found = lookupAcordByCode(acordCode);
  if (!found) return;

  const entry = ensureAccumulator(accum, found.acordCode, {
    label: found.label,
    description: found.description,
    source: "heuristic",
  });

  entry.score = quantize(entry.score + boost);
  entry.heuristicScore = quantize(entry.heuristicScore + boost);
}

function applyAnchorOverrideSignals(
  block: ExtractedBlock,
  accum: Map<string, ScoreAccumulator>,
) {
  const normalized = normalizeText(block.text);
  if (!normalized) return;

  const hasAgentOrProducer = /\b(agent|producer)\b/.test(normalized);
  const hasName = /\bname\b/.test(normalized);
  const hasIdCode = /\b(id|code|number|no|#)\b/.test(normalized);

  if (/\bpolicy\b/.test(normalized) && /\b(number|no|#)\b/.test(normalized)) {
    boostKnownCode(accum, "Policy_PolicyNumberIdentifier", 240);
  }

  if (/\b(effective|eff)\b/.test(normalized) && /\bdate\b/.test(normalized)) {
    boostKnownCode(accum, "Policy_EffectiveDate", 240);
  }

  if (/\b(expiration|expiry|exp)\b/.test(normalized) && /\bdate\b/.test(normalized)) {
    boostKnownCode(accum, "Policy_ExpirationDate", 240);
  }

  if (hasAgentOrProducer && hasName) {
    boostKnownCode(accum, "Producer_FullName", 235);
    boostKnownCode(accum, "Producer_ContactPerson_FullName", 220);
  }

  if (hasAgentOrProducer && hasIdCode) {
    boostKnownCode(accum, "Producer_CustomerIdentifier", 235);
  }
}

/**
 * Semantic signal via cosine similarity against precomputed ACORD embeddings.
 * No-ops gracefully when embeddings are unavailable or not yet cached.
 *
 * Set DISABLE_RUNTIME_EMBEDDINGS=1 to skip per-block OpenAI API calls while
 * keeping the precomputed ACORD cache for future ranking use. This avoids
 * HTTP 431 (headers too large) errors when processing large batches.
 */
async function applySemanticSignals(
  block: ExtractedBlock,
  accum: Map<string, ScoreAccumulator>,
  deterministic = false,
): Promise<void> {
  // Skip when explicitly disabled or running in deterministic mode.
  // Dictionary + heuristic scoring covers 91% of mappings without embeddings.
  if (deterministic || process.env.DISABLE_RUNTIME_EMBEDDINGS === "1") {
    return;
  }

  const multiplier = getBlockScoreMultiplier(block);
  const cache = getEmbeddingCache();
  if (cache.size === 0) return; // embeddings not ready or not configured

  let blockEmbedding: number[];
  try {
    blockEmbedding = await embedText(block.text);
  } catch {
    return;
  }
  if (blockEmbedding.length === 0) return;

  // Score every cached ACORD entry and collect those above threshold.
  const SIMILARITY_THRESHOLD = 0.3;
  const TOP_K = 12;

  const candidates: Array<{ acordCode: string; sim: number }> = [];

  for (const [acordCode, embedding] of cache) {
    const sim = quantize(cosineSimilarity(blockEmbedding, embedding));
    if (sim >= SIMILARITY_THRESHOLD) {
      candidates.push({ acordCode, sim });
    }
  }

  candidates.sort((a, b) => b.sim - a.sim || a.acordCode.localeCompare(b.acordCode));
  const top = candidates.slice(0, TOP_K);

  for (const { acordCode, sim } of top) {
    // Scale cosine similarity to the same magnitude as dictionary scores
    // (dictionary exact-code match = 200, label match = 160).
    const semanticScore = quantize(sim * 240 * multiplier);

    const found = lookupAcordByCode(acordCode);
    if (!found) continue;

    const entry = ensureAccumulator(accum, acordCode, {
      label: found.label,
      description: found.description,
      source: "ai",
    });
    entry.score = quantize(entry.score + semanticScore);
    entry.semanticSimilarity = quantize(Math.max(entry.semanticSimilarity, sim));

    // Promote source to AI only when semantic evidence is clearly strong.
    if (sim >= 0.78 && entry.source !== "dictionary") {
      entry.source = "ai";
    }
  }
}

function toSuggestions(
  accum: Map<string, ScoreAccumulator>,
  block: ExtractedBlock,
  blockConfidence: number,
  calibrationProfile?: CalibrationProfile,
  familyId?: string,
  graphSnapshot?: GlobalSemanticGraphSnapshot,
  carrierAdapterOverrides?: CarrierAdapterOverride[],
  underwritingRuleOverrides?: UnderwritingRuleOverride[],
): AcordSuggestion[] {
  const profile = resolveScopedCalibrationProfile(calibrationProfile, familyId);
  const hasExplicitFieldCue = hasFieldCue(block.text);
  const ontologyBundles = selectOntologyBundlesForFamily(familyId);
  const normalizedWeights = normalizeSignalWeights(profile);
  const getAddressComponentKind = (
    label: string,
    acordCode: string,
  ): "line1" | "line2" | "city" | "state" | "postal" | null => {
    const text = normalizeText(`${label} ${acordCode}`);
    if (hasAnyToken(text, ["line one", "line1"])) return "line1";
    if (hasAnyToken(text, ["line two", "line2"])) return "line2";
    if (hasAnyToken(text, ["city"])) return "city";
    if (hasAnyToken(text, ["state", "province"])) return "state";
    if (hasAnyToken(text, ["postal", "zip"])) return "postal";
    return null;
  };

  const scored = [...accum.values()]
    .map((item) => {
      const penalty = getLabelPenaltyFactor(
        block.text,
        item.label,
        item.acordCode,
      );
      const precisionBoost = getTokenPrecisionBoost(block.text, item.label);
      return {
        ...item,
        score: quantize(item.score * penalty * precisionBoost),
        dictionaryScore: quantize(item.dictionaryScore),
        heuristicScore: quantize(item.heuristicScore),
        semanticSimilarity: quantize(item.semanticSimilarity),
      };
    })
    .sort(compareScoreAccumulator);

  const getLocationKind = (
    label: string,
    acordCode: string,
  ): "city" | "state" | "postal" | null => {
    const text = normalizeText(`${label} ${acordCode}`);
    const isPostal = hasAnyToken(text, ["postal", "zip"]);
    const isState = hasAnyToken(text, ["state", "province"]);
    const isCity = hasAnyToken(text, ["city"]);

    if (isPostal) return "postal";
    if (isState) return "state";
    if (isCity) return "city";
    return null;
  };

  const buildLocationFallback = (
    kind: "city" | "state" | "postal",
  ): ScoreAccumulator | null => {
    const queryByKind: Record<typeof kind, string> = {
      city: "mailing address city name",
      state: "mailing address state or province code",
      postal: "mailing address postal code",
    };

    const fallbackHits = [...safeDictionarySearch(queryByKind[kind], 5)].sort(
      (left, right) => right.score - left.score || left.entry.acordCode.localeCompare(right.entry.acordCode),
    );
    const picked =
      fallbackHits.find(
        (hit) => getLocationKind(hit.entry.label, hit.entry.acordCode) === kind,
      ) ?? fallbackHits[0];

    if (!picked) return null;

    const syntheticBase = scored[0]?.score || 100;
    const syntheticWeightByKind: Record<typeof kind, number> = {
      city: 1.35,
      state: 1.25,
      postal: 1.15,
    };

    const syntheticScore = quantize(syntheticBase * syntheticWeightByKind[kind]);

    return {
      acordCode: picked.entry.acordCode,
      label: picked.entry.label,
      description: picked.entry.description,
      score: syntheticScore,
      dictionaryScore: syntheticScore,
      heuristicScore: 0,
      semanticSimilarity: 0,
      source: "dictionary",
    };
  };

  const enforceCityStatePostalOrder = (
    items: ScoreAccumulator[],
  ): ScoreAccumulator[] => {
    if (!isCityStateZipPrompt(block.text)) {
      return items;
    }

    const kinds: Array<"city" | "state" | "postal"> = [
      "city",
      "state",
      "postal",
    ];

    const remaining = [...items];
    const pinned: ScoreAccumulator[] = [];

    for (const kind of kinds) {
      const index = remaining.findIndex(
        (item) => getLocationKind(item.label, item.acordCode) === kind,
      );

      if (index >= 0) {
        const [matched] = remaining.splice(index, 1);
        pinned.push(matched);
        continue;
      }

      const fallback = buildLocationFallback(kind);
      if (fallback) {
        const duplicateIndex = remaining.findIndex(
          (item) => item.acordCode === fallback.acordCode,
        );
        if (duplicateIndex >= 0) {
          const [matchedExisting] = remaining.splice(duplicateIndex, 1);
          pinned.push({
            ...matchedExisting,
            score: fallback.score,
            dictionaryScore: Math.max(
              matchedExisting.dictionaryScore,
              fallback.dictionaryScore,
            ),
            source: matchedExisting.source === "ai" ? "ai" : fallback.source,
          });
        } else {
          pinned.push(fallback);
        }
      }
    }

    return [...pinned, ...remaining];
  };

  const ordered = enforceCityStatePostalOrder(scored);

  const all = ordered;
  if (all.length === 0) {
    // If we have a clear field cue but no scored candidates, provide a low-confidence
    // fallback set so downstream review can still inspect probable ACORD options.
    if (hasExplicitFieldCue) {
      const fallback = safeDictionarySearch(block.text, 3).map((hit) => ({
        acordCode: hit.entry.acordCode,
        label: hit.entry.label,
        description: hit.entry.description,
        confidenceScore: 0.12,
        normalizedConfidenceScore: 0.12,
        source: "dictionary" as const,
        lexicalScore: 0.15,
        semanticSimilarity: 0,
        dictionaryScore: 0.35,
        heuristicScore: 0.1,
      }));
      return fallback;
    }
    return [];
  }

  const top = all[0].score || 1;
  const second = all[1]?.score || 0;
  const topMargin = top > 0 ? (top - second) / top : 0;
  const marginGate = clamp01(topMargin / 0.2);

  const allCandidateCodes = new Set(all.map((item) => item.acordCode));

  const scoredSuggestions = all.slice(0, 5).map((item) => {
    const normalizedRelative = top > 0 ? item.score / top : 0;
    const semanticEvidence = clamp01(item.semanticSimilarity);
    const dictionaryEvidence = clamp01(item.dictionaryScore / 200);
    const heuristicEvidence = clamp01(item.heuristicScore / 160);
    const anchorEvidence = lexicalAnchorScore(
      block.text,
      item.label,
      item.acordCode,
    );
    const blendedEvidence = clamp01(
      semanticEvidence * normalizedWeights.embedding +
        anchorEvidence * normalizedWeights.lexical +
        dictionaryEvidence * normalizedWeights.dictionary +
        heuristicEvidence * normalizedWeights.heuristic,
    );
    const normalization = normalizeSignalsForFamily(
      {
        embedding: semanticEvidence,
        lexical: anchorEvidence,
        dictionary: dictionaryEvidence,
        heuristic: heuristicEvidence,
      },
      familyId,
    );
    const normalizedBlend = blendNormalizedSignals(
      normalization.normalized,
      normalizedWeights,
    );

    const ontologyNode = getAcordOntologyNode(item.acordCode);
    const ontologyViolations: string[] = [];
    const ontologyWarnings: string[] = [];
    const ontologyExplanation: string[] = [];

    if (ontologyNode) {
      if (ontologyNode.parentCodes.length > 0) {
        ontologyExplanation.push(`Parents: ${ontologyNode.parentCodes.join(", ")}`);
      }
      if (ontologyNode.requiredSiblingCodes.length > 0) {
        ontologyExplanation.push(
          `Required siblings: ${ontologyNode.requiredSiblingCodes.join(", ")}`,
        );
      }
      if (ontologyNode.mutuallyExclusiveCodes.length > 0) {
        ontologyExplanation.push(
          `Mutually exclusive with: ${ontologyNode.mutuallyExclusiveCodes.join(", ")}`,
        );
      }
      ontologyExplanation.push(`Sections: ${ontologyNode.sections.join(", ")}`);

      if (
        ontologyNode.parentCodes.length > 0 &&
        !ontologyNode.parentCodes.some((code) => allCandidateCodes.has(code))
      ) {
        ontologyViolations.push("parent-missing");
      }
      if (
        ontologyNode.requiredSiblingCodes.length > 0 &&
        !ontologyNode.requiredSiblingCodes.some((code) => allCandidateCodes.has(code))
      ) {
        ontologyWarnings.push("required-sibling-missing");
      }
      if (
        ontologyNode.mutuallyExclusiveCodes.some((code) => allCandidateCodes.has(code))
      ) {
        ontologyWarnings.push("mutually-exclusive-candidate-present");
      }
    }

    let confidenceScore = clamp01(
      blendedEvidence * 0.6 +
        normalizedRelative * 0.25 +
        clamp01(blockConfidence) * 0.15,
    );

    // Blend normalized signals to make cross-family confidence comparable.
    confidenceScore = clamp01(confidenceScore * 0.7 + normalizedBlend * 0.3);

    // Confidence calibration: penalize ambiguous tops and weak lexical anchors.
    confidenceScore *= 0.6 + marginGate * 0.4;

    if (
      item.source === "heuristic" &&
      semanticEvidence < 0.72 &&
      dictionaryEvidence < 0.45
    ) {
      confidenceScore = Math.min(confidenceScore, 0.62);
    }

    if (anchorEvidence < 0.2 && semanticEvidence < 0.72) {
      confidenceScore = Math.min(confidenceScore, 0.58);
    }

    if (anchorEvidence < 0.1 && semanticEvidence < 0.55) {
      confidenceScore = Math.min(confidenceScore, 0.48);
    }

    // For short name/address prompts, require stronger lexical anchoring.
    const isSensitivePrompt =
      isNamePrompt(block.text) || isAddressPrompt(block.text);
    if (isSensitivePrompt && anchorEvidence < 0.34 && semanticEvidence < 0.74) {
      confidenceScore = Math.min(confidenceScore, 0.5);
    }

    if (
      isSensitivePrompt &&
      anchorEvidence >= 0.65 &&
      normalizedRelative > 0.9
    ) {
      confidenceScore = clamp01(confidenceScore * 1.06);
    }

    // Address prompts can over-index on dictionary score because many address
    // labels are structurally similar. Keep ranking, but cap confidence unless
    // semantic evidence is clearly strong.
    if (
      isAddressPrompt(block.text) &&
      semanticEvidence < 0.78 &&
      dictionaryEvidence >= 0.55
    ) {
      confidenceScore = Math.min(confidenceScore, 0.72);
    }

    // Micro-calibration for plain "Mailing Address" prompts to avoid
    // overconfident city/state fragments outranking line confidence visually.
    if (isAddressPrompt(block.text) && !isCityStateZipPrompt(block.text)) {
      const componentKind = getAddressComponentKind(item.label, item.acordCode);
      if (componentKind === "line1") {
        confidenceScore = Math.min(confidenceScore, 0.7);
      } else if (componentKind === "line2") {
        confidenceScore = Math.min(confidenceScore, 0.62);
      } else if (componentKind === "city") {
        confidenceScore = Math.min(confidenceScore, 0.54);
      } else if (componentKind === "state" || componentKind === "postal") {
        confidenceScore = Math.min(confidenceScore, 0.5);
      }
    }

    confidenceScore = clamp01(quantize(confidenceScore));

    const ontologyPenalty = ontologyViolations.length > 0 ? 0.12 : 0;

    return {
      acordCode: item.acordCode,
      label: item.label,
      description: item.description,
      confidenceScore: Number(confidenceScore.toFixed(3)),
      normalizedConfidenceScore: Number((confidenceScore * (1 - ontologyPenalty)).toFixed(3)),
      source: item.source,
      lexicalScore: Number(anchorEvidence.toFixed(3)),
      semanticSimilarity: Number(semanticEvidence.toFixed(3)),
      dictionaryScore: Number(dictionaryEvidence.toFixed(3)),
      heuristicScore: Number(heuristicEvidence.toFixed(3)),
      normalization: normalization,
      ontology: ontologyNode
        ? {
            parentCodes: ontologyNode.parentCodes,
            childCodes: ontologyNode.childCodes,
            mutuallyExclusiveCodes: ontologyNode.mutuallyExclusiveCodes,
            requiredSiblingCodes: ontologyNode.requiredSiblingCodes,
            sections: ontologyNode.sections,
            groups: ontologyNode.groups,
            explanation: ontologyExplanation,
            warnings: ontologyWarnings,
            violatedConstraints: ontologyViolations,
          }
        : undefined,
      _anchorEvidence: anchorEvidence,
      _semanticEvidence: semanticEvidence,
      _ontologyPenalty: ontologyPenalty,
    };
  });

  const withCalibrationRanking = scoredSuggestions.map((candidate) => {
    const arbitration = arbitrateCandidateByOntology(candidate, ontologyBundles);
    const graphInference = inferCandidateFromGlobalGraph(candidate, graphSnapshot);
    const carrierAdapter = adaptCandidateToCarrier(
      candidate,
      familyId,
      carrierAdapterOverrides,
    );
    const underwritingRules = evaluateCandidateUnderwritingRules(candidate, {
      blockText: block.text,
      chosenCodes: Array.from(allCandidateCodes).sort((left, right) => left.localeCompare(right)),
      familyId,
      overrides: underwritingRuleOverrides,
      extractionBlockId: block.id,
    });
    const riskDecision = inferCandidateRiskAndDecisionIntelligence(candidate, {
      blockText: block.text,
      familyId,
    });
    const thresholds = resolveThresholds(profile, candidate.acordCode);
    const thresholdGap = candidate.confidenceScore - thresholds.review;
    const ontologyPenalty = candidate._ontologyPenalty || 0;
    const graphBoost = graphInference.inferred ? graphInference.confidence * 0.08 : 0;
    const graphPenalty = graphInference.inferred ? 0 : 0.03;
    const carrierBoost = carrierAdapter.confidence * 0.06;
    const rulePenalty = underwritingRules.hardFailures.length > 0 ? 0.25 : 0;
    const riskPenalty =
      riskDecision.decisionIntelligence.projectedOutcome === "decline"
        ? 0.22
        : riskDecision.decisionIntelligence.projectedOutcome === "refer-to-underwriter"
          ? 0.12
          : 0;
    const calibratedRankingScore = quantize(
      (candidate.normalizedConfidenceScore || candidate.confidenceScore) *
        (1 - ontologyPenalty) *
        0.72 +
        thresholdGap * 0.2 +
        graphBoost -
        graphPenalty +
        carrierBoost +
        underwritingRules.scoreDelta * 0.22 -
        rulePenalty -
        riskPenalty,
    );
    return {
      unification: resolveUnificationForCode(candidate.acordCode),
      ...candidate,
      graphInference,
      carrierAdapter,
      underwritingRules,
      riskFactors: riskDecision.riskFactors,
      decisionIntelligence: riskDecision.decisionIntelligence,
      ontology: candidate.ontology
        ? {
            ...candidate.ontology,
            namespace: arbitration.winningNamespace,
          }
        : candidate.ontology,
      arbitration: {
        winningNamespace: arbitration.winningNamespace,
        precedenceScore: arbitration.score,
        reason: arbitration.reason,
      },
      _calibratedRankingScore: calibratedRankingScore,
    };
  });

  withCalibrationRanking.sort(
    (left, right) =>
      right._calibratedRankingScore - left._calibratedRankingScore ||
      compareSuggestion(left, right),
  );

  const topSuggestion = withCalibrationRanking[0];
  if (!topSuggestion) {
    return [];
  }

  const isCompoundLocationPrompt = isCityStateZipPrompt(block.text);
  const isSensitivePrompt =
    isNamePrompt(block.text) || isAddressPrompt(block.text);
  const topThresholds = resolveThresholds(profile, topSuggestion.acordCode);
  const topLabelText = normalizeText(
    `${topSuggestion.label} ${topSuggestion.acordCode}`,
  );
  const hasAddressLabelEvidence =
    isAddressPrompt(block.text) &&
    hasAnyToken(topLabelText, [
      "address",
      "mailing",
      "street",
      "line one",
      "line two",
    ]);
  const hasStrongSensitiveEvidence =
    isSensitivePrompt &&
    (topSuggestion._anchorEvidence >= 0.2 ||
      topSuggestion._semanticEvidence >= 0.72 ||
      hasAddressLabelEvidence);

  // Keep ranked candidates available for reviewer triage instead of hard-abstaining
  // at this stage; downstream filters and manual review still enforce quality.

  if (
    !hasExplicitFieldCue &&
    (topSuggestion.ontology?.violatedConstraints?.length || 0) > 1
  ) {
    return [];
  }

  if (
    !hasExplicitFieldCue &&
    (topSuggestion.underwritingRules?.hardFailures?.length || 0) > 0
  ) {
    return [];
  }

  // Preserve suggestions even when graph inference is weak; confidence captures this.

  return withCalibrationRanking.map(
    ({
      _anchorEvidence: _ignoredAnchor,
      _semanticEvidence: _ignoredSem,
      _ontologyPenalty: _ignoredOntologyPenalty,
      _calibratedRankingScore: _ignoredCalibratedScore,
      ...rest
    }) => rest,
  );
}

export async function mapBlocksToAcord(
  blocks: ExtractedBlock[],
  options?: {
    context?: string;
    deterministic?: boolean;
    calibrationProfile?: CalibrationProfile;
    familyId?: string;
    carrierAdapterOverrides?: CarrierAdapterOverride[];
    underwritingRuleOverrides?: UnderwritingRuleOverride[];
  },
): Promise<FieldMapping[]> {
  if (!options?.deterministic) {
    ensureEmbeddings().catch(() => {});
  }

  const graphSeedPayload: MappingPersistencePayload = {
    version: 1,
    documentId: "runtime-graph-document",
    pages: [],
    fields: [],
    mappings: [],
    decisionGraph: {
      labels: {},
      fields: {},
      mappings: {},
      confidenceThresholds: {
        accepted: 0.8,
        review: 0.6,
        rejected: 0.45,
      },
    },
    overrides: {},
    suppressedOcrBlockIds: [],
    associationEdits: [],
    schemaArtifacts: [],
    formFamily: options?.familyId
      ? {
          familyId: options.familyId,
          familyLabel: options.familyId,
          confidence: 1,
          signatureHash: "runtime-graph",
          layoutSignature: [],
          semanticSignature: [],
          evidence: ["runtime-graph"],
          classifiedAt: "1970-01-01T00:00:00.000Z",
          classifierVersion: "runtime",
        }
      : undefined,
  };
  const runtimeGraph = buildGlobalSemanticGraph([
    {
      fixtureId: "runtime-graph",
      payload: graphSeedPayload,
    },
  ]).snapshot;

  return Promise.all(
    blocks.map(async (block) => {
      // Run scoring for all OCR blocks; suppression should happen downstream where
      // we have full mapping context and diagnostics visibility.

      const accum = new Map<string, ScoreAccumulator>();

      applyIntentSignals(block, accum);
      applyDictionarySignals(block, accum);
      applyHeuristicSignals(block, accum);
      applyAnchorOverrideSignals(block, accum);
      await applySemanticSignals(block, accum, options?.deterministic === true);

      const suggestions = toSuggestions(
        accum,
        block,
        block.confidence,
        options?.calibrationProfile,
        options?.familyId,
        runtimeGraph,
        options?.carrierAdapterOverrides,
        options?.underwritingRuleOverrides,
      );

      return {
        blockId: block.id,
        page: block.page,
        text: block.text,
        boundingBox: block.boundingBox,
        suggestions,
        chosen: suggestions[0],
      };
    }),
  );
}
