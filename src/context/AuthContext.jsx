import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "../supabase/client";

const AuthContext = createContext(null);

// Le profil du propriétaire vit dans les métadonnées du compte Supabase.
function profilDe(utilisateur) {
  const meta = utilisateur.user_metadata || {};
  const nomComplet = meta.full_name || meta.name || "";
  const morceaux = nomComplet.split(" ").filter(Boolean);
  return {
    nom: meta.nom || morceaux.slice(-1).join(" ") || "",
    prenoms: meta.prenoms || morceaux.slice(0, -1).join(" ") || nomComplet,
    role: meta.role || "Bailleur gestionnaire",
    cabinet: meta.cabinet || "Chabi Arnaud GOUNOU",
  };
}

function versUtilisateur(utilisateur) {
  return {
    id: utilisateur.id,
    uid: utilisateur.id,
    email: utilisateur.email,
    ...profilDe(utilisateur),
    derniereConnexion: new Date().toISOString(),
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let actif = true;
    const { data: abonnement } = supabase.auth.onAuthStateChange((_evenement, session) => {
      if (!actif) return;
      setUser(session?.user ? versUtilisateur(session.user) : null);
      setLoading(false);
    });
    // Un abonnement ne se déclenche qu'au prochain changement : on lit la session
    // courante pour l'état initial.
    supabase.auth.getSession().then(({ data }) => {
      if (!actif) return;
      setUser(data.session?.user ? versUtilisateur(data.session.user) : null);
      setLoading(false);
    });
    return () => {
      actif = false;
      abonnement.subscription.unsubscribe();
    };
  }, []);

  const login = useCallback(async (email, password) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { ok: false, error: messageAuth(error) };
      return { ok: true, user: data.user };
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
  }, []);

  /**
   * Change le mot de passe du compte connecté.
   *
   * Par prudence, le mot de passe actuel est redemandé avant d'accepter le
   * nouveau : une session restée ouverte sur un poste partagé ne doit pas suffire
   * à verrouiller le propriétaire hors de son compte.
   *
   * @returns {Promise<{ok: boolean, error?: string}>}
   */
  const changePassword = useCallback(async (actuel, nouveau) => {
    const { data } = await supabase.auth.getUser();
    const email = data?.user?.email;
    if (!email) return { ok: false, error: "Aucun compte connecté" };
    if (!actuel) return { ok: false, error: "Saisissez votre mot de passe actuel" };
    if (!nouveau || String(nouveau).length < 6) {
      return { ok: false, error: "Le nouveau mot de passe doit contenir au moins 6 caractères" };
    }
    if (actuel === nouveau) {
      return { ok: false, error: "Le nouveau mot de passe doit être différent de l'ancien" };
    }
    // Preuve que c'est bien le propriétaire : cette étape échoue si le mot de
    // passe actuel est faux.
    const verif = await supabase.auth.signInWithPassword({ email, password: actuel });
    if (verif.error) return { ok: false, error: messageAuth(verif.error) };
    const { error } = await supabase.auth.updateUser({ password: nouveau });
    if (error) return { ok: false, error: messageAuth(error) };
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
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Traduit les erreurs de Supabase Auth en français.
 *
 * Les messages bruts sont en anglais et peu parlants : le propriétaire doit
 * savoir quoi corriger.
 */
function messageAuth(e) {
  switch (e?.code) {
    case "invalid_credentials":
      return "Identifiants invalides";
    case "invalid_email":
    case "validation_failed":
      return "Adresse email invalide";
    case "weak_password":
      return "Ce mot de passe est trop faible";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "Trop de tentatives. Patientez quelques minutes avant de réessayer.";
    case "email_not_confirmed":
      return "Adresse email non confirmée. Vérifiez votre boîte de réception.";
    default:
      if (e?.message?.toLowerCase().includes("fetch")) {
        return "Connexion impossible. Vérifiez votre accès à Internet.";
      }
      return e?.message || "Opération impossible";
  }
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth doit être utilisé au sein d'un AuthProvider");
  }
  return ctx;
}
