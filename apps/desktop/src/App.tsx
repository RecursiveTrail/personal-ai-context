import { NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { ConnectMcp } from "./components/ConnectMcp";
import { Desk } from "./components/Desk";

const navClass = ({ isActive }: { isActive: boolean }) => (isActive ? "isActive" : "");

export function App() {
  const navigate = useNavigate();
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbarInner">
          <div className="brand">
            <h1>Chit</h1>
            <p className="tagline">
              The local consciousness layer and MCP runtime for personal AI agents.
            </p>
            <button
              type="button"
              className="brandHome"
              aria-label="Home"
              onClick={() => navigate("/")}
            />
          </div>
          <nav className="deskNav" aria-label="Desk">
            <NavLink to="/" end className={navClass}>
              Home
            </NavLink>
            <NavLink to="/connect" className={navClass}>
              Connect MCP
            </NavLink>
          </nav>
        </div>
      </header>
      <Routes>
        <Route path="/" element={<Desk />} />
        <Route path="/connect" element={<ConnectMcp />} />
      </Routes>
    </div>
  );
}
