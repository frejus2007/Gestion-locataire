// Service worker : rend l'application installable et utilisable hors ligne.
//
// Stratégie volontairement simple, adaptée à une application de gestion :
//   - navigation (pages) : réseau d'abord, cache en secours. L'application
//     montre des données vivantes ; on ne veut pas servir une page périmée.
//   - fichiers statiques (JS, CSS, images) : cache d'abord, car ils sont
//     versionnés par leur nom et ne changent qu'au déploiement.
//
// Les données métier ne sont PAS mises en cache : ce sont des montants, et
// une quittance affichée hors ligne doit venir du store local, pas d'une copie
// figée dans le cache HTTP.

const VERSION = "cag-v2";
const CACHE_STATIQUE = `${VERSION}-statique`;

const ASSETS = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/logo-cag.png",
  "/favicon-32.png",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_STATIQUE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cles) =>
        Promise.all(cles.filter((c) => !c.startsWith(VERSION)).map((c) => caches.delete(c)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const requete = event.request;

  // Seules les requêtes GET sont mises en cache.
  if (requete.method !== "GET") return;

  const url = new URL(requete.url);
  if (url.origin !== self.location.origin) return;

  // Navigation : réseau d'abord, page en cache si le réseau échoue.
  if (requete.mode === "navigate") {
    event.respondWith(
      fetch(requete)
        .then((reponse) => {
          const copie = reponse.clone();
          caches.open(CACHE_STATIQUE).then((cache) => cache.put("/index.html", copie));
          return reponse;
        })
        .catch(() => caches.match("/index.html"))
    );
    return;
  }

  // Statique : cache d'abord, puis réseau en complément.
  event.respondWith(
    caches.match(requete).then((enCache) => {
      if (enCache) return enCache;
      return fetch(requete).then((reponse) => {
        // Les réponses en erreur ne sont pas mises en cache : inutile de polluer le cache.
        if (reponse.ok && reponse.type === "basic") {
          const copie = reponse.clone();
          caches.open(CACHE_STATIQUE).then((cache) => cache.put(requete, copie));
        }
        return reponse;
      });
    })
  );
});

// Permet a la page de demander une mise a jour immediate.
self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});