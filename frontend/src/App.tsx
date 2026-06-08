import { Navigate, Route, Routes } from "react-router-dom";
import Home from "./pages/Home";
import Mapping from "./pages/Mapping";
import { Designer } from "./designer/Designer";
import { AppShell } from "./layout/AppShell";

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Home />} />
        <Route path="/mapping" element={<Mapping />} />
        <Route path="/designer" element={<Designer />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
