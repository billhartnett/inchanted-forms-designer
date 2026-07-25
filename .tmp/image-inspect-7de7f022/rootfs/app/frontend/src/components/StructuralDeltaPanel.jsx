import React from 'react';

function StructuralDeltaPanel({ data = {} }) {
  const mismatchRate = data.categoryModeMismatchRate || 0;
  const threshold = 0.17378;
  const regressionCount = data.regressionCount || 0;
  const drift = data.drift || 0;

  const getMismatchStatus = (rate) => {
    if (rate <= threshold * 0.9) return 'healthy';
    if (rate <= threshold) return 'warning';
    return 'critical';
  };

  const getRegressionStatus = (count) => {
    if (count === 0) return 'healthy';
    return 'critical';
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <h3>Structural Delta</h3>
        <div className={`status-badge ${getRegressionStatus(regressionCount)}`}>
          {regressionCount} Regressions
        </div>
      </div>
      <div className="panel-content">
        <div className="metric-group">
          <div className="metric-item">
            <span className="label">Category Mode Mismatch Rate</span>
            <span className={`value ${getMismatchStatus(mismatchRate)}`}>
              {(mismatchRate * 100).toFixed(4)}%
            </span>
            <div className="threshold-bar">
              <div className="threshold-fill" style={{ width: `${(mismatchRate / threshold) * 100}%` }}></div>
              <span className="threshold-marker" style={{ left: `${(threshold / threshold) * 100}%` }}></span>
            </div>
          </div>
        </div>
        <div className="metric-group">
          <div className="metric-item">
            <span className="label">Regression Count</span>
            <span className={`value ${getRegressionStatus(regressionCount)}`}>
              {regressionCount}
            </span>
          </div>
          <div className="metric-item">
            <span className="label">Drift</span>
            <span className="value">{drift.toFixed(7)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default StructuralDeltaPanel;
