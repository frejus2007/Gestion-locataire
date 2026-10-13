// La quittance tient-elle sur UNE seule page, dans les conditions réelles ?
//
// Les contrôles précédents passaient le logo de côté. L'application, elle,
// l'imprime en tête : la marque occupe une centaine de points, ce qui peut
// suffire à faire basculer la signature sur une seconde page.
//
// Ce test reproduit l'appel réel : logo, signature, numéros de réception,
// et les deux formes de détail — sept lignes pour un mois, tableau au-delà.
//
// Usage : node scripts/test-quittance-page.mjs

import fs from "node:fs";
import path from "node:path";

const { construireQuittance } = await import("../src/utils/quittancePdf.js");

const L = 62;
const R = 533;
const POSTES = ["loyer", "eau", "electricite", "ordures", "degats", "autre1", "autre2"];

let sortie = 0;
let ko = 0;
function verifier(intitule, condition, detail = "") {
  if (condition) {
    sortie++;
    console.log(`  OK    ${intitule}${detail ? " — " + detail : ""}`);
  } else {
    ko++;
    console.log(`  ECHEC ${intitule}${detail ? " — " + detail : ""}`);
  }
}

// Le logo, tel que l'application le charge.
const cheminLogo = path.join(process.cwd(), "public", "logo-cag-complet-pdf.png");
const logo = fs.existsSync(cheminLogo)
  ? `data:image/png;base64,${fs.readFileSync(cheminLogo).toString("base64")}`
  : null;
verifier("le logo est disponible pour le test", Boolean(logo), logo ? "chargé" : "absent");

const PROPRIETAIRE = {
  nom: "GOUNOU",
  prenoms: "Chabi Arnaud",
  ifu: "3202100123456",
  telephone: "+229 97 12 34 56",
  adresse: "Rue des Pêches, Fidjrossè",
  ville: "Cotonou",
  reception: [
    { reseau: "MTN MoMo", numero: "+229 97 12 34 56" },
    { reseau: "Moov Money", numero: "+229 96 00 11 22" },
    { reseau: "Celtis", numero: "+229 94 55 66 77" },
  ],
};

/** Une quittance couvrant `nbMois` mois, chaque mois portant ses charges. */
function quittance(nbMois) {
  const allocations = [];
  for (let i = 0; i < nbMois; i++) {
    const detail = Object.fromEntries(
      POSTES.map((k) => [k, k === "loyer" ? 37000 : 1000 + i * 250])
    );
    allocations.push({
      loyerId: `loy_${i}`,
      montant: Object.values(detail).reduce((s, v) => s + v, 0),
      detail,
    });
  }
  return {
    id: "q",
    numero: "Q-2026-000001",
    periode: "2026-01",
    montant: allocations.reduce((s, a) => s + a.montant, 0),
    datePaiement: "2026-10-11",
    mode: "especes",
    cautionSur: "Loyer + eau",
    allocations,
    nomLocataire: "ADJOVI",
    prenomsLocataire: "Marie",
    ifuLocataire: "3202500000123",
    telephoneLocataire: "+229 96 11 22 33",
    designationLot: "Appartement 4",
    adresseImmeuble: "Lot 286 parcelle W, ABOMAY-CALAVI, Bénin",
    nomProprietaire: PROPRIETAIRE.nom,
    prenomsProprietaire: PROPRIETAIRE.prenoms,
    ifuProprietaire: PROPRIETAIRE.ifu,
    telephoneProprietaire: PROPRIETAIRE.telephone,
    adresseProprietaire: PROPRIETAIRE.adresse,
    villeProprietaire: PROPRIETAIRE.ville,
  };
}

console.log("\nUne seule page, dans les conditions de l'application");
for (const nbMois of [1, 2, 3, 4, 6, 12]) {
  const q = quittance(nbMois);
  const blocs = allocations =>
    allocations.map((a, i) => ({
      titre: `DETAIL — ${["OCTOBRE", "NOVEMBRE", "DÉCEMBRE", "JANVIER", "FÉVRIER", "MARS",
        "AVRIL", "MAI", "JUIN", "JUILLET", "AOÛT", "SEPTEMBRE"][i % 12]} 2026`,
      detail: a.detail,
      montant: a.montant,
    }));

  const doc = construireQuittance(q, {
    proprietaire: PROPRIETAIRE,
    periodes: q.allocations.map((_, i) => `2026-${String(i + 1).padStart(2, "0")}`),
    blocs: blocs(q.allocations),
    cautionSur: q.cautionSur,
    logo,
  });
  const pages = doc.internal.getNumberOfPages();
  verifier(`${nbMois} mois : une seule page`, pages === 1, `${pages} page(s)`);
}

console.log("\nLe pire cas : montants en lettres très longs");
// Un montant à onze chiffres écrit son montant en lettres sur plusieurs lignes,
// ce qui allonge le bas de la page — le cas le plus défavorable.
const long = quittance(3);
long.montant = 9876543210;
long.allocations = long.allocations.map((a, i) => ({
  ...a,
  montant: i === 0 ? 9876543210 : 0,
  detail: { ...a.detail, loyer: i === 0 ? 9876543210 : a.detail.loyer },
}));
const docLong = construireQuittance(long, {
  proprietaire: PROPRIETAIRE,
  periodes: ["2026-01", "2026-02", "2026-03"],
  blocs: long.allocations.map((a, i) => ({
    titre: `DETAIL — MOIS ${i + 1}`,
    detail: a.detail,
    montant: a.montant,
  })),
  cautionSur: long.cautionSur,
  logo,
});
verifier("montant très long : une seule page",
  docLong.internal.getNumberOfPages() === 1,
  `${docLong.internal.getNumberOfPages()} page(s)`);

console.log(`\n${sortie} vérification(s) réussie(s), ${ko} échec(s)`);
process.exitCode = ko === 0 ? 0 : 1;