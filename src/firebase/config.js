import { initializeApp } from "firebase/app";
import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, getDoc, getDocs, collection, doc } from "firebase/firestore";
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
export const storage = configure ? getStorage(app) : null;

// Cache local : les données déjà vues restent lisibles hors connexion, et la
// file d'attente d'écritures survit à un rechargement. `persistentLocalCache`
// retombe automatiquement en mémoire si IndexedDB est indisponible — contrairement
// à l'ancien `enableIndexedDbPersistence`, qui bloquait le client au lieu de
// dégrader proprement.
//
// `experimentalForceLongPolling` contourne HTTP/3. En production, Firestore
// ouvre un canal de streaming que le navigateur tente d'établir en QUIC ; sur
// certains réseaux (et c'est le cas depuis Netlify), cette négociation échoue
// en `ERR_QUIC_PROTOCOL_ERROR`, suivie d'un canal invalide — les données
// n'arrivent plus. Le SDK détecte normalement ce cas, mais sa détection ne voit
// pas cette panne : il faut donc le forcer. Le prix est un aller-retour par
// lecture au lieu d'un canal permanent ; sur une application de gestion
// locative, la différence est imperceptible.
//
// Réglable par variable d'environnement : si un jour le réseau ne pose plus
// de problème, `VITE_FIREBASE_LONG_POLLING=false` suffit à revenir au
// streaming, sans toucher au code.
const longPolling = import.meta.env.VITE_FIREBASE_LONG_POLLING !== "false";

export const db = configure
  ? initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      experimentalForceLongPolling: longPolling,
      experimentalAutoDetectLongPolling: !longPolling,
    })
  : null;

if (configure) {
  // Session conservée : on ne demande pas le mot de passe à chaque ouverture.
  setPersistence(auth, browserLocalPersistence).catch(() => {
    /* persistance refusée : sans conséquence, la session reste en mémoire */
  });

  if (import.meta.env.DEV) {
    // Accès direct depuis la console du navigateur pour diagnostiquer une
    // lecture Firestore qui ne répond pas. Éplacé en production.
    window.__firebase = {
      app,
      auth,
      db,
      // Lecture de diagnostic, bornée dans le temps : une promesse qui ne
      // répond pas doit se voir, pas figer la console.
      lire: (chemin = "proprietaire/proprietaire", ms = 8000) =>
        Promise.race([
          getDoc(doc(db, ...chemin.split("/"))).then(
            (s) => (s.exists() ? s.data() : "(absent)"),
            (e) => `ERREUR: ${e.message}`
          ),
          new Promise((r) => setTimeout(() => r("TIMEOUT"), ms)),
        ]),
      lireCollection: (nom, ms = 8000) =>
        Promise.race([
          getDocs(collection(db, nom)).then(
            (s) => s.docs.map((d) => d.id),
            (e) => `ERREUR: ${e.message}`
          ),
          new Promise((r) => setTimeout(() => r("TIMEOUT"), ms)),
        ]),
    };
  }}
