import React from 'react';

function IngestionPanel({ data = {} }) {
  const status = data.status || 'UNKNOWN';
  const successRate = (data.successRate || 0) * 100;
  const documentsProcessed = data.documentsProcessed || 0;
  const failureRate = 100 - successRate;

  const getStatusColor = (status) => {
    if (status === 'operational') return 'healthy';
    if (status === 'degraded') return 'warning';
    return 'critical';
  };

  const getSuccessStatus = (rate) => {
    if (rate >= 95) return 'healthy';
    if (rate >= 80) return 'warning';
    return 'critical';
  };

  const statusColor = getStatusColor(status);
  const successStatus = getSuccessStatus(successRate);

  return (
    <div className="panel">
      <div className="panel-header">
        <h3>Ingestion Pipeline</h3>
        <div className={`status-badge ${statusColor}`}>
          {status}
        </div>
      </div>
      <div className="panel-content">
        <div className="metric-group">
          <div className="metric-item">
            <span className="label">Success Rate</span>
            <span className={`value ${successStatus}`}>
              {successRate.toFixed(2)}%
            </span>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${successRate}%` }}></div>
            </div>
          </div>
        </div>
        <div className="metric-group">
          <div className="metric-item">
            <span className="label">Documents Processed</span>
            <span className="value">{documentsProcessed.toLocaleString()}</span>
          </div>
          <div className="metric-item">
            <span className="label">Failure Rate</span>
            <span className={`value ${failureRate > 5 ? 'warning' : 'healthy'}`}>
              {failureRate.toFixed(2)}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default IngestionPanel;
