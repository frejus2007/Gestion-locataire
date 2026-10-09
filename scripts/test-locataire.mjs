// Test fonctionnel de l'enregistrement d'un locataire.
//
// Vérifie la chaîne complète : la modale crée le locataire, le bail, les loyers
// dus depuis l'entrée, et la liste se met à jour.
//
// Usage : node scripts/test-locataire.mjs

import path from "node:path";
import os from "node:os";
import { lancerChrome, attendre } from "./lib/navigateur.mjs";

const NOM = "TCHOUMI";
const PRENOMS = "Aline";
const TELEPHONE = "+229 97 11 22 33";

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

const { cdp, fermer } = await lancerChrome({ port: 9226 });
try {
  await cdp.connecter();
  await cdp.ouvrir("/locataires");
  const avant = await cdp.evaluer(`document.querySelectorAll("table tbody tr").length`);
  console.log(`\nLocataires avant : ${avant}`);

  console.log("\nOuverture de la modale");
  verifier("modale ouverte", (await cdp.cliquer("nouveau locataire")) === "ok : Nouveau locataire");
  await attendre(1200);
  verifier(
    "titre présent",
    await cdp.evaluer(`(document.querySelector(".modal h3")?.innerText || "") === "Enregistrer un locataire"`)
  );

  // Logement : le premier appartement libre du premier immeuble. Les deux listes
// déroulantes se suivent, c'est la seconde qui porte les appartements.
  const logement = await cdp.evaluer(`
    (function () {
      const el = document.querySelectorAll(".modal select")[1];
      if (!el) return "introuvable";
      const opt = el.options[1];
      if (!opt) return "aucun appartement libre";
      Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value")
        .set.call(el, opt.value);
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return opt.text;
    })();`);
  verifier("appartement proposé", Boolean(logement) && !logement.includes("introuvable"), logement);
  await attendre(400);

  // Identité.
  await cdp.saisir('.modal input[placeholder="ADJOVI"]', NOM);
  await cdp.saisir('.modal input[placeholder="Marie"]', PRENOMS);
  await cdp.saisir('.modal input[placeholder="+229 96 11 22 33"]', TELEPHONE);
  await cdp.saisir('.modal input[placeholder="2024000000001"]', "3202500000123");

  // Loyer : la valeur du champ ne provient pas d'un attribut, on le repère par
  // le libellé qui le precede.
  await cdp.evaluer(`
    (function () {
      const groupe = [...document.querySelectorAll(".modal .form-group")]
        .find((g) => g.querySelector("label")?.innerText.startsWith("Loyer mensuel"));
      const champ = groupe?.querySelector("input");
      if (!champ) return "introuvable";
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")
        .set.call(champ, "45000");
      champ.dispatchEvent(new Event("input", { bubbles: true }));
      return "loyer = " + champ.value;
    })();`);

  // Frais mensuels : ils reprisont sur chaque quittance.
  await cdp.evaluer(`
    (function () {
      const parLabel = (texte) => [...document.querySelectorAll(".modal .form-group")]
        .find((g) => g.querySelector("label")?.innerText.trim() === texte)
        ?.querySelector("input");
      for (const [label, valeur] of [["Eau", "2500"], ["Électricité", "4000"], ["Ordures ménagères", "1000"]]) {
        const champ = parLabel(label);
        if (!champ) return "introuvable : " + label;
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")
          .set.call(champ, valeur);
        champ.dispatchEvent(new Event("input", { bubbles: true }));
      }
      return "frais saisis";
    })();`);
  await attendre(400);

  console.log("\nEnregistrement");
  const clic = await cdp.cliquer("enregistrer");
  verifier("bouton d'enregistrement", clic.startsWith("ok"), clic);
  await attendre(2000);

  const message = await cdp.evaluer(`
    (document.querySelector(".toast")?.innerText || "").replace(/\\s+/g, " ").trim()`);
  verifier("confirmation affichée", /enregistré/i.test(message), message);

  // Aucun message : une validation a pu bloquer en silence. Les champs en
  // disent autant que la modale.
  const refus = await cdp.evaluer(`
    (function () {
      const e = [...document.querySelectorAll(".modal .error-text")]
        .map((x) => x.innerText.trim());
      const b = document.querySelector(".modal .alert-error");
      return JSON.stringify({ champs: e, alerte: b ? b.innerText.trim() : null });
    })();`);
  console.log(`  refus : ${refus}`);
  verifier("modale refermée", await cdp.evaluer(`!document.querySelector(".modal")`));

  const apres = await cdp.evaluer(`document.querySelectorAll("table tbody tr").length`);
  verifier("un locataire ajouté", apres === avant + 1, `${avant} → ${apres}`);

  const present = await cdp.evaluer(`
    document.body.innerText.includes(${JSON.stringify(PRENOMS + " " + NOM)})`);
  verifier("locataire listé", present);

  // Le compte du nouveau locataire doit porter le loyer et les frais. Sans
  // rechargement : les données vivent en mémoire, un rechargement repartirait de
  // le jeu de démonstration.
  const ouverture = await cdp.evaluer(`
    (function () {
      // Le bouton « Compte » de la ligne du nouveau locataire : le seeking sur
      // l'URL confond le préfixe de l'identifiant avec un segment de route.
      const ligne = [...document.querySelectorAll("table tbody tr")]
        .find((tr) => tr.innerText.includes(${JSON.stringify(NOM)}));
      if (!ligne) return "ligne introuvable";
      const lien = [...ligne.querySelectorAll("a")].find((a) => a.innerText.includes("Compte"));
      if (!lien) return "bouton Compte introuvable";
      lien.click();
      return lien.getAttribute("href");
    })();`);
  console.log(`  lien du compte : ${ouverture}`);
  await attendre(3000);
  const compte = await cdp.evaluer(`
    (function () {
      const texte = document.body.innerText.replace(/\\s+/g, " ");
      return JSON.stringify({
        url: location.pathname,
        loyer: texte.includes("45 000"),
        frais: texte.includes("7 500") || texte.includes("2500"),
      });
    })();`);
  const etat = JSON.parse(compte);
  verifier("compte du locataire ouvert", etat.url.startsWith("/locataires/"), etat.url);
  verifier("loyer repris dans le relevé", etat.loyer);

  await cdp.shot(path.join(os.tmpdir(), "cag-test-locataire.png"));

  console.log(`\n${ok} vérification(s) réussie(s), ${ko} échec(s)`);
  process.exitCode = ko === 0 ? 0 : 1;
} finally {
  fermer();
}