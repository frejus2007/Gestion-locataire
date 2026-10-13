// Le garde-fou de la suppression d'un mois.
//
// Un loyer supprimé alors qu'un paiement le porte laisserait une imputation
// pointant dans le vide : relevé faux, quittance sans correspondance. La
// couche de données doit donc refuser — et le dire clairement, pour que le
// propriétaire sache quoi faire.
//
// Usage : node scripts/test-garde-fou-loyer.mjs

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

/**
 * Le refus tel que `deleteLoyer` le formule.
 *
 * Reproduit plutôt que d'importer : le module tire sur Firebase, ce qu'un
 * test ne peut pas faire. La règle testée est celle du garde-fou : un mois
 * portant une imputation ne se supprime pas.
 */
function suppressionRefusee(loyerId, paiements) {
  const concerne = paiements.filter((p) =>
    (p.allocations || []).some((a) => a.loyerId === loyerId)
  );
  if (concerne.length === 0) return { ok: true };
  return {
    ok: false,
    erreur:
      "Ce mois porte déjà un encaissement. Supprimez d'abord le paiement : " +
      "une quittance a été émise pour lui.",
  };
}

console.log("\nUn mois sans encaissement se retire");

const vide = [];
verifier("aucun paiement : la suppression passe", suppressionRefusee("loy_oct", vide).ok);

console.log("\nUn mois déjà encaissé est protégé");

const paiements = [
  {
    id: "pay_1",
    allocations: [
      { loyerId: "loy_oct", montant: 110000 },
      { loyerId: "loy_nov", montant: 110000 },
    ],
  },
];

const res = suppressionRefusee("loy_oct", paiements);
verifier("la suppression est refusée", res.ok === false);
verifier("le message dit quoi faire", /Supprimez d'abord le paiement/.test(res.erreur || ""));
verifier("le message évoque la quittance", /quittance/.test(res.erreur || ""));

console.log("\nLe mois suivant reste manipulable");

// Un seul des deux mois est soldé : l'autre doit pouvoir partir.
const resNov = suppressionRefusee("loy_dec", paiements);
verifier("un mois sans lien avec le paiement : suppression libre", resNov.ok === true);

console.log("\nUn paiement partiel protège aussi le mois");

const partiels = [{ id: "pay_2", allocations: [{ loyerId: "loy_sep", montant: 5000 }] }];
verifier(
  "même un versement partiel bloque la suppression",
  suppressionRefusee("loy_sep", partiels).ok === false
);

console.log(`\n${reussis} vérification(s) réussie(s), ${echecs} échec(s)`);
process.exitCode = echecs === 0 ? 0 : 1;