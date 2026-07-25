import React from 'react';

function PerformancePanel({ data = {} }) {
  const p95Latency = data.p95Latency || 0;
  const p99Latency = data.p99Latency || 0;
  const totalLatency = data.totalLatency || 0;
  const components = data.components || {};

  const getLatencyStatus = (latency, threshold) => {
    if (latency <= threshold * 0.8) return 'healthy';
    if (latency <= threshold) return 'warning';
    return 'critical';
  };

  const p95Status = getLatencyStatus(p95Latency, 50);
  const p99Status = getLatencyStatus(p99Latency, 100);
  const totalStatus = getLatencyStatus(totalLatency, 400);

  return (
    <div className="panel">
      <div className="panel-header">
        <h3>Performance</h3>
        <div className={`status-badge ${totalStatus}`}>
          {totalLatency}ms
        </div>
      </div>
      <div className="panel-content">
        <div className="latency-metrics">
          <div className="latency-item">
            <span className="label">P95 Latency</span>
            <span className={`value ${p95Status}`}>{p95Latency}ms</span>
            <div className="latency-bar">
              <div className="latency-fill" style={{ width: `${Math.min(p95Latency / 50 * 100, 100)}%` }}></div>
            </div>
            <span className="threshold">≤50ms</span>
          </div>

          <div className="latency-item">
            <span className="label">P99 Latency</span>
            <span className={`value ${p99Status}`}>{p99Latency}ms</span>
            <div className="latency-bar">
              <div className="latency-fill" style={{ width: `${Math.min(p99Latency / 100 * 100, 100)}%` }}></div>
            </div>
            <span className="threshold">≤100ms</span>
          </div>

          <div className="latency-item">
            <span className="label">Total Latency</span>
            <span className={`value ${totalStatus}`}>{totalLatency}ms</span>
            <div className="latency-bar">
              <div className="latency-fill" style={{ width: `${Math.min(totalLatency / 400 * 100, 100)}%` }}></div>
            </div>
            <span className="threshold">≤400ms</span>
          </div>
        </div>

        {Object.keys(components).length > 0 && (
          <div className="components-breakdown">
            <span className="breakdown-label">Component Latencies</span>
            {Object.entries(components).map(([name, latency]) => (
              <div className="component-item" key={name}>
                <span>{name}</span>
                <span className="component-latency">{latency}ms</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default PerformancePanel;
