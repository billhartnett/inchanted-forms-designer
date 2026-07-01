import React from 'react';

function DiagnosticsPanel({ data = {} }) {
  const coverage = data.coverage || 0;
  const drift = data.drift || 0;
  const latency = data.latency || 0;
  const missingFields = data.missingFields || 0;

  const getCoverageStatus = (coverage) => {
    if (coverage >= 0.90) return 'healthy';
    if (coverage >= 0.80) return 'warning';
    return 'critical';
  };

  const getDriftStatus = (drift) => {
    if (drift < 0.0001) return 'healthy';
    if (drift < 0.0005) return 'warning';
    return 'critical';
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <h3>Diagnostics</h3>
        <div className={`status-badge ${getCoverageStatus(coverage)}`}>
          {Math.round(coverage * 100)}%
        </div>
      </div>
      <div className="panel-content">
        <div className="metric-group">
          <div className="metric-item">
            <span className="label">Coverage</span>
            <span className="value">{Math.round(coverage * 100)}%</span>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${coverage * 100}%` }}></div>
            </div>
          </div>
        </div>
        <div className="metric-group">
          <div className="metric-item">
            <span className="label">Drift</span>
            <span className={`value ${getDriftStatus(drift)}`}>
              {drift.toFixed(7)}
            </span>
          </div>
          <div className="metric-item">
            <span className="label">Latency</span>
            <span className="value">{latency}ms</span>
          </div>
        </div>
        <div className="metric-group">
          <div className="metric-item">
            <span className="label">Missing Fields</span>
            <span className={`value ${missingFields > 0 ? 'warning' : 'healthy'}`}>
              {missingFields}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DiagnosticsPanel;
