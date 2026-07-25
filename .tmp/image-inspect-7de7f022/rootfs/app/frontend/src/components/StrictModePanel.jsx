import React from 'react';

function StrictModePanel({ data = {} }) {
  const status = data.status || 'UNKNOWN';
  const failureClass = data.failureClass || 'none';
  const latency = data.latency || 0;
  const consecutiveFailures = data.consecutiveFailures || 0;

  const getStatusColor = (status) => {
    if (status === 'PASS') return 'healthy';
    if (status === 'FAIL') return 'critical';
    return 'warning';
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <h3>Strict Mode</h3>
        <div className={`status-badge ${getStatusColor(status)}`}>{status}</div>
      </div>
      <div className="panel-content">
        <div className="metric-group">
          <div className="metric-item">
            <span className="label">Status</span>
            <span className="value">{status}</span>
          </div>
          <div className="metric-item">
            <span className="label">Failure Class</span>
            <span className="value">{failureClass}</span>
          </div>
        </div>
        <div className="metric-group">
          <div className="metric-item">
            <span className="label">Latency</span>
            <span className="value">{latency}ms</span>
          </div>
          <div className="metric-item">
            <span className="label">Consecutive Failures</span>
            <span className={`value ${consecutiveFailures > 0 ? 'warning' : 'healthy'}`}>
              {consecutiveFailures}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default StrictModePanel;
