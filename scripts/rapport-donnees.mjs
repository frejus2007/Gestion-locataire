// Que reste-t-il dans les données, après les corrections du code ?
//
// L'affichage est désormais juste : seuls les loyers échus et le loyer seul
// comptent dans la dette. Mais les documents créés avant la correction sont
// toujours là — des loyers de novembre et décembre d'avance, que le
// propriétaire n'a jamais validés.
//
// Ce module **lit** et ne propose rien à écrire : il ne contient aucune
// fonction d'écriture. C'est le filet de sécurité avant toute correction de
// données réelles.
//
// Pourquoi une fonction pure plutôt qu'un script Node ?
//
// Les règles Firestore exigent un utilisateur connecté (`isAuth()` sur chaque
// collection). Une lecture à froid, hors de l'application, échoue avec
// `permission-denied` — c'est ce qui arrive si on tente le rapport en ligne de
// commande. La collecte se fait donc dans l'application, où la session est
// déjà ouverte, et ce module fait l'analyse.
//
// Deux parties :
//   - `analyserDonnees` — l'analyse, testable hors navigateur ;
//   - un exemple `main()` commenté, à déclencher depuis les Paramètres.
//
// Règle de sécurité rappelée ici : la suppression d'un loyer passe par
// `deleteLoyer`, qui refuse un mois portant déjà un paiement. Aucun rapport ne
// doit contourner ce garde-fou.
//
// Usage en test : node scripts/rapport-donnees.mjs

const MOIS_LONGS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

/** « 2026-11 » → « novembre 2026 ». */
export function libellePeriode(periode) {
  const [annee, mois] = String(periode || "").split("-");
  return `${MOIS_LONGS[Number(mois) - 1] || mois} ${annee}`;
}

/** Le loyer seul d'un document, hors charges. */
export function loyerSeul(loyer) {
  return Number(loyer?.loyer) || Number(loyer?.montantDu) || 0;
}

/**
 * Analyse les données et décrit ce qui reste à nettoyer.
 *
 * La distinction essentielle : un loyer daté après le mois courant n'est pas
 * forcément en trop. S'il porte un encaissement, le propriétaire a réellement
 * reçu cet argent — c'est un paiement d'avance, et le supprimer effacerait une
 * recette. Sans encaissement, c'est un document généré automatiquement et
 * jamais validé : c'est celui-là qui-embrasse.
 *
 * @param {object} donnees  { baux, lots, locataires, loyers, paiements }
 * @param {string} [periodeRef]  période de référence, « AAAA-MM »
 * @returns {object} rapport
 */
export function analyserDonnees(donnees, periodeRef = periodeCourante()) {
  const { baux = [], lots = [], locataires = [], loyers = [], paiements = [] } = donnees;

  const nomDe = (id) => {
    const l = locataires.find((x) => x.id === id);
    return l ? `${l.prenoms || ""} ${l.nom || ""}`.trim() || "—" : "—";
  };
  const lotDe = (id) => {
    const l = lots.find((x) => x.id === id);
    return l ? [l.numero, l.designation].filter(Boolean).join(" ") || "—" : "—";
  };

  // Un loyer « en trop » est daté après le mois courant : il n'est pas encore
  // échu, et le propriétaire ouvre lui-même les mois à venir.
  const enTrop = loyers.filter((l) => l.periode > periodeRef);

  // Les mois qui portent un encaissement sont légitimes, même futurs.
  const porteurs = new Set(
    paiements.flatMap((p) => (p.allocations || []).map((a) => a.loyerId))
  );

  const parBail = new Map();
  for (const l of enTrop) {
    if (!parBail.has(l.bailId)) parBail.set(l.bailId, []);
    parBail.get(l.bailId).push(l);
  }

  const bauxACorriger = [];
  for (const [bailId, ls] of parBail) {
    const bail = baux.find((b) => b.id === bailId);
    if (!bail) continue;
    const sansPaiement = ls.filter((l) => !porteurs.has(l.id));
    if (sansPaiement.length === 0) continue;
    bauxACorriger.push({
      bailId,
      locataire: nomDe(bail.locataireId),
      logement: lotDe(bail.lotId),
      loyerMensuel: Number(bail.loyerMensuel) || 0,
      dateDebut: bail.dateDebut,
      dateFin: bail.dateFin || null,
      periodes: sansPaiement.map((l) => l.periode).sort(),
      total: sansPaiement.reduce((s, l) => s + (l.montantDu || 0), 0),
      // Ces mois-là sontregulars : le propriétaire les a réellement encaissés.
      periodesEncaissees: ls
        .filter((l) => porteurs.has(l.id))
        .map((l) => l.periode)
        .sort(),
    });
  }

  // Charges encore inscrites sur les baux : elles s'ajoutent à chaque loyer.
  const chargesSurBaux = baux
    .map((b) => ({
      bailId: b.id,
      locataire: nomDe(b.locataireId),
      logement: lotDe(b.lotId),
      postes: Object.entries(b.fraisDefaut || {})
        .filter(([cle, v]) => !cle.startsWith("libelle") && Number(v) > 0)
        .map(([cle, v]) => ({ cle, montant: Number(v) })),
    }))
    .filter((x) => x.postes.length > 0);

  // Logements sans numéro : le reçu affichera la désignation.
  const lotsSansNumero = lots
    .filter((l) => !l.numero)
    .map((l) => {
      const bail = baux.find((b) => b.lotId === l.id);
      return {
        lotId: l.id,
        logement: [l.designation, l.etage].filter(Boolean).join(" — ") || "—",
        locataire: bail ? nomDe(bail.locataireId) : null,
      };
    });

  return {
    periodeRef,
    totaux: {
      baux: baux.length,
      lots: lots.length,
      locataires: locataires.length,
      loyers: loyers.length,
      paiements: paiements.length,
      loyersHorsMoisCourant: enTrop.length,
    },
    bauxACorriger,
    chargesSurBaux,
    lotsSansNumero,
    // Rien n'est modifié : ce rapport est une photographie.
    ecritures: 0,
  };
}

