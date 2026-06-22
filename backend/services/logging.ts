export function logInfo(message: string, details?: unknown) {
  console.info(`[backend] ${message}`, details ?? "");
}

export function logWarn(message: string, details?: unknown) {
  console.warn(`[backend] ${message}`, details ?? "");
}

export function logError(message: string, details?: unknown) {
  console.error(`[backend] ${message}`, details ?? "");
}