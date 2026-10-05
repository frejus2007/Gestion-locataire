import { Outlet, Link, useParams } from "react-router-dom";
import { Building2, Home, FileText, User } from "lucide-react";

// Layout minimaliste pour l'espace locataire — volontairement distinct du propriétaire
export default function TenantLayout() {
  const { id } = useParams();

  return (
    <div className="tenant-layout">
      {/* Header locataire */}
      <header className="tenant-header">
        <div className="tenant-header-brand">
          <div className="tenant-header-icon">
            <Building2 size={20} />
          </div>
          <span>Mon Espace Locataire</span>
        </div>
        {id && (
          <Link to="/espace-locataire" className="tenant-logout">
            Déconnexion
          </Link>
        )}
      </header>

      {/* Contenu */}
      <main className="tenant-main">
        <Outlet />
      </main>

      {/* Navigation bas de page locataire */}
      {id && (
        <nav className="tenant-bottom-nav">
          <Link
            to={`/espace-locataire/${id}`}
            className={({ isActive }) => "tenant-nav-link" + (isActive ? " active" : "")}
          >
            <Home size={20} />
            Accueil
          </Link>
          <Link
            to={`/espace-locataire/${id}/quittances`}
            className={({ isActive }) => "tenant-nav-link" + (isActive ? " active" : "")}
          >
            <FileText size={20} />
            Quittances
          </Link>
          <Link
            to={`/espace-locataire/${id}/profil`}
            className={({ isActive }) => "tenant-nav-link" + (isActive ? " active" : "")}
          >
            <User size={20} />
            Profil
          </Link>
        </nav>
      )}
    </div>
  );
}
