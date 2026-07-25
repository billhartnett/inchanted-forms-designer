type RuntimeConfig = {
  API_BASE_URL?: string;
};

declare global {
  interface Window {
    __APP_CONFIG__?: RuntimeConfig;
  }
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

export function getApiBaseUrl(): string {
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
