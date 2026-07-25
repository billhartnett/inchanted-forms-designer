import React from 'react';

function SystemHealthBar({ healthData = {} }) {
  const status = healthData.status || 'UNKNOWN';
  const alerts = healthData.alerts || 0;
  const criticalAlerts = healthData.criticalAlerts || 0;
  const checksPassed = healthData.checksPassed || 0;
  const totalChecks = healthData.totalChecks || 0;

  const getStatusColor = (status) => {
    switch (status) {
      case 'HEALTHY':
        return '#10b981';
      case 'DEGRADED':
        return '#f59e0b';
      case 'CRITICAL':
        return '#ef4444';
      default:
        return '#6b7280';
    }
  };

  const statusColor = getStatusColor(status);
  const passRate = totalChecks > 0 ? Math.round((checksPassed / totalChecks) * 100) : 0;

  return (
    <div className="system-health-bar">
      <div className="health-status">
        <div 
          className="status-indicator"
          style={{ backgroundColor: statusColor }}
        ></div>
        <span className="status-text">{status}</span>
      </div>

      <div className="health-metrics">
        <div className="metric">
          <span className="metric-label">Pass Rate</span>
          <span className="metric-value">{passRate}%</span>
          <div className="metric-bar">
            <div className="metric-fill" style={{ width: `${passRate}%` }}></div>
          </div>
        </div>

        <div className="metric">
          <span className="metric-label">Checks Passed</span>
          <span className="metric-value">{checksPassed}/{totalChecks}</span>
        </div>

        <div className="metric">
          <span className="metric-label">Alerts</span>
          <span className={`metric-value ${alerts > 0 ? 'warning' : 'healthy'}`}>
            {alerts}
          </span>
        </div>

        <div className="metric">
          <span className="metric-label">Critical</span>
          <span className={`metric-value ${criticalAlerts > 0 ? 'critical' : 'healthy'}`}>
            {criticalAlerts}
          </span>
        </div>
      </div>
    </div>
  );
}

export default SystemHealthBar;
