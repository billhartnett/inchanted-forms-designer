import fs from "node:fs";
import path from "node:path";

import type { AcordLabelCandidate as AcordSuggestion } from "shared/acord";
import type { ExtractedBlock } from "shared/types";

type Wave9Thresholds = {
  accepted: number;
  review: number;
  reject: number;
};

type Wave9Bundle = {
  roleClassifier?: {
    roles?: Record<string, {
      tokenWeights?: Record<string, number>;
      geometry?: { centroidX?: number; centroidY?: number; sigmaX?: number; sigmaY?: number };
    }>;
  };
  familyOntologyResolver?: {
    familyToCodes?: Record<string, string[]>;
    codeToFamilies?: Record<string, string[]>;
    hardConstraints?: Record<string, string[]>;
  };
  fieldTypeModel?: {
    byCode?: Record<string, string>;
    byTextPattern?: Array<{ pattern: string; fieldType: string; priority?: number }>;
  };
  suppressionModel?: {
    topBandYThreshold?: number;
    suppressTextPatterns?: Array<{ pattern: string; reason?: string; weight?: number }>;
  };
  geometryModel?: {
    roleCentroids?: Record<string, { x: number; y: number; sigmaX: number; sigmaY: number }>;
  };
  consistencyModel?: {
    textToCanonicalCode?: Record<string, string>;
  };
  confidenceCalibration?: {
    global?: Wave9Thresholds;
    byRole?: Record<string, Wave9Thresholds>;
  };
};

type Wave9Loaded = {
  enabled: boolean;
  bundle: Wave9Bundle;
};

const DEFAULT_WAVE9_THRESHOLDS: Wave9Thresholds = {
  accepted: 0.78,
  review: 0.5,
  reject: 0.28,
};

let cachedWave9: Wave9Loaded | null = null;

