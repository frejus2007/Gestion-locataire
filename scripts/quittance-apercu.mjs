// Produit une quittance PDF sans navigateur, pour contrôler la mise en page.
//
// La base de démonstration vit en mémoire : on la charge directement, on émet
// une quittance et on écrit le fichier. Le rendu est ensuite inspectable.
//
// Le script vérifie aussi, sur toutes les quittances, que les sept lignes
// imprimées reconstruisent le montant total. C'est l'invariant que le
// générateur a longtemps enfreint : le montant total atterrissait sur la
// ligne « Loyer », et les charges s'ajoutaient une seconde fois à la lecture.
//
// Usage : node scripts/quittance-apercu.mjs [chemin]

import fs from "node:fs";
import path from "node:path";
import { listQuittances, listPaiements, listBaux, getProprietaire, POSTES_FRAIS } from "../src/data/db.js";
import { construireQuittance, detailQuittance } from "../src/utils/quittancePdf.js";

const SORTIE = process.argv[2] || path.join(process.cwd(), "apercu-quittance.pdf");
const LOGO = path.join(process.cwd(), "public", "logo-cag-complet-pdf.png");

const logo = fs.existsSync(LOGO)
  ? `data:image/png;base64,${fs.readFileSync(LOGO).toString("base64")}`
  : null;

const quittances = listQuittances();
if (quittances.length === 0) {
  console.error("Aucune quittance dans le jeu de démonstration.");
  process.exit(1);
}

// On privilégie une quittance qui porte un détail de frais : c'est elle qui
// montre les sept lignes comme elles doivent apparaître.
const avecDetail =
  quittances.find((q) => q.detail && Object.values(q.detail).some((v) => v > 0)) || quittances[0];
const bail = listBaux().find((b) => b.id === avecDetail.bailId);
const paiement = listPaiements().find((p) => p.id === avecDetail.paiementId);

/* ---- Contrôle : les sept lignes doivent reconstruire le montant total ---- */
let incoherentes = 0;
let loyerEcrasé = 0;
for (const q of quittances) {
  const affiche = detailQuittance(q);
  const somme = POSTES_FRAIS.reduce((s, cle) => s + (Number(affiche[cle]) || 0), 0);
  if (somme !== Number(q.montant)) {
    incoherentes++;
    if (incoherentes <= 5) {
      console.log(
        `  INCOHÉRENTE ${q.numero} : lignes = ${somme}, total imprimé = ${q.montant}`
      );
    }
  }
  // Un loyer enregistré doit rester tel quel sur la ligne « Loyer ».
  if (q.detail && Number(q.detail.loyer) > 0 && affiche.loyer !== Number(q.detail.loyer)) {
    loyerEcrasé++;
    if (loyerEcrasé <= 5) {
      console.log(
        `  LOYER ÉCRASÉ ${q.numero} : enregistré ${q.detail.loyer}, imprimé ${affiche.loyer}`
      );
    }
  }
}
console.log(
  `\ncohérence des lignes : ${quittances.length - incoherentes}/${quittances.length} quittances`
);
console.log(`loyer conforme       : ${quittances.length - loyerEcrasé}/${quittances.length} quittances`);

/* ---- Aperçu d'une quittance ---- */
console.log("\nquittance choisie :", avecDetail.numero);
console.log("  détail          :", JSON.stringify(avecDetail.detail));
console.log("  lignes imprimées:", JSON.stringify(detailQuittance(avecDetail)));
console.log("  paiement        :", paiement ? `${paiement.montant} (${paiement.mode})` : "—");
console.log("  logo            :", logo ? "chargé" : "absent");

const doc = construireQuittance(avecDetail, {
  proprietaire: getProprietaire(),
  periode: avecDetail.periode,
  cautionSur: bail?.cautionSur || "",
  logo,
});

const pages = doc.output("arraybuffer");
const taille = Buffer.from(pages).length;
console.log(`\nlogo embarqué : ${taille > 20000 ? "oui" : "NON"} (${taille} octets)`);

const donnees = Buffer.from(doc.output("arraybuffer"));
fs.writeFileSync(SORTIE, donnees);
console.log(`\nécrit : ${SORTIE} (${donnees.length} octets)`);
console.log(`signature : ${donnees.subarray(0, 5).toString()}`);
console.log(`pages    : ${doc.internal.getNumberOfPages()}`);

process.exitCode = incoherentes === 0 && loyerEcrasé === 0 ? 0 : 1;
