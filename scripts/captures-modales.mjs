// Captures des deux modales de saisie : encaissement et enregistrement d'un
// locataire. La session est posée dans le localStorage, puis chaque modale est
// ouverte en cliquant sur le bouton qui l'ouvre.
//
// Usage : node scripts/captures-modales.mjs [clair|sombre]

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

  // Les formulaires sont plus hauts que l'écran : sans ce second cliché, le
  // pied — bouton d'enregistrement — resterait hors du champ.
  const shotBas = async (nom) => {
    const info = await cdp.evaluer(`
      (function () {
        const corps = document.querySelector(".modal-corps");
        if (!corps) return "pas de corps défilable";
        corps.scrollTop = corps.scrollHeight;
        return "défilé de " + corps.scrollHeight + " sur " + corps.clientHeight;
      })();`);
    console.log(`  ${info}`);
    await attendre(700);
    await cdp.shot(path.join(SORTIE, `${nom}.png`));
  };

  console.log("\nEncaissement");
  await cdp.ouvrir("/paiements");
  console.log(`  ${await cdp.cliquer("encaisser un loyer")}`);
  await attendre(1200);
  // Un locataire est choisi pour que les lignes soient remplies.
  console.log(`  locataire : ${await cdp.choisir(".modal select", 1)}`);
  await attendre(900);
  await cdp.shot(path.join(SORTIE, `encaissement-${THEME}.png`));
  await shotBas(`encaissement-${THEME}-bas`);

  console.log("\nEnregistrement d'un locataire");
  await cdp.evaluer(`
    (function () {
      const el = [...document.querySelectorAll(".modal button")]
        .find((e) => (e.innerText || "").toLowerCase().includes("annuler"));
      if (el) el.click();
      return true;
    })();`);
  await attendre(600);
  await cdp.ouvrir("/locataires");
  console.log(`  ${await cdp.cliquer("nouveau locataire")}`);
  await attendre(1200);
  await cdp.shot(path.join(SORTIE, `locataire-${THEME}.png`));
  await shotBas(`locataire-${THEME}-bas`);

  console.log(`\nCaptures dans ${SORTIE}`);
} finally {
  fermer();
}