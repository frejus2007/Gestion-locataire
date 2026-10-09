// Captures de la page de connexion sur les deux formes : téléphone et
// ordinateur. L'écran de connexion est la première chose vue sur mobile,
// une version cassée s'y voit tout de suite.
//
// Usage : node scripts/captures-login.mjs

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { lancerChrome } from "./lib/navigateur.mjs";

const SORTIE = path.join(os.tmpdir(), "cag-login");

const FORMES = [
  ["mobile", 390, 844],
  ["pc", 1440, 900],
];

for (const [nom, largeur, hauteur] of FORMES) {
  const { cdp, fermer } = await lancerChrome({ port: 9228, largeur, hauteur, silencieux: true });
  try {
    fs.mkdirSync(SORTIE, { recursive: true });
    await cdp.ouvrir("/login", 3200);
    await cdp.shot(path.join(SORTIE, `login-${nom}.png`));
    // Ce qui compte : le formulaire doit rester visible et tappable.
    const etat = await cdp.evaluer(`
      (function () {
        const carte = document.querySelector(".login-card-cag");
        const bouton = document.querySelector(".login-bouton");
        const r = carte ? carte.getBoundingClientRect() : null;
        const b = bouton ? bouton.getBoundingClientRect() : null;
        return JSON.stringify({
          carte: r ? { haut: Math.round(r.top), largeur: Math.round(r.width) } : null,
          boutonVisible: b ? b.top < window.innerHeight && b.bottom > 0 : false,
          defilement: document.documentElement.scrollHeight > window.innerHeight,
        });
      })();`);
    console.log(`  ${nom} (${largeur}×${hauteur}) : ${etat}`);
  } finally {
    fermer();
  }
}
console.log(`\nCaptures dans ${SORTIE}`);