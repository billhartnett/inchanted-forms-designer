import { Navigate, Route, Routes } from "react-router-dom";
import { lazy, Suspense, useEffect, useState } from "react";
import { AppShell } from "./layout/AppShell";
import DashboardLayout from "./layouts/DashboardLayout";
import useMonitoringData from "./hooks/useMonitoringData";
import "./styles/dashboard.css";

const Home = lazy(() => import("./pages/Home"));
const Mapping = lazy(() => import("./pages/Mapping"));
const Designer = lazy(() => import("./designer/Designer").then((module) => ({
  default: module.Designer,
})));
const DocumentIngestionTester = lazy(() => import("./pages/DocumentIngestionTester"));

function DashboardPage() {
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

export default function App() {
  return (
    <Suspense fallback={null}>
      <Routes>
        {/* Dashboard Routes */}
        <Route path="/" element={<DashboardPage />} />
        <Route path="/ingestion-test" element={<DocumentIngestionTester />} />

        {/* Designer Routes */}
        <Route element={<AppShell />}>
          <Route path="/home" element={<Home />} />
          <Route path="/mapping" element={<Mapping />} />
          <Route path="/designer" element={<Designer />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
