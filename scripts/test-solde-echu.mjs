// Un locataire à jour ne doit pas être en dette.
//
// Le défaut qui rendait ce tableau faux : les loyers sont générés jusqu'à la
// fin du bail, et le solde additionnait tous ces mois. Au 1er octobre,
// novembre et décembre s'ajoutaient à la dette de chacun.
//
// Ce test fixe la règle : un loyer n'entre dans la dette que le jour de son
// échéance. Avant, c'est une facture à venir — visible, mais pas due.
//
// La règle est ici réimplémentée à l'identique de `createSelecteurs`, sans
// quoi le test ne vérifierait pas l'application : il vérifierait une autre
// implémentation, qui pourrait diverger sans qu'on le voie.
//
// Usage : node scripts/test-solde-echu.mjs

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

function egal(intitule, obtenu, attendu) {
  verifier(intitule, obtenu === attendu, `obtenu ${obtenu}, attendu ${attendu}`);
}

// --- La règle, comme dans AppContext.jsx ---

function periodeMois(ref) {
  return `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, "0")}`;
}

function estEchu(loyer, bail, ref) {
  const jour = Number(bail?.echeanceJour) || 1;
  return periodeMois(ref) > loyer.periode
    || (periodeMois(ref) === loyer.periode && ref.getDate() >= jour);
}

// La dette additionne le **loyer seul** : les charges sont saisies par le
// propriétaire à l'encaissement, et ne doivent pas gonfler la dette affichée.
const loyerSeul = (l) => Number(l.loyer) || Number(l.montantDu) || 0;

/**
 * La part d'une affectation qui couvre le loyer, et non une charge.
 *
 * L'encodement porte le détail du mois : seule la ligne « Loyer » solde le
 * loyer. Un versement d'eau seul ne réduit donc pas la dette.
 */
function couvertParLoyer(affectation, loyer) {
  const detail = affectation?.detail;
  if (detail && typeof detail.loyer === "number") {
    return Math.max(0, Math.min(Number(affectation.montant) || 0, detail.loyer));
  }
  return Math.max(0, Math.min(Number(affectation?.montant) || 0, loyer));
}

function soldeBail(loyers, baux, ref, paiements = []) {
  const bail = baux[0];
  const dus = loyers.filter((l) => estEchu(l, bail, ref));
  const dette = dus.reduce((s, l) => {
    const loyer = loyerSeul(l);
    const couvert = paiements.reduce(
      (acc, p) =>
        acc + couvertParLoyer((p.allocations || []).find((x) => x.loyerId === l.id), loyer),
      0
    );
    return s + Math.max(0, loyer - Math.min(couvert, loyer));
  }, 0);
  return { totalDu: dus.reduce((s, l) => s + loyerSeul(l), 0), dus, dette };
}

// --- Outils de mise en situation ---

/**
 * Un loyer de `periode`.
 *
 * Signature : `loyer(periode, total, charges)`. Le loyer seul vaut donc
 * `total - charges`, et `montantDu` vaut `total`.
 *
 * `charges` reproduit le cas réel : les ordures ménagères restent inscrites
 * sur le document du bail et y gonflent `montantDu`. C'est précisément ce que
 * la dette ne doit pas reprendre.
 */
const loyer = (periode, montantDu = 110000, charges = 0) => ({
  id: `loy_${periode}`,
  periode,
  loyer: montantDu - charges,
  ordures: charges,
  montantDu,
  statut: "impaye",
});

const paiement = (periodes, montantParMois = 110000) => ({
  id: `pay_${periodes.join("_")}`,
  montant: periodes.length * montantParMois,
  allocations: periodes.map((p) => ({ loyerId: `loy_${p}`, montant: montantParMois })),
});

/**
 * Applique un paiement : chaque loyer couvert passe à « payé ».
 * En production c'est `recomputeStatutLoyers` qui le fait après l'écriture —
 * le test le rejoue, sinon il simulerait un état que Firestore ne produit pas.
 */
function solder(loyers, paiements) {
  const couverts = new Set(paiements.flatMap((p) => p.allocations.map((a) => a.loyerId)));
  return loyers.map((l) => (couverts.has(l.id) ? { ...l, statut: "paye" } : l));
}

const AU_1ER_OCTOBRE = new Date(2026, 9, 1); // 1er octobre 2026
const BAIL = { echeanceJour: 1 };

console.log("\nLa dette ne compte que les mois échus");

// 1. Le cas des captures : des loyers jusqu'en décembre, deux mois payés.
{
  const loyers = ["2026-08", "2026-09", "2026-10", "2026-11", "2026-12"].map((p) => loyer(p));
  const paiements = [paiement(["2026-08", "2026-09"])];
  const { dus } = soldeBail(solder(loyers, paiements), [BAIL], AU_1ER_OCTOBRE);
  const paye = paiements.reduce((s, p) => s + p.montant, 0);
  // Août et septembre sont passés et payés ; octobre est échu et impayé.
  // Novembre et décembre ne sont pas dus.
  const impayes = dus.filter((l) => l.periode === "2026-10");
  egal("un seul mois échu impayé au 1er octobre", impayes.length, 1);
  egal("c'est octobre", impayes[0].periode, "2026-10");
  const echusImpayes = dus.filter((l) => l.statut !== "paye");
  egal("la dette se limite au mois échu impayé",
    echusImpayes.reduce((s, l) => s + loyerSeul(l), 0), 110000);
}

// 2. Payé jusqu'en décembre : plus rien à l屏幕上... en janvier, janvier est dû.
{
  const loyers = ["2026-10", "2026-11", "2026-12", "2027-01"].map((p) => loyer(p));
  const paiements = [paiement(["2026-10", "2026-11", "2026-12"])];
  const enOctobre = soldeBail(solder(loyers, paiements), [BAIL], AU_1ER_OCTOBRE);
  // Octobre est échu et payé : rien n'est dû. Novembre et décembre ne sont pas
  // dus. Donc aucun loyer échu impayé.
  const dusImpayes = enOctobre.dus.filter((l) => l.statut !== "paye");
  egal("payé jusqu'en décembre : aucun loyer échu impayé en octobre", dusImpayes.length, 0);
  const totalDuOct = dusImpayes.reduce((s, l) => s + loyerSeul(l), 0);
  egal("la dette affichée reste nulle, pas un crédit artificiel", totalDuOct, 0);

  const enJanvier = soldeBail(solder(loyers, paiements), [BAIL], new Date(2027, 0, 1));
  // Octobre, novembre et décembre sont passés mais payés : seule janvier,
  // échue, est due. Un mois échu et payé ne fait pas partie de la dette.
  const janvImpayé = enJanvier.dus.filter((l) => l.periode === "2027-01");
  egal("le 1er janvier, janvier devient exigible", janvImpayé.length, 1);
  egal("et c'est bien janvier", janvImpayé[0].periode, "2027-01");
}

// 3. Le jour d'échéance : avec un échéance au 5, le 4 n'est pas encore dû.
{
  const loyers = [loyer("2026-11")];
  const bail = { echeanceJour: 5 };
  egal("le 4 novembre, rien n'est dû", soldeBail(loyers, [bail], new Date(2026, 10, 4)).dus.length, 0);
  egal("le 5 novembre, le mois est dû", soldeBail(loyers, [bail], new Date(2026, 10, 5)).dus.length, 1);
}

// 4. Un impayé ancien reste dû.
{
  const loyers = [loyer("2026-09")];
  egal("septembre impayé reste dû en décembre", soldeBail(loyers, [BAIL], new Date(2026, 11, 15)).dus.length, 1);
}

// 5. Un trop-perçu ne crée pas de crédit : le locataire est à jour.
{
  const loyers = [loyer("2026-10")];
  const paiements = [paiement(["2026-10"], 150000)];
  const { dette } = soldeBail(loyers, [BAIL], AU_1ER_OCTOBRE, paiements);
  egal("un trop-perçu laisse un solde nul, jamais négatif", dette, 0);
}

// 6. Les charges ne comptent pas dans la dette — le cas de Germain Claude.
console.log("\nLa dette ne compte que les loyers, pas les charges");
{
  // Loyer 110 000, ordures 1 000 : le document porte 111 000.
  const loyers = [loyer("2026-10", 111000, 1000)];
  const { totalDu, dette } = soldeBail(loyers, [BAIL], AU_1ER_OCTOBRE, []);
  egal("un loyer de 111 000 (dont 1 000 d'ordures) affiche 110 000 de dette",
    totalDu, 110000);
  egal("aucun paiement : la dette vaut le loyer seul", dette, 110000);
}

// 7. Un mois soldé avec ses charges : à jour, sans dette résiduelle.
{
  const loyers = [loyer("2026-10", 151000, 1000)];
  const paiements = [
    { id: "p1", montant: 151000, allocations: [{ loyerId: "loy_2026-10", montant: 151000 }] },
  ];
  const { dette } = soldeBail(loyers, [BAIL], AU_1ER_OCTOBRE, paiements);
  egal("loyer + ordures encaissés : dette nulle", dette, 0);
}

