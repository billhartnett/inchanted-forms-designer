import type { GatedFieldPrediction } from "./acord-gating";

export type AcordDocument = {
  policy: Record<string, unknown>;
  namedInsureds: Array<Record<string, unknown>>;
  producers: Array<Record<string, unknown>>;
  insurers: Array<Record<string, unknown>>;
  locations: Array<Record<string, unknown>>;
  coverages: Array<Record<string, unknown>>;
  businessOperations: Array<Record<string, unknown>>;
  lossHistory: Array<Record<string, unknown>>;
  priorCarriers: Array<Record<string, unknown>>;
  additionalInterests: Array<Record<string, unknown>>;
  metadata: {
    appliedCodes: string[];
    rejectedCodes: string[];
    clusterAssignments: Record<string, number>;
  };
};

export type ApplyGatedFieldsResult = {
  document: AcordDocument;
  appliedCount: number;
  skippedCount: number;
  builderDiagnostics: {
    appliedByCluster: Record<string, number>;
    skippedByCluster: Record<string, number>;
    routedClusters: string[];
  };
};

function toCamelCase(value: string): string {
  const text = String(value || "").trim();
  if (!text) return "value";
  return text
    .split(/[_\-.\s]+/)
    .filter(Boolean)
    .map((part, index) => {
      const lower = part.toLowerCase();
      if (index === 0) return lower;
      return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
    })
    .join("");
}

type EntityRoute =
  | "policy"
  | "namedInsureds"
  | "producers"
  | "insurers"
  | "locations"
  | "coverages"
  | "businessOperations"
  | "lossHistory"
  | "priorCarriers"
  | "additionalInterests";

