import React from 'react';
import { Link } from 'react-router-dom';
import SystemHealthBar from '../components/SystemHealthBar';
import StrictModePanel from '../components/StrictModePanel';
import DiagnosticsPanel from '../components/DiagnosticsPanel';
import StructuralDeltaPanel from '../components/StructuralDeltaPanel';
import ThresholdsPanel from '../components/ThresholdsPanel';
import PerformancePanel from '../components/PerformancePanel';
import DriftPanel from '../components/DriftPanel';
import RegressionPanel from '../components/RegressionPanel';
import CarrierPanel from '../components/CarrierPanel';
import IngestionPanel from '../components/IngestionPanel';
import IncidentLog from '../components/IncidentLog';
import TimelinePanel from '../components/TimelinePanel';

function DashboardLayout({ monitoringData, loading, error, refreshing, lastUpdate }) {
  if (loading && !monitoringData) {
    return (
      <div className="dashboard-container">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading monitoring dashboard...</p>
        </div>
      </div>
    );
  }

  if (error && !monitoringData) {
    return (
      <div className="dashboard-container">
        <div className="error-state">
          <p>Error loading dashboard: {error}</p>
        </div>
      </div>
    );
  }

  const data = monitoringData || {};

  return (
    <div className="dashboard-container">
      {/* Header with System Health */}
      <header className="dashboard-header">
        <div className="header-left">
          <h1>Production Monitoring Dashboard</h1>
        </div>
        <div className="header-right">
          <Link to="/designer" className="nav-link">
            🎨 Designer
          </Link>
          <Link to="/mapping" className="nav-link">
            🗺️ Mapping
          </Link>
          <Link to="/ingestion-test" className="nav-link">
            📤 Test Ingestion
          </Link>
          <span className={`refresh-status ${refreshing ? 'refreshing' : ''}`}>
            {refreshing ? '⟳ Updating...' : `✓ Last updated: ${lastUpdate.toLocaleTimeString()}`}
          </span>
        </div>
      </header>

      {/* System Health Bar */}
      <SystemHealthBar healthData={data.systemHealth} />

      {/* Main Grid Layout */}
      <div className="dashboard-grid">
        
        {/* Row 1: Critical Panels */}
        <div className="grid-row">
          <div className="grid-item span-2">
            <StrictModePanel data={data.strictMode} />
          </div>
          <div className="grid-item span-2">
            <DiagnosticsPanel data={data.diagnostics} />
          </div>
          <div className="grid-item span-2">
            <StructuralDeltaPanel data={data.structuralDelta} />
          </div>
        </div>

        {/* Row 2: Performance and Thresholds */}
        <div className="grid-row">
          <div className="grid-item span-2">
            <PerformancePanel data={data.performance} />
          </div>
          <div className="grid-item span-2">
            <ThresholdsPanel data={data.thresholds} />
          </div>
          <div className="grid-item span-2">
            <DriftPanel data={data.drift} />
          </div>
        </div>

        {/* Row 3: Regressions and Carrier Health */}
        <div className="grid-row">
          <div className="grid-item span-2">
            <RegressionPanel data={data.regressions} />
          </div>
          <div className="grid-item span-2">
            <CarrierPanel data={data.carrierAdapters} />
          </div>
          <div className="grid-item span-2">
            <IngestionPanel data={data.ingestion} />
          </div>
        </div>

        {/* Row 4: Timeline and Incidents */}
        <div className="grid-row full-width">
          <div className="grid-item span-4">
            <TimelinePanel data={data.timeline} />
          </div>
          <div className="grid-item span-2">
            <IncidentLog data={data.incidents} />
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="dashboard-footer">
        <p>Production Monitoring System • Real-time monitoring with 5-second refresh interval</p>
      </footer>
    </div>
  );
}

export default DashboardLayout;
