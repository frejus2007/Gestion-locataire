// Ouvre l'application et ouvre la modale d'encaissement, sans jamais cliquer
// sur « Encaisser » : ouvrir une modale et cocher des mois n'écrit rien dans
// Firebase. Le but est de vérifier que la page ne se vide pas — un écran
// blanc vient d'une exception JavaScript au rendu, invisible côté serveur.
//
// Nécessite CAG_EMAIL et CAG_MOT_DE_PASSE : l'authentification passe par
// Firebase, on ne peut pas se connecter autrement.
//
// Usage : node scripts/test-modale-encaissement.mjs

import { lancerChrome, attendre } from "./lib/navigateur.mjs";

const EMAIL = process.env.CAG_EMAIL;
const MOT_DE_PASSE = process.env.CAG_MOT_DE_PASSE;

let ok = 0;
let ko = 0;
function verifier(intitule, condition, detail = "") {
  if (condition) {
    ok++;
    console.log(`  OK    ${intitule}${detail ? " — " + detail : ""}`);
  } else {
    ko++;
    console.log(`  ECHEC ${intitule}${detail ? " — " + detail : ""}`);
  }
}

if (!EMAIL || !MOT_DE_PASSE) {
  console.log(
    "Identifiants absents : renseigne CAG_EMAIL et CAG_MOT_DE_PASSE pour\n" +
      "lancer ce test, ou regarde l'application toi-même."
  );
  process.exit(0);
}

const { cdp, fermer } = await lancerChrome({ port: 9231 });
try {
  await cdp.ouvrir("/login", 3500);
  await cdp.saisir("input[type=text]", EMAIL);
  await cdp.saisir("input[type=password]", MOT_DE_PASSE);
  await cdp.cliquer("se connecter");
  await attendre(5000);

  verifier("connexion réussie", (await cdp.evaluer("location.pathname")) !== "/login",
    await cdp.evaluer("location.pathname"));

  await cdp.ouvrir("/paiements");
  await attendre(1500);

  const bouton = await cdp.cliquer("encaisser un loyer");
  verifier("modale demandée", bouton.startsWith("ok"), bouton);
  await attendre(1500);

  // Un écran blanc ne laisse qu'un document presque vide : on le vérifie.
  const etat = await cdp.evaluer(`
    (function () {
      const m = document.querySelector(".modal");
      return JSON.stringify({
        modale: !!m,
        titre: document.querySelector(".modal h3")?.innerText || null,
        mois: document.querySelectorAll(".cag-mois-case").length,
        lignes: document.querySelectorAll(".cag-ligne").length,
        texte: document.body.innerText.length,
      });
    })();`);
  const s = JSON.parse(etat);
  verifier("la modale s'affiche", s.modale, s.titre || "page vide");
  verifier("les sept lignes sont là", s.lignes === 7, `${s.lignes} lignes`);
  verifier("les mois sont listés", s.mois > 0, `${s.mois} mois`);

  // Cocher trois mois : le geste du trimestriel, et le point exact qui plantait.
  await cdp.evaluer(`
    (function () {
      const cases = [...document.querySelectorAll(".cag-mois-case")]
        .filter((c) => !c.className.includes("soldé"));
      cases.slice(0, 3).forEach((c) => c.querySelector("input")?.click());
      return cases.slice(0, 3).length;
    })();`);
  await attendre(1000);

  const apres = await cdp.evaluer(`
    (function () {
      return JSON.stringify({
        modale: !!document.querySelector(".modal"),
        coches: [...document.querySelectorAll(".cag-mois-case input")]
          .filter((i) => i.checked).length,
        total: document.querySelector(".cag-total strong")?.innerText || null,
      });
    })();`);
  const a = JSON.parse(apres);
  verifier("trois mois cochés", a.coches === 3, `${a.coches} cochés`);
  verifier("la page ne se vide pas", a.modale);
  verifier("le total est calculé", Boolean(a.total), a.total || "absent");

  console.log(`\n${ok} vérification(s) réussie(s), ${ko} échec(s)`);
  process.exitCode = ko === 0 ? 0 : 1;
} finally {
  fermer();
}