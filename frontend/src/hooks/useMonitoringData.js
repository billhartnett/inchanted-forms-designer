import { useEffect, useState } from 'react';
import { fetchMonitoringData } from '../services/monitoringApi';

/**
 * Hook for fetching monitoring data with auto-refresh
 * Refreshes every 5 seconds to keep dashboard current
 */
function useMonitoringData() {
  const [monitoringData, setMonitoringData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let isMounted = true;
    let refreshInterval;

    const loadData = async () => {
      try {
        setRefreshing(true);
        const data = await fetchMonitoringData();
        
        if (isMounted) {
          setMonitoringData(data);
          setError(null);
          setLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message || 'Failed to fetch monitoring data');
          setLoading(false);
        }
      } finally {
        if (isMounted) {
          setRefreshing(false);
        }
      }
    };

    // Initial load
    loadData();

    // Set up refresh interval (5 seconds)
    refreshInterval = setInterval(() => {
      loadData();
    }, 5000);

    // Cleanup
    return () => {
      isMounted = false;
      clearInterval(refreshInterval);
    };
  }, []);

  return { monitoringData, loading, error, refreshing };
}

export default useMonitoringData;
