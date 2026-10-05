import { useState, useEffect } from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  FileText,
  Menu,
  Building2,
  Moon,
  Sun,
  Settings,
} from "lucide-react";

const navItems = [
  { to: "/", label: "Tableau de bord", icon: LayoutDashboard, end: true },
  { to: "/locataires", label: "Locataires", icon: Users },
  { to: "/quittances", label: "Quittances", icon: FileText },
];

export default function Layout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dark, setDark] = useState(() => {
    return localStorage.getItem("theme") === "dark";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  return (
    <div className="layout">
      {/* Sidebar desktop */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-icon">
            <Building2 size={20} />
          </div>
          <span>Gestion Locataires</span>
        </div>
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}
            >
              <item.icon size={18} className="nav-icon" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <NavLink
            to="/parametres"
            className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}
          >
            <Settings size={18} className="nav-icon" />
            Paramètres
          </NavLink>
          <button
            className="nav-link"
            style={{ width: "100%", background: "none", border: "none", cursor: "pointer" }}
            onClick={() => setDark(!dark)}
          >
            {dark ? <Sun size={18} className="nav-icon" /> : <Moon size={18} className="nav-icon" />}
            {dark ? "Mode clair" : "Mode sombre"}
          </button>
        </div>
      </aside>

      {/* Topbar mobile */}
      <header className="topbar">
        <button className="menu-btn" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu">
          <Menu size={22} />
        </button>
        <span className="topbar-title">Gestion Locataires</span>
        <button
          className="menu-btn"
          onClick={() => setDark(!dark)}
          aria-label="Thème"
          style={{ marginLeft: "auto" }}
        >
          {dark ? <Sun size={20} /> : <Moon size={20} />}
        </button>
      </header>

      {/* Menu mobile overlay */}
      {menuOpen && (
        <div className="modal-overlay" onClick={() => setMenuOpen(false)}>
          <nav
            className="card"
            style={{ position: "absolute", top: "1rem", left: "1rem", right: "1rem", padding: "1rem" }}
            onClick={(e) => e.stopPropagation()}
          >
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}
                onClick={() => setMenuOpen(false)}
                style={{ color: "var(--text)" }}
              >
                <item.icon size={18} className="nav-icon" />
                {item.label}
              </NavLink>
            ))}
            <NavLink
              to="/parametres"
              className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}
              onClick={() => setMenuOpen(false)}
              style={{ color: "var(--text)" }}
            >
              <Settings size={18} className="nav-icon" />
              Paramètres
            </NavLink>
          </nav>
        </div>
      )}

      <main className="main-content">
        <Outlet />
      </main>

      {/* Bottom nav mobile */}
      <nav className="bottom-nav">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}
          >
            <item.icon size={20} className="nav-icon" />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
