import { Routes, Route, Link } from "react-router-dom";
import Designer from "./pages/Designer";

export default function App() {
  return (
    <div style={{ padding: 20 }}>
      <nav style={{ marginBottom: 20 }}>
        <Link to="/" style={{ marginRight: 15 }}>Home</Link>
        <Link to="/designer">Form Designer</Link>
      </nav>

      <Routes>
        {/* Home route */}
        <Route
          path="/"
          element={
            <div>
              <h1>Inchanted Forms Designer</h1>
              <p>Upload forms, extract text, and map fields to ACORD eLabels.</p>
              <p>Use the navigation above to open the Form Designer.</p>
            </div>
          }
        />

        {/* Designer route */}
        <Route path="/designer" element={<Designer />} />

        {/* ⭐ REQUIRED: Catch-all route for SPA */}
        <Route path="*" element={<Designer />} />
      </Routes>
    </div>
  );
}
