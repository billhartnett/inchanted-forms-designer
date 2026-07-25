import React from 'react';

function IncidentLog({ data = [] }) {
  const incidents = Array.isArray(data) ? data : [];
  const recentIncidents = incidents.slice(0, 8); // Show last 8 incidents

  const getIncidentColor = (level) => {
    switch (level) {
      case 'CRITICAL':
        return 'critical';
      case 'WARNING':
        return 'warning';
      case 'INFO':
        return 'info';
      default:
        return 'info';
    }
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <h3>Incident Log</h3>
        <span className="incident-count">{incidents.length} total</span>
      </div>
      <div className="panel-content">
        <div className="incident-list">
          {recentIncidents.length > 0 ? (
            recentIncidents.map((incident, index) => (
              <div 
                key={index} 
                className={`incident-item ${getIncidentColor(incident.level)}`}
              >
                <div className="incident-level">{incident.level || 'INFO'}</div>
                <div className="incident-message">
                  {incident.message || 'Unknown incident'}
                </div>
                <div className="incident-time">
                  {formatTime(incident.timestamp)}
                </div>
              </div>
            ))
          ) : (
            <div className="no-incidents">
              <p>No incidents detected</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default IncidentLog;
