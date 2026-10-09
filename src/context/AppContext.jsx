// Contexte applicatif : expose les données et les sélecteurs dérivés.
//
// Les composants ne calculent jamais un solde eux-mêmes : ils appellent les
// sélecteurs ci-dessous, qui sont la seule source de vérité des montants.
//
// Firestore est asynchrone : la lecture ne peut plus être faite pendant le
// rendu. Les données vivent donc dans un état, chargées au montage et
// rechargées après chaque écriture. `Promise.all` accepte indifféremment les
// valeurs synchrones du jeu local et les promesses de Firestore : le même
// code sert les deux modes.

import { createContext, useContext, useState, useCallback, useMemo, useEffect } from "react";
import { db } from "../utils/db-provider";
import { comparePeriode, periodeCourante } from "../utils/format";

const { CATEGORIES_DEPENSE, MOIS_DE_PAYEMENT, LIGNES_FRAIS } = db;

const AppContext = createContext(null);

const VIDE = {
  proprietaire: null,
  immeubles: [],
  lots: [],
  locataires: [],
  baux: [],
  loyers: [],
  paiements: [],
  depenses: [],
  quittances: [],
};

export function AppProvider({ children }) {
  const [donnees, setDonnees] = useState(VIDE);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState(null);

  // Relit l'ensemble de la base. Volontairement exhaustive plutôt que ciblée :
  // le volume d'un parc locatif tient largement en mémoire, et un rechargement
  // partiel finit toujours par laisser un écran incohérent.
  //
  // Renvoie les données lues : après une écriture, l'appelant a souvent besoin
  // du document qu'il vient de créer (un loyer à imputer, un lot à ouvrir).
  // Se fier à l'état du composant ne marcherait pas — il date du rendu
  // précédent, donc d'avant l'écriture.
  const refresh = useCallback(async () => {
    try {
      const [proprietaire, immeubles, lots, locataires, baux, loyers, paiements, depenses, quittances] =
        await Promise.all([
          db.getProprietaire(),
          db.listImmeubles(),
          db.listLots(),
          db.listLocataires(),
          db.listBaux(),
          db.listLoyers(),
          db.listPaiements(),
          db.listDepenses(),
          db.listQuittances(),
        ]);
      const lu = { proprietaire, immeubles, lots, locataires, baux, loyers, paiements, depenses, quittances };
      setDonnees(lu);
      setErreur(null);
      return lu;
    } catch (e) {
      // L'écran doit rester utilisable : on note l'erreur et on garde les
      // dernières données connues plutôt que de tout vider.
      setErreur(e.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Exécute une écriture, recharge, et propage le résultat à l'appelant.
  // Toujours `{ ok, resultat }` ou `{ ok: false, erreur }` : les pages
  // testent `res.ok` et affichent `res.erreur`.
  //
  // `resultat` est l'effet de l'écriture ; `donnees` est l'état complet relu
  // juste après, ce qui permet à l'appelant de récupérer un document créé
  // (un loyer généré, un lot à ouvrir) sans rely sur son rendu précédent.
  const run = useCallback(
    async (action) => {
      setLoading(true);
      try {
        const resultat = await action();
        const donnees = await refresh();
        setLoading(false);
        return { ok: true, resultat, donnees };
      } catch (e) {
        await refresh();
        setErreur(e.message);
        setLoading(false);
        return { ok: false, erreur: e.message };
      }
    },
    [refresh]
  );

  const sel = useMemo(() => createSelecteurs(donnees), [donnees]);

  const actions = useMemo(
    () => ({
      refresh,
      run,

      // Propriétaire
      saveProprietaire: (champs) => run(() => db.updateProprietaire(champs)),

      // Immeubles
      saveImmeuble: (data, id = null) =>
        run(() => (id ? db.updateImmeuble(id, data) : db.createImmeuble(data))),
      removeImmeuble: (id) => run(() => db.deleteImmeuble(id)),

      // Lots
      saveLot: (data, id = null) => run(() => (id ? db.updateLot(id, data) : db.createLot(data))),
      removeLot: (id) => run(() => db.deleteLot(id)),

      // Locataires
      saveLocataire: (data, id = null) =>
        run(() => (id ? db.updateLocataire(id, data) : db.createLocataire(data))),
      removeLocataire: (id) => run(() => db.deleteLocataire(id)),

      // Baux
      saveBail: (data, id = null) => run(() => (id ? db.updateBail(id, data) : db.createBail(data))),
      removeBail: (id) => run(() => db.deleteBail(id)),
      genererDepuis: (bailId, periodeDebut, periodeFin = null) =>
        run(() => db.genererLoyersDepuis(bailId, periodeDebut, periodeFin)),
      genererPeriode: (periode) => run(() => db.genererLoyersPourPeriode(periode)),

      // Paiements
      enregistrerPaiement: (data) => run(() => db.enregistrerPaiement(data)),
      removePaiement: (id) => run(() => db.deletePaiement(id)),

      // Dépenses
      saveDepense: (data, id = null) =>
        run(() => (id ? db.updateDepense(id, data) : db.createDepense(data))),
      removeDepense: (id) => run(() => db.deleteDepense(id)),

      // Quittances
      genererQuittance: (paiementId) => run(() => db.genererQuittance(paiementId)),
      genererQuittancesManquantes: () => run(() => db.genererQuittancesManquantes()),
    }),
    [refresh, run]
  );

  // Listes de référence : constantes, redefinees hors du useMemo pour ne pas
  // devenir des dependances.
  const value = useMemo(
    () => ({
      ...donnees,
      ...sel,
      ...actions,
      CATEGORIES: CATEGORIES_DEPENSE,
      MODES: MOIS_DE_PAYEMENT,
      // Sept lignes d'un encaissement (loyer, eau, électricité, ordures…).
      LIGNES: LIGNES_FRAIS,
      loading,
      erreur,
      setErreur,
    }),
    [donnees, sel, actions, loading, erreur]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

// --- Sélecteurs ---
//
// Tout ce qui est calculé (soldes, statuts, totaux) est défini ici. Les pages
// lisent ces valeurs sans jamais refaire le calcul elles-mêmes.

export function createSelecteurs(donnees) {
  const { baux, lots, immeubles, locataires, loyers, paiements, depenses, quittances } = donnees;

  const loyersParBail = new Map();
  for (const l of loyers) {
    if (!loyersParBail.has(l.bailId)) loyersParBail.set(l.bailId, []);
    loyersParBail.get(l.bailId).push(l);
  }

  const paiementsParBail = new Map();
  for (const p of paiements) {
    if (!paiementsParBail.has(p.bailId)) paiementsParBail.set(p.bailId, []);
    paiementsParBail.get(p.bailId).push(p);
  }

  const bauxParId = new Map(baux.map((b) => [b.id, b]));
  const lotsParId = new Map(lots.map((l) => [l.id, l]));
  const immeublesParId = new Map(immeubles.map((i) => [i.id, i]));
  const locatairesParId = new Map(locataires.map((l) => [l.id, l]));
  const paiementsParId = new Map(paiements.map((p) => [p.id, p]));
  const quittancesParPaiement = new Map(quittances.map((q) => [q.paiementId, q]));

  const bailEstActif = (bail, ref = new Date()) => {
    if (!bail) return false;
    const auj = ref.toISOString().slice(0, 10);
    if (bail.dateDebut > auj) return false;
    if (bail.dateFin && bail.dateFin < auj) return false;
    return true;
  };

  /** Loyers d'un bail, du plus ancien au plus récent. */
  const loyersDe = (bailId) =>
    [...(loyersParBail.get(bailId) || [])].sort((a, b) => comparePeriode(a.periode, b.periode));

  /** Paiements d'un bail, du plus récent au plus ancien. */
  const paiementsDe = (bailId) =>
    [...(paiementsParBail.get(bailId) || [])].sort((a, b) => b.date.localeCompare(a.date));

  /** Loyers non soldés, du plus ancien au plus récent — la file des impayés. */
  const impayesDe = (bailId) =>
    loyersDe(bailId).filter((l) => l.statut !== "paye");

  /** Reste dû sur un loyer, compte tenu des paiements déjà alloués. */
  const resteDuLoyer = (loyerId) => {
    const loyer = loyers.find((l) => l.id === loyerId);
    if (!loyer) return 0;
    const paye = paiements.reduce((s, p) => {
      const a = (p.allocations || []).find((x) => x.loyerId === loyerId);
      return s + (a ? a.montant : 0);
    }, 0);
    return Math.max(0, loyer.montantDu - paye);
  };

  /**
   * Solde d'un bail : total dû moins total encaissé.
   * Positif = le locataire doit de l'argent, négatif = il a un crédit.
   */
  const soldeBail = (bailId) => {
    const ls = loyersParBail.get(bailId) || [];
    const totalDu = ls.reduce((s, l) => s + l.montantDu, 0);
    const totalPaye = (paiementsParBail.get(bailId) || []).reduce((s, p) => s + p.montant, 0);
    return totalDu - totalPaye;
  };

  const bailEstAJour = (bailId) => impayesDe(bailId).length === 0;

  /** Nombre de mois d'impayés consécutifs, du plus ancien impayé. */
  const moisDImpayes = (bailId) => impayesDe(bailId).length;

  /** Le lot est-il occupé aujourd'hui ? Dérivé des baux actifs. */
  const lotOccupe = (lotId, ref = new Date()) =>
    baux.some((b) => b.lotId === lotId && bailEstActif(b, ref));

  /** Le bail en cours d'un lot, s'il y en a un. */
  const bailActifDuLot = (lotId, ref = new Date()) =>
    baux.find((b) => b.lotId === lotId && bailEstActif(b, ref)) || null;

  /** Baux d'un lot, du plus récent au plus ancien. */
  const bauxDULot = (lotId) =>
    baux
      .filter((b) => b.lotId === lotId)
      .sort((a, b) => b.dateDebut.localeCompare(a.dateDebut));

  // Les baux d'un locataire, du plus récent au plus ancien. Sert aussi à
  // résoudre un identifiant de locataire en bail dans la page Compte.
  const bauxDuLocataire = (locataireId) =>
    baux
      .filter((b) => b.locataireId === locataireId)
      .sort((a, b) => b.dateDebut.localeCompare(a.dateDebut));

  const bailCourantDuLocataire = (locataireId, ref = new Date()) =>
    bauxDuLocataire(locataireId).find((b) => bailEstActif(b, ref)) || null;

  // --- Immeubles ---

  const lotsDImmeuble = (immeubleId) => lots.filter((l) => l.immeubleId === immeubleId);

  /**
   * Compte de résultat d'un immeuble : ce que les baux actifs ont produit,
   * ce que l'immeuble a coûté, et le solde.
   */
  const bilanImmeuble = (immeubleId, { depuis = null, jusquA = null } = {}) => {
    const lotIds = new Set(lotsDImmeuble(immeubleId).map((l) => l.id));
    const bailIds = new Set(baux.filter((b) => lotIds.has(b.lotId)).map((b) => b.id));

    let recettes = 0;
    let attendu = 0;
    for (const p of paiements) {
      if (!bailIds.has(p.bailId)) continue;
      if (depuis && p.date < depuis) continue;
      if (jusquA && p.date > jusquA) continue;
      recettes += p.montant;
    }
    for (const l of loyers) {
      if (!bailIds.has(l.bailId)) continue;
      if (depuis && `${l.periode}-01` < depuis) continue;
      if (jusquA && `${l.periode}-28` > jusquA) continue;
      attendu += l.montantDu;
    }

    const couts = depenses
      .filter((d) => d.immeubleId === immeubleId)
      .filter((d) => (!depuis || d.date >= depuis) && (!jusquA || d.date <= jusquA));
    const totalCouts = couts.reduce((s, d) => s + d.montant, 0);

    const listeLots = lotsDImmeuble(immeubleId);
    return {
      recettes,
      attendu,
      dette: Math.max(0, attendu - recettes),
      depenses: totalCouts,
      resultat: recettes - totalCouts,
      nbLots: listeLots.length,
      nbLotsOccupes: listeLots.filter((l) => lotOccupe(l.id)).length,
      nbLocataires: baux.filter((b) => lotIds.has(b.lotId) && bailEstActif(b)).length,
    };
  };

  // --- Agrégats globaux ---

  const impayesGlobaux = () =>
    baux
      .filter((b) => bailEstActif(b))
      .map((b) => ({
        bail: b,
        locataire: locatairesParId.get(b.locataireId) || null,
        lot: lotsParId.get(b.lotId) || null,
        immeuble: (() => {
          const l = lotsParId.get(b.lotId);
          return l ? immeublesParId.get(l.immeubleId) || null : null;
        })(),
        solde: soldeBail(b.id),
        mois: moisDImpayes(b.id),
      }))
      .filter((x) => x.solde > 0)
      .sort((a, b) => b.solde - a.solde);

  /** Soldes de tous les baux, indexés par bailId. */
  const soldesParBail = new Map(baux.map((b) => [b.id, soldeBail(b.id)]));

  /** Baux actifs dont le locataire est à jour. */
  const solvable = () =>
    baux.filter((b) => bailEstActif(b) && impayesDe(b.id).length === 0);

  const cautionTotale = () =>
    baux
      .filter((b) => b.cautionStatut === "deposee")
      .reduce((s, b) => s + (b.cautionVersee || 0), 0);

  // --- Journal mensuel ---

  /** Recettes, dépenses et solde d'une période au format "2026-10". */
  const journalPeriode = (periode) => {
    const recettes = paiements.filter((p) => p.date.slice(0, 7) === periode);
    const couts = depenses.filter((d) => d.date.slice(0, 7) === periode);
    const totalRecettes = recettes.reduce((s, p) => s + p.montant, 0);
    const totalCouts = couts.reduce((s, d) => s + d.montant, 0);
    return {
      periode,
      recettes,
      depenses: couts,
      totalRecettes,
      totalCouts,
      solde: totalRecettes - totalCouts,
    };
  };

  /** Séries mensuelles pour les graphiques, sur les N derniers mois. */
  const serieMensuelle = (nombreMois = 12) => {
    const series = [];
    let cur = periodeCourante();
    for (let i = nombreMois - 1; i >= 0; i--) {
      const d = new Date(Number(cur.slice(0, 4)), Number(cur.slice(5, 7)) - 1 - i, 1);
      const p = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const j = journalPeriode(p);
      series.push({ periode: p, recettes: j.totalRecettes, depenses: j.totalCouts, solde: j.solde });
    }
    return series;
  };

  /** Taux de remplissage : lots occupés sur lots totals. */
  const tauxOccupation = () => {
    if (!lots.length) return 0;
    return lots.filter((l) => lotOccupe(l.id)).length / lots.length;
  };

  return {
    // Accès directs
    baux,
    bauxParId,
    lotsParId,
    immeublesParId,
    locatairesParId,
    paiementsParId,
    quittancesParPaiement,
    soldesParBail,

    // Fonctions de lecture
    bailEstActif,
    loyersDe,
    paiementsDe,
    impayesDe,
    resteDuLoyer,
    soldeBail,
    bailEstAJour,
    moisDImpayes,
    lotOccupe,
    bailActifDuLot,
    bauxDULot,
    bauxDuLocataire,
    bailCourantDuLocataire,
    lotsDImmeuble,
    bilanImmeuble,
    impayesGlobaux,
    solvable,
    cautionTotale,
    journalPeriode,
    serieMensuelle,
    tauxOccupation,
  };
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp doit être utilisé dans AppProvider");
  return ctx;
}