import { useState, useEffect } from "react";
import { useNavigate, useLocation, Navigate } from "react-router-dom";
import {
  Eye,
  EyeOff,
  LogIn,
  AlertCircle,
  ShieldCheck,
  Sun,
  Moon,
  Check,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isAuthenticated, loading, defaultCredentials } = useAuth();
  const { addToast } = useToast();

  const [email, setEmail] = useState(defaultCredentials.email);
  const [password, setPassword] = useState(defaultCredentials.password);
  const [showPassword, setShowPassword] = useState(false);
  const [erreur, setErreur] = useState("");
  const [sombre, setSombre] = useState(() => localStorage.getItem("theme") === "dark");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", sombre ? "dark" : "light");
    localStorage.setItem("theme", sombre ? "dark" : "light");
  }, [sombre]);

  if (isAuthenticated) {
    const destination = location.state?.from?.pathname || "/";
    return <Navigate to={destination} replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErreur("");

    if (!email.trim()) {
      setErreur("Veuillez renseigner votre email.");
      return;
    }
    if (!password) {
      setErreur("Veuillez saisir votre mot de passe.");
      return;
    }

    const res = await login(email, password, true);
    if (res.ok) {
      addToast(`Bienvenue ${res.user.prenoms} ${res.user.nom} !`);
      const destination = location.state?.from?.pathname || "/";
      window.dispatchEvent(new CustomEvent("cag:login"));
      navigate(destination, { replace: true });
    } else {
      setErreur(res.error || "Identifiants invalides.");
    }
  };

  return (
    <div className="login-page-container">
      <section className="login-brand-panel">
        <div className="login-brand-content">
          <div className="login-brand-logo">
            <img src="/logo-cag.png" alt="Cabinet Albert & Gilles" />
          </div>
          <p className="login-brand-kicker">Gestion des locataires · Espace propriétaire</p>
          <h1>Vos loyers, vos maisons,<br />vos quittances.</h1>
          <p className="login-brand-description">
            Un seul tableau de bord pour suivre vos locataires, encaisser les loyers
            et éditer vos quittances en quelques secondes.
          </p>
          <ul className="login-feature-list">
            <li><Check size={17} /> Quittances PDF avec codes-barres, prêtes à envoyer</li>
            <li><Check size={17} /> Soldes et impayés calculés automatiquement</li>
            <li><Check size={17} /> Alertes avant la fin des baux</li>
            <li><Check size={17} /> Fonctionne aussi sur téléphone</li>
          </ul>
          <p className="login-brand-footnote">Application mobile · Vos données restent sur votre serveur.</p>
        </div>
      </section>

      <section className="login-form-panel">
      {/* Bouton de bascule thème clair/sombre en haut à droite */}
      <header className="login-topbar">
        <button
          type="button"
          className="login-theme-btn"
          onClick={() => setSombre((s) => !s)}
          title={sombre ? "Passer au thème clair" : "Passer au thème sombre"}
          aria-label={sombre ? "Passer au thème clair" : "Passer au thème sombre"}
        >
          {sombre ? <Sun size={18} className="theme-spin-icon" /> : <Moon size={18} className="theme-spin-icon" />}
          <span className="login-theme-text">{sombre ? "Mode clair" : "Mode sombre"}</span>
        </button>
      </header>

      <main className="login-card-wrapper">
        <div className="login-card">
          <div className="login-header login-stagger-1">
            <p className="login-form-kicker">Connexion</p>
            <h2 className="login-title">Espace Propriétaire</h2>
            <p className="login-subtitle">
              Accédez à vos maisons, locataires et quittances.
            </p>
          </div>

          {erreur && (
            <div className="login-error-banner login-shake" role="alert">
              <AlertCircle size={18} className="login-error-icon" />
              <span>{erreur}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="login-form login-stagger-2">
            <div className="form-group">
              <label htmlFor="email" className="login-label">
                Identifiant
              </label>
              <div className="login-field-box">
                <input
                  id="email"
                  type="email"
                  className="login-input"
                  placeholder="Adresse email ou identifiant"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (erreur) setErreur("");
                  }}
                  autoComplete="username"
                  required
                />
              </div>
            </div>

            <div className="form-group login-stagger-3">
              <div className="login-label-row">
                <label htmlFor="password" className="login-label">
                  Mot de passe
                </label>
                <button
                  type="button"
                  className="login-forgot-link"
                  onClick={() =>
                    alert(
                      "Pour réinitialiser votre accès gestionnaire, veuillez contacter l'administrateur du Cabinet Albert & Gilles."
                    )
                  }
                >
                  Mot de passe oublié ?
                </button>
              </div>
              <div className="login-field-box">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  className="login-input"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (erreur) setErreur("");
                  }}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="login-pwd-toggle"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="login-submit-btn login-stagger-4"
              disabled={loading}
            >
              {loading ? (
                <span className="login-btn-loading">
                  <span className="login-spinner" />
                  Connexion en cours…
                </span>
              ) : (
                <span className="login-btn-content">
                  <span>Se connecter</span>
                  <LogIn size={18} className="login-btn-arrow" />
                </span>
              )}
            </button>
          </form>

          <div className="login-footer-security login-stagger-4">
            <ShieldCheck size={15} className="login-security-icon" />
            <span>Connexion sécurisée · Cabinet Albert & Gilles</span>
          </div>
        </div>
      </main>
      </section>
    </div>
  );
}
