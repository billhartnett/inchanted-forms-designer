import "./layout.css";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

export default function Layout({ children }) {
  return (
    <div className="layout-container">
      <Sidebar />

      <div className="layout-main">
        <Topbar />
        <div className="layout-content">{children}</div>
      </div>
    </div>
  );
}
