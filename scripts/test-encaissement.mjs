// Test fonctionnel de l'encaissement : du remplissage de la modale à la
// quittance enregistrée.
//
// Couvre le chemin le plus risqué — un paiement sur plusieurs mois, qui doit
// porter le même montant sur chacun des mois couverts.
//
// Les données vivent en mémoire : le test ne recharge jamais la page, sinon il
// repartirait du jeu de démonstration.
//
// Usage : node scripts/test-encaissement.mjs

import { lancerChrome, attendre } from "./lib/navigateur.mjs";

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

/** Décale une période « 2026-11 » de n mois : « 2027-01 » pour n = 2. */
function periode(debut, moisEnPlus) {
  const [an, mois] = debut.split("-").map(Number);
  const total = (mois - 1) + moisEnPlus;
  return `${an + Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/** Le mois en cours, au format « 2026-10 ». */
function periodeCourante() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const { cdp, fermer } = await lancerChrome({ port: 9225 });
try {
  await cdp.connecter();
  await cdp.ouvrir("/paiements");
  const avant = await cdp.evaluer(`document.querySelectorAll("table tbody tr").length`);
  console.log(`\nQuittances avant : ${avant}`);

  console.log("\nOuverture de la modale");
  verifier("modale ouverte", (await cdp.cliquer("encaisser un loyer")).startsWith("ok"));
  await attendre(1200);
  verifier(
    "titre présent",
    await cdp.evaluer(`(document.querySelector(".modal h3")?.innerText || "").includes("Encaisser un paiement")`)
  );

  // Choix du locataire : les sept lignes se remplissent depuis le bail.
  const locataire = await cdp.choisir(".modal select", 1);
  verifier("locataire proposé", Boolean(locataire) && !locataire.includes("introuvable"), locataire);
  await attendre(900);

  const lignes = await cdp.evaluer(`document.querySelectorAll(".modal .cag-ligne").length`);
  verifier("sept lignes de détail", lignes === 7, `${lignes} lignes`);

  const loyer = await cdp.evaluer(`
    (function () {
      const el = document.querySelector('.modal .cag-ligne input[aria-label="Loyer"]');
      return el ? Number(el.value) : null;
    })();`);
  verifier("loyer pré-rempli depuis le bail", Number(loyer) > 0, `${loyer} FCFA`);

  const totalMois = await cdp.evaluer(`document.querySelector(".modal .cag-total strong")?.innerText || ""`);
  console.log(`  total d'un mois : ${totalMois}`);
  const montantMois = Number(totalMois.replace(/[^\d]/g, ""));

  // La période proposée doitLogiquement recevoir le loyer entier : c'est
  // toute l'utilité du calcul, sinon le clic est refusé.
  const resteAffiche = await cdp.evaluer(`
    (function () {
      const el = document.querySelector(".modal .cag-reste");
      if (!el) return 0;
      return Number(el.innerText.replace(/[^\\d]/g, ""));
    })();`);
  verifier(
    "la période proposée peut recevoir le loyer",
    resteAffiche >= montantMois,
    `reste ${resteAffiche} pour un loyer de ${montantMois}`
  );

  verifier(
    "aucun avertissement de dépassement",
    !(await cdp.evaluer(`!!document.querySelector(".modal .cag-refus")`))
  );

  // Encaissement sur la période proposée, telle quelle : c'est le parcours du
  // propriétaire, un clic.
  const avant1 = await cdp.evaluer(`document.querySelectorAll("table tbody tr").length`);
  const clic = await cdp.evaluer(`
    (function () {
      const el = [...document.querySelectorAll(".modal button")]
        .find((e) => (e.innerText || "").toLowerCase().includes("encaisser"));
      if (!el) return "bouton introuvable";
      el.click();
      return "ok : " + el.innerText.trim().slice(0, 40);
    })();`);
  verifier("bouton d'encaissement", clic.startsWith("ok"), clic);
  await attendre(2000);

  const message = await cdp.evaluer(`
    (document.querySelector(".toast")?.innerText || "").replace(/\\s+/g, " ").trim()`);
  verifier("confirmation affichée", /encaissé/i.test(message), message);
  verifier("modale refermée", await cdp.evaluer(`!document.querySelector(".modal")`));

  const apres1 = await cdp.evaluer(`document.querySelectorAll("table tbody tr").length`);
  verifier("une quittance ajoutée", apres1 === avant1 + 1, `${avant1} → ${apres1}`);

  /* ---- Second passage : trois mois d'avance ---- */
  console.log("\nPaiement sur trois mois");
  await cdp.cliquer("encaisser un loyer");
  await attendre(1200);
  await cdp.choisir(".modal select", 1);
  await attendre(900);

  // Trois mois à venir : aucun loyer n'y est encore imputé, le versement doit
  // aboutir même si le mois courant est partiellement payé.
  const premier = periode(periodeCourante(), 1);
  const fin = periode(premier, 2);
  await cdp.evaluer(`
    (function () {
      const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      const champs = document.querySelectorAll('.modal input[type="month"]');
      set.call(champs[0], ${JSON.stringify(premier)});
      champs[0].dispatchEvent(new Event("input", { bubbles: true }));
      set.call(champs[1], ${JSON.stringify(fin)});
      champs[1].dispatchEvent(new Event("input", { bubbles: true }));
      return champs[0].value + " -> " + champs[1].value;
    })();`);
  await attendre(900);

  const bandeau = await cdp.evaluer(`
    document.querySelector(".modal .cag-total-periode")?.innerText?.replace(/\\s+/g, " ") || ""`);
  const attendu = new Intl.NumberFormat("fr-FR")
    .format(montantMois * 3)
    .replace(/[\u202F\u00A0]/g, " ");
  verifier("total de la période", bandeau.includes("3 mois") && bandeau.includes(attendu), bandeau);

  const avant2 = await cdp.evaluer(`document.querySelectorAll("table tbody tr").length`);
  await cdp.evaluer(`
    (function () {
      const el = [...document.querySelectorAll(".modal button")]
        .find((e) => (e.innerText || "").toLowerCase().includes("encaisser"));
      el.click();
      return "ok";
    })();`);
  await attendre(2000);

  const message2 = await cdp.evaluer(`
    (document.querySelector(".toast")?.innerText || "").replace(/\\s+/g, " ").trim()`);
  verifier("avance de trois mois encaissée", /encaissé/i.test(message2), message2);

  const apres2 = await cdp.evaluer(`document.querySelectorAll("table tbody tr").length`);
  verifier("seconde quittance ajoutée", apres2 === avant2 + 1, `${avant2} → ${apres2}`);

  // La liste n'est pas triée par date : on cherche la ligne, pas la première.
  const trouvee = await cdp.evaluer(`
    (function () {
      const lignes = [...document.querySelectorAll("table tbody tr")]
        .map((tr) => tr.innerText.replace(/\\s+/g, " ").trim());
      const cible = lignes.find((l) => l.includes(${JSON.stringify(attendu)}));
      return JSON.stringify({ trouve: Boolean(cible), ligne: (cible || lignes[0] || "").slice(0, 110) });
    })();`);
  const res = JSON.parse(trouvee);
  verifier("montant exact présent dans la liste", res.trouve, res.ligne);

  console.log(`\n${ok} vérification(s) réussie(s), ${ko} échec(s)`);
  process.exitCode = ko === 0 ? 0 : 1;
} finally {
  fermer();
}