import { createContext, useContext, useEffect, useState, useCallback } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase/config";

const AuthContext = createContext(null);

export function AuthProviderFirebase({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true);
      try {
        if (firebaseUser) {
          const ref = doc(db, "users", firebaseUser.uid);
          const snap = await getDoc(ref);
          let profile = {};
          if (snap.exists()) profile = snap.data();
          else {
            profile = {
              nom: firebaseUser.displayName?.split(" ")?.slice(-1)?.join(" ") || "",
              prenoms: firebaseUser.displayName?.split(" ")?.slice(0, -1)?.join(" ") || firebaseUser.displayName || "",
              role: "Bailleur gestionnaire",
              cabinet: "Chabi Arnaud GOUNOU",
              createdAt: serverTimestamp(),
            };
            await setDoc(ref, profile, { merge: true });
          }
          setUser({
            id: firebaseUser.uid,
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            ...profile,
            derniereConnexion: new Date().toISOString(),
          });
        } else {
          setUser(null);
        }
      } catch (e) {
        console.warn("Auth state error:", e);
        setUser(null);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  const login = useCallback(async (email, password) => {
    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      return { ok: true, user: cred.user };
    } catch (e) {
      return { ok: false, error: messageAuth(e) };
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await signOut(auth);
    setUser(null);
  }, []);

  const resetPassword = useCallback(async (email) => {
    await sendPasswordResetEmail(auth, email);
    return { ok: true };
  }, []);

  /**
   * Change le mot de passe du compte connecté.
   *
   * Firebase exige qu'une opération sensible soit précédée d'une
   * réauthentification : sans cela, une session restée ouverte sur un poste
   * partagé suffirait à verrouiller le propriétaire hors de son propre compte.
   * On redemande donc le mot de passe actuel avant d'accepter le nouveau — ce
   * qui est de toute façon le comportement attendu.
   *
   * @returns {Promise<{ok: boolean, error?: string}>}
   */
  const changePassword = useCallback(async (actuel, nouveau) => {
    const u = auth.currentUser;
    if (!u?.email) return { ok: false, error: "Aucun compte connecté" };
    if (!actuel) return { ok: false, error: "Saisissez votre mot de passe actuel" };
    if (!nouveau || String(nouveau).length < 6) {
      return { ok: false, error: "Le nouveau mot de passe doit contenir au moins 6 caractères" };
    }
    if (actuel === nouveau) {
      return { ok: false, error: "Le nouveau mot de passe doit être différent de l'ancien" };
    }
    try {
      // Preuve que c'est bien le propriétaire : c'est cette étape qui fait
      // échouer la saisie si le mot de passe actuel est faux.
      const cred = EmailAuthProvider.credential(u.email, actuel);
      await reauthenticateWithCredential(u, cred);
      await updatePassword(u, nouveau);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: messageAuth(e) };
    }
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
        resetPassword,
        // Pas de compte de démonstration en mode connecté : l'écran de
        // connexion s'en sert pour pré-remplir le champ et afficher l'aide.
        // Sans cet objet, la page planterait sur `defaultCredentials.email`.
        defaultCredentials: { email: "", password: "" },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Traduit les codes d'erreur Firebase en français.
 *
 * Les messages bruts sont en anglais et parfois peu parlants («
 * auth/wrong-password »), ce qui laisse le propriétaire devant une impasse
 * sans savoir quoi corriger.
 */
function messageAuth(e) {
  switch (e?.code) {
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Mot de passe actuel incorrect";
    case "auth/invalid-email":
      return "Adresse email invalide";
    case "auth/weak-password":
      return "Ce mot de passe est trop faible";
    case "auth/too-many-requests":
      return "Trop de tentatives. Patientez quelques minutes avant de réessayer.";
    case "auth/user-not-found":
    case "auth/invalid-user-credentials":
      return "Identifiants invalides";
    case "auth/requires-recent-login":
      return "Session trop ancienne. Déconnectez-vous et reconnectez-vous.";
    case "auth/network-request-failed":
      return "Connexion impossible. Vérifiez votre accès à Internet.";
    default:
      return e?.message || "Opération impossible";
  }
}

export function useAuthFirebase() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuthFirebase must be used within AuthProviderFirebase");
  return ctx;
}
