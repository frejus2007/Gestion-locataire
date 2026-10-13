// Vérifie l'affichage des deux formulaires sans rien écrire dans Firebase.
//
// Ouvrir la modale d'encaissement et cocher des mois ne crée aucun document :
// seules l'écriture d'un paiement le fera. On s'arrête donc avant le clic
// « Encaisser », et on vérifie que la sélection se comporte.
//
// Usage : node scripts/captures-modales.mjs

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { lancerChrome, attendre } from "./lib/navigateur.mjs";

const THEME = process.argv[2] === "sombre" ? "sombre" : "clair";
const SORTIE = path.join(os.tmpdir(), "cag-modales");

const { cdp, fermer } = await lancerChrome({ port: 9223 });
try {
  fs.mkdirSync(SORTIE, { recursive: true });
  await cdp.connecter(THEME);

  /* ---- Connexion par le vrai formulaire ---- */
  // L'authentification passe par Firebase : une session posée dans le
  // localStorage ne suffit plus. On passe donc par le formulaire, comme le
  // ferait le propriétaire. Se connecter est une lecture.
  const EMAIL = process.env.CAG_EMAIL;
  const MOT_DE_PASSE = process.env.CAG_MOT_DE_PASSE;
  if (!EMAIL || !MOT_DE_PASSE) {
    console.log(
      "Identifiants absents : renseigne CAG_EMAIL et CAG_MOT_DE_PASSE pour\n" +
        "vérifier l'affichage, ou ouvre l'application et regarde toi-même."
    );
    process.exit(0);
  }
  await cdp.ouvrir("/login", 3500);
  await cdp.saisir("input[type=email]", EMAIL);
  await cdp.saisir("input[type=password]", MOT_DE_PASSE);
  await cdp.cliquer("se connecter");
  await attendre(5000);
  const urlApres = await cdp.evaluer("location.pathname");
  console.log("connexion :", urlApres === "/login" ? "REFUSÉE" : `ok (${urlApres})`);

  /* ---- Encaissement : sélection multiple de mois ---- */
  await cdp.ouvrir("/paiements");
  console.log("ouverture :", await cdp.cliquer("encaisser un loyer"));
  await attendre(1200);
  console.log("locataire :", await cdp.choisir(".modal select", 1));
  await attendre(1000);

  const etatInitial = await cdp.evaluer(`
    (function () {
      const cases = [...document.querySelectorAll(".cag-mois-case")];
      return JSON.stringify({
        nbMois: cases.length,
        coches: cases.filter((c) => c.querySelector("input")?.checked).length,
        soldes: cases.filter((c) => c.className.includes("soldé")).length,
        loyer: document.querySelector('.cag-ligne input[aria-label="Loyer"]')?.value,
        total: document.querySelector(".cag-total strong")?.innerText,
        reste: document.querySelector(".cag-reste")?.innerText?.replace(/\\s+/g, " "),
      });
    })();`);
  console.log("état initial :", etatInitial);

  // Cocher trois mois d'affilée : le geste du trimestriel.
  const apresCoche = await cdp.evaluer(`
    (function () {
      const cases = [...document.querySelectorAll(".cag-mois-case")]
        .filter((c) => !c.className.includes("soldé"));
      cases.slice(0, 3).forEach((c) => c.querySelector("input")?.click());
      return cases.slice(0, 3).length;
    })();`);
  console.log("mois cliquables :", apresCoche);
  await attendre(900);

  console.log("après sélection :", await cdp.evaluer(`
    (function () {
      const cases = [...document.querySelectorAll(".cag-mois-case")];
      return JSON.stringify({
        coches: cases.filter((c) => c.querySelector("input")?.checked).length,
        total: document.querySelector(".cag-total strong")?.innerText,
        reste: document.querySelector(".cag-reste")?.innerText?.replace(/\\s+/g, " "),
        refus: document.querySelector(".cag-refus")?.innerText?.replace(/\\s+/g, " ") || null,
      });
    })();`));

  await cdp.shot(path.join(SORTIE, `encaissement-${THEME}.png`));
  await cdp.evaluer(`
    (function () {
      const corps = document.querySelector(".modal-corps");
      if (corps) corps.scrollTop = corps.scrollHeight;
      return true;
    })();`);
  await attendre(600);
  await cdp.shot(path.join(SORTIE, `encaissement-${THEME}-bas.png`));

  /* ---- Relevé : ligne cliquable ---- */
  await cdp.evaluer(`
    (function () {
      const el = [...document.querySelectorAll(".modal button")]
        .find((e) => (e.innerText || "").toLowerCase().includes("annuler"));
      if (el) el.click();
      return true;
    })();`);
  await attendre(600);
  await cdp.ouvrir("/locataires");
  await cdp.cliquer("compte");
  await attendre(3000);
  console.log("lignes cliquables du relevé :", await cdp.evaluer(`
    document.querySelectorAll(".cag-releve tbody tr.cag-ligne-cliquable").length`));
  await cdp.shot(path.join(SORTIE, `releve-${THEME}.png`));

  console.log(`\nCaptures dans ${SORTIE}`);
} finally {
  fermer();
}