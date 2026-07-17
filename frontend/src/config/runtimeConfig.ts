type RuntimeConfig = {
  API_BASE_URL?: string;
  WAVE9_CONTRACT_URL?: string;
  WAVE9_ENABLED?: boolean | string;
};

declare global {
  interface Window {
    __APP_CONFIG__?: RuntimeConfig;
  }
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function getEnvValue(key: string): string {
  const value = (import.meta.env as Record<string, unknown>)[key];
  return typeof value === "string" ? value.trim() : "";
}

function getConfiguredApiBase(): string {
  const fromVite = getEnvValue("VITE_API_BASE_URL");
  if (fromVite) return normalizeBaseUrl(fromVite);

  const fromNextPublic = getEnvValue("NEXT_PUBLIC_API_BASE");
  if (fromNextPublic) return normalizeBaseUrl(fromNextPublic);

  return "";
}

export function getApiBaseUrl(): string {
  const configured = getConfiguredApiBase();
  if (configured) {
    return configured;
  }

  if (typeof window !== "undefined") {
    const runtimeValue = window.__APP_CONFIG__?.API_BASE_URL;
    if (typeof runtimeValue === "string" && runtimeValue.trim()) {
      return normalizeBaseUrl(runtimeValue.trim());
    }

    const { hostname, protocol } = window.location;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return `${protocol}//${hostname}:7071`;
    }
  }

  return "";
}

export function apiUrl(path: string): string {
  const base = getApiBaseUrl();
  return base ? `${base}${path}` : path;
}

export function getWave9ContractUrl(): string {
  const fromVite = getEnvValue("VITE_WAVE9_CONTRACT_URL");
  if (fromVite) return fromVite;

  const fromNextPublic = getEnvValue("NEXT_PUBLIC_WAVE9_CONTRACT_URL");
  if (fromNextPublic) return fromNextPublic;

  if (typeof window !== "undefined") {
    const runtimeValue = window.__APP_CONFIG__?.WAVE9_CONTRACT_URL;
    if (typeof runtimeValue === "string" && runtimeValue.trim()) {
      return runtimeValue.trim();
    }
  }

  return apiUrl("/api/wave9/contracts");
}

export function isWave9Enabled(): boolean {
  const fromVite = getEnvValue("VITE_WAVE9_ENABLED");
  if (fromVite) {
    return fromVite.toLowerCase() === "true";
  }

  const fromNextPublic = getEnvValue("NEXT_PUBLIC_WAVE9_ENABLED");
  if (fromNextPublic) {
    return fromNextPublic.toLowerCase() === "true";
  }

  if (typeof window !== "undefined") {
    const runtimeValue = window.__APP_CONFIG__?.WAVE9_ENABLED;
    if (typeof runtimeValue === "boolean") {
      return runtimeValue;
    }
    if (typeof runtimeValue === "string") {
      return runtimeValue.toLowerCase() === "true";
    }
  }

  return false;
}
