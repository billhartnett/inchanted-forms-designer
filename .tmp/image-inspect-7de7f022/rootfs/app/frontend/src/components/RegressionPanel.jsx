import React from 'react';

function RegressionPanel({ data = {} }) {
  const count = data.count || 0;
  const trend = data.trend || 'unknown';
  const consecutiveSuccesses = data.consecutiveSuccesses || 0;

  const getRegressionStatus = (count) => {
    if (count === 0) return 'healthy';
    return 'critical';
  };

  const getTrendColor = (trend) => {
    if (trend === 'stable') return 'healthy';
    if (trend === 'increasing') return 'critical';
    return 'healthy';
  };

  const status = getRegressionStatus(count);
  const trendColor = getTrendColor(trend);

  return (
    <div className="panel">
      <div className="panel-header">
        <h3>Regression Detection</h3>
        <div className={`status-badge ${status}`}>
          {count} Detected
        </div>
      </div>
      <div className="panel-content">
        <div className="metric-group">
          <div className="metric-item large-value">
            <span className="label">Regression Count</span>
            <span className={`value large ${status}`}>
              {count}
            </span>
            <span className="sublabel">Must remain 0</span>
          </div>
        </div>
        <div className="metric-group">
          <div className="metric-item">
            <span className="label">Trend</span>
            <span className={`value ${trendColor}`}>
              {trend === 'stable' ? '→' : trend === 'increasing' ? '↑' : '↓'} {trend}
            </span>
          </div>
          <div className="metric-item">
            <span className="label">Consecutive Successes</span>
            <span className="value">{consecutiveSuccesses}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default RegressionPanel;
