// Pont d'authentification : choisit la source de session.
//
// Le mode se lit dans `import.meta.env` au chargement du module, donc la
// valeur ne change pas pendant l'exécution : une seule branche est prise pour
// toute la session.
//
// Deux règles à respecter ici, apprises à la dure :
//
//   1. `useAuth` appelle *les deux* hooks et garde le résultat. Appeler l'un ou
//      l'autre selon un drapeau viole « les hooks doivent être appelés dans le
//      même ordre à chaque rendu » ; si le drapeau changeait un jour, la
//      lecture croiserait deux contextes différents.
//
//   2. Les deux contextes sont montés simultanément, celui du mode inactif
//      enveloppant le children du second. Il faut bien un Provider autour de
//      chaque : `useAuthFirebase` et `useAuthLocal` lisent leur contexte à
//      chaque rendu, et un `useContext` sans Provider renvoie null et fait
//      échouer le hook suivant.

import { AuthProvider as AuthProviderLocal, useAuth as useAuthLocal } from "./AuthContext.jsx";
import { AuthProviderFirebase, useAuthFirebase } from "./AuthContext.firebase.jsx";

const useFirebase = import.meta.env.VITE_USE_FIREBASE === "true";

export function AuthProvider({ children }) {
  return (
    <AuthProviderLocal>
      <AuthProviderFirebase>{children}</AuthProviderFirebase>
    </AuthProviderLocal>
  );
}

export function useAuth() {
  const local = useAuthLocal();
  const firebase = useAuthFirebase();
  return useFirebase ? firebase : local;
}
