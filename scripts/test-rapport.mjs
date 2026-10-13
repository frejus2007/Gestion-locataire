// Le rapport distingue-t-il ce qu'on peut retirer de ce qu'on doit garder ?
//
// Le piège : un loyer daté dans le futur n'est pas forcément unwanted. S'il
// porte un encaissement, le propriétaire a réellement reçu cet argent ; le
// supprimer effacerait une recette. Ce test verrouille cette distinction.
//
// Usage : node scripts/test-rapport.mjs

import { analyserDonnees, formaterRapport } from "./rapport-donnees.mjs";

let reussis = 0;
let echecs = 0;

function verifier(intitule, condition, detail = "") {
  if (condition) {
    reussis++;
    console.log(`  OK    ${intitule}${detail ? " — " + detail : ""}`);
  } else {
    echecs++;
    console.log(`  ECHEC ${intitule}${detail ? " — " + detail : ""}`);
  }
}

const REF = "2026-10"; // octobre 2026

const locataire = (id, nom) => ({ id, nom, prenoms: "" });
const bail = (id, locataireId, over = {}) => ({
  id,
  locataireId,
  lotId: "lot1",
  dateDebut: "2026-01-01",
  dateFin: null,
  loyerMensuel: 110000,
  ...over,
});
const loyerDoc = (bailId, periode, montantDu = 110000) => ({
  id: `loy_${bailId}_${periode}`,
  bailId,
  periode,
  loyer: montantDu,
  montantDu,
});
const paiement = (id, loyerIds, montant = 110000) => ({
  id,
  bailId: "b1",
  montant: montant * loyerIds.length,
  allocations: loyerIds.map((loyerId) => ({ loyerId, montant })),
});

console.log("\nCe qui peut être retiré");

// Un locataire payé jusqu'en octobre : novembre et décembre n'ont jamais été
// validés, ils n'ont pas d'encaissement. Ils sont retirables.
{
  const rapport = analyserDonnees({
    baux: [bail("b1", "l1")],
    lots: [{ id: "lot1", numero: "R1", designation: "Rez" }],
    locataires: [locataire("l1", "DAKPO")],
    loyers: [
      loyerDoc("b1", "2026-09"),
      loyerDoc("b1", "2026-10"),
      loyerDoc("b1", "2026-11"),
      loyerDoc("b1", "2026-12"),
    ],
    paiements: [
      paiement("p1", ["loy_b1_2026-09"]),
      paiement("p2", ["loy_b1_2026-10"]),
    ],
  }, REF);

  const ligne = rapport.bauxACorriger.find((b) => b.bailId === "b1");
  verifier("le bail est signalé", Boolean(ligne));
  verifier("novembre et décembre sont à retirer",
    JSON.stringify(ligne?.periodes) === '["2026-11","2026-12"]',
    JSON.stringify(ligne?.periodes));
  verifier("septembre et octobre ne sont pas signalés",
    !ligne?.periodes.includes("2026-09") && !ligne?.periodes.includes("2026-10"));
  verifier("le total est celui des deux mois à retirer", ligne?.total === 220000, String(ligne?.total));
}

console.log("\nCe qui doit être conservé");

// Un locataire qui a payé d'avance : décembre porte un encaissement. Le retirer
// effacerait une recette réellement encaissée.
{
  const rapport = analyserDonnees({
    baux: [bail("b1", "l1")],
    lots: [{ id: "lot1", numero: "R1", designation: "Rez" }],
    locataires: [locataire("l1", "TRAORE")],
    loyers: [
      loyerDoc("b1", "2026-10"),
      loyerDoc("b1", "2026-11"),
      loyerDoc("b1", "2026-12"),
    ],
    paiements: [
      paiement("p1", ["loy_b1_2026-10", "loy_b1_2026-11", "loy_b1_2026-12"]),
    ],
  }, REF);

  const ligne = rapport.bauxACorriger.find((b) => b.bailId === "b1");
  verifier("aucun mois à retirer : tout est encaissé",
    ligne === undefined,
    ligne ? `trouvé : ${ligne.periodes.join(", ")}` : "rien à faire");
  verifier("et le rapport indique zéro écriture", rapport.ecritures === 0);
}

console.log("\nLe cas mixte : novembre à retirer, décembre conservé");

{
  const rapport = analyserDonnees({
    baux: [bail("b1", "l1")],
    lots: [{ id: "lot1", numero: "R1", designation: "Rez" }],
    locataires: [locataire("l1", "BEKA")],
    loyers: [
      loyerDoc("b1", "2026-10"),
      loyerDoc("b1", "2026-11"),
      loyerDoc("b1", "2026-12"),
    ],
    paiements: [
      paiement("p1", ["loy_b1_2026-10"]),
      paiement("p2", ["loy_b1_2026-12"]), // décembre payé d'avance
    ],
  }, REF);

  const ligne = rapport.bauxACorriger.find((b) => b.bailId === "b1");
  verifier("seule novembre est à retirer",
    JSON.stringify(ligne?.periodes) === '["2026-11"]',
    JSON.stringify(ligne?.periodes));
  verifier("décembre est listé comme encaissé",
    JSON.stringify(ligne?.periodesEncaissees) === '["2026-12"]',
    JSON.stringify(ligne?.periodesEncaissees));
}

console.log("\nLes autres constats");

{
  const rapport = analyserDonnees({
    baux: [bail("b1", "l1", { fraisDefaut: { ordures: 1000, eau: 0 } })],
    lots: [{ id: "lot1", designation: "REZ DE CHAUSSEE", etage: "R1" }],
    locataires: [locataire("l1", "ANIFO")],
    loyers: [],
    paiements: [],
  }, REF);

  verifier("les charges du bail sont signalées",
    rapport.chargesSurBaux.length === 1 && rapport.chargesSurBaux[0].postes[0].cle === "ordures");
  verifier("les charges à zéro ne sont pas signalées",
    rapport.chargesSurBaux[0].postes.length === 1,
    String(rapport.chargesSurBaux[0].postes.length));
  verifier("le logement sans numéro est signalé",
    rapport.lotsSansNumero.length === 1 && rapport.lotsSansNumero[0].locataire === "ANIFO");
}

console.log("\nLe rapport reste lisible");
{
  const rapport = analyserDonnees({
    baux: [bail("b1", "l1", { fraisDefaut: { ordures: 1000 } })],
    lots: [{ id: "lot1", designation: "REZ DE CHAUSSEE" }],
    locataires: [locataire("l1", "DAKPO")],
    loyers: [loyerDoc("b1", "2026-11")],
    paiements: [],
  }, REF);
  const texte = formaterRapport(rapport);
  verifier("le texte mentionne le locataire", texte.includes("DAKPO"));
  verifier("le texte annonce l'absence d'écriture", /Écritures effectuées : 0/.test(texte));
  verifier("le texte cite novembre", texte.includes("novembre 2026"));
}

console.log(`\n${reussis} vérification(s) réussie(s), ${echecs} échec(s)`);
process.exitCode = echecs === 0 ? 0 : 1;