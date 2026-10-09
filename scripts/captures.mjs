// Captures d'écran des pages protégées, en se connectant d'abord.
//
// Usage : node scripts/captures.mjs

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { lancerChrome } from "./lib/navigateur.mjs";

const SORTIE = path.join(os.tmpdir(), "cag-captures");

const PAGES = [
  ["tableau-de-bord", "/"],
  ["immeubles", "/immeubles"],
  ["locataires", "/locataires"],
  ["paiements", "/paiements"],
  ["parametres", "/parametres"],
];

const { cdp, fermer } = await lancerChrome({ port: 9222, silencieux: true });
try {
  fs.mkdirSync(SORTIE, { recursive: true });
  await cdp.connecter();

  for (const [nom, chemin] of PAGES) {
    await cdp.ouvrir(chemin);
    await cdp.shot(path.join(SORTIE, `${nom}.png`));
    const texte = await cdp.evaluer("document.body.innerText.slice(0, 160).replace(/\\s+/g, ' ')");
    if (texte && /introuvable|une erreur/i.test(texte)) {
      console.log(`   ATTENTION : ${texte}`);
    }
  }
  console.log(`\n${PAGES.length} capture(s) dans ${SORTIE}`);
} finally {
  fermer();
}