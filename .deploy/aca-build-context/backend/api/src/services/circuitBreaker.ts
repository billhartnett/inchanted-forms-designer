type CircuitState = {
  failureCount: number;
  openedAt?: number;
};

const states = new Map<string, CircuitState>();

export function canCallCarrier(carrierId: string, options?: { threshold?: number; cooldownMs?: number }): boolean {
  const threshold = options?.threshold ?? 3;
  const cooldownMs = options?.cooldownMs ?? 30_000;
  const state = states.get(carrierId) || { failureCount: 0 };
  if (state.failureCount < threshold) return true;
  if (!state.openedAt) return false;
  if (Date.now() - state.openedAt > cooldownMs) {
    states.set(carrierId, { failureCount: Math.max(0, threshold - 1) });
    return true;
  }
  return false;
}

export function registerCarrierSuccess(carrierId: string): void {
  states.set(carrierId, { failureCount: 0 });
}

export function registerCarrierFailure(carrierId: string): void {
  const current = states.get(carrierId) || { failureCount: 0 };
  const nextCount = current.failureCount + 1;
  states.set(carrierId, {
    failureCount: nextCount,
    openedAt: nextCount >= 3 ? Date.now() : current.openedAt,
  });
}

export function getCircuitSnapshot(): Record<string, CircuitState> {
  return Object.fromEntries(states.entries());
}