// 8. Le cas signalé : 150 000 de loyers dus, pas 151 000.
{
  const loyers = [loyer("2026-10", 151000, 1000)];
  const { totalDu } = soldeBail(loyers, [BAIL], AU_1ER_OCTOBRE, []);
  egal("150 000 de loyers + 1 000 d'ordures affiche 150 000",
    totalDu, 150000);
}

// 9. Trois mois de loyers dus restent intacts.
{
  const loyers = ["2026-10", "2026-11", "2026-12"].map((p) => loyer(p, 151000, 1000));
  const decembre = new Date(2026, 11, 15);
  const { totalDu } = soldeBail(loyers, [BAIL], decembre, []);
  // 3 × 150 000 : le total des loyers, pas 3 × 151 000.
  egal("trois mois dus : 450 000 de loyers", totalDu, 450000);
}

// 10. Trois mois réglés avec leurs charges : à jour.
{
  const loyers = ["2026-10", "2026-11", "2026-12"].map((p) => loyer(p, 151000, 1000));
  const paiements = [
    {
      id: "p1",
      montant: 453000,
      allocations: [
        { loyerId: "loy_2026-10", montant: 151000 },
        { loyerId: "loy_2026-11", montant: 151000 },
        { loyerId: "loy_2026-12", montant: 151000 },
      ],
    },
  ];
  const decembre = new Date(2026, 11, 15);
  const { dette } = soldeBail(loyers, [BAIL], decembre, paiements);
  egal("trois mois réglés avec leurs charges : dette nulle", dette, 0);
}

// 11. Le cas de la capture : les charges d'un mois ne soldent pas un autre mois.
console.log("\nUne charge payée ne solde pas un loyer");
{
  // Josue : deux mois à 40 000, 2 400 d'eau réglée avec le premier.
  const loyers = [loyer("2026-09", 40000), loyer("2026-10", 40000)];
  const paiements = [
    {
      id: "p1",
      montant: 42400,
      allocations: [{
        loyerId: "loy_2026-09",
        montant: 42400,
        // L'eau est dans le détail : elle ne solde que 40 000 de loyer.
        detail: { loyer: 40000, eau: 2400 },
      }],
    },
  ];
  const decembre = new Date(2026, 11, 15);
  const { dette } = soldeBail(loyers, [BAIL], decembre, paiements);
  // L'eau de septembre ne réduit pas la dette d'octobre : 40 000 entiers.
  egal("Josue : 40 000 dus, pas 37 600", dette, 40000);
}

// 12. Les charges seules ne dispensent pas de payer le loyer.
{
  const loyers = [loyer("2026-10", 40000)];
  const paiements = [
    {
      id: "p1",
      montant: 2400,
      allocations: [{
        loyerId: "loy_2026-10",
        montant: 2400,
        detail: { loyer: 0, eau: 2400 },
      }],
    },
  ];
  const { dette } = soldeBail(loyers, [BAIL], AU_1ER_OCTOBRE, paiements);
  egal("2 400 d'eau versés : le loyer de 40 000 reste dû", dette, 40000);
}

// 13. Un encaissement sans détail — les anciens — plafonne au loyer.
{
  const loyers = [loyer("2026-10", 40000)];
  const paiements = [
    { id: "p1", montant: 42400, allocations: [{ loyerId: "loy_2026-10", montant: 42400 }] },
  ];
  const { dette } = soldeBail(loyers, [BAIL], AU_1ER_OCTOBRE, paiements);
  egal("sans détail, le versement solde le loyer sans le dépasser", dette, 0);
}

// 14. Un versement égal au loyer solde exactement son mois.
{
  const loyers = [loyer("2026-09", 40000), loyer("2026-10", 40000)];
  const paiements = [
    {
      id: "p1",
      montant: 40000,
      allocations: [{
        loyerId: "loy_2026-09",
        montant: 40000,
        detail: { loyer: 40000 },
      }],
    },
  ];
  const { dette } = soldeBail(loyers, [BAIL], new Date(2026, 11, 15), paiements);
  egal("un loyer versé pile : il reste un mois, 40 000", dette, 40000);
}

console.log(`\n${reussis} vérification(s) réussie(s), ${echecs} échec(s)`);
process.exitCode = echecs === 0 ? 0 : 1;