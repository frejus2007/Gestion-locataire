// Vérifie que le filet d'erreur attrape une exception de rendu.
//
// On provoque une panne volontaire dans un écran, puis on contrôle que la page
// n'est plus blanche : le message doit apparaître, avec le détail de l'erreur
// et les deux sorties.
//
// Usage : node scripts/test-filet-erreur.mjs

import fs from "node:fs";
import { lancerChrome, attendre } from "./lib/navigateur.mjs";

const CIBLE = "src/pages/Login.jsx";
const original = fs.readFileSync(CIBLE, "utf8");

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

const { cdp, fermer } = await lancerChrome({ port: 9242, silencieux: true });
try {
  await cdp.ouvrir("/login", 4000);
  const depart = await cdp.evaluer(`document.querySelector(".login-card-cag") ? "formulaire" : "absent"`);
  verifier("l'écran de connexion s'affiche d'abord", depart === "formulaire", depart);

  // Panne volontaire : une variable qui n'existe pas.
  const panne = original.replace(
    "export default function Login(",
    "export default function Login() { throw new Error('PANNE VOLONTAIRE'); }\nfunction Inactif("
  );
  if (panne === original) {
    throw new Error("point d'injection introuvable : le test ne prouve rien");
  }
  fs.writeFileSync(CIBLE, panne, "utf8");
  console.log("  (panne injectée, attente du rechargement à chaud)");

  let carte = "";
  for (let essai = 0; essai < 20; essai++) {
    await attendre(500);
    carte = await cdp.evaluer(
      `document.querySelector(".filet-erreur-carte")?.innerText.replace(/\\s+/g, " ") || ""`
    );
    if (carte) break;
  }

  verifier("le filet d'erreur s'affiche", carte.includes("Un écran n'a pas pu s'afficher"),
    carte.slice(0, 80));
  verifier("le message d'erreur est visible", carte.includes("PANNE VOLONTAIRE"));
  verifier("un bouton de rechargement est proposé", carte.includes("Recharger la page"));
  verifier("un retour à l'accueil est proposé", carte.includes("Retour à l'accueil"));
  verifier("la page n'est plus blanche",
    (await cdp.evaluer("document.body.innerText.trim().length")) > 50);
} finally {
  fs.writeFileSync(CIBLE, original, "utf8");
  fermer();
}

console.log(`\n${sortie} vérification(s) réussie(s), ${ko} échec(s)`);
process.exitCode = ko === 0 ? 0 : 1;