// Connexion : l'écran d'entrée de l'application.
//
// Le logo CAGOUNOU et le rappel du cabinet structurent la page ; le formulaire
// ne demande qu'un identifiant et un mot de passe.

import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Check, Eye, EyeOff, Home, Receipt, ShieldAlert } from "lucide-react";
import { useAuth } from "../context/AuthContext";

const ARGUMENTS = [
  { icone: Receipt, texte: "Quittances PDF au format officiel" },
  { icone: Home, texte: "Maisons, lots et locataires" },
  { icone: ShieldAlert, texte: "Vos données restent sur cet appareil" },
];

export default function Login() {
  const { login, defaultCredentials } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState(defaultCredentials.email);
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState("");
  const [chargement, setChargement] = useState(false);
  const [visible, setVisible] = useState(false);

  const soumettre = async (e) => {
    e.preventDefault();
    setErreur("");
    setChargement(true);
    const res = await login(email, motDePasse);
    setChargement(false);
    if (res.ok) {
      const retour = location.state?.from?.pathname || "/";
      navigate(retour, { replace: true });
    } else {
      setErreur(res.error || "Connexion impossible");
    }
  };



  return (
    <div className="login-split">
      <aside className="login-aside-cag">
        <div className="login-marque">
          {/* Le logo complet porte déjà « Chabi Arnaud GOUNOU / GESTION
              LOCATIVE » : aucune légende ne le répète en dessous. */}
          <img src="/logo-cag-complet.png" alt="CAGOUNOU" className="login-logo-cag" />
        </div>

        <div className="login-pitch-cag">
          <h1>Vos loyers, vos maisons, vos quittances.</h1>
          <p>
            Enregistrez vos encaissements, suivez le compte de chaque locataire et
            éditez vos quittances au format officiel, sans quitter cet appareil.
          </p>
          <ul className="login-arguments">
            {ARGUMENTS.map(({ icone: Icone, texte }) => (
              <li key={texte}>
                <span className="login-tick">
                  <Icone size={14} />
                </span>
                {texte}
              </li>
            ))}
          </ul>
        </div>

        <p className="login-pied">Application mobile · Données conservées localement</p>
      </aside>

      <main className="login-main-cag">
        <form className="login-card-cag" onSubmit={soumettre}>
          <div className="login-surtitre">Connexion</div>
          <h2>Espace Propriétaire</h2>
          <p className="login-sous-titre">Accédez à vos maisons, locataires et quittances.</p>

          <label className="login-champ">
            <span>Identifiant</span>
            <input
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
          </label>

          <label className="login-champ">
            <span>Mot de passe</span>
            <div className="login-champ-mdp">
              <input
                type={visible ? "text" : "password"}
                value={motDePasse}
                onChange={(e) => setMotDePasse(e.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setVisible((v) => !v)}
                aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                title={visible ? "Masquer" : "Afficher"}
              >
                {visible ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </label>

          {erreur ? <div className="login-erreur">{erreur}</div> : null}

          <button type="submit" className="btn btn-primary login-bouton" disabled={chargement}>
            {chargement ? "Connexion…" : "Se connecter"}
            {!chargement ? <Check size={16} /> : null}
          </button>

          {/* Les identifiants de démonstration n'existent qu'en mode local.
              En mode Firebase, cette ligne afficherait des champs vides. */}
          {defaultCredentials.email ? (
            <p className="login-aide">
              Par défaut : <code>{defaultCredentials.email}</code> /{" "}
              <code>{defaultCredentials.password}</code>
            </p>
          ) : null}
        </form>
      </main>
    </div>
  );
}