import type {
  CarrierSubmissionResponse,
  SubmissionCarrierPayload,
  SubmissionDrift,
  SubmissionOverride,
  SubmissionPackage,
  SubmissionStatusSnapshot,
  UnderwritingDecisionOutcome,
} from "../acord";
import type { MappingPersistencePayload } from "../types";
import { buildRiskScoringSnapshot, evaluateRiskScoring, evaluateUnderwritingDecision, extractRiskFactors } from "./riskDecisionIntelligence";

const CANONICAL_GENERATED_AT = "1970-01-01T00:00:00.000Z";

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort((left, right) =>
      left[0].localeCompare(right[0]),
    );
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashString(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function selectCarrier(payload: MappingPersistencePayload, overrides: SubmissionOverride[]): string {
  const forcedCarrier = [...overrides]
    .reverse()
    .find((override) => override.action === "force-carrier" && override.carrierId)?.carrierId;
  if (forcedCarrier) return forcedCarrier;

  const carrierFromAdapter = payload.carrierAdapterSnapshot?.carrierIds?.[0];
  if (carrierFromAdapter) return carrierFromAdapter;

  return payload.formFamily?.familyId?.includes("contractor") ? "markel" : "anac";
}

function toCarrierPayload(
  payload: MappingPersistencePayload,
  carrierId: string,
  acordXml: string,
): SubmissionCarrierPayload[] {
  const chosenMappings = payload.mappings
    .map((record) => {
      const chosenCode =
        payload.decisionGraph.mappings[record.extractionBlockId]?.chosenCandidateCode ||
        record.mapping.chosen?.acordCode ||
        "";
      return {
        extractionBlockId: record.extractionBlockId,
        code: chosenCode,
        confidence: record.mapping.chosen?.confidenceScore || 0,
      };
    })
    .sort(
      (left, right) =>
        left.extractionBlockId.localeCompare(right.extractionBlockId) ||
        left.code.localeCompare(right.code),
    );

  const jsonPayload = JSON.stringify(
    {
      submissionDocumentId: payload.documentId || "unknown",
      carrierId,
      mappings: chosenMappings,
      underwritingDecision: payload.underwritingDecisionSnapshot?.outcome || "accept",
      weightedScore: payload.riskScoringSnapshot?.weightedScore || 0,
      acordXmlHash: hashString(acordXml),
    },
    null,
    2,
  );

  const xmlPayload = [
    `<CarrierSubmission carrierId="${carrierId}">`,
    `  <SubmissionDocumentId>${payload.documentId || "unknown"}</SubmissionDocumentId>`,
    `  <UnderwritingOutcome>${payload.underwritingDecisionSnapshot?.outcome || "accept"}</UnderwritingOutcome>`,
    `  <WeightedRiskScore>${(payload.riskScoringSnapshot?.weightedScore || 0).toFixed(6)}</WeightedRiskScore>`,
    `  <AcordXmlHash>${hashString(acordXml)}</AcordXmlHash>`,
    `</CarrierSubmission>`,
  ].join("\n");

  return [
    {
      carrierId,
      format: "json",
      payload: jsonPayload,
      payloadHash: hashString(jsonPayload),
      schemaVersion: "carrier-json-v1",
      lineage: [`carrier=${carrierId}`, "format=json", "schema=carrier-json-v1"],
    },
    {
      carrierId,
      format: "xml",
      payload: xmlPayload,
      payloadHash: hashString(xmlPayload),
      schemaVersion: "carrier-xml-v1",
      lineage: [`carrier=${carrierId}`, "format=xml", "schema=carrier-xml-v1"],
    },
  ];
}

export function buildSubmissionPackage(
  payload: MappingPersistencePayload,
  options: {
    acordXml: string;
    includeSemanticLineage?: boolean;
    overrides?: SubmissionOverride[];
  },
): SubmissionPackage {
  const overrides = options.overrides || payload.submissionOverrides || [];
  const carrierId = selectCarrier(payload, overrides);
  const riskSignals = extractRiskFactors(payload, { overrides: payload.riskFactorOverrides || [] });
  const riskScoring = evaluateRiskScoring(payload, { signals: riskSignals });
  const riskScoringSnapshot = buildRiskScoringSnapshot(payload, {
    previousSnapshot: payload.riskScoringSnapshot,
    signals: riskSignals,
  });
  const decision = evaluateUnderwritingDecision(payload, {
    riskSignals,
    riskScoring,
    overrides: payload.underwritingDecisionOverrides || [],
  });

  const carrierPayloads = toCarrierPayload(payload, carrierId, options.acordXml);
  const lineageBundle = options.includeSemanticLineage
    ? [
        ...(payload.semanticMemorySnapshot?.lineage || []),
        ...(payload.globalSemanticGraphSnapshot?.lineage || []),
        ...(payload.underwritingDecisionSnapshot?.lineage || []),
      ].sort((left, right) => left.localeCompare(right))
    : undefined;

  const packageSeed = stableSerialize({
    documentId: payload.documentId || "unknown",
    carrierId,
    acordXmlHash: hashString(options.acordXml),
    carrierPayloadHashes: carrierPayloads.map((item) => item.payloadHash),
    riskHash: payload.riskFactorSnapshot?.riskFactorHash || "",
    scoringHash: riskScoringSnapshot.scoringHash,
    decisionHash: payload.underwritingDecisionSnapshot?.decisionHash || "",
  });
  const packageHash = hashString(packageSeed);

  return {
    packageId: `submission-${packageHash}`,
    generatedAt: CANONICAL_GENERATED_AT,
    acordXml: options.acordXml,
    acordXmlHash: hashString(options.acordXml),
    carrierPayloads,
    riskReport: {
      riskFactorHash: payload.riskFactorSnapshot?.riskFactorHash || "",
      scoringHash: riskScoringSnapshot.scoringHash,
      weightedScore: riskScoring.weightedScore,
      classification: riskScoring.classification,
    },
    decisionReport: {
      decisionHash: payload.underwritingDecisionSnapshot?.decisionHash || hashString(decision.decisionId),
      outcome: decision.outcome,
      firedRuleCount: decision.firedRules.length,
    },
    semanticLineageBundle: lineageBundle,
    packageHash,
    lineage: [
      `submission.packageId=submission-${packageHash}`,
      `submission.carrier=${carrierId}`,
      `submission.acordXmlHash=${hashString(options.acordXml)}`,
      `submission.riskScoringHash=${riskScoringSnapshot.scoringHash}`,
      `submission.decisionOutcome=${decision.outcome}`,
    ],
  };
}

export function normalizeCarrierResponse(input: {
  submissionId: string;
  carrierId: string;
  httpStatus: number;
  body: Record<string, unknown>;
  outcome: UnderwritingDecisionOutcome;
}): CarrierSubmissionResponse {
  const status: CarrierSubmissionResponse["status"] =
    input.httpStatus >= 500
      ? "error"
      : input.httpStatus >= 400
        ? "rejected"
        : input.outcome === "decline"
          ? "rejected"
          : input.httpStatus === 202
            ? "pending"
            : "accepted";

  const normalized: Record<string, string | number | boolean | null> = {
    status,
    httpStatus: input.httpStatus,
    carrierReferenceId:
      typeof input.body.referenceId === "string" ? input.body.referenceId : null,
    ack:
      typeof input.body.ack === "boolean"
        ? input.body.ack
        : input.httpStatus >= 200 && input.httpStatus < 300,
    message:
      typeof input.body.message === "string" ? input.body.message : "carrier-response",
  };

  const responseHash = hashString(stableSerialize(normalized));
  return {
    submissionId: input.submissionId,
    carrierId: input.carrierId,
    status,
    carrierReferenceId:
      typeof input.body.referenceId === "string" ? input.body.referenceId : undefined,
    message: String(normalized.message),
    responseHash,
    normalized,
    receivedAt: CANONICAL_GENERATED_AT,
    lineage: [
      `carrierResponse.submissionId=${input.submissionId}`,
      `carrierResponse.status=${status}`,
      `carrierResponse.hash=${responseHash}`,
    ],
  };
}

export function buildSubmissionStatusSnapshot(input: {
  packageId: string;
  carrierId: string;
  response?: CarrierSubmissionResponse;
  previous?: SubmissionStatusSnapshot;
}): SubmissionStatusSnapshot {
  const attemptCount = (input.previous?.attemptCount || 0) + 1;
  const submissionId = input.response?.submissionId || `${input.packageId}-${attemptCount}`;
  const status = input.response?.status || "draft";
  return {
    submissionId,
    packageId: input.packageId,
    carrierId: input.carrierId,
    status,
    lastUpdatedAt: CANONICAL_GENERATED_AT,
    attemptCount,
    latestResponseHash: input.response?.responseHash,
    lineage: [
      `submissionStatus.submissionId=${submissionId}`,
      `submissionStatus.status=${status}`,
      `submissionStatus.attempt=${attemptCount}`,
    ],
  };
}

export function evaluateSubmissionDrift(
  baseline: {
    submissionPackage?: SubmissionPackage;
    submissionStatus?: SubmissionStatusSnapshot;
    carrierSubmissionResponse?: CarrierSubmissionResponse;
    underwritingDecisionHash?: string;
  },
  current: {
    submissionPackage?: SubmissionPackage;
    submissionStatus?: SubmissionStatusSnapshot;
    carrierSubmissionResponse?: CarrierSubmissionResponse;
    underwritingDecisionHash?: string;
  },
): SubmissionDrift {
  const differences = [
    {
      key: "submissionPackage.packageHash",
      baselineValue: baseline.submissionPackage?.packageHash || null,
      currentValue: current.submissionPackage?.packageHash || null,
    },
    {
      key: "submissionPackage.carrierPayloadHash",
      baselineValue: baseline.submissionPackage?.carrierPayloads?.map((item) => item.payloadHash).join("|") || null,
      currentValue: current.submissionPackage?.carrierPayloads?.map((item) => item.payloadHash).join("|") || null,
    },
    {
      key: "submissionStatus.status",
      baselineValue: baseline.submissionStatus?.status || null,
      currentValue: current.submissionStatus?.status || null,
    },
    {
      key: "carrierResponse.responseHash",
      baselineValue: baseline.carrierSubmissionResponse?.responseHash || null,
      currentValue: current.carrierSubmissionResponse?.responseHash || null,
    },
    {
      key: "decisionToSubmission.outcomeConsistency",
      baselineValue: baseline.underwritingDecisionHash || null,
      currentValue: current.underwritingDecisionHash || null,
    },
  ].filter((item) => item.baselineValue !== item.currentValue);

  return {
    hasDrift: differences.length > 0,
    driftHash: hashString(stableSerialize(differences)),
    differences,
  };
}
