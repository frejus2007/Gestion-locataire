// État du rechargement dans le navigateur : service worker, cache, connexion
// au serveur de développement.
//
// Un « il faut actualiser » vient presque toujours d'un de ces quatre Points.
// Ce script les regarde un par un.
//
// Usage : node scripts/diag-actualisation.mjs

import { lancerChrome, attendre } from "./lib/navigateur.mjs";

const { cdp, fermer } = await lancerChrome({ port: 9240, silencieux: true });
try {
  await cdp.ouvrir("/login", 4000);

  const sw = await cdp.evaluer(`
    (async function () {
      if (!("serviceWorker" in navigator)) return "service worker non supporté";
      const regs = await navigator.serviceWorker.getRegistrations();
      return JSON.stringify({
        controller: navigator.serviceWorker.controller
          ? navigator.serviceWorker.controller.scriptURL
          : null,
        enregistrements: regs.map((r) => r.scope),
      });
    })();
  `);
  console.log("service worker :", sw);

  const cache = await cdp.evaluer(`
    (async function () {
      if (typeof caches === "undefined") return "aucun cache";
      const noms = await caches.keys();
      const detail = [];
      for (const nom of noms) {
        const c = await caches.open(nom);
        detail.push(nom + " (" + (await c.keys()).length + " entrées)");
      }
      return JSON.stringify(detail);
    })();
  `);
  console.log("caches :", cache);

  // La connexion au serveur de développement : sans elle, aucun rechargement à
  // chaud ne peut se produire.
  const hmr = await cdp.evaluer(`
    (function () {
      const metas = [...document.querySelectorAll('meta')].map((m) => m.getAttribute("name") || m.getAttribute("property"));
      return JSON.stringify({
        scriptsVite: [...document.querySelectorAll("script")]
          .some((s) => (s.src || "").includes("@vite/client")),
        websockets: Boolean(window.__vite_ws || window.__HMR__),
        metas,
      });
    })();
  `);
  console.log("hote de developpement :", hmr);

  // La version réellement servie du fichier que l'on édite.
  const version = await cdp.evaluer(`
    (async function () {
      const reponse = await fetch("/src/pages/paiements/Encaissement.jsx", { cache: "no-store" });
      const texte = await reponse.text();
      return JSON.stringify({
        statut: reponse.status,
        enteteCache: reponse.headers.get("cache-control"),
        taille: texte.length,
      });
    })();
  `);
  console.log("fichier servi :", version);
} finally {
  fermer();
}