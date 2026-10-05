// Coquille de l'application : navigation latérale sur ordinateur,
// barre du haut et navigation basse sur mobile.

import { useState, useEffect } from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  LayoutDashboard,
  Building2,
  Users,
  Wallet,
  Receipt,
  BookOpen,
  Wrench,
  Settings,
  Menu,
  X,
  Moon,
  Sun,
  AlertTriangle,
} from "lucide-react";
import { useApp } from "../context/AppContext";

const NAVIGATION = [
  { section: "Pilotage" },
  { to: "/", label: "Tableau de bord", icon: LayoutDashboard, end: true },
  { to: "/journal", label: "Journal mensuel", icon: BookOpen },
  { section: "Biens et locataires" },
  { to: "/immeubles", label: "Immeubles", icon: Building2 },
  { to: "/locataires", label: "Locataires", icon: Users },
  { section: "Argent" },
  { to: "/paiements", label: "Versements", icon: Wallet },
  { to: "/quittances", label: "Quittances", icon: Receipt },
  { to: "/depenses", label: "Dépenses", icon: Wrench },
];

const NAV_MOBILE = [
  { to: "/", label: "Accueil", icon: LayoutDashboard, end: true },
  { to: "/immeubles", label: "Immeubles", icon: Building2 },
  { to: "/paiements", label: "Versements", icon: Wallet },
  { to: "/quittances", label: "Quittances", icon: Receipt },
];

export default function Layout() {
  const [menuOuvert, setMenuOuvert] = useState(false);
  const [sombre, setSombre] = useState(() => localStorage.getItem("theme") === "dark");
  const { impayesGlobaux } = useApp();

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", sombre ? "dark" : "light");
    localStorage.setItem("theme", sombre ? "dark" : "light");
  }, [sombre]);

  const nbImpayes = impayesGlobaux().length;

  // Le menu se referme dès qu'on change de page : pas d'effet nécessaire,
  // l'événement de navigation suffit à déclencher le re-rendu.
  const fermer = () => setMenuOuvert(false);

  // Rendu direct plutôt qu'un sous-composant : évite de recréer un composant
  // à chaque rendu, ce qui perdreait son état interne.
  const liens = NAVIGATION.map((item, i) => {
    if (item.section) {
      return (
        <div className="nav-section" key={`section-${i}`}>
          {item.section}
        </div>
      );
    }
    const Icon = item.icon;
    return (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.end}
        className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}
        onClick={fermer}
      >
        <Icon size={18} className="nav-icon" />
        {item.label}
        {item.to === "/" && nbImpayes > 0 && <span className="nav-badge">{nbImpayes}</span>}
      </NavLink>
    );
  });

  return (
    <div className="layout">
      <aside className={`sidebar ${menuOuvert ? "open" : ""}`}>
        <div className="sidebar-brand">
          <img src="/logo-cag.png" alt="CAG" className="brand-logo" />
        </div>

        <nav className="sidebar-nav">{liens}</nav>

        <div className="sidebar-footer">
          <NavLink
            to="/parametres"
            className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}
          >
            <Settings size={18} className="nav-icon" />
            Paramètres
          </NavLink>
          <button
            type="button"
            className="nav-link"
            style={{ width: "100%", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}
            onClick={() => setSombre((s) => !s)}
          >
            {sombre ? <Sun size={18} className="nav-icon" /> : <Moon size={18} className="nav-icon" />}
            {sombre ? "Mode clair" : "Mode sombre"}
          </button>
        </div>
      </aside>

      <header className="topbar">
        <button
          type="button"
          className="menu-btn"
          onClick={() => setMenuOuvert((o) => !o)}
          aria-label={menuOuvert ? "Fermer le menu" : "Ouvrir le menu"}
        >
          {menuOuvert ? <X size={22} /> : <Menu size={22} />}
        </button>
        <img src="/logo-cag.png" alt="CAG" className="topbar-logo" />
        <span className="topbar-title">Gestion locative</span>
        <div className="spacer" />
        {nbImpayes > 0 && (
          <span className="badge badge-red" title={`${nbImpayes} locataire(s) en impayé`}>
            <AlertTriangle size={12} style={{ verticalAlign: -1, marginRight: 3 }} />
            {nbImpayes}
          </span>
        )}
        <button
          type="button"
          className="menu-btn"
          onClick={() => setSombre((s) => !s)}
          aria-label="Changer de thème"
        >
          {sombre ? <Sun size={20} /> : <Moon size={20} />}
        </button>
      </header>

      {menuOuvert && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 39 }}
          onClick={fermer}
          role="presentation"
        />
      )}

      <main className="main-content">
        <Outlet />
      </main>

      <nav className="bottom-nav">
        {NAV_MOBILE.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}
            >
              <Icon size={20} className="nav-icon" />
              {item.label}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}