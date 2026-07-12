export function logInfo(message: string, details?: unknown) {
  console.info(`[shared] ${message}`, details ?? "");
}

export function logWarn(message: string, details?: unknown) {
  console.warn(`[shared] ${message}`, details ?? "");
}

export function logError(message: string, details?: unknown) {
  console.error(`[shared] ${message}`, details ?? "");
}