import React from 'react';

function ThresholdsPanel({ data = {} }) {
  const thresholds = data || {};

  const getThresholdStatus = (value, threshold, isMin = false) => {
    if (isMin) {
      return value >= threshold ? 'healthy' : 'critical';
    } else {
      return value <= threshold ? 'healthy' : 'critical';
    }
  };

  const renderThreshold = (name, metric, isMin = false) => {
    if (!metric) return null;
    const { value, threshold } = metric;
    const status = getThresholdStatus(value, threshold, isMin);
    const operation = isMin ? '≥' : '≤';

    return (
      <div className="threshold-item" key={name}>
        <span className="threshold-name">{name}</span>
        <div className="threshold-values">
          <span className={`value ${status}`}>{value.toFixed(4)}</span>
          <span className="operator">{operation}</span>
          <span className="threshold">{threshold.toFixed(4)}</span>
          <span className={`status-icon ${status}`}>{status === 'healthy' ? '✓' : '✗'}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <h3>Wave 6 Thresholds</h3>
        <div className="threshold-count">
          6 Enforced
        </div>
      </div>
      <div className="panel-content">
        <div className="thresholds-list">
          {renderThreshold('Min Replay Coverage', thresholds.minReplayCoverageRatio, true)}
          {renderThreshold('Max Missing Fields', thresholds.maxMissingFieldRate)}
          {renderThreshold('Max Misclass. Rate', thresholds.maxMisclassificationRate)}
          {renderThreshold('Max Geometry Mismatch', thresholds.maxGeometryMismatchRate)}
          {renderThreshold('Max Category Mismatch', thresholds.maxCategoryModeMismatchRate)}
          {renderThreshold('Drift Threshold', thresholds.driftThreshold)}
        </div>
      </div>
    </div>
  );
}

export default ThresholdsPanel;
