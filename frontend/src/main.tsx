import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App";
import Home from "./routes/Home";
import Designer from "./routes/Designer";
import Mapping from "./routes/Mapping";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<Home />} />
          <Route path="designer" element={<Designer />} />
          <Route path="mapping" element={<Mapping />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