function normalizeText(text: string): string {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function scoreTokenWeights(text: string, tokenWeights: Record<string, number> | undefined): number {
  if (!tokenWeights) return 0;
  const tokens = normalizeText(text).split(" ").filter(Boolean);
  let score = 0;
  for (const token of tokens) {
    score += Number(tokenWeights[token] || 0);
  }
  return score;
}

function scoreGeometry(block: ExtractedBlock, centroid?: { centroidX?: number; centroidY?: number; sigmaX?: number; sigmaY?: number }): number {
  if (!centroid) return 0;
  const x = Number(block.boundingBox?.x || 0);
  const y = Number(block.boundingBox?.y || 0);
  const sigmaX = Math.max(1, Number(centroid.sigmaX || 80));
  const sigmaY = Math.max(1, Number(centroid.sigmaY || 80));
  const dx = (x - Number(centroid.centroidX || 0)) / sigmaX;
  const dy = (y - Number(centroid.centroidY || 0)) / sigmaY;
  const distance = Math.sqrt(dx * dx + dy * dy);
  return Math.max(0, 1 - Math.min(1.5, distance));
}

function readJsonSafe<T>(filePath: string): T | undefined {
  try {
    if (!fs.existsSync(filePath)) return undefined;
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return undefined;
  }
}

export function loadWave9Models(): Wave9Loaded {
  if (cachedWave9) {
    return cachedWave9;
  }

  const enabled = process.env.WAVE9_MODELS_ENABLED !== "0";
  if (!enabled) {
    cachedWave9 = { enabled: false, bundle: {} };
    return cachedWave9;
  }

  const baseDir = process.env.WAVE9_MODELS_DIR || path.resolve(
    __dirname,
    "../../../../training-data/acord-labeled/wave9",
  );

  const bundle: Wave9Bundle = {
    roleClassifier: readJsonSafe<Wave9Bundle["roleClassifier"]>(path.join(baseDir, "role_classifier.json")),
    familyOntologyResolver: readJsonSafe<Wave9Bundle["familyOntologyResolver"]>(path.join(baseDir, "family_ontology_resolver.json")),
    fieldTypeModel: readJsonSafe<Wave9Bundle["fieldTypeModel"]>(path.join(baseDir, "field_type_model.json")),
    suppressionModel: readJsonSafe<Wave9Bundle["suppressionModel"]>(path.join(baseDir, "suppression_model.json")),
    geometryModel: readJsonSafe<Wave9Bundle["geometryModel"]>(path.join(baseDir, "geometry_model.json")),
    consistencyModel: readJsonSafe<Wave9Bundle["consistencyModel"]>(path.join(baseDir, "consistency_model.json")),
    confidenceCalibration: readJsonSafe<Wave9Bundle["confidenceCalibration"]>(path.join(baseDir, "confidence_calibration.json")),
  };

  cachedWave9 = {
    enabled: true,
    bundle,
  };
  return cachedWave9;
}

export function inferWave9RoleContext(
  block: ExtractedBlock,
  fallbackRole: "producer_agent" | "named_insured" | null,
): string | null {
  const model = loadWave9Models();
  const roles = model.bundle.roleClassifier?.roles;
  if (!model.enabled || !roles || Object.keys(roles).length === 0) {
    return fallbackRole;
  }

  const scored = Object.entries(roles)
    .map(([role, payload]) => {
      const tokenScore = scoreTokenWeights(block.text, payload.tokenWeights);
      const geometryScore = scoreGeometry(block, payload.geometry);
      return {
        role,
        score: tokenScore * 0.7 + geometryScore * 0.3,
      };
    })
    .sort((left, right) => right.score - left.score || left.role.localeCompare(right.role));

  if (scored.length === 0 || scored[0].score < 0.08) {
    return fallbackRole;
  }
  return scored[0].role;
}

export function applyWave9FamilyConstraints(
  suggestions: AcordSuggestion[],
  familyId?: string,
): AcordSuggestion[] {
  if (suggestions.length === 0) return suggestions;
  const model = loadWave9Models();
  const resolver = model.bundle.familyOntologyResolver;
  if (!model.enabled || !familyId || !resolver?.familyToCodes || !resolver.codeToFamilies) {
    return suggestions;
  }

  const normalizedFamily = normalizeText(familyId).replace(/\s+/g, "-");
  const allowedCodes = new Set(
    (resolver.hardConstraints?.[normalizedFamily] || resolver.familyToCodes[normalizedFamily] || [])
      .map((code) => String(code || "")),
  );
  if (allowedCodes.size === 0) {
    return suggestions;
  }

  const filtered = suggestions.filter((candidate) => {
    const code = String(candidate.acordCode || "");
    if (!code) return false;
    if (/^LawyersProfessionalLiability_/i.test(code) && !/lawyer/.test(normalizedFamily)) {
      return false;
    }
    return allowedCodes.has(code);
  });
  return filtered.length > 0 ? filtered : suggestions;
}

export function applyWave9ConsistencyAndGeometryRerank(
  suggestions: AcordSuggestion[],
  block: ExtractedBlock,
  predictedRole: string | null,
): AcordSuggestion[] {
  if (suggestions.length <= 1) return suggestions;
  const model = loadWave9Models();
  if (!model.enabled) return suggestions;

  const canonicalCode = model.bundle.consistencyModel?.textToCanonicalCode?.[normalizeText(block.text)];
  const roleCentroid = predictedRole
    ? model.bundle.geometryModel?.roleCentroids?.[predictedRole]
    : undefined;

  return suggestions
    .map((candidate) => {
      const base = Number(candidate.confidenceScore || 0);
      const consistencyBoost = canonicalCode && candidate.acordCode === canonicalCode ? 0.08 : 0;
      let geometryBoost = 0;
      if (roleCentroid) {
        const gScore = scoreGeometry(block, {
          centroidX: roleCentroid.x,
          centroidY: roleCentroid.y,
          sigmaX: roleCentroid.sigmaX,
          sigmaY: roleCentroid.sigmaY,
        });
        geometryBoost = gScore * 0.04;
      }

      const adjusted = Math.min(0.999, base + consistencyBoost + geometryBoost);
      return {
        ...candidate,
        confidenceScore: Number(adjusted.toFixed(3)),
        normalizedConfidenceScore: Number(
          Math.max(
            adjusted,
            Number(candidate.normalizedConfidenceScore || candidate.confidenceScore || 0),
          ).toFixed(3),
        ),
      };
    })
    .sort(
      (left, right) =>
        Number(right.confidenceScore || 0) - Number(left.confidenceScore || 0) ||
        left.acordCode.localeCompare(right.acordCode),
    );
}

export function inferWave9FieldTypeOverride(
  blockText: string,
  topCandidate: AcordSuggestion | undefined,
): "text" | "numeric" | "date" | "checkbox" | undefined {
  const model = loadWave9Models();
  if (!model.enabled) return undefined;
  const fieldTypeModel = model.bundle.fieldTypeModel;
  if (!fieldTypeModel) return undefined;

  const code = String(topCandidate?.acordCode || "");
  const direct = code ? fieldTypeModel.byCode?.[code] : undefined;
  if (direct) {
    if (direct === "numeric") return "numeric";
    if (direct === "boolean") return "checkbox";
    if (direct === "date") return "date";
    return "text";
  }

  const normalized = normalizeText(blockText);
  const rules = (fieldTypeModel.byTextPattern || [])
    .slice()
    .sort((left, right) => Number(right.priority || 0) - Number(left.priority || 0));
  for (const rule of rules) {
    try {
      if (new RegExp(rule.pattern, "i").test(normalized)) {
        if (rule.fieldType === "numeric") return "numeric";
        if (rule.fieldType === "boolean") return "checkbox";
        if (rule.fieldType === "date") return "date";
        return "text";
      }
    } catch {
      continue;
    }
  }
  return undefined;
}

export function inferWave9Suppression(
  block: ExtractedBlock,
): { suppress: boolean; reasons: string[] } {
  const model = loadWave9Models();
  if (!model.enabled) {
    return { suppress: false, reasons: [] };
  }

  const normalized = normalizeText(block.text);
  const suppression = model.bundle.suppressionModel;
  const reasons: string[] = [];
  let score = 0;

  if (suppression?.topBandYThreshold && Number(block.boundingBox?.y || 0) <= suppression.topBandYThreshold) {
    score += 0.3;
    reasons.push("wave9_top_band");
  }

  for (const pattern of suppression?.suppressTextPatterns || []) {
    try {
      if (new RegExp(pattern.pattern, "i").test(normalized)) {
        score += Number(pattern.weight || 0.4);
        reasons.push(pattern.reason || `wave9_pattern:${pattern.pattern}`);
      }
    } catch {
      continue;
    }
  }

  return {
    suppress: score >= 0.55,
    reasons,
  };
}

export function resolveWave9ThresholdDecision(
  confidenceScore: number,
  predictedRole: string | null,
): "accepted" | "review" | "rejected" {
  const model = loadWave9Models();
  const calibration = model.bundle.confidenceCalibration;
  const roleThresholds =
    predictedRole && calibration?.byRole?.[predictedRole]
      ? calibration.byRole[predictedRole]
      : calibration?.global;
  const thresholds = roleThresholds || DEFAULT_WAVE9_THRESHOLDS;

  if (confidenceScore >= Number(thresholds.accepted || DEFAULT_WAVE9_THRESHOLDS.accepted)) {
    return "accepted";
  }
  if (confidenceScore >= Number(thresholds.review || DEFAULT_WAVE9_THRESHOLDS.review)) {
    return "review";
  }
  return "rejected";
}
