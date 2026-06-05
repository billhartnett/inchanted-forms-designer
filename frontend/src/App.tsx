import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Mapping from "./pages/Mapping";
import { Designer } from "./designer/Designer";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/mapping" element={<Mapping />} />
      <Route path="/designer" element={<Designer />} />
    </Routes>
  );
}
