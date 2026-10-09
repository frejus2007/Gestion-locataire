import { AuthProvider as AuthProviderLocal, useAuth as useAuthLocal } from "./AuthContext.jsx";
import { AuthProviderFirebase, useAuthFirebase } from "./AuthContext.firebase.jsx";

const useFirebase = import.meta.env.VITE_USE_FIREBASE === "true";

export function AuthProvider({ children }) {
  return useFirebase ? (
    <AuthProviderFirebase>{children}</AuthProviderFirebase>
  ) : (
    <AuthProviderLocal>{children}</AuthProviderLocal>
  );
}

export function useAuth() {
  return useFirebase ? useAuthFirebase() : useAuthLocal();
}
