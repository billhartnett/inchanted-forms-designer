import React from 'react';

function CarrierPanel({ data = {} }) {
  const enabledCarriers = data.enabledCarriers || 0;
  const healthyCarriers = data.healthyCarriers || 0;
  const status = data.status || 'UNKNOWN';
  const failureCount = data.failureCount || 0;

  const getHealthStatus = (healthy, enabled) => {
    if (enabled === 0) return 'unknown';
    if (healthy === enabled) return 'healthy';
    if (healthy >= enabled * 0.8) return 'warning';
    return 'critical';
  };

  const carrierStatus = getHealthStatus(healthyCarriers, enabledCarriers);
  const healthPercentage = enabledCarriers > 0 ? Math.round((healthyCarriers / enabledCarriers) * 100) : 0;

  return (
    <div className="panel">
      <div className="panel-header">
        <h3>Carrier Adapters</h3>
        <div className={`status-badge ${carrierStatus}`}>
          {healthyCarriers}/{enabledCarriers}
        </div>
      </div>
      <div className="panel-content">
        <div className="metric-group">
          <div className="metric-item">
            <span className="label">Carrier Health</span>
            <span className="value">{healthPercentage}%</span>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${healthPercentage}%` }}></div>
            </div>
          </div>
        </div>
        <div className="metric-group">
          <div className="metric-item">
            <span className="label">Enabled Carriers</span>
            <span className="value">{enabledCarriers}</span>
          </div>
          <div className="metric-item">
            <span className="label">Healthy</span>
            <span className={`value ${carrierStatus}`}>{healthyCarriers}</span>
          </div>
        </div>
        <div className="metric-group">
          <div className="metric-item">
            <span className="label">Status</span>
            <span className={`value ${carrierStatus}`}>{status}</span>
          </div>
          <div className="metric-item">
            <span className="label">Failures</span>
            <span className={`value ${failureCount > 0 ? 'warning' : 'healthy'}`}>
              {failureCount}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CarrierPanel;
