import type { Request, Response, Router } from "express";
import type { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

import { acordAll, acordLookupByCode, acordSearch, acordSuggest } from "./acord";
import { clusterFormFamiliesHandler } from "./clusterFormFamilies";
import { compareSemanticMemorySnapshotsHandler } from "./compareSemanticMemorySnapshots";
import { detectCrossDocumentDriftHandler } from "./detectCrossDocumentDrift";
import { detectFamilyDriftHandler } from "./detectFamilyDrift";
import { detectMultiOntologyDriftHandler } from "./detectMultiOntologyDrift";
import { detectOntologyDriftHandler } from "./detectOntologyDrift";
import { evaluateAcordSemanticsHandler } from "./evaluateAcordSemantics";
import { evaluateCalibration } from "./evaluateCalibration";
import { evaluateCarrierAdaptersHandler } from "./evaluateCarrierAdapters";
import { evaluateCrossFamilyNormalizationHandler } from "./evaluateCrossFamilyNormalization";
import { evaluateDecisionDriftHandler } from "./evaluateDecisionDrift";
import { evaluateFamilyCalibrationHandler } from "./evaluateFamilyCalibration";
import { evaluateGlobalSemanticDriftHandler } from "./evaluateGlobalSemanticDrift";
import { evaluateGraphHarmonizationHandler } from "./evaluateGraphHarmonization";
import { evaluateGraphInferenceHandler } from "./evaluateGraphInference";
import { evaluateLongitudinalDriftHandler } from "./evaluateLongitudinalDrift";
import { evaluateMappingQualityHandler } from "./evaluateMappingQuality";
import { evaluateMemoryRecommendationsHandler } from "./evaluateMemoryRecommendations";
import { evaluateOntologyArbitrationHandler } from "./evaluateOntologyArbitration";
import { evaluateRiskFactorsHandler } from "./evaluateRiskFactors";
import { evaluateRiskScoringHandler } from "./evaluateRiskScoring";
import { evaluateSemanticConflictsHandler } from "./evaluateSemanticConflicts";
import { evaluateSemanticFusionHandler } from "./evaluateSemanticFusion";
import { evaluateSubmissionDriftHandler } from "./evaluateSubmissionDrift";
import { evaluateUnderwritingDecisionHandler } from "./evaluateUnderwritingDecision";
import { evaluateUnderwritingRuleDriftHandler } from "./evaluateUnderwritingRuleDrift";
import { evaluateUnderwritingRulesHandler } from "./evaluateUnderwritingRules";
import { exportAcordXml } from "./exportAcordXml";
import { exportAuditTrailHandler } from "./exportAuditTrail";
import { extractDocument } from "./extractDocument";
import { extractText } from "./extractText";
import { generateSubmissionPackageHandler } from "./generateSubmissionPackage";
import { getAcordOntologyHandler } from "./getAcordOntology";
import { getCarrierSemanticAdaptersHandler } from "./getCarrierSemanticAdapters";
import { getGlobalSemanticGraphHandler } from "./getGlobalSemanticGraph";
import { getMetricsHandler } from "./getMetrics";
import { getMonitoringDashboardHandler } from "./getMonitoringDashboard";
import { getSemanticMemorySnapshotHandler } from "./getSemanticMemorySnapshot";
import { getSubmissionStatusHandler } from "./getSubmissionStatus";
import { getUnificationGraphHandler } from "./getUnificationGraph";
import { ingestionTestHandler } from "./ingestion-test";
import { loadCalibrationProfile } from "./loadCalibrationProfile";
import { loadMapping } from "./loadMapping";
import { mapFields } from "./mapFields";
import { processSubmissionRetryHandler } from "./processSubmissionRetry";
import { saveCalibrationProfile } from "./saveCalibrationProfile";
import { saveMapping } from "./saveMapping";
import { submitToCarrierHandler } from "./submitToCarrier";
import { suggestLabels } from "./suggestLabels";
import { updateGlobalSemanticGraphHandler } from "./updateGlobalSemanticGraph";
import { updateSemanticMemoryHandler } from "./updateSemanticMemory";
import { validateAcordOntologyHandler } from "./validateAcordOntology";

type AzureHandler = (
  request: HttpRequest,
  context: InvocationContext,
) => Promise<HttpResponseInit> | HttpResponseInit;

const WAVE8_CONTRACT_VERSION = "wave8.v1";

type JsonRecord = Record<string, unknown>;

function asObject(value: unknown): JsonRecord | null {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    return null;
  }
  return value as JsonRecord;
}

