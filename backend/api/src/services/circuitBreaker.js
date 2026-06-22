"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canCallCarrier = canCallCarrier;
exports.registerCarrierSuccess = registerCarrierSuccess;
exports.registerCarrierFailure = registerCarrierFailure;
exports.getCircuitSnapshot = getCircuitSnapshot;
const states = new Map();
function canCallCarrier(carrierId, options) {
    const threshold = options?.threshold ?? 3;
    const cooldownMs = options?.cooldownMs ?? 30_000;
    const state = states.get(carrierId) || { failureCount: 0 };
    if (state.failureCount < threshold)
        return true;
    if (!state.openedAt)
        return false;
    if (Date.now() - state.openedAt > cooldownMs) {
        states.set(carrierId, { failureCount: Math.max(0, threshold - 1) });
        return true;
    }
    return false;
}
function registerCarrierSuccess(carrierId) {
    states.set(carrierId, { failureCount: 0 });
}
function registerCarrierFailure(carrierId) {
    const current = states.get(carrierId) || { failureCount: 0 };
    const nextCount = current.failureCount + 1;
    states.set(carrierId, {
        failureCount: nextCount,
        openedAt: nextCount >= 3 ? Date.now() : current.openedAt,
    });
}
function getCircuitSnapshot() {
    return Object.fromEntries(states.entries());
}
