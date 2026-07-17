import { apiUrl } from "../config/runtimeConfig";
import {
  fetchEnvelopeJson,
  fetchEnvelopeJsonWithTimeout,
  resolveWave9Endpoint,
} from "./wave9Client";

type JsonObject = Record<string, unknown>;

async function postWave9<T>(key: Parameters<typeof resolveWave9Endpoint>[0], fallbackPath: string, payload: JsonObject): Promise<T> {
  const url = await resolveWave9Endpoint(key, fallbackPath);
  return fetchEnvelopeJson<T>(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

function withQuery(path: string, params: Record<string, string | number | boolean | undefined>): string {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined) {
      return;
    }
    query.set(key, String(value));
  });
  const queryString = query.toString();
  return queryString ? `${path}?${queryString}` : path;
}

export function fetchApiGet<T>(path: string): Promise<T> {
  return fetchEnvelopeJson<T>(apiUrl(path), {
    method: "GET",
  });
}

export function fetchApiPost<T>(path: string, payload: JsonObject): Promise<T> {
  return fetchEnvelopeJson<T>(apiUrl(path), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export function fetchApiPostForm<T>(
  path: string,
  formData: FormData,
  options?: { headers?: Record<string, string>; timeoutMs?: number },
): Promise<T> {
  const timeoutMs = options?.timeoutMs ?? 180_000;
  return fetchEnvelopeJsonWithTimeout<T>(
    apiUrl(path),
    timeoutMs,
    {
      method: "POST",
      body: formData,
      headers: options?.headers,
    },
  );
}

export function runSemanticSummary(payload: JsonObject) {
  return postWave9("semanticSummary", "/api/wave9/semantic-summary", payload);
}

export function runAcordValidate(payload: JsonObject) {
  return postWave9("acordValidate", "/api/wave9/acord/validate", payload);
}

export function runArbitrationTrace(payload: JsonObject) {
  return postWave9("arbitrationTrace", "/api/wave9/arbitration/trace", payload);
}

export function runMappingFlow(payload: JsonObject) {
  return postWave9("mappingFlow", "/api/wave9/mapping/flow", payload);
}

export function runNormalization(payload: JsonObject) {
  return postWave9("normalization", "/api/wave9/normalization", payload);
}

export function runScoring(payload: JsonObject) {
  return postWave9("scoring", "/api/wave9/scoring", payload);
}

export function runPreview(payload: JsonObject) {
  return postWave9("preview", "/api/wave9/preview", payload);
}

export function runExtractText(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return fetchApiPostForm<{ pages?: unknown[]; raw?: unknown }>("/api/extractText", formData, {
    timeoutMs: 180_000,
  });
}

export function runExtractDocument(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return fetchApiPostForm<Record<string, unknown>>("/api/extractDocument", formData, {
    headers: {
      "X-File-Name": file.name,
    },
    timeoutMs: 180_000,
  });
}

export function runAcordSearch(query: string, limit = 8) {
  return fetchApiGet<{ items?: unknown[] }>(withQuery("/api/acord/search", { query, limit }));
}

export function runAcordCodeLookup(code: string) {
  return fetchApiGet<Record<string, unknown>>(`/api/acord/code/${encodeURIComponent(code)}`);
}

export function runAcordSuggest(payload: { text: string; context?: string }) {
  return fetchApiPost<Record<string, unknown>>("/api/acord/suggest", payload);
}

export function runExportAcordXml(payload: JsonObject) {
  return fetchApiPost<{ xml?: string; includedMappings?: number }>("/api/exportAcordXml", payload);
}

export function runSubmissionPackageGenerate(payload: JsonObject) {
  return fetchApiPost<Record<string, unknown>>("/api/submission/package/generate", payload);
}

export function runSubmissionCarrierSubmit(payload: JsonObject) {
  return fetchApiPost<Record<string, unknown>>("/api/submission/carrier/submit", payload);
}

export function runSubmissionStatus(submissionId: string) {
  return fetchApiGet<Record<string, unknown>>(
    withQuery("/api/submission/status", { submissionId }),
  );
}

export function runMonitoringDashboard() {
  return fetchApiGet<Record<string, unknown>>("/api/monitoring/dashboard");
}

export function runMonitoringModule(moduleName: string) {
  return fetchApiGet<Record<string, unknown>>(`/api/monitoring/${encodeURIComponent(moduleName)}`);
}
