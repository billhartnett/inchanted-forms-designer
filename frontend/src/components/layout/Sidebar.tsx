import { Link } from "react-router-dom";

export default function Sidebar() {
  return (
    <div className="sidebar">
      <h2 className="sidebar-title">Inchanted</h2>

      <nav className="sidebar-nav">
        <Link to="/">Home</Link>
        <Link to="/designer">Designer</Link>
        <Link to="/mapping">Mapping</Link>
      </nav>
    </div>
  );
}
