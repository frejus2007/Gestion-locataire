import { initializeApp } from "firebase/app";
import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";
import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// L'import est fait par le pont d'authentification même en mode local, où
// aucune configuration n'est renseignée : initialiser quand même produirait
// une erreur bruyante au démarrage pour rien. On exporte donc des valeurs
// nulles et les garde-fous se contentent de ne rien faire.
export const configure = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

export const app = configure ? initializeApp(firebaseConfig) : null;
export const auth = configure ? getAuth(app) : null;
export const db = configure ? getFirestore(app) : null;
export const storage = configure ? getStorage(app) : null;

if (configure) {
  // Session conservée : on ne demande pas le mot de passe à chaque ouverture.
  setPersistence(auth, browserLocalPersistence).catch(() => {
    /* persistance refusée : sans conséquence, la session reste en mémoire */
  });

  // Hors-ligne : les données déjà consultées restent lisibles sans réseau.
  enableIndexedDbPersistence(db).catch((err) => {
    console.warn("Firestore hors-ligne indisponible :", err.code || err.message);
  });
}