function inferErrorCode(status: number): string {
  if (status === 400) return "BAD_REQUEST";
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "CONFLICT";
  if (status === 422) return "UNPROCESSABLE_ENTITY";
  if (status >= 500) return "INTERNAL_ERROR";
  return "REQUEST_ERROR";
}

function buildContractMeta(path: string, status: number, ok: boolean): JsonRecord {
  return {
    version: WAVE8_CONTRACT_VERSION,
    path,
    status,
    ok,
    timestamp: new Date().toISOString(),
  };
}

function normalizeErrorMessage(value: unknown, status: number): string {
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  const objectValue = asObject(value);
  if (objectValue && typeof objectValue.error === "string" && objectValue.error.trim()) {
    return objectValue.error;
  }
  if (objectValue && typeof objectValue.message === "string" && objectValue.message.trim()) {
    return objectValue.message;
  }
  if (status >= 500) return "Internal server error";
  return "Request failed";
}

function normalizeJsonBodyForUi(jsonBody: unknown, status: number, path: string): unknown {
  const contract = buildContractMeta(path, status, status < 400);

  if (status >= 400) {
    const base = asObject(jsonBody) ?? {};
    const message = normalizeErrorMessage(jsonBody, status);
    return {
      ...base,
      ok: false,
      status,
      data: null,
      error: message,
      errorEnvelope: {
        code: inferErrorCode(status),
        message,
        details: base.details ?? null,
      },
      contract,
      meta: {
        ...(asObject(base.meta) ?? {}),
        contractVersion: WAVE8_CONTRACT_VERSION,
      },
    };
  }

  const base = asObject(jsonBody);
  if (base) {
    return {
      ...base,
      ok: true,
      status,
      data: base.data ?? base,
      error: null,
      errorEnvelope: null,
      contract,
      meta: {
        ...(asObject(base.meta) ?? {}),
        contractVersion: WAVE8_CONTRACT_VERSION,
      },
    };
  }

  const arrayValue = Array.isArray(jsonBody) ? jsonBody : null;
  return {
    ok: true,
    status,
    data: jsonBody,
    items: arrayValue,
    error: null,
    errorEnvelope: null,
    contract,
    meta: {
      contractVersion: WAVE8_CONTRACT_VERSION,
    },
  };
}

function toAzureRequest(request: Request): HttpRequest {
  const host = request.get("host") || "localhost";
  const url = new URL(request.originalUrl || request.url, `http://${host}`);
  return {
    method: request.method,
    url: url.toString(),
    query: url.searchParams,
    params: request.params as Record<string, string>,
    headers: {
      get(name: string): string | null {
        const value = request.get(name);
        return typeof value === "string" ? value : null;
      },
    },
    async json() {
      return request.body;
    },
    async text() {
      if (typeof request.body === "string") return request.body;
      if (Buffer.isBuffer(request.body)) return request.body.toString("utf8");
      if (request.body == null) return "";
      return JSON.stringify(request.body);
    },
    async formData() {
      const form = new FormData();
      const body = request.body as Record<string, unknown> | undefined;
      if (body && typeof body === "object") {
        for (const [key, value] of Object.entries(body)) {
          if (value == null) continue;
          form.append(key, String(value));
        }
      }
      const files = (request as any).files as Array<{ fieldname: string; originalname: string; mimetype: string; buffer: Buffer }> | undefined;
      if (Array.isArray(files)) {
        for (const file of files) {
          const blob = new Blob([new Uint8Array(file.buffer)], {
            type: file.mimetype || "application/octet-stream",
          });
          const webFile = new File([blob], file.originalname || "upload.bin", { type: file.mimetype || "application/octet-stream" });
          form.append(file.fieldname, webFile);
        }
      }
      return form;
    },
  } as unknown as HttpRequest;
}

function toInvocationContext(request: Request): InvocationContext {
  return {
    invocationId: `express-${Date.now()}`,
    functionName: request.path,
    traceContext: { traceParent: request.get("traceparent") || "", traceState: request.get("tracestate") || "" },
    log: (...args: unknown[]) => console.log(...args),
    error: (...args: unknown[]) => console.error(...args),
    warn: (...args: unknown[]) => console.warn(...args),
    info: (...args: unknown[]) => console.info(...args),
    debug: (...args: unknown[]) => console.debug(...args),
  } as unknown as InvocationContext;
}

