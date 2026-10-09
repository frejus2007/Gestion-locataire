import { createContext, useContext, useEffect, useState, useCallback } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
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
      return { ok: false, error: e.message };
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

  return (
    <AuthContext.Provider
      value={{ user, isAuthenticated: !!user, loading, login, logout, resetPassword }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthFirebase() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuthFirebase must be used within AuthProviderFirebase");
  return ctx;
}
