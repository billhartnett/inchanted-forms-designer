import React from 'react';

function TimelinePanel({ data = [] }) {
  const timeline = Array.isArray(data) ? data : [];
  const recentEvents = timeline.slice(0, 12); // Show last 12 events

  const getEventType = (event) => {
    if (event.type) return event.type;
    if (event.event) return event.event;
    return 'UNKNOWN';
  };

  const getEventColor = (type) => {
    const lowerType = type.toLowerCase();
    if (lowerType.includes('alert') || lowerType.includes('critical')) return 'critical';
    if (lowerType.includes('warning')) return 'warning';
    if (lowerType.includes('success') || lowerType.includes('pass')) return 'healthy';
    return 'info';
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <h3>Timeline</h3>
        <span className="event-count">{timeline.length} events</span>
      </div>
      <div className="panel-content timeline-content">
        {recentEvents.length > 0 ? (
          <div className="timeline-container">
            {recentEvents.map((event, index) => {
              const eventType = getEventType(event);
              const color = getEventColor(eventType);

              return (
                <div key={index} className="timeline-event">
                  <div className={`timeline-marker ${color}`}></div>
                  <div className="timeline-content-item">
                    <div className="timeline-type">{eventType}</div>
                    <div className="timeline-description">
                      {event.description || event.message || 'Event occurred'}
                    </div>
                    <div className="timeline-time">
                      {formatTime(event.timestamp || event.time)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="no-events">
            <p>No timeline events recorded</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default TimelinePanel;
