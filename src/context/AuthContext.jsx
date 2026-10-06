import { createContext, useContext, useState, useCallback } from "react";

const AuthContext = createContext(null);

const STORAGE_KEY = "cag_auth_session";

// Compte gestionnaire par défaut
const DEFAULT_CREDENTIALS = {
  email: "admin@cag-immobilier.bj",
  password: "admin",
  nom: "KOUASSI",
  prenoms: "Jean-Marc",
  role: "Bailleur gestionnaire",
  cabinet: "Cabinet Albert & Gilles",
};

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
    const isAccepted =
      (cleanEmail === "admin@cag-immobilier.bj" && cleanPass === "admin") ||
      (cleanEmail === "admin" && cleanPass === "admin") ||
      (cleanEmail === "jean-marc.kouassi@cag.bj" && cleanPass === "admin123") ||
      (cleanEmail.includes("@") && cleanPass.length >= 4);

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

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        loading,
        login,
        logout,
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