async function runAzureHandlerAsExpress(handler: AzureHandler, request: Request, response: Response): Promise<void> {
  const result = await handler(toAzureRequest(request), toInvocationContext(request));
  const status = result?.status ?? 200;
  const contractPath = `${request.baseUrl || ""}${request.path}`;
  const headers = result?.headers;
  if (headers) {
    for (const [key, value] of Object.entries(headers)) {
      if (value != null) response.setHeader(key, String(value));
    }
  }
  response.setHeader("x-wave-contract-version", WAVE8_CONTRACT_VERSION);
  response.setHeader("x-wave-contract-stable", "true");
  if (typeof (result as any)?.body === "string") {
    response.status(status).send((result as any).body);
    return;
  }
  if ((result as any)?.jsonBody !== undefined) {
    response.status(status).json(
      normalizeJsonBodyForUi((result as any).jsonBody, status, contractPath),
    );
    return;
  }
  response.status(status).json(normalizeJsonBodyForUi(null, status, contractPath));
}

export function registerMigratedFunctionRoutes(router: Router): void {
  router.route("/wave9/contracts")
    .get((_request, response) => {
      response.status(200).json({
        ok: true,
        status: 200,
        data: {
          version: WAVE8_CONTRACT_VERSION,
          contracts: {
            extraction: "/api/wave9/acord/extraction",
            semanticInference: "/api/wave9/acord/semantic-inference",
            arbitration: "/api/wave9/arbitration",
            normalization: "/api/wave9/normalization",
            scoring: "/api/wave9/scoring",
            inference: "/api/wave9/inference",
            preview: "/api/wave9/preview",
          },
        },
        error: null,
        errorEnvelope: null,
        contract: buildContractMeta("/api/wave9/contracts", 200, true),
        meta: { contractVersion: WAVE8_CONTRACT_VERSION },
      });
    })
    ;

  router.route("/wave9/acord/extraction")
    .post(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(extractDocument, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;

  router.route("/wave9/acord/semantic-inference")
    .post(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(evaluateAcordSemanticsHandler, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;

  router.route("/wave9/inference")
    .post(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(evaluateGraphInferenceHandler, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;

  router.route("/wave9/arbitration")
    .post(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(evaluateOntologyArbitrationHandler, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;

  router.route("/wave9/normalization")
    .post(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(evaluateCrossFamilyNormalizationHandler, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;

  router.route("/wave9/scoring")
    .post(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(evaluateRiskScoringHandler, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;

  router.route("/wave9/preview")
    .post(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(mapFields, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;

  router.route("/acord/search")
    .get(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(acordSearch, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;
  router.route("/acord/labels/search")
    .get(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(acordSearch, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;
  router.route("/ops/label-search")
    .get(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(acordSearch, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;
  router.route("/acord/code/:acordCode")
    .get(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(acordLookupByCode, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;
  router.route("/acord/labels/code/:acordCode")
    .get(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(acordLookupByCode, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;
  router.route("/acord/all")
    .get(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(acordAll, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;
  router.route("/acord/labels/all")
    .get(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(acordAll, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;
  router.route("/ops/acord-dictionary")
    .get(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(acordAll, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;
  router.route("/acord/suggest")
    .post(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(acordSuggest, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;
  router.route("/acord/labels/suggest")
    .post(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(acordSuggest, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;
  router.route("/clusterFormFamilies")
    .post(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(clusterFormFamiliesHandler, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;
  router.route("/memory/compare-snapshots")
    .post(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(compareSemanticMemorySnapshotsHandler, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;
  router.route("/fusion/drift")
    .post(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(detectCrossDocumentDriftHandler, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;
  router.route("/detectFamilyDrift")
    .post(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(detectFamilyDriftHandler, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;
  router.route("/ontology/multi/drift")
    .post(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(detectMultiOntologyDriftHandler, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;
  router.route("/ontology/drift")
    .post(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(detectOntologyDriftHandler, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;
  router.route("/evaluateAcordSemantics")
    .post(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(evaluateAcordSemanticsHandler, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;
  router.route("/evaluateCalibration")
    .post(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(evaluateCalibration, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;
  router.route("/carrier/adapters/evaluate")
    .post(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(evaluateCarrierAdaptersHandler, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;
  router.route("/normalize/cross-family")
    .post(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(evaluateCrossFamilyNormalizationHandler, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;
  router.route("/underwriting/decision/drift")
    .post(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(evaluateDecisionDriftHandler, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;
  router.route("/evaluateFamilyCalibration")
    .post(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(evaluateFamilyCalibrationHandler, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;
  router.route("/graph/drift")
    .post(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(evaluateGlobalSemanticDriftHandler, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;
  router.route("/graph/harmonization")
    .post(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(evaluateGraphHarmonizationHandler, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;
  router.route("/graph/inference")
    .post(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(evaluateGraphInferenceHandler, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;
  router.route("/memory/longitudinal-drift")
    .post(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(evaluateLongitudinalDriftHandler, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;
  router.route("/evaluateMappingQuality")
    .post(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(evaluateMappingQualityHandler, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;
  router.route("/memory/recommendations")
    .post(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(evaluateMemoryRecommendationsHandler, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;
  router.route("/ontology/arbitration")
    .post(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(evaluateOntologyArbitrationHandler, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;
  router.route("/risk/factors/evaluate")
    .post(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(evaluateRiskFactorsHandler, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;
  router.route("/risk/scoring/evaluate")
    .post(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(evaluateRiskScoringHandler, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;
  router.route("/conflicts/semantic")
    .post(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(evaluateSemanticConflictsHandler, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;
  router.route("/fusion/evaluate")
    .post(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(evaluateSemanticFusionHandler, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;
  router.route("/submission/drift")
    .post(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(evaluateSubmissionDriftHandler, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;
  router.route("/underwriting/decision/evaluate")
    .post(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(evaluateUnderwritingDecisionHandler, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;
  router.route("/rules/drift")
    .post(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(evaluateUnderwritingRuleDriftHandler, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;
  router.route("/rules/evaluate")
    .post(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(evaluateUnderwritingRulesHandler, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;
  router.route("/exportAcordXml")
    .post(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(exportAcordXml, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;
  router.route("/ops/audit/export")
    .get(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(exportAuditTrailHandler, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;
  router.route("/extractDocument")
    .post(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(extractDocument, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;
  router.route("/extractText")
    .post(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(extractText, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;
  router.route("/submission/package/generate")
    .post(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(generateSubmissionPackageHandler, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;
  router.route("/ontology")
    .get(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(getAcordOntologyHandler, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;
  router.route("/carrier/adapters")
    .get(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(getCarrierSemanticAdaptersHandler, request, response);
      } catch (error) {
        next(error);
      }
    })
    .post(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(getCarrierSemanticAdaptersHandler, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;
  router.route("/graph/retrieve")
    .post(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(getGlobalSemanticGraphHandler, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;
  router.route("/ops/metrics")
    .get(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(getMetricsHandler, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;
  router.route("/monitoring/dashboard")
    .get(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(getMonitoringDashboardHandler, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;
  router.route("/memory/snapshot")
    .post(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(getSemanticMemorySnapshotHandler, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;
  router.route("/submission/status")
    .get(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(getSubmissionStatusHandler, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;
  router.route("/fusion/unification-graph")
    .get(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(getUnificationGraphHandler, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;
  router.route("/ingestion-test")
    .get(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(ingestionTestHandler, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;
  router.route("/loadCalibrationProfile")
    .get(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(loadCalibrationProfile, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;
  router.route("/loadMapping")
    .get(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(loadMapping, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;
  router.route("/mapFields")
    .post(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(mapFields, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;
  router.route("/submission/retry/process")
    .post(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(processSubmissionRetryHandler, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;
  router.route("/saveCalibrationProfile")
    .post(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(saveCalibrationProfile, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;
  router.route("/saveMapping")
    .post(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(saveMapping, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;
  router.route("/submission/carrier/submit")
    .post(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(submitToCarrierHandler, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;
  router.route("/suggestLabels")
    .post(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(suggestLabels, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;
  router.route("/graph/update")
    .post(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(updateGlobalSemanticGraphHandler, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;
  router.route("/memory/update")
    .post(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(updateSemanticMemoryHandler, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;
  router.route("/ontology/validate")
    .post(async (request, response, next) => {
      try {
        await runAzureHandlerAsExpress(validateAcordOntologyHandler, request, response);
      } catch (error) {
        next(error);
      }
    })
    ;
}
