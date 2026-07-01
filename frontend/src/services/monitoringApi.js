/**
 * Monitoring API Service
 * Fetches data from backend monitoring endpoints
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:7071/api';

/**
 * Fetch complete monitoring data from backend
 */
export async function fetchMonitoringData() {
  try {
    const response = await fetch(`${API_BASE_URL}/monitoring/dashboard`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }

    const data = await response.json();
    return transformMonitoringData(data);
  } catch (error) {
    console.error('Error fetching monitoring data:', error);
    throw error;
  }
}

/**
 * Fetch specific module data
 */
export async function fetchModuleData(moduleName) {
  try {
    const response = await fetch(`${API_BASE_URL}/monitoring/${moduleName}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`Error fetching ${moduleName} data:`, error);
    throw error;
  }
}

/**
 * Transform raw monitoring data into dashboard format
 */
function transformMonitoringData(rawData) {
  return {
    timestamp: rawData.timestamp || new Date().toISOString(),
    systemHealth: {
      status: rawData.overallStatus || 'UNKNOWN',
      alerts: rawData.totalAlerts || 0,
      criticalAlerts: rawData.criticalAlerts || 0,
      warningAlerts: rawData.warningAlerts || 0,
      checksPassed: rawData.checksPassed || 0,
      totalChecks: rawData.totalChecks || 0,
    },
    strictMode: rawData.strictMode || {
      status: 'UNKNOWN',
      failureClass: 'none',
      latency: 0,
      consecutiveFailures: 0,
    },
    diagnostics: rawData.diagnostics || {
      coverage: 0,
      drift: 0,
      latency: 0,
      missingFields: 0,
    },
    structuralDelta: rawData.structuralDelta || {
      categoryModeMismatchRate: 0,
      regressionCount: 0,
      drift: 0,
    },
    thresholds: rawData.thresholds || {
      minReplayCoverageRatio: { value: 0, threshold: 0.97 },
      maxMissingFieldRate: { value: 0, threshold: 0.001 },
      maxMisclassificationRate: { value: 0, threshold: 0.001 },
      maxGeometryMismatchRate: { value: 0, threshold: 0.001 },
      maxCategoryModeMismatchRate: { value: 0, threshold: 0.17378 },
      driftThreshold: { value: 0, threshold: 0.0001 },
    },
    performance: rawData.performance || {
      p95Latency: 0,
      p99Latency: 0,
      totalLatency: 0,
      components: {},
    },
    drift: rawData.drift || {
      currentMaxDrift: 0,
      trend: 'stable',
      incidents: 0,
    },
    regressions: rawData.regressions || {
      count: 0,
      trend: 'stable',
      consecutiveSuccesses: 0,
    },
    carrierAdapters: rawData.carrierAdapters || {
      enabledCarriers: 0,
      healthyCarriers: 0,
      status: 'UNKNOWN',
    },
    ingestion: rawData.ingestion || {
      status: 'UNKNOWN',
      successRate: 0,
      documentsProcessed: 0,
    },
    incidents: rawData.incidents || [],
    timeline: rawData.timeline || [],
  };
}

export default {
  fetchMonitoringData,
  fetchModuleData,
};