function normalizeCluster(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function getCodeRoot(code: string): string {
  const text = String(code || "").trim();
  if (!text) return "";
  if (text.includes("_")) return text.split("_")[0] || "";
  if (text.includes(".")) return text.split(".")[0] || "";
  return text;
}

function resolveEntityRoute(prediction: GatedFieldPrediction): EntityRoute {
  const clusterNormalized = normalizeCluster(prediction.cluster || "");
  const codeRootNormalized = normalizeCluster(getCodeRoot(prediction.acordCode));
  const routeHint = `${clusterNormalized} ${codeRootNormalized}`;

  if (
    routeHint.includes("additionalinterest") ||
    routeHint.includes("mortgagee") ||
    routeHint.includes("losspayee")
  ) {
    return "additionalInterests";
  }
  if (routeHint.includes("priorcarrier") || routeHint.includes("priorinsurer")) {
    return "priorCarriers";
  }
  if (routeHint.includes("losshistory") || routeHint.includes("claim")) {
    return "lossHistory";
  }
  if (routeHint.includes("namedinsured") || routeHint.includes("applicant")) {
    return "namedInsureds";
  }
  if (routeHint.includes("producer") || routeHint.includes("broker") || routeHint.includes("agency")) {
    return "producers";
  }
  if (routeHint.includes("insurer") || routeHint.includes("carrier")) {
    return "insurers";
  }
  if (routeHint.includes("location") || routeHint.includes("premises") || routeHint.includes("building")) {
    return "locations";
  }
  if (routeHint.includes("coverage") || routeHint.includes("lineofbusiness")) {
    return "coverages";
  }
  if (routeHint.includes("business") || routeHint.includes("operation")) {
    return "businessOperations";
  }
  if (routeHint.includes("policy") || routeHint.includes("policystatus") || routeHint.includes("generalinfo")) {
    return "policy";
  }

  return "policy";
}

function routeFromCluster(cluster: string): EntityRoute {
  return resolveEntityRoute({
    blockId: "",
    page: 1,
    text: "",
    eLabelName: "",
    probability: 0,
    acordCode: cluster,
    modelConfidence: 0,
    gatingValid: true,
    cluster,
    family: "",
    aliases: [],
    formMembership: [],
    reasons: [],
  });
}

function buildEntityGroupKey(route: EntityRoute, prediction: GatedFieldPrediction): string {
  if (route === "policy") {
    return "policy";
  }
  const page = Number(prediction.page || 1);
  return `${route}:page:${page}`;
}

function isMultiInstanceRoute(route: EntityRoute): boolean {
  return route !== "policy";
}

function getRouteContainer(document: AcordDocument, route: EntityRoute): Array<Record<string, unknown>> {
  switch (route) {
    case "policy":
      return [document.policy];
    case "namedInsureds":
      return document.namedInsureds;
    case "producers":
      return document.producers;
    case "insurers":
      return document.insurers;
    case "locations":
      return document.locations;
    case "coverages":
      return document.coverages;
    case "businessOperations":
      return document.businessOperations;
    case "lossHistory":
      return document.lossHistory;
    case "priorCarriers":
      return document.priorCarriers;
    case "additionalInterests":
      return document.additionalInterests;
    default:
      return [document.policy];
  }
}

function ensureEntity(
  document: AcordDocument,
  route: EntityRoute,
  entityGroupKey: string,
  entityKeyToIndex: Map<string, number>,
): Record<string, unknown> {
  if (route === "policy") {
    return document.policy;
  }

  const container = getRouteContainer(document, route);
  const existingIndex = entityKeyToIndex.get(entityGroupKey);
  if (typeof existingIndex === "number" && container[existingIndex]) {
    return container[existingIndex];
  }

  const created: Record<string, unknown> = {};
  container.push(created);
  const index = container.length - 1;
  entityKeyToIndex.set(entityGroupKey, index);
  return created;
}

function setNestedValue(target: Record<string, unknown>, pathParts: string[], value: unknown): void {
  if (pathParts.length === 0) {
    return;
  }

  let cursor: Record<string, unknown> = target;
  for (let index = 0; index < pathParts.length - 1; index += 1) {
    const key = toCamelCase(pathParts[index]);
    const current = cursor[key];
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      cursor[key] = {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  }

  cursor[toCamelCase(pathParts[pathParts.length - 1])] = value;
}

function splitCodePath(code: string): { cluster: string; parts: string[] } {
  if (code.includes("_")) {
    const [cluster, ...rest] = code.split("_");
    return {
      cluster,
      parts: rest.length ? rest : [code],
    };
  }

  if (code.includes(".")) {
    const [cluster, ...rest] = code.split(".");
    return {
      cluster,
      parts: rest.length ? rest : [code],
    };
  }

  return {
    cluster: "Policy",
    parts: [code],
  };
}

function normalizePredictionValue(value: string): string {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function createAcordDocument(): AcordDocument {
  return {
    policy: {},
    namedInsureds: [],
    producers: [],
    insurers: [],
    locations: [],
    coverages: [],
    businessOperations: [],
    lossHistory: [],
    priorCarriers: [],
    additionalInterests: [],
    metadata: {
      appliedCodes: [],
      rejectedCodes: [],
      clusterAssignments: {},
    },
  };
}

export function applyGatedFields(
  gatedPredictions: GatedFieldPrediction[],
): ApplyGatedFieldsResult {
  const document = createAcordDocument();
  const appliedByCluster: Record<string, number> = {};
  const skippedByCluster: Record<string, number> = {};
  const entityKeyToIndexByRoute = new Map<string, Map<string, number>>();
  const dedupApplied = new Set<string>();

  let appliedCount = 0;
  let skippedCount = 0;

  const orderedPredictions = [...gatedPredictions].sort(
    (left, right) =>
      Number(left.page || 1) - Number(right.page || 1) ||
      String(left.blockId || "").localeCompare(String(right.blockId || "")) ||
      String(left.acordCode || "").localeCompare(String(right.acordCode || "")),
  );

  for (const prediction of orderedPredictions) {
    if (!prediction.gatingValid) {
      skippedCount += 1;
      document.metadata.rejectedCodes.push(prediction.acordCode);
      const cluster = String(prediction.cluster || "General").trim() || "General";
      skippedByCluster[cluster] = (skippedByCluster[cluster] || 0) + 1;
      continue;
    }

    const route = resolveEntityRoute(prediction);
    const { parts } = splitCodePath(prediction.acordCode);
    const entityGroupKey = buildEntityGroupKey(route, prediction);
    const routeMapKey = String(route);
    if (!entityKeyToIndexByRoute.has(routeMapKey)) {
      entityKeyToIndexByRoute.set(routeMapKey, new Map<string, number>());
    }

    const entityIndexMap = entityKeyToIndexByRoute.get(routeMapKey)!;
    const dedupKey = [
      route,
      entityGroupKey,
      String(prediction.acordCode || ""),
      normalizePredictionValue(String(prediction.text || "")),
    ].join("|");
    if (dedupApplied.has(dedupKey)) {
      continue;
    }

    const entity = ensureEntity(document, route, entityGroupKey, entityIndexMap);

    setNestedValue(entity, parts, prediction.text);
    dedupApplied.add(dedupKey);
    appliedCount += 1;
    document.metadata.appliedCodes.push(prediction.acordCode);
    const clusterKey = String(prediction.cluster || routeFromCluster(route)).trim() || "General";
    document.metadata.clusterAssignments[clusterKey] =
      (document.metadata.clusterAssignments[clusterKey] || 0) + 1;
    appliedByCluster[clusterKey] =
      (appliedByCluster[clusterKey] || 0) + 1;
  }

  document.metadata.appliedCodes = Array.from(new Set(document.metadata.appliedCodes));
  document.metadata.rejectedCodes = Array.from(new Set(document.metadata.rejectedCodes));

  return {
    document,
    appliedCount,
    skippedCount,
    builderDiagnostics: {
      appliedByCluster,
      skippedByCluster,
      routedClusters: Array.from(
        new Set([
          ...Object.keys(appliedByCluster),
          ...Object.keys(skippedByCluster),
        ]),
      ).sort((left, right) => left.localeCompare(right)),
    },
  };
}
