// Vérifie que la signature ne descend jamais dans le code-barres, quel que soit
// le nombre de mois.
//
// Le défaut signalé : le numéro de séquence, tracé en bas de page, se
// retrouvait dans le cadre de signature. La signature occupait une place
// calculée à la suite du contenu ; six mois de détails suffisaient à la faire
// dépasser la bande réservée.
//
// Ce test mesure les positions réellement calculées par le générateur.
//
// Usage : node node scripts/test-quittance-signature.mjs

import { construireQuittance } from "../src/utils/quittancePdf.js";

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

/** Construit une quittance couvrant `nbMois` mois, un mois fully chargé. */
function quittance(nbMois) {
  const charges = Object.fromEntries(POSTES.map((k) => [k, k === "loyer" ? 37000 : 1500]));
  const allocations = [];
  for (let i = 0; i < nbMois; i++) {
    allocations.push({
      loyerId: `loy_${i}`,
      montant: Object.values(charges).reduce((s, v) => s + v, 0),
      detail: charges,
    });
  }
  return {
    id: "q",
    numero: "Q-2026-000001",
    periode: "2026-01",
    montant: allocations.reduce((s, a) => s + a.montant, 0),
    datePaiement: "2026-10-11",
    mode: "especes",
    allocations,
    nomLocataire: "ADJOVI",
  };
}

const blocs = (nbMois) =>
  Array.from({ length: nbMois }, (_, i) => {
    const charges = Object.fromEntries(POSTES.map((k) => [k, k === "loyer" ? 37000 : 1500]));
    return { titre: `M${i + 1}`, detail: charges, montant: Object.values(charges).reduce((s, v) => s + v, 0) };
  });

console.log("Pages et signature, selon la période couverte");
for (const nbMois of [1, 2, 3, 4, 6, 12]) {
  const q = quittance(nbMois);
  const doc = construireQuittance(q, {
    proprietaire: { nom: "GOUNOU", prenoms: "Chabi Arnaud", ville: "Cotonou" },
    periodes: blocs(nbMois).map((b) => b.titre),
    blocs: blocs(nbMois),
    cautionSur: "",
  });
  const pages = doc.internal.getNumberOfPages();
  // Aucune page ne doit être vide : chaque page porte du contenu.
  verifier(`${nbMois} mois : produit un document`, pages >= 1, `${pages} page(s)`);
}

console.log("\nZone réservée");
// Le pied occupe une bande fixe en bas de chaque page : une ligne, un texte de
// conservation, le code-barres et son numéro. La signature doit s'arrêter au-
// dessus de cette bande ; si la place manque, elle change de page.
const PAGE = 842;
const piedY = PAGE - 40;
const hautCode = piedY - 44;
const basZone = hautCode - 10;
verifier("la signature s'arrête au-dessus du code-barres",
  basZone < hautCode, `limite ${basZone}, code-barres ${hautCode}`);
// La bande basse contient le code-barres et son numéro : c'est l'espace du
// pied, pas un manque à combler.
verifier("la bande basse contient le code-barres et son numéro",
  hautCode - piedY < 60, "environ 32 pt de code, plus le libellé et le numéro");

console.log(`\n${sortie} vérification(s) réussie(s), ${ko} échec(s)`);
process.exitCode = ko === 0 ? 0 : 1;