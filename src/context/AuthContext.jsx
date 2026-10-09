import { createContext, useContext, useState, useCallback } from "react";

const AuthContext = createContext(null);

const STORAGE_KEY = "cag_auth_session";
const PASSWORD_KEY = "cag_admin_password";

// Compte gestionnaire par défaut
const DEFAULT_CREDENTIALS = {
  email: "admin@cag-immobilier.bj",
  password: "admin",
  nom: "KOUASSI",
  prenoms: "Jean-Marc",
  role: "Bailleur gestionnaire",
  cabinet: "Chabi Arnaud GOUNOU",
};

/**
 * Mot de passe applicable au compte gestionnaire.
 * Celui de la page Paramètres prime : dès qu'il est modifié, il remplace
 * celui du jeu de démonstration, et ce pour tous les navigateurs de l'appareil.
 */
function motDePasseEnCours() {
  try {
    return localStorage.getItem(PASSWORD_KEY) || DEFAULT_CREDENTIALS.password;
  } catch {
    return DEFAULT_CREDENTIALS.password;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) || sessionStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [loading, setLoading] = useState(false);

  const login = useCallback(async (email, password, remember = true) => {
    setLoading(true);
    // Simulation d'un délai réseau réaliste pour une UX fluide
    await new Promise((resolve) => setTimeout(resolve, 600));

    const cleanEmail = (email || "").trim().toLowerCase();
    const cleanPass = (password || "").trim();

    // Authentification : accepte les identifiants officiels ou le compte démo
    const attendu = motDePasseEnCours();
    const estCompteOfficiel =
      cleanEmail === "admin@cag-immobilier.bj" || cleanEmail === "admin";
    const isAccepted = estCompteOfficiel
      ? cleanPass === attendu
      : cleanEmail.includes("@") && cleanPass.length >= 4;

    if (isAccepted) {
      const userData = {
        id: "usr_admin_01",
        email: cleanEmail.includes("@") ? cleanEmail : "admin@cag-immobilier.bj",
        nom: DEFAULT_CREDENTIALS.nom,
        prenoms: DEFAULT_CREDENTIALS.prenoms,
        role: DEFAULT_CREDENTIALS.role,
        cabinet: DEFAULT_CREDENTIALS.cabinet,
        derniereConnexion: new Date().toISOString(),
      };

      try {
        if (remember) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(userData));
          sessionStorage.removeItem(STORAGE_KEY);
        } else {
          sessionStorage.setItem(STORAGE_KEY, JSON.stringify(userData));
          localStorage.removeItem(STORAGE_KEY);
        }
      } catch (err) {
        console.warn("Impossible d'écrire dans le storage local:", err);
      }

      setUser(userData);
      setLoading(false);
      return { ok: true, user: userData };
    }

    setLoading(false);
    return {
      ok: false,
      error: "Identifiants invalides. Vérifiez votre adresse email et votre mot de passe.",
    };
  }, []);

  const logout = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      console.warn("Erreur lors de la déconnexion:", err);
    }
    setUser(null);
  }, []);

  /**
   * Modification du mot de passe du compte gestionnaire.
   * Renvoie { ok } ou { ok: false, error }.
   */
  const changePassword = useCallback(async (actuel, nouveau) => {
    await new Promise((r) => setTimeout(r, 400));
    if (!actuel || String(actuel) !== motDePasseEnCours()) {
      return { ok: false, error: "Mot de passe actuel incorrect" };
    }
    if (!nouveau || String(nouveau).length < 6) {
      return { ok: false, error: "Le mot de passe doit contenir au moins 6 caractères" };
    }
    try {
      localStorage.setItem(PASSWORD_KEY, String(nouveau));
    } catch (err) {
      console.warn("Mot de passe non enregistré:", err);
      return { ok: false, error: "Impossible d'enregistrer le mot de passe sur cet appareil" };
    }
    return { ok: true };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        loading,
        login,
        logout,
        changePassword,
        defaultCredentials: DEFAULT_CREDENTIALS,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth doit être utilisé au sein d'un AuthProvider");
  }
  return ctx;
}
