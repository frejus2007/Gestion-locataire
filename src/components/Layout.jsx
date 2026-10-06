// Coquille de l'application : navigation latérale sur ordinateur,
// barre du haut et navigation basse sur mobile.

import { useState, useEffect } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
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
  RotateCw,
} from "lucide-react";
import { useApp } from "../context/AppContext";

const NAVIGATION = [
  { section: "Pilotage" },
  { to: "/", label: "Tableau de bord", icon: LayoutDashboard, end: true },
  { to: "/journal", label: "Journal mensuel", icon: BookOpen },
  { section: "Patrimoine" },
  { to: "/immeubles", label: "Immeubles", icon: Building2 },
  { to: "/locataires", label: "Locataires", icon: Users },
  { section: "Finances" },
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
  const [syncing, setSyncing] = useState(false);
  const { impayesGlobaux, proprietaire } = useApp();

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", sombre ? "dark" : "light");
    localStorage.setItem("theme", sombre ? "dark" : "light");
  }, [sombre]);

  const nbImpayes = impayesGlobaux().length;
  const initiales = `${proprietaire?.prenoms?.[0] || "J"}${proprietaire?.nom?.[0] || "K"}`.toUpperCase();
  const nomComplet = [proprietaire?.prenoms, proprietaire?.nom].filter(Boolean).join(" ") || "Jean-Marc KOUASSI";

  // Le menu se referme dès qu'on change de page : pas d'effet nécessaire,
  // l'événement de navigation suffit à déclencher le re-rendu.
  const fermer = () => setMenuOuvert(false);

  const handleSync = () => {
    if (syncing) return;
    setSyncing(true);
    window.dispatchEvent(new CustomEvent("cag:reconnect"));
    setTimeout(() => setSyncing(false), 850);
  };

  // Rendu direct plutôt qu'un sous-composant : évite de recréer un composant
  // à chaque rendu, ce qui perdrait son état interne.
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
        <span className="nav-label">{item.label}</span>
        {item.to === "/locataires" && nbImpayes > 0 && <span className="nav-badge">{nbImpayes}</span>}
      </NavLink>
    );
  });

  return (
    <div className="layout">
      <aside className={`sidebar ${menuOuvert ? "open" : ""}`}>
        <Link to="/" className="sidebar-brand" onClick={fermer}>
          <div className="brand-logo-container">
            <img src="/logo-cag.png" alt="Cabinet Albert & Gilles" className="brand-logo" />
          </div>
          <div className="brand-text">
            <span className="brand-name">Cabinet Albert & Gilles</span>
            <span className="brand-tagline">Gestion Locative</span>
          </div>
        </Link>

        <nav className="sidebar-nav">{liens}</nav>

        <div className="sidebar-footer">
          <div className="sidebar-profile-card">
            <Link
              to="/parametres"
              className="sidebar-profile-info"
              onClick={fermer}
              title="Voir les paramètres du bailleur"
            >
              <div className="sidebar-avatar-wrapper">
                <div className="sidebar-avatar">{initiales}</div>
                <span className="sidebar-avatar-status" title="Session locale active" />
              </div>
              <div className="sidebar-user-details">
                <strong className="sidebar-user-name" title={nomComplet}>{nomComplet}</strong>
                <span className="sidebar-user-role">Bailleur gestionnaire</span>
              </div>
            </Link>
            <button
              type="button"
              className="btn-icon-subtle sidebar-sync-btn"
              onClick={handleSync}
              title="Synchroniser / Animation de démarrage"
              aria-label="Recharger"
            >
              <RotateCw size={14} className={syncing ? "spin-sync" : ""} />
            </button>
          </div>

          <div className="sidebar-footer-actions">
            <NavLink
              to="/parametres"
              className={({ isActive }) => "nav-link footer-nav-link" + (isActive ? " active" : "")}
              onClick={fermer}
            >
              <Settings size={18} className="nav-icon" />
              <span>Paramètres</span>
            </NavLink>
            <button
              type="button"
              className="sidebar-theme-toggle"
              onClick={() => setSombre((s) => !s)}
              title={sombre ? "Désactiver le mode sombre" : "Activer le mode sombre"}
              aria-label={sombre ? "Désactiver le mode sombre" : "Activer le mode sombre"}
            >
              <div className="theme-toggle-label">
                {sombre ? <Moon size={18} className="nav-icon theme-active-icon" /> : <Sun size={18} className="nav-icon" />}
                <span>Mode sombre</span>
              </div>
              <div className={`theme-toggle-switch ${sombre ? "active" : ""}`} aria-hidden="true">
                <div className="theme-toggle-thumb" />
              </div>
            </button>
          </div>
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