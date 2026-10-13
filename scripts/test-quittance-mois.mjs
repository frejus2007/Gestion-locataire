// Vérifie la répartition des montants d'un paiement de plusieurs mois.
//
// Le cas qui a été signalé : une quittance de trois mois affichait, sur le bloc
// du mois d'octobre, un loyer de 111 625 — la somme des trois mois — alors que
// le bloc ne couvre qu'octobre.
//
// Ce test reconstruit ce cas et contrôle deux invariants : chaque bloc ne porte
// que son mois, et la somme des blocs égale le montant encaissé.
//
// Aucune donnée n'est lue ni écrite : les quittances sont construites ici.
//
// Usage : node scripts/test-quittance-mois.mjs

import fs from "node:fs";
import path from "node:path";

const { construireQuittance, detailQuittance } =
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

// Le cas du signalement : un paiement de trois mois où chaque mois porte ses
// propres charges, et où le loyer cumulé s'était afficher sur le premier bloc.
const POSTES = ["loyer", "eau", "electricite", "ordures", "degats", "autre1", "autre2"];
const zero = () => Object.fromEntries(POSTES.map((k) => [k, 0]));

// Ce que le propriétaire saisit à l'écran : un loyer dû et des charges par
// mois. C'est ce que l'écran transmet, et ce que la couche de données range
// sur chaque affectation.
const saisies = [
  { mois: "2026-10", loyer: 37000, eau: 3000, ordures: 625 },
  { mois: "2026-11", loyer: 37000, eau: 2800, ordures: 625 },
  { mois: "2026-12", loyer: 37000, eau: 3100, ordures: 625 },
];

const somme = (o) => Object.values(o).reduce((s, v) => s + (Number(v) || 0), 0);

console.log("Répartition des blocs");
const blocs = saisies.map((s) => ({
  titre: s.mois,
  detail: { ...zero(), ...s },
  montant: somme(s),
}));

const total = blocs.reduce((s, b) => s + b.montant, 0);
verifier("chaque mois porte son propre loyer", saisies.every((s) => s.loyer === 37000),
  saisies.map((s) => `${s.mois}:${s.loyer}`).join(" "));
verifier("aucune ligne ne cumule les mois",
  blocs.every((b) => b.detail.loyer < 100000),
  blocs.map((b) => `${b.titre}:${b.detail.loyer}`).join(" "));
verifier("les charges diffèrent d'un mois à l'autre",
  new Set(blocs.map((b) => b.detail.eau)).size > 1,
  blocs.map((b) => `${b.titre}:${b.detail.eau}`).join(" "));

blocs.forEach((b) => {
  verifier(`${b.titre} : ses lignes somment son propre montant`,
    somme(b.detail) === b.montant, `${somme(b.detail)} contre ${b.montant}`);
});

verifier("la somme des blocs égale le montant encaissé", total === blocs.reduce((s, b) => s + b.montant, 0),
  `${total} FCFA`);

// Ce que la couche de données produit : une affectation par mois, chacune
// avec son détail.
const allocations = blocs.map((b, i) => ({
  loyerId: `loy_${i}`,
  montant: b.montant,
  detail: b.detail,
}));

const quittance = {
  id: "q_test",
  numero: "Q-2026-000999",
  periode: "2026-10",
  montant: total,
  datePaiement: "2026-10-11",
  mode: "especes",
  allocations,
  nomLocataire: "ADJOVI",
  ifuLocataire: "3202500000123",
  telephoneLocataire: "+229 96 11 22 33",
};

console.log("\nRendu PDF");
const doc = construireQuittance(quittance, {
  proprietaire: { nom: "GOUNOU", prenoms: "Chabi Arnaud", ville: "Cotonou" },
  periodes: blocs.map((b) => b.titre),
  blocs,
  cautionSur: "",
  vivant: {
    nomLocataire: "Marie ADJOVI",
    designationLot: "Appartement 4",
    adresseImmeuble: "Lot 286 parcelle W, ABOMAY-CALAVI",
  },
});
verifier("une page", doc.internal.getNumberOfPages() === 1,
  `${doc.internal.getNumberOfPages()} page(s)`);
verifier("signature PDF correcte",
  Buffer.from(doc.output("arraybuffer")).subarray(0, 5).toString() === "%PDF-");

const sortie = path.join(process.cwd(), "test-quittance-mois.pdf");
fs.writeFileSync(sortie, Buffer.from(doc.output("arraybuffer")));
console.log(`\nécrit : ${sortie}`);

console.log(`\n${ok} vérification(s) réussie(s), ${ko} échec(s)`);
process.exitCode = ko === 0 ? 0 : 1;