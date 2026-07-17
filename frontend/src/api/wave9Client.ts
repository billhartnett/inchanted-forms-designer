import { apiUrl, getWave9ContractUrl } from "../config/runtimeConfig";

export type Wave9EndpointKey =
  | "contracts"
  | "acordExtraction"
  | "semanticInference"
  | "semanticSummary"
  | "acordValidate"
  | "inference"
  | "arbitration"
  | "arbitrationTrace"
  | "normalization"
  | "scoring"
  | "preview"
  | "mappingFlow";

type ContractEndpoint = {
  method: string;
  path: string;
};

type Wave9ContractPayload = {
  endpoints?: Record<string, ContractEndpoint>;
};

type EnvelopeError = {
  code?: string;
  message?: string;
  details?: unknown;
  traceId?: string;
};

type EnvelopeResponse<T> = {
  ok?: boolean;
  status?: number;
  data?: T;
  error?: string | null;
  errorEnvelope?: EnvelopeError | null;
};

export class ApiEnvelopeError extends Error {
  status: number;
  code: string;
  details: unknown;
  traceId: string | null;

  constructor(message: string, status: number, code = "REQUEST_ERROR", details: unknown = null, traceId: string | null = null) {
    super(message);
    this.name = "ApiEnvelopeError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.traceId = traceId;
  }
}

let contractCache: Wave9ContractPayload | null = null;
let contractPromise: Promise<Wave9ContractPayload> | null = null;

function extractTraceId(response: Response, payload: EnvelopeResponse<unknown>): string | null {
  if (payload?.errorEnvelope?.traceId && String(payload.errorEnvelope.traceId).trim()) {
    return String(payload.errorEnvelope.traceId).trim();
  }
  const headerTraceId = response.headers.get("x-trace-id") || response.headers.get("x-request-id");
  if (headerTraceId && headerTraceId.trim()) {
    return headerTraceId.trim();
  }
  return null;
}

async function parseJsonResponse<T>(response: Response): Promise<EnvelopeResponse<T>> {
  try {
    return (await response.json()) as EnvelopeResponse<T>;
  } catch {
    return {};
  }
}

export async function fetchEnvelopeJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const payload = await parseJsonResponse<T>(response);

  if (!response.ok) {
    const errorMessage =
      payload?.errorEnvelope?.message ||
      payload?.error ||
      `Request failed: ${response.status}`;
    throw new ApiEnvelopeError(
      errorMessage,
      response.status,
      payload?.errorEnvelope?.code || "REQUEST_ERROR",
      payload?.errorEnvelope?.details ?? null,
      extractTraceId(response, payload),
    );
  }

  if (payload && typeof payload === "object" && "data" in payload) {
    return (payload.data as T) ?? (payload as unknown as T);
  }

  return payload as T;
}

export async function fetchEnvelopeJsonWithTimeout<T>(
  input: RequestInfo | URL,
  timeoutMs: number,
  init?: RequestInit,
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const signal = init?.signal
      ? AbortSignal.any([init.signal, controller.signal])
      : controller.signal;
    return await fetchEnvelopeJson<T>(input, {
      ...init,
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiEnvelopeError(
        `Request timed out after ${Math.round(timeoutMs / 1000)}s`,
        408,
        "REQUEST_TIMEOUT",
      );
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function fetchWave9Contract(forceRefresh = false): Promise<Wave9ContractPayload> {
  if (!forceRefresh && contractCache) {
    return contractCache;
  }

  if (!forceRefresh && contractPromise) {
    return contractPromise;
  }

  const contractUrl = getWave9ContractUrl();
  contractPromise = fetchEnvelopeJson<Wave9ContractPayload>(contractUrl)
    .then((payload) => {
      contractCache = payload || {};
      return contractCache;
    })
    .finally(() => {
      contractPromise = null;
    });

  return contractPromise;
}

export async function resolveWave9Endpoint(
  key: Wave9EndpointKey,
  fallbackPath: string,
): Promise<string> {
  try {
    const contract = await fetchWave9Contract();
    const endpoint = contract.endpoints?.[key];
    if (endpoint && typeof endpoint.path === "string" && endpoint.path.trim()) {
      return apiUrl(endpoint.path.trim());
    }
  } catch {
    // fall back to local path when contract lookup fails.
  }

  return apiUrl(fallbackPath);
}
