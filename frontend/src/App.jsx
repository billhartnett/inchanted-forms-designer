import React, { useEffect, useState } from 'react';
import DashboardLayout from './layouts/DashboardLayout';
import useMonitoringData from './hooks/useMonitoringData';
import './styles/dashboard.css';

function App() {
  const { monitoringData, loading, error, refreshing } = useMonitoringData();
  const [lastUpdate, setLastUpdate] = useState(new Date());

  useEffect(() => {
    // Update last refresh time when data changes
    if (monitoringData) {
      setLastUpdate(new Date());
    }
  }, [monitoringData]);

  return (
    <div className="app">
      <DashboardLayout 
        monitoringData={monitoringData}
        loading={loading}
        error={error}
        refreshing={refreshing}
        lastUpdate={lastUpdate}
      />
    </div>
  );
}

export default App;
