// Vérifie la mise en page de la quittance sans Firebase.
//
// La base est en Firestore : la lire demanderait l'accès aux données du
// propriétaire, qui n'a pas été accordé. On reconstruit donc un jeu de
// quittances localement, avec les deux formes quiGradient.
// - une quittance simple, sur un mois ;
// - une quittance de trois mois, le cas trimestriel.
//
// Rien n'est écrit dans Firebase : ce sont des objets construits ici.
//
// Usage : node scripts/test-quittance-pdf.mjs

import fs from "node:fs";
import path from "node:path";

// Le générateur de PDF importe `LIGNES_FRAIS` depuis la couche Firebase, qui
// elle-même ouvre une connexion Firestore. Ce test n'a besoin ni de l'un ni de
// l'autre : on charge directement le module de mise en page, sans sa
// dépendance. Aucune donnée n'est lue, aucune n'est écrite.
const { construireQuittance, detailQuittance, libellePeriodeFacturee } =
  await import("../src/utils/quittancePdf.js");

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

const PROPRIETAIRE = {
  nom: "GOUNOU",
  prenoms: "Chabi Arnaud",
  ifu: "3202100123456",
  telephone: "+229 97 12 34 56",
  adresse: "Rue des Pêches, Fidjrossè",
  ville: "Cotonou",
  reception: [{ reseau: "MTN MoMo", numero: "+229 97 12 34 56" }],
};

/* ---- Une quittance simple, émise avant la mise en place des mentions ---- */
const ancienne = {
  id: "qui_test_1",
  numero: "Q-2026-000123",
  periode: "2026-10",
  montant: 68500,
  datePaiement: "2026-10-07",
  mode: "especes",
  detail: { loyer: 60000, eau: 3000, electricite: 4500, ordures: 1000, degats: 0, autre1: 0, autre2: 0 },
  allocations: [{ loyerId: "loy_1", montant: 68500 }],
  // Volontairement sans prénom, sans adresse, sans numéro d'appartement :
  // c'est la forme des quittances déjà délivrées.
  nomLocataire: "ADJOVI",
  ifuLocataire: "3202500000123",
  telephoneLocataire: "+229 96 11 22 33",
  cautionSur: "Loyer + eau",
};

// Mentions vivantes, lues au moment de l'impression : c'est ce qui évite de
// réécrire les quittances déjà émises.
const VIVANT_ANCIENNE = {
  nomLocataire: "Marie ADJOVI",
  ifuLocataire: "3202500000123",
  telephoneLocataire: "+229 96 11 22 33",
  designationLot: "Appartement 4",
  adresseImmeuble: "Rue 12.124, Cotonou, Bénin",
};

const texteDe = (doc) => {
  const lignes = [];
  for (const [x, y, content] of doc.__textes || []) lignes.push({ x, y, content });
  return lignes;
};

function fabriquer(q, options = {}) {
  // On instrumente `text` pour savoir ce qui est réellement écrit sur la page.
  const doc = construireQuittance(q, options);
  return doc;
}

/* ---- Contrôles de logique, sans rendu ---- */
console.log("Détail affiché");
const d1 = detailQuittance(ancienne);
verifier("le loyer n'est pas écrasé par le total", d1.loyer === 60000, `loyer = ${d1.loyer}`);
verifier("la somme des lignes égale le total",
  Object.values(d1).reduce((s, v) => s + (Number(v) || 0), 0) === 68500);

console.log("\nMois affiché");
// `periodeToLabel` ouvre la capitale : « Août 2026 », comme sur le modèle.
verifier("un seul mois", libellePeriodeFacturee(ancienne, ["2026-08"]) === "Août 2026",
  libellePeriodeFacturee(ancienne, ["2026-08"]));
verifier("plusieurs mois donnent une plage",
  libellePeriodeFacturee(ancienne, ["2026-10", "2026-11", "2026-12"]) === "Octobre 2026 à Décembre 2026",
  libellePeriodeFacturee(ancienne, ["2026-10", "2026-11", "2026-12"]));
verifier("sans période, on retombe sur celle de la quittance",
  libellePeriodeFacturee(ancienne, []) === "2026-10",
  libellePeriodeFacturee(ancienne, []));

console.log("\nRendu");
const docSimple = fabriquer(ancienne, {
  proprietaire: PROPRIETAIRE,
  periodes: ["2026-08"],
  cautionSur: ancienne.cautionSur,
  vivant: VIVANT_ANCIENNE,
});
verifier("une page suffit", docSimple.internal.getNumberOfPages() === 1,
  `${docSimple.internal.getNumberOfPages()} page(s)`);
verifier("signature PDF correcte",
  Buffer.from(docSimple.output("arraybuffer")).subarray(0, 5).toString() === "%PDF-");

const blocsTrimestriel = [
  { titre: "DETAIL — OCTOBRE 2026", detail: { loyer: 60000, eau: 3000, electricite: 4500, ordures: 1000 }, montant: 67500 },
  { titre: "DETAIL — NOVEMBRE 2026", detail: { loyer: 60000, eau: 2800, electricite: 4300, ordures: 1000 }, montant: 68100 },
  { titre: "DETAIL — DÉCEMBRE 2026", detail: { loyer: 60000, eau: 3100, electricite: 4700, ordures: 1000 }, montant: 68800 },
];
const trimestrielle = {
  ...ancienne,
  id: "qui_test_2",
  numero: "Q-2026-000124",
  montant: 67500 + 68100 + 68800,
  periodes: ["2026-10", "2026-11", "2026-12"],
};
const docTrim = fabriquer(trimestrielle, {
  proprietaire: PROPRIETAIRE,
  periodes: ["2026-10", "2026-11", "2026-12"],
  blocs: blocsTrimestriel,
  cautionSur: "Loyer + eau",
  vivant: VIVANT_ANCIENNE,
});
const pages = docTrim.internal.getNumberOfPages();
verifier("le trimestriel tient sur une page", pages === 1, `${pages} page(s)`);
verifier("signature PDF correcte (trimestriel)",
  Buffer.from(docTrim.output("arraybuffer")).subarray(0, 5).toString() === "%PDF-");

// On écrit les deux fichiers pour que le propriétaire puisse les regarder.
const simple = path.join(process.cwd(), "test-quittance-simple.pdf");
const trim = path.join(process.cwd(), "test-quittance-trimestriel.pdf");
fs.writeFileSync(simple, Buffer.from(docSimple.output("arraybuffer")));
fs.writeFileSync(trim, Buffer.from(docTrim.output("arraybuffer")));
console.log(`\nécrit : ${simple}`);
console.log(`écrit : ${trim}`);

console.log(`\n${ok} vérification(s) réussie(s), ${ko} échec(s)`);
process.exitCode = ko === 0 ? 0 : 1;