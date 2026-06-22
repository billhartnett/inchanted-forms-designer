type CounterMap = Record<string, number>;

type MetricSnapshot = {
  counters: CounterMap;
  gauges: Record<string, number>;
  latenciesMs: Record<string, number[]>;
  updatedAt: string;
};

const metrics: MetricSnapshot = {
  counters: {},
  gauges: {},
  latenciesMs: {},
  updatedAt: new Date().toISOString(),
};

export function incrementMetric(name: string, by = 1): void {
  metrics.counters[name] = (metrics.counters[name] || 0) + by;
  metrics.updatedAt = new Date().toISOString();
}

export function setGauge(name: string, value: number): void {
  metrics.gauges[name] = value;
  metrics.updatedAt = new Date().toISOString();
}

export function observeLatency(name: string, valueMs: number): void {
  metrics.latenciesMs[name] = [...(metrics.latenciesMs[name] || []), valueMs].slice(-250);
  metrics.updatedAt = new Date().toISOString();
}

export function getMetricsSnapshot(): MetricSnapshot {
  return {
    counters: { ...metrics.counters },
    gauges: { ...metrics.gauges },
    latenciesMs: Object.fromEntries(
      Object.entries(metrics.latenciesMs).map(([name, values]) => [name, [...values]]),
    ),
    updatedAt: metrics.updatedAt,
  };
}

export function logStructuredEvent(
  level: "info" | "warn" | "error",
  event: string,
  fields: Record<string, unknown>,
): void {
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
