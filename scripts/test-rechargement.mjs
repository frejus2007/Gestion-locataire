// Le rechargement à chaud fonctionne-t-il vraiment ?
//
// Test sans ambiguïté : on ajoute une règle CSS bien visible, puis on regarde
// la page **sans recharger**. Le style est calculé par le navigateur, sa
// présence se mesure donc exactement.
//
// Usage : node scripts/test-rechargement.mjs

import fs from "node:fs";
import { lancerChrome, attendre } from "./lib/navigateur.mjs";

const CSS = "src/index.css";
const original = fs.readFileSync(CSS, "utf8");
const REGLE = "\nbody { outline: 7px solid magenta !important; }\n";

let sortie = 0;
let ko = 0;
function verifier(intitule, condition, detail = "") {
  if (condition) {
    sortie++;
    console.log(`  OK    ${intitule}${detail ? " — " + detail : ""}`);
  } else {
    ko++;
    console.log(`  ECHEC ${intitule}${detail ? " — " + detail : ""}`);
  }
}

const { cdp, fermer } = await lancerChrome({ port: 9241, silencieux: true });
try {
  await cdp.ouvrir("/login", 4000);

  const avant = await cdp.evaluer(`
    getComputedStyle(document.body).outlineWidth`);
  console.log(`  contour avant : ${avant}`);

  // Un compteur de page : s'il repart de zéro, le navigateur a rechargé.
  const marqueur = await cdp.evaluer(`
    (function () {
      if (!window.__cjg_naissance) window.__cjg_naissance = Date.now();
      return Date.now() - window.__cjg_naissance;
    })();`);

  fs.writeFileSync(CSS, original + REGLE, "utf8");
  console.log("  style ajouté, attente du rechargement à chaud");

  let largeur = "";
  for (let essai = 0; essai < 20; essai++) {
    await attendre(500);
    largeur = await cdp.evaluer(`getComputedStyle(document.body).outlineWidth`);
    if (largeur !== avant) break;
  }

  verifier("le style arrive sans rechargement", largeur !== avant,
    `contour passé de ${avant} à ${largeur}`);

  const age = await cdp.evaluer(`
    (function () {
      if (!window.__cjg_naissance) return "la page a été rechargée";
      return Math.round((Date.now() - window.__cjg_naissance) / 1000) + " s";
    })();`);
  verifier("la page n'a pas été rechargée",
    typeof age === "string" && age.endsWith(" s") && parseInt(age) >= 0,
    `âge de la page : ${age}`);
  void marqueur;
} finally {
  fs.writeFileSync(CSS, original, "utf8");
  fermer();
}

console.log(`\n${sortie} vérification(s) réussie(s), ${ko} échec(s)`);
process.exitCode = ko === 0 ? 0 : 1;