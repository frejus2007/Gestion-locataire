// Reproduction du parcours d'encaissement « tel quel » : ouverture de
// la modale, choix du premier locataire, période par défaut, clic sur
// le bouton. Sert à voir exactement ce que voit le propriétaire.
//
// Usage : node scripts/repro-encaissement.mjs

import { lancerChrome, attendre } from "./lib/navigateur.mjs";

const { cdp, fermer } = await lancerChrome({ port: 9227 });
try {
  await cdp.connecter();
  await cdp.ouvrir("/paiements");

  console.log(await cdp.cliquer("encaisser un loyer"));
  await attendre(1200);

  console.log("locataire :", await cdp.choisir(".modal select", 1));
  await attendre(900);

  console.log("état initial :", await cdp.evaluer(`
    (function () {
      const champs = [...document.querySelectorAll('.modal input[type="month"]')];
      const total = document.querySelector(".modal .cag-total strong")?.innerText || "";
      const lignes = [...document.querySelectorAll(".modal .cag-ligne")]
        .map((l) => {
          const label = l.querySelector(".cag-ligne-label")?.innerText.trim();
          const valeur = l.querySelector("input")?.value;
          return label + "=" + valeur;
        });
      return JSON.stringify({
        periode: champs.map((c) => c.value),
        total,
        lignes,
      }, null, 1);
    })();`));

  // Clic sur le bouton, sans toucher à la période : c'est le parcours
  // le plus courant.
  await cdp.evaluer(`
    (function () {
      const el = [...document.querySelectorAll(".modal button")]
        .find((e) => (e.innerText || "").toLowerCase().includes("encaisser"));
      el.click();
      return "cliqué";
    })();`);
  await attendre(2000);

  console.log("après clic :", await cdp.evaluer(`
    (function () {
      const toast = document.querySelector(".toast");
      return JSON.stringify({
        toast: toast ? toast.innerText.replace(/\\s+/g, " ").trim() : null,
        modale: !!document.querySelector(".modal"),
        quittances: document.querySelectorAll("table tbody tr").length,
      });
    })();`));
} finally {
  fermer();
}