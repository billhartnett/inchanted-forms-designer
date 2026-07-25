"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.incrementMetric = incrementMetric;
exports.setGauge = setGauge;
exports.observeLatency = observeLatency;
exports.getMetricsSnapshot = getMetricsSnapshot;
exports.logStructuredEvent = logStructuredEvent;
const metrics = {
    counters: {},
    gauges: {},
    latenciesMs: {},
    updatedAt: new Date().toISOString(),
};
function incrementMetric(name, by = 1) {
    metrics.counters[name] = (metrics.counters[name] || 0) + by;
    metrics.updatedAt = new Date().toISOString();
}
function setGauge(name, value) {
    metrics.gauges[name] = value;
    metrics.updatedAt = new Date().toISOString();
}
function observeLatency(name, valueMs) {
    metrics.latenciesMs[name] = [...(metrics.latenciesMs[name] || []), valueMs].slice(-250);
    metrics.updatedAt = new Date().toISOString();
}
function getMetricsSnapshot() {
    return {
        counters: { ...metrics.counters },
        gauges: { ...metrics.gauges },
        latenciesMs: Object.fromEntries(Object.entries(metrics.latenciesMs).map(([name, values]) => [name, [...values]])),
        updatedAt: metrics.updatedAt,
    };
}
function logStructuredEvent(level, event, fields) {
    const entry = {
        level,
        event,
        at: new Date().toISOString(),
        ...fields,
    };
    const text = JSON.stringify(entry);
    if (level === "error") {
        console.error(text);
        return;
    }
    if (level === "warn") {
        console.warn(text);
        return;
    }
    console.log(text);
}