function periodeCourante() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Rendu texte du rapport, pour la console. */
export function formaterRapport(r) {
  const f = (n) => Number(n || 0).toLocaleString("fr-FR");
  const lignes = [];

  lignes.push(`Baux ${r.totaux.baux} · Lots ${r.totaux.lots} · Locataires ${r.totaux.locataires}`);
  lignes.push(`Loyers ${r.totaux.loyers} · Paiements ${r.totaux.paiements}`);
  lignes.push(`Mois en cours : ${libellePeriode(r.periodeRef)}`);
  lignes.push(`Loyers datés après le mois courant : ${r.totaux.loyersHorsMoisCourant}`);

  lignes.push("\n— Loyers à retirer, bail par bail —");
  if (r.bauxACorriger.length === 0) {
    lignes.push("  Aucun : tous les mois futurs portent un encaissement.");
  }
  for (const b of r.bauxACorriger) {
    lignes.push(`\n  ${b.locataire} — ${b.logement} (loyer ${f(b.loyerMensuel)})`);
    lignes.push(`    à retirer : ${b.periodes.map(libellePeriode).join(", ")} (${f(b.total)} FCFA)`);
    if (b.periodesEncaissees.length > 0) {
      lignes.push(`    à conserver, déjà encaissés : ${b.periodesEncaissees.map(libellePeriode).join(", ")}`);
    }
  }

  lignes.push("\n— Charges inscrites sur les baux —");
  if (r.chargesSurBaux.length === 0) lignes.push("  Aucune.");
  for (const b of r.chargesSurBaux) {
    lignes.push(`  ${b.locataire} — ${b.logement} : ${b.postes.map((p) => `${p.cle} ${f(p.montant)}`).join(", ")}`);
  }

  lignes.push("\n— Logements sans numéro d'appartement —");
  if (r.lotsSansNumero.length === 0) lignes.push("  Aucun.");
  for (const l of r.lotsSansNumero) {
    lignes.push(`  ${l.logement}${l.locataire ? ` — occupé par ${l.locataire}` : " — vacant"}`);
  }

  lignes.push(`\nÉcritures effectuées : ${r.ecritures}. Ce rapport n'a rien modifié.`);
  return lignes.join("\n");
}

// --- Exemple d'appel, depuis l'application ---
//
// Dans un composant connecté au contexte, la collecte est déjà faite :
//
//   const { baux, lots, locataires, loyers, paiements } = useApp();
//   const rapport = analyserDonnees({ baux, lots, locataire, loyers, paiements });
//   console.log(formaterRapport(rapport));
//
// `useApp()` expose toutes ces collections, et la session Firebase est ouverte
// — les règles Firestore sont donc satisfaites.