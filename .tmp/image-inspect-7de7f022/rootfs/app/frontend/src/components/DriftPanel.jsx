import React from 'react';

function DriftPanel({ data = {} }) {
  const currentMaxDrift = data.currentMaxDrift || 0;
  const threshold = 0.0001;
  const trend = data.trend || 'unknown';
  const incidents = data.incidents || 0;

  const getDriftStatus = (drift) => {
    if (drift < threshold * 0.5) return 'healthy';
    if (drift < threshold) return 'warning';
    return 'critical';
  };

  const getTrendColor = (trend) => {
    if (trend === 'stable') return 'healthy';
    if (trend === 'increasing') return 'warning';
    if (trend === 'decreasing') return 'healthy';
    return 'warning';
  };

  const driftStatus = getDriftStatus(currentMaxDrift);
  const trendColor = getTrendColor(trend);

  return (
    <div className="panel">
      <div className="panel-header">
        <h3>Drift Detection</h3>
        <div className={`status-badge ${driftStatus}`}>
          {currentMaxDrift.toFixed(7)}
        </div>
      </div>
      <div className="panel-content">
        <div className="metric-group">
          <div className="metric-item">
            <span className="label">Current Max Drift</span>
            <span className={`value ${driftStatus}`}>
              {currentMaxDrift.toFixed(7)}
            </span>
            <div className="drift-bar">
              <div className="drift-fill" style={{ width: `${Math.min((currentMaxDrift / threshold) * 100, 100)}%` }}></div>
            </div>
            <span className="threshold">{'<'}{threshold.toFixed(4)}</span>
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
            <span className="label">Incidents</span>
            <span className={`value ${incidents > 0 ? 'warning' : 'healthy'}`}>
              {incidents}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DriftPanel;
