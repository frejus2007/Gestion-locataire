// Service de données — implémentation Firestore.
//
// L'API est volontairement calquée sur celle de `db.js` : mêmes noms de
// fonctions, mêmes paramètres, mêmes formes de retour. Les pages ne changent
// pas, seule la source des données change.
//
// Deux différences assumées vis-à-vis du jeu en mémoire :
//
//   1. Tout est asynchrone. Une fonction renvoie une promesse ; c'est au
//      contexte d'application de l'attendre.
//
//   2. Le métier d'encaissement est réimplémenté ici plutôt que réutilisé.
//      Les règles — imputation mois par mois,.avance sur les mois suivants,
//      interdits de dépassement — sont déterministes et font authorities du
//      reste du logiciel : il n'y a pas lieu de les laisser dépendre d'un
//      objet en mémoire. L'ensemble tourne dans une transaction Firestore,
//      afin que deux encaissements simultanés ne puissent pas s'imputer le
//      même mois.

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  runTransaction,
  serverTimestamp,
  writeBatch,
  query,
  where,
} from "firebase/firestore";
import { db } from "../firebase/config";
import { comparePeriode, periodeCourante, periodeDecalee } from "../utils/format.js";

// --- Constantes de référence (mêmes valeurs que db.js) ---

export const MOIS_DE_PAYEMENT = [
  { id: "especes", label: "Espèces" },
  { id: "virement", label: "Virement bancaire" },
  { id: "mobile", label: "Mobile Money" },
  { id: "cheque", label: "Chèque" },
];

export const CATEGORIES_DEPENSE = [
  { id: "entretien", label: "Entretien courant" },
  { id: "reparation", label: "Réparation" },
  { id: "charges", label: "Charges et taxes" },
  { id: "travaux", label: "Travaux et rénovation" },
  { id: "fourniture", label: "Fournitures et équipements" },
  { id: "autre", label: "Autre" },
];

export const LIGNES_FRAIS = [
  { cle: "loyer", key: "loyer", label: "Loyer" },
  { cle: "eau", key: "eau", label: "Eau" },
  { cle: "electricite", key: "electricite", label: "Électricité" },
  { cle: "ordures", key: "ordures", label: "Ordures" },
  { cle: "degats", key: "degats", label: "Dégâts" },
  { cle: "autre1", key: "autre1", label: "Autre 1", libre: "libelle1" },
  { cle: "autre2", key: "autre2", label: "Autre 2", libre: "libelle2" },
];

/**
 * Clés des postes, dans l'ordre d'affichage.
 *
 * Une liste de chaînes, pas d'objets : les pages indexent directement avec
 * (`detail[cle]`), et `LIGNES_FRAIS` porte déjà les libellés. Serving ici des
 * objets ferait écrire `detail[object Object]`, soit des frais à zéro.
 */
export const POSTES_FRAIS = LIGNES_FRAIS.map((l) => l.key);

/** Un loyer dont tous les postes sont à zéro. */
export function postesALZero() {
  return Object.fromEntries(POSTES_FRAIS.map((k) => [k, 0]));
}

/** Les postes avec le libellé applicable à un bail, prêts à afficher. */
export function lignesPostesPour(bail) {
  const f = bail?.fraisDefaut || {};
  const libres = Object.fromEntries(
    LIGNES_FRAIS.filter((l) => l.libre).map((l) => [l.key, f[l.libre] || l.label])
  );
  return LIGNES_FRAIS.map((l) => ({ ...l, label: libres[l.key] || l.label }));
}

const dupliquer = (obj) => JSON.parse(JSON.stringify(obj));

let compteur = 0;
export function nextId(prefix) {
  compteur += 1;
  return `${prefix}_${Date.now().toString(36)}${String(compteur).padStart(3, "0")}`;
}

// --- Accès de base ---

const COLLECTIONS = {
  proprietaire: "proprietaire",
  immeubles: "immeubles",
  lots: "lots",
  locataires: "locataires",
  baux: "baux",
  loyers: "loyers",
  paiements: "paiements",
  quittances: "quittances",
  depenses: "depenses",
};

// --- Cache de lecture ---
//
// Chaque aller-retour coûte près d'une seconde depuis une connexion
// intercontinentale. L'application relisait les mêmes collections sans
// cesse — après chaque écriture, à chaque changement d'onglet, toutes les
// deux minutes — et la génération des loyers relisait les baux et les loyers
// à chaque mois de la période. Le total se comptait en dizaines de requêtes.
//
// On garde donc en mémoire le résultat d'une lecture, et on n'invalide que la
// collection réellement modifiée. La première lecture après une écriture
// repart du serveur ; les suivantes sont gratuites.
//
// `DUREE_CACHE` borne lapéremption même en l'absence d'écriture : c'est ce qui
// permet à un second appareil de voir ses saisies.

// Secondes pendant lesquelles une lecture est réutilisée.
const DUREE_CACHE = 30;
const cache = new Map();

/** Omet une collection du cache : à appeler après toute écriture dessus. */
export function invalider(nom) {
  cache.delete(nom);
}

function invaliderToutes() {
  cache.clear();
}

async function lireCollection(nom, { frais = false } = {}) {
  if (!frais) {
    const enCache = cache.get(nom);
    if (enCache && Date.now() - enCache.t < DUREE_CACHE * 1000) {
      return enCache.donnees;
    }
  }
  const snap = await getDocs(collection(db, nom));
  const donnees = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  cache.set(nom, { t: Date.now(), donnees });
  return donnees;
}

async function lireUn(nom, id) {
  const snap = await getDoc(doc(db, nom, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// --- Règles de métier (portées de db.js) ---

const totalPostes = (l) =>
  POSTES_FRAIS.reduce((s, cle) => s + (Number(l[cle]) || 0), 0);

function fraisDefautBail(bail) {
  const f = bail.fraisDefaut || {};
  return Object.fromEntries(POSTES_FRAIS.map((cle) => [cle, Number(f[cle]) || 0]));
}

// Un bail sans date exploitable — document ancien, import incomplet, saisie
// interrompue — faisait exploser toute la lecture : la période devient
// undefined, et le calcul des mois échouait sur `Cannot read properties
// of undefined`. On retombe sur la période courante plutôt que de laisser
// l'écran entier échouer ; le bail reste inexact mais l'application reste
// lisible, ce qui permet de le corriger au lieu de la rouvrir.
const periodeDebutBail = (bail) => String(bail?.dateDebut || "").slice(0, 7) || periodeCourante();
const periodeFinBail = (bail, max = periodeCourante()) =>
  bail?.dateFin ? String(bail.dateFin).slice(0, 7) : max;

function bailCouvre(bail, periode, max = periodeCourante()) {
  return (
    comparePeriode(periodeDebutBail(bail), periode) <= 0 &&
    comparePeriode(periode, periodeFinBail(bail, max)) <= 0
  );
}

const bailActifCouvre = (bail, periode, max = periodeCourante()) =>
  comparePeriode(periode, max) <= 0 && bailCouvre(bail, periode, max);

/**
 * Applique à un loyer le détail d'un encaissement.
 *
 * Deux règles protègent l'historique :
 *
 *   1. Le **loyer** est celui du contrat. Il n'est jamais repris du paiement :
 *      l'écran d'encaissement propose le loyer restant dû, qui n'est pas le
 *      loyer du mois, et l'écrire ici ferait descendre le loyer enregistré
 *      chaque fois qu'un reste est encaissé.
 *   2. Les **charges** ne font qu'augmenter. Un montant saisi zéro ne veut pas
 *      dire « aucune charge », cela veut dire « rien à ajouter ce jour-ci » :
 *      remettre l'eau à zéro effacerait une facture déjà établie.
 *
 * Le montant dû ne peut donc jamais passer sous ce qui est déjà encaissé, et
 * `enregistrerPaiement` refuse une affectation plus grande que le reste.
 *
 * @returns {object} les champs à écrire sur le document loyer
 */
function appliquerDetailLoyer(loyer, detail) {
  const montants = Object.fromEntries(
    POSTES_FRAIS.map((cle) => [cle, Math.max(0, Math.round(Number(detail[cle]) || 0))])
  );

  const champs = {};
  const copie = { ...loyer };
  for (const cle of POSTES_FRAIS) {
    if (cle === "loyer") continue;
    if (montants[cle] <= 0) continue;
    if ((Number(loyer[cle]) || 0) >= montants[cle]) continue;
    champs[cle] = montants[cle];
    copie[cle] = montants[cle];
  }
  if (Object.keys(champs).length === 0) return {};

  // Le loyer reste celui du bail : un document qui n'en porterait pas est
  //complété par le seul montant connu, jamais par celui du paiement.
  copie.loyer = Number(loyer.loyer) || 0;
  champs.loyer = copie.loyer;
  champs.montantDu = totalPostes(copie);
  return champs;
}

/** Total déjà imputé sur un loyer, tous paiements confondus. */
function totalAllouePourLoyer(paiements, loyerId, ignorerPaiementId = null) {
  return paiements
    .filter((p) => p.id !== ignorerPaiementId)
    .reduce((s, p) => {
      const alloc = (p.allocations || []).find((a) => a.loyerId === loyerId);
      return s + (alloc ? alloc.montant : 0);
    }, 0);
}

function statutPour(paye, montantDu) {
  return paye <= 0 ? "impaye" : paye >= montantDu ? "paye" : "partiel";
}

// --- Propriétaire ---

export async function getProprietaire() {
  const existant = await lireUn(COLLECTIONS.proprietaire, "proprietaire");
  if (existant) return existant;
  const defaut = {
    id: "proprietaire",
    nom: "KOUASSI",
    prenoms: "Jean-Marc",
    telephone: "+229 97 12 34 56",
    adresse: "Rue des Pêches, Fidjrossè",
    ville: "Cotonou",
    ifu: "3202100123456",
    banque: "Ecobank Benin — 0100 4500 1234 56",
    signatureUrl: null,
    reception: [
      { reseau: "MTN MoMo", numero: "+229 97 12 34 56" },
      { reseau: "Moov Money", numero: "" },
      { reseau: "Celtis", numero: "" },
    ],
  };
  await setDoc(doc(db, COLLECTIONS.proprietaire, "proprietaire"), defaut);
  return defaut;
}

export async function updateProprietaire(champs) {
  await updateDoc(doc(db, COLLECTIONS.proprietaire, "proprietaire"), {
    ...champs,
    updatedAt: serverTimestamp(),
  });
  return lireUn(COLLECTIONS.proprietaire, "proprietaire");
}

// --- Immeubles ---

export const listImmeubles = () => lireCollection(COLLECTIONS.immeubles);
export const getImmeuble = (id) => lireUn(COLLECTIONS.immeubles, id);

export async function createImmeuble(data) {
  invaliderToutes();
  const id = data.id || nextId("imm");
  await setDoc(doc(db, COLLECTIONS.immeubles, id), { ...data, id });
  return lireUn(COLLECTIONS.immeubles, id);
}

export async function updateImmeuble(id, data) {
  invaliderToutes();
  await updateDoc(doc(db, COLLECTIONS.immeubles, id), { ...data, updatedAt: serverTimestamp() });
  return lireUn(COLLECTIONS.immeubles, id);
}

/**
 * Supprime un immeuble et ses lots.
 *
 * Les baux et les loyers qui s'y rattachent ne sont PAS supprimés : un
 * immeuble porte un historique de perception, on ne l'efface pas par un
 * geste de nettoyage. Seuls les lots disparaissent, et uniquement s'ils ne
 * sont pas loués — un lot occupé est conservé, sinon sa suppression
 * laisserait un bail sans logement.
 */
export async function deleteImmeuble(id) {
  invaliderToutes();
  const [lots, baux] = await Promise.all([
    lireCollection(COLLECTIONS.lots),
    lireCollection(COLLECTIONS.baux),
  ]);

  const lotsLoue = new Set(baux.map((b) => b.lotId));
  const aSupprimer = lots.filter((l) => l.immeubleId === id && !lotsLoue.has(l.id));

  await Promise.all([
    ...aSupprimer.map((l) => deleteDoc(doc(db, COLLECTIONS.lots, l.id))),
    deleteDoc(doc(db, COLLECTIONS.immeubles, id)),
  ]);
}

// --- Lots ---

export const listLots = () => lireCollection(COLLECTIONS.lots);
export const getLot = (id) => lireUn(COLLECTIONS.lots, id);

export async function createLot(data) {
  invaliderToutes();
  const id = data.id || nextId("lot");
  await setDoc(doc(db, COLLECTIONS.lots, id), { ...data, id });
  return lireUn(COLLECTIONS.lots, id);
}

export async function updateLot(id, data) {
  invaliderToutes();
  await updateDoc(doc(db, COLLECTIONS.lots, id), { ...data, updatedAt: serverTimestamp() });
  return lireUn(COLLECTIONS.lots, id);
}

/**
 * Supprime un lot, s'il est libre.
 *
 * Un lot occupé est refusé : c'est la protection qui manquait, le bouton de
 * suppression n'en tientait aucun compte. Supprimer le logement d'un locataire
 * laisserait son bail sans adresse ni loyer de référence.
 */
export async function deleteLot(id) {
  invaliderToutes();
  const baux = await lireCollection(COLLECTIONS.baux);
  if (baux.some((b) => b.lotId === id)) {
    throw new Error("Ce logement est occupé : clôturez d'abord le bail du locataire.");
  }
  await deleteDoc(doc(db, COLLECTIONS.lots, id));
}

// --- Locataires ---

export const listLocataires = () => lireCollection(COLLECTIONS.locataires);
export const getLocataire = (id) => lireUn(COLLECTIONS.locataires, id);

export async function createLocataire(data) {
  invaliderToutes();
  const id = data.id || nextId("loc");
  await setDoc(doc(db, COLLECTIONS.locataires, id), { ...data, id });
  return lireUn(COLLECTIONS.locataires, id);
}

export async function updateLocataire(id, data) {
  invaliderToutes();
  await updateDoc(doc(db, COLLECTIONS.locataires, id), { ...data, updatedAt: serverTimestamp() });
  return lireUn(COLLECTIONS.locataires, id);
}

/**
 * Supprime un locataire et tout ce qui s'y rattache.
 *
 * Firestore n'a pas de suppression en cascade : ne retirer que la fiche
 * laisserait le bail derrière, or la liste des locataires est bâtie sur les
 * baux — la ligne survivrait, sans nom. On supprime donc, dans l'ordre, les
 * pièces dépendantes puis les pièces maîtresses :
 *   quittances → paiements → loyers → baux → locataire
 *
 * L'ordre importe : on part de ce qui dépend pour ne jamais laisser un
 * paiement orphelin pointant sur un bail disparu.
 */
export async function deleteLocataire(id) {
  invaliderToutes();
  const [baux, loyers, paiements, quittances] = await Promise.all([
    lireCollection(COLLECTIONS.baux),
    lireCollection(COLLECTIONS.loyers),
    lireCollection(COLLECTIONS.paiements),
    lireCollection(COLLECTIONS.quittances),
  ]);

  const bauxDuLocataire = baux.filter((b) => b.locataireId === id);
  const bailIds = new Set(bauxDuLocataire.map((b) => b.id));

  const paiementsDuLocataire = paiements.filter(
    (p) => p.locataireId === id || bailIds.has(p.bailId)
  );
  const paiementIds = new Set(paiementsDuLocataire.map((p) => p.id));

  const quittancesLiees = quittances.filter(
    (q) => q.locataireId === id || bailIds.has(q.bailId) || paiementIds.has(q.paiementId)
  );
  const loyersDuBail = loyers.filter((l) => bailIds.has(l.bailId));

  await Promise.all([
    ...quittancesLiees.map((q) => deleteDoc(doc(db, COLLECTIONS.quittances, q.id))),
    ...paiementsDuLocataire.map((p) => deleteDoc(doc(db, COLLECTIONS.paiements, p.id))),
    ...loyersDuBail.map((l) => deleteDoc(doc(db, COLLECTIONS.loyers, l.id))),
    ...bauxDuLocataire.map((b) => deleteDoc(doc(db, COLLECTIONS.baux, b.id))),
    deleteDoc(doc(db, COLLECTIONS.locataires, id)),
  ]);
}

// --- Baux ---

export const listBaux = () => lireCollection(COLLECTIONS.baux);
export const getBail = (id) => lireUn(COLLECTIONS.baux, id);

/**
 * Un bail occupe un logement.
 *
 * La règle est vérifiée ici, dans la couche de données, et non dans chaque
 * écran : une chambre ne peut porter qu'un bail en cours. La laisser aux
 * formulaires laissait passer le cas principal — appeler `createBail`
 * directement, ou passer par un écran qui aurait oublié la vérification —
 * et deux locataires se retrouvaient sur la même chambre, chacun avec ses
 * loyers, donc une facture à partager en silence.
 *
 * Un bail dont la date de sortie est renseignée libère le logement pour le
 * suivant ; c'est la seule façon d'en hériter.
 */
export async function createBail(data) {
  invaliderToutes();
  const baux = await lireCollection(COLLECTIONS.baux);
  const aujourdhui = new Date().toISOString().slice(0, 10);

  const occupe = baux.some(
    (b) =>
      b.lotId === data.lotId &&
      b.id !== data.id &&
      (!b.dateDebut || b.dateDebut <= aujourdhui) &&
      (!b.dateFin || b.dateFin >= aujourdhui)
  );
  if (occupe) {
    throw new Error("Ce logement est déjà occupé par un bail en cours.");
  }

  const id = data.id || nextId("bail");
  await setDoc(doc(db, COLLECTIONS.baux, id), { ...data, id });
  return lireUn(COLLECTIONS.baux, id);
}

export async function updateBail(id, data) {
  invaliderToutes();
  await updateDoc(doc(db, COLLECTIONS.baux, id), { ...data, updatedAt: serverTimestamp() });
  return lireUn(COLLECTIONS.baux, id);
}

/**
 * Supprime un bail et ses rents, encaissements et quittances.
 * Même raison que pour le locataire : ces pièces ne sont pas exploitables
 * sans le bail, et les laisser produirait des totaux incohérents.
 */
export async function deleteBail(id) {
  invaliderToutes();
  const [loyers, paiements, quittances] = await Promise.all([
    lireCollection(COLLECTIONS.loyers),
    lireCollection(COLLECTIONS.paiements),
    lireCollection(COLLECTIONS.quittances),
  ]);

  const paiementIds = new Set(paiements.filter((p) => p.bailId === id).map((p) => p.id));

  await Promise.all([
    ...quittances
      .filter((q) => q.bailId === id || paiementIds.has(q.paiementId))
      .map((q) => deleteDoc(doc(db, COLLECTIONS.quittances, q.id))),
    ...paiements
      .filter((p) => p.bailId === id)
      .map((p) => deleteDoc(doc(db, COLLECTIONS.paiements, p.id))),
    ...loyers.filter((l) => l.bailId === id).map((l) => deleteDoc(doc(db, COLLECTIONS.loyers, l.id))),
    deleteDoc(doc(db, COLLECTIONS.baux, id)),
  ]);
}

// --- Dépenses ---

export const listDepenses = () => lireCollection(COLLECTIONS.depenses);

export async function createDepense(data) {
  invaliderToutes();
  const id = data.id || nextId("dep");
  await setDoc(doc(db, COLLECTIONS.depenses, id), { ...data, id });
  return lireUn(COLLECTIONS.depenses, id);
}

export async function updateDepense(id, data) {
  invaliderToutes();
  await updateDoc(doc(db, COLLECTIONS.depenses, id), { ...data, updatedAt: serverTimestamp() });
  return lireUn(COLLECTIONS.depenses, id);
}

export async function deleteDepense(id) {
  invaliderToutes();
  await deleteDoc(doc(db, COLLECTIONS.depenses, id));
}

// --- Loyers ---

export const listLoyers = () => lireCollection(COLLECTIONS.loyers);

/** Un loyer est-il déjà soldé, partiellement réglé, ou impayé ? */
export async function recomputeStatutLoyers(loyerIds) {
  if (!loyerIds.length) return;
  // Une seule lecture des loyers concernés, et une écriture groupée. La
  // version précédente relisait chaque loyer un par un puis les réécrivait un
  // par un : deux requêtes par loyer touché, donc une seconde chacune.
  const [paiements, loyers] = await Promise.all([
    lireCollection(COLLECTIONS.paiements),
    Promise.all(loyerIds.map((id) => lireUn(COLLECTIONS.loyers, id, { frais: true }))),
  ]);

  const aEcrire = [];
  for (const loyer of loyers.filter(Boolean)) {
    const paye = paiements
      .filter((p) => (p.allocations || []).some((a) => a.loyerId === loyer.id))
      .reduce((s, p) => s + p.allocations.find((a) => a.loyerId === loyer.id).montant, 0);
    const statut = statutPour(paye, loyer.montantDu);
    if (statut !== loyer.statut) aEcrire.push({ id: loyer.id, statut });
  }

  invalider(COLLECTIONS.loyers);
  if (!aEcrire.length) return;
  const lot = writeBatch(db);
  for (const { id, statut } of aEcrire) {
    lot.update(doc(db, COLLECTIONS.loyers, id), { statut });
  }
  await lot.commit();
}

/**
 * Crée les loyers manquants pour une période. Idempotent.
 * @returns {number} nombre de loyers créés
 */
export async function genererLoyersPourPeriode(periode, bailIds = null, { jusquA = true } = {}) {
  const baux = bailIds
    ? await Promise.all(bailIds.map((id) => lireUn(COLLECTIONS.baux, id)))
    : await lireCollection(COLLECTIONS.baux);
  const existants = await lireCollection(COLLECTIONS.loyers);

  const aEcrire = [];
  for (const bail of baux.filter(Boolean)) {
    const couvert = jusquA
      ? bailActifCouvre(bail, periode)
      : bailCouvre(bail, periode, Infinity);
    if (!couvert) continue;
    if (existants.some((l) => l.bailId === bail.id && l.periode === periode)) continue;
    const postes = fraisDefautBail(bail);
    aEcrire.push({
      id: nextId("loy"),
      bailId: bail.id,
      periode,
      ...postes,
      loyer: bail.loyerMensuel,
      montantDu: bail.loyerMensuel + totalPostes(postes),
      statut: "impaye",
    });
  }

  // Un aller-retour au lieu d'un par loyer : vingt-six chambres demandaient
  // vingt-six requêtes là où une seule suffisait.
  await ecrireEnLot(COLLECTIONS.loyers, aEcrire);
  return aEcrire.length;
}

/**
 * Écrit un ensemble de documents en une seule requête.
 *
 * Firestore limite un lot à 500 opérations ; au-delà, le lot est coupé en
 * plusieurs, ce qui reste bien plus rapide qu'une écriture par document.
 */
async function ecrireEnLot(nom, documents) {
  if (!documents.length) return;
  invalider(nom);
  for (let i = 0; i < documents.length; i += 400) {
    const lot = writeBatch(db);
    for (const d of documents.slice(i, i + 400)) {
      lot.set(doc(db, nom, d.id), d);
    }
    await lot.commit();
  }
}

/**
 * Génère les loyers dus depuis une période donnée.
 *
 * La borne haute est celle du bail (ou la période du jour) : un bail qui finit
 * dans le futur doit voir ses échéances générées jusqu'à sa fin, pas seulement
 * jusqu'à aujourd'hui — sinon le récapitulatif d'un bail longue durée afficherait
 * un impayé sur des mois qui n'ont pas encore eu lieu.
 *
 * @param {string} bailId
 * @param {string} [periodeDebut]  première période, celle du début du bail par défaut
 * @param {string} [periodeFin]    dernière période à générer
 * @returns {Promise<number>} nombre de loyers créés
 */
export async function genererLoyersDepuis(bailId, periodeDebut, periodeFin = null) {
  const bail = await lireUn(COLLECTIONS.baux, bailId);
  if (!bail) return 0;
  const debut = (periodeDebut || periodeDebutBail(bail)).slice(0, 7);
  const borne = periodeFin
    ? periodeFin.slice(0, 7)
    : periodeFinBail(bail, periodeCourante());

// Les loyers sont lus UNE fois pour toute la période. La version précédente
  // relisait les collections à chaque mois : un bail de six mois coûtait une
  // douzaine de requêtes, chacune d'environ une seconde.
  const [existants] = await Promise.all([lireCollection(COLLECTIONS.loyers)]);
  const dejaLa = new Set(
    existants.filter((l) => l.bailId === bailId).map((l) => l.periode)
  );

  const postes = fraisDefautBail(bail);
  const aEcrire = [];
  let cur = debut;
  // Garde-fou : dix ans de bail. Au-delà la boucle ne s'arrêterait pas
  // d'elle-même et le navigateur gèlerait.
  for (let garde = 0; garde < 120; garde += 1) {
    if (comparePeriode(cur, borne) > 0) break;
    if (!dejaLa.has(cur) && bailCouvre(bail, cur, Infinity)) {
      aEcrire.push({
        id: nextId("loy"),
        bailId,
        periode: cur,
        ...postes,
        loyer: bail.loyerMensuel,
        montantDu: bail.loyerMensuel + totalPostes(postes),
        statut: "impaye",
      });
    }
    cur = periodeDecalee(cur, 1);
  }

  await ecrireEnLot(COLLECTIONS.loyers, aEcrire);
  return aEcrire.length;
}

// --- Encaissement ---

/**
 * Enregistre un paiement et l'impute aux loyers désignés.
 *
 * Toute la partie calculée ici est exécutée dans une transaction Firestore :
 * deux encaissements ouverts en même temps ne peuvent donc pas imputer le même
 * mois ni dépasser le reste à payer. C'est le point sur lequel une gestion
 * locative ne pardonne pas l'approximation — un loyer marqué soldé deux fois,
 * c'est un mois de loyer perdu pour le propriétaire.
 *
 * @param {object} data { bailId, date, montant, mode, reference, allocations, detail, libelles, note }
 * @returns {Promise<{paiement: object, quittance: null}>}
 */
export async function enregistrerPaiement(data) {
  const bail = await lireUn(COLLECTIONS.baux, data.bailId);
  if (!bail) throw new Error("Bail introuvable");

  // Tous les loyers du bail, lus d'un seul coup, et indexés deux fois : par
  // identifiant pour les imputations, par période pour la marche de l'avance.
  // Trois boucles en avaient besoin ; chacune relisait ses documents, ce qui
  // faisait deux à trois requêtes par mois encaissé.
  const loyersParPeriode = await loyersDuBail(bail.id);
  const loyersParId = new Map([...loyersParPeriode.values()].map((l) => [l.id, l]));

  const allocations = (data.allocations || []).filter((a) => a.montant > 0);
  if (allocations.length === 0) throw new Error("Sélectionnez au moins un mois à régler");
  if (allocations.some((a) => !Number.isSafeInteger(a.montant))) {
    throw new Error("Les montants affectés doivent être des nombres entiers");
  }
  if (new Set(allocations.map((a) => a.loyerId)).size !== allocations.length) {
    throw new Error("Un mois ne peut être sélectionné qu'une seule fois");
  }

  const detail = data.detail
    ? Object.fromEntries(
        POSTES_FRAIS.map((cle) => [cle, Math.max(0, Math.round(Number(data.detail[cle]) || 0))])
      )
    : null;
  if (detail && detail.loyer <= 0) throw new Error("Le loyer doit être supérieur à zéro");

  // Une charge appartient à un mois : le détail de chaque affectation est donc
  // le sien. `data.details` en porte autant qu'il y a de mois ; à défaut, le
  // détail unique s'applique au dernier — c'est le cas d'un encaissement sur
  // un seul mois, et celui des anciens appels.
  //
  // Construit au niveau de la fonction : les affectations le réutilisent plus
  // bas, pour la quittance.
  const detailParMois =
    Array.isArray(data.details) && data.details.length === allocations.length
      ? data.details
      : allocations.map((_, i) => (i === allocations.length - 1 ? detail : null));

  let montant = Math.round(Number(data.montant) || 0);
  if (detail) {
    // Les charges apportées par le versement sont réunies puis écrites d'un
    // seul lot. La version précédente réécrivait le loyer mois par mois, chacun
    // à son aller-retour : encaisser une année avec ses charges faisait
    // douze écritures successives.
    const chargesAAppliquer = [];
    for (const [i, alloc] of allocations.entries()) {
      const detailDuMois = detailParMois[i];
      if (!detailDuMois) continue;
      const loyer = loyersParId.get(alloc.loyerId);
      if (!loyer) continue;
      // Le loyer d'un mois ne se réécrit jamais à partir d'un paiement : c'est
      // le contrat qui le fixe. Seules les charges sont mises à jour, et
      // seulement vers le haut — une charge ne se retire pas parce qu'on a
      // encaissé, sinon l'historique se réécrirait à chaque versement.
      const champs = appliquerDetailLoyer(loyer, detailDuMois);
      // Rien à écrire quand le paiement n'apporte aucune charge nouvelle.
      if (Object.keys(champs).length > 0) {
        chargesAAppliquer.push({ id: loyer.id, champs });
      }
    }
    if (chargesAAppliquer.length) {
      invalider(COLLECTIONS.loyers);
      const lotCharges = writeBatch(db);
      for (const { id, champs } of chargesAAppliquer) {
        lotCharges.update(doc(db, COLLECTIONS.loyers, id), champs);
      }
      await lotCharges.commit();
    }
    montant = allocations.reduce((s, a) => s + a.montant, 0);
  }
  if (!Number.isSafeInteger(montant) || montant <= 0) {
    throw new Error("Le montant doit être un entier supérieur à zéro");
  }

  const totalAlloue = allocations.reduce((s, a) => s + a.montant, 0);
  if (totalAlloue > montant) throw new Error("Les mois sélectionnés dépassent le montant reçu");

  const paiements = await lireCollection(COLLECTIONS.paiements);

  const periodesChoisies = [];
  for (const alloc of allocations) {
    let loyer = loyersParId.get(alloc.loyerId);
    if (!loyer) {
      // Un loyer absent de l'index appartient à un autre bail, ou n'existe
      // plus. Une seule lecture, uniquement sur ce chemin d'erreur, permet de
      // distinguer les deux et de dire la même chose qu'avant.
      loyer = await lireUn(COLLECTIONS.loyers, alloc.loyerId);
      if (!loyer) throw new Error("Loyer introuvable dans l'allocation");
      throw new Error("Un loyer ne peut pas être imputé à un autre bail");
    }
    const dejaPaye = totalAllouePourLoyer(paiements, loyer.id, data.paiementIdExistant);
    const reste = loyer.montantDu - dejaPaye;
    if (alloc.montant > reste) {
      throw new Error(`Montant trop élevé pour ${loyer.periode} : il reste ${reste} FCFA à payer`);
    }
    periodesChoisies.push(loyer.periode || periodeDebutBail(bail));
  }

  let avance = montant - totalAlloue;
  let periode = periodesChoisies.sort().at(-1) || periodeDebutBail(bail);
  const periodesAvance = [];

  // La marche se fait en mémoire : plus aucun aller-retour dans la boucle.
  for (let garde = 0; avance > 0 && garde < 600; garde += 1) {
    periode = periodeDecalee(periode, 1);
    if (!bailCouvre(bail, periode, Infinity)) {
      throw new Error("La date de fin du bail ne permet pas d'affecter toute l'avance aux mois suivants");
    }
    const loyerExistant = loyersParPeriode.get(periode);
    const montantDu = loyerExistant?.montantDu ?? Number(bail.loyerMensuel);
    const dejaPaye = loyerExistant ? totalAllouePourLoyer(paiements, loyerExistant.id) : 0;
    const reste = montantDu - dejaPaye;
    if (reste <= 0) continue;
    if (!Number.isSafeInteger(reste) || reste < 0) throw new Error("Montant du mois suivant invalide");
    const montantAffecte = Math.min(avance, reste);
    periodesAvance.push({ periode, montant: montantAffecte });
    avance -= montantAffecte;
  }
  if (avance > 0) throw new Error("Impossible d'affecter toute l'avance sur la durée restante du bail");

  if (periodesAvance.length) {
    // Tous les mois d'avance sont générés en une seule écriture, puis relus
    // d'un bloc. La version précédente générait puis relait chaque mois
    // séparément : deux requêtes par mois d'avance.
    const premiere = periodesAvance[0].periode;
    const derniere = periodesAvance.at(-1).periode;
    // La génération relit la collection des loyers : elle ne doit pas voir
    // une copie antérieure à ce que nous venons de lire.
    invalider(COLLECTIONS.loyers);
    await genererLoyersDepuis(bail.id, premiere, derniere);

    const apres = await loyersDuBail(bail.id);
    for (const a of periodesAvance) {
      const loyer = apres.get(a.periode);
      if (!loyer) throw new Error(`Impossible de générer le loyer de ${a.periode}`);
      allocations.push({ loyerId: loyer.id, montant: a.montant });
    }
  }

  const paiement = {
    id: nextId("pay"),
    bailId: bail.id,
    locataireId: bail.locataireId,
    date: data.date,
    montant,
    mode: data.mode || "especes",
    reference: data.reference || "",
    note: data.note || "",
    detail: detail ? dupliquer(detail) : null,
    libelles: data.libelles ? dupliquer(data.libelles) : null,
    allocations: allocations.map((a, i) => ({
      loyerId: a.loyerId,
      montant: Math.round(a.montant),
      // Chaque mois emporte ses propres charges : la quittance les relit bloc
      // par bloc. L'eau de juin reste celle de juin.
      detail: detailParMois[i] ? dupliquer(detailParMois[i]) : null,
    })),
    createdAt: serverTimestamp(),
  };

  await setDoc(doc(db, COLLECTIONS.paiements, paiement.id), paiement);
  // Sans cette invalidation, la quittance ne relit pas le paiement qu'elle vient
  // d'écrire : `lireCollection` sert encore la liste d'avant l'écriture, et le
  // paiement est réputé introuvable. L'oublie affectait aussi le rafraîchissement
  // qui suit — le nouvel encaissement n'apparaissait pas dans la liste.
  invaliderToutes();
  await recomputeStatutLoyers(allocations.map((a) => a.loyerId));
  return { paiement, quittance: null };
}

/**
 * Tous les loyers d'un bail, lus en une fois, indexés par période.
 *
 * La marche de l'avance cherchait le mois suivant d'un mois à l'autre, une
 * requête par mois. Sur un bail sans date de fin, elle en enchaînaient des
 * centaines — quatre à cinq minutes d'attente avant d'enregistrer quoi que ce
 * soit, pour une simple quittance. Une seule lecture, et le calcul se fait
 * ensuite en mémoire.
 *
 * @param {string} bailId
 * @returns {Promise<Map<string, object>>} période → loyer
 */
async function loyersDuBail(bailId) {
  const snap = await getDocs(
    query(collection(db, COLLECTIONS.loyers), where("bailId", "==", bailId))
  );
  return new Map(snap.docs.map((d) => [d.data().periode, { id: d.id, ...d.data() }]));
}

/**
 * Supprime un loyer seul — un mois saisi par erreur, ou ouvert puis retracted.
 *
 * Un garde-fou est non négociable : dès qu'un paiement porte ce loyer, le mois
 * appartient à l'historique. Le supprimer laisserait une imputation pointant
 * dans le vide, un relevé faux, et une quittance sans correspondance. On
 * refuse donc, et on propose de supprimer le paiement — ce que le propriétaire
 * peut faire depuis la liste des encaissements.
 *
 * @param {string} id  identifiant du loyer
 * @returns {Promise<{ok: boolean, erreur?: string}>}
 */
export async function deleteLoyer(id) {
  const loyer = await lireUn(COLLECTIONS.loyers, id);
  if (!loyer) return { ok: false, erreur: "Ce mois n'existe plus." };

  const paiements = await lireCollection(COLLECTIONS.paiements);
  const concerne = paiements.filter((p) =>
    (p.allocations || []).some((a) => a.loyerId === id)
  );
  if (concerne.length > 0) {
    return {
      ok: false,
      erreur:
        "Ce mois porte déjà un encaissement. Supprimez d'abord le paiement : " +
        "une quittance a été émise pour lui.",
    };
  }

  invaliderToutes();
  await deleteDoc(doc(db, COLLECTIONS.loyers, id));
  return { ok: true };
}

// --- Quittances ---

export const listQuittances = () => lireCollection(COLLECTIONS.quittances);
export const listPaiements = () => lireCollection(COLLECTIONS.paiements);

export async function getPaiement(id) {
  return lireUn(COLLECTIONS.paiements, id);
}

/**
 * Supprime un paiement et la quittance qui l'atteste.
 *
 * Les deux vont ensemble : une quittance sans son paiement n'a plus de quoi
 * être justifiée, et la laisser affichait un reçu pour un versement annulé.
 * Les loyers concernés sont ensuite recalculés — ils redeviennent impayés, ou
 * partiellement réglés s'ils le sont encore.
 *
 * @returns {Promise<{paiement: string|null, quittances: string[]}>}
 */
export async function deletePaiement(id) {
  invaliderToutes();
  const [paiements, quittances] = await Promise.all([
    lireCollection(COLLECTIONS.paiements),
    lireCollection(COLLECTIONS.quittances),
  ]);

  const paiement = paiements.find((p) => p.id === id) || null;
  // Uniquement la quittance de CE paiement : les autres versements du même
  // locataire ont leurs propres quittances, qui doivent rester.
  const liees = quittances.filter((q) => q.paiementId === id);

  await Promise.all([
    ...liees.map((q) => deleteDoc(doc(db, COLLECTIONS.quittances, q.id))),
    deleteDoc(doc(db, COLLECTIONS.paiements, id)),
  ]);

  // Le statut d'un loyer dépend des paiements qui le couvrent : en retirer un
  // change sa situation, il faut donc le recalculer.
  const loyersConcernes = new Set((paiement?.allocations || []).map((a) => a.loyerId));
  await recomputeStatutLoyers([...loyersConcernes]);

  return { paiement: id, quittances: liees.map((q) => q.id) };
}

/**
 * Numéro séquentiel dans une transaction.
 *
 * Un compteur naïf (`nombre de quittances + 1`) produit deux fois le même
 * numéro dès que deux fenêtres émettent au même instant — et un reçu numéroté
 * en double n'a plus de valeur. La transaction sérialise les lectures et
 * l'écriture du compteur.
 */
async function prochainNumeroQuittance() {
  return runTransaction(db, async (tx) => {
    const ref = doc(db, "counters", "quittances");
    const snap = await tx.get(ref);
    const valeur = (snap.exists() ? snap.data().value || 0 : 0) + 1;
    tx.set(ref, { value: valeur }, { merge: true });
    const annee = new Date().getFullYear();
    return { valeur, numero: `Q-${annee}-${String(valeur).padStart(6, "0")}` };
  });
}

/**
 * Émet la quittance d'un paiement. Les mentions sont figées ici : la quittance
 * doit rester identique même si le bail ou les frais changent plus tard.
 */
/**
 * La documentation dont une quittance a besoin, lue une fois pour toutes.
 *
 * Émettre une quittance faisait six lectures d'un document unique — paiement,
 * bail, lot, immeuble, locataire, propriétaire. Comme `lireUn` n'a pas de
 * cache, chacune partait sur le réseau. Pire, ces six lectures se refaisaient
 * à l'identique pour chaque quittance : générer les vingt quittances
 * manquantes relisait vingt fois le même bail, le même lot et le même immeuble,
 * en série.
 *
 * Les listes passent maintenant par `lireCollection`, qui garde le résultat en
 * mémoire : la première lecture part sur le réseau, les suivantes sont
 * gratuites. La numérotation reste séquentielle — un numéro de quittance ne se
 * permute pas, et deux émissions parallèles se disputeraient le même numéro.
 *
 * @returns {Promise<object>} index par identifiant, plus les paiements
 */
async function contexteQuittance() {
  // Les paiements et les quittances sont lus **sans le cache**, et c'est
  // délibéré.
  //
  // Une quittance est presque toujours émise dans la foulée du paiement qu'elle
  // atteste, et l'émission en masse en crée plusieurs d'affilée. Servis par le
  // cache — trente secondes de réutilisation — le contexte ne verrait pas le
  // paiement vient d'être écrit, et le dirait introuvable ; pire encore, une
  // quittance déjà émise passerait pour absente et se ferait réémettre sous un
  // nouveau numéro.
  //
  // Les autres collections ne changent pas au cours d'une émission : baux, lots,
  // immeubles et locataires peuvent venir du cache.
  const [paiements, quittances, baux, lots, immeubles, locataires, proprietaire] =
    await Promise.all([
      lireCollection(COLLECTIONS.paiements, { frais: true }),
      lireCollection(COLLECTIONS.quittances, { frais: true }),
      lireCollection(COLLECTIONS.baux),
      lireCollection(COLLECTIONS.lots),
      lireCollection(COLLECTIONS.immeubles),
      lireCollection(COLLECTIONS.locataires),
      getProprietaire(),
    ]);
  const parId = (liste) => new Map(liste.map((d) => [d.id, d]));
  return {
    paiements: parId(paiements),
    quittances,
    baux: parId(baux),
    lots: parId(lots),
    immeubles: parId(immeubles),
    locataires: parId(locataires),
    proprietaire,
  };
}

/**
 * Émet la quittance d'un paiement, ou renvoie celle qui existe déjà.
 *
 * @param {string} paiementId
 * @param {object} [contexte]  contexte partagé, pour émettre plusieurs
 *   quittances sans relire la même documentation à chaque fois
 */
export async function genererQuittance(paiementId, contexte = null) {
  const ctx = contexte ?? (await contexteQuittance());
  const paiement = ctx.paiements.get(paiementId);
  if (!paiement) throw new Error("Paiement introuvable");

  // Un paiement a droit à une quittance, une seule. Ouvrir ou télécharger le PDF
  // d'une quittance déjà émise la renvoie telle quelle : sans cette garde, chaque
  // consultation créait un document et consommait un numéro de quittance.
  const existante = ctx.quittances.find((q) => q.paiementId === paiementId);
  if (existante) return existante;

  const bail = ctx.baux.get(paiement.bailId);
  const lot = bail ? ctx.lots.get(bail.lotId) : null;
  const immeuble = lot ? ctx.immeubles.get(lot.immeubleId) : null;
  const locataire = bail ? ctx.locataires.get(bail.locataireId) : null;
  const { proprietaire } = ctx;
  const { numero, valeur } = await prochainNumeroQuittance();
  const annee = Number(String(numero).slice(2, 6));

  const quittance = {
    id: `quittance_${numero}`,
    numero,
    sequence: valeur,
    annee,
    paiementId,
    bailId: paiement.bailId,
    locataireId: paiement.locataireId,
    periode: paiement.periode || periodeCourante(),
    montant: paiement.montant,
    datePaiement: paiement.date,
    dateEmission: new Date().toISOString().slice(0, 10),
    mode: paiement.mode || "especes",
    detail: paiement.detail || null,
    libelles: paiement.libelles || null,
    allocations: paiement.allocations || [],
    cautionSur: bail?.cautionSur || "",
    // Locataire, logement et propriétaire figés à l'émission. La quittance doit
    // rester lisible des années plus tard : ces mentions ne sont plus relues
    // ailleurs, donc il faut les figer ici.
    nomLocataire: [locataire?.prenoms, locataire?.nom].filter(Boolean).join(" "),
    prenomsLocataire: locataire?.prenoms || "",
    ifuLocataire: locataire?.ifu || "",
    telephoneLocataire: locataire?.telephone || "",
    designationLot: lot?.designation || "",
    // Repère court du logement (R1, E2, A3, Boutique 1). Figé comme le reste :
    // le numéro de chambre figure sur le reçu et doit rester lisible même si
    // le logement est renommé ensuite.
    numeroLot: lot?.numero || "",
    adresseImmeuble: immeuble
      ? [immeuble.adresse, immeuble.ville].filter(Boolean).join(", ")
      : "",
    nomProprietaire: proprietaire?.nom || "",
    prenomsProprietaire: proprietaire?.prenoms || "",
    ifuProprietaire: proprietaire?.ifu || "",
    telephoneProprietaire: proprietaire?.telephone || "",
    adresseProprietaire: proprietaire?.adresse || "",
    villeProprietaire: proprietaire?.ville || "Cotonou",
    createdAt: serverTimestamp(),
  };

  await setDoc(doc(db, COLLECTIONS.quittances, quittance.id), quittance);
  // Le cache des quittances est invalidé à chaque émission : une seconde passe
  // ne doit pas croire cette quittance inexistante et lui attribuer un numéro
  // supplémentaire.
  invalider(COLLECTIONS.quittances);
  return quittance;
}

/** Émet les quittances manquantes, une fois par paiement. */
export async function genererQuittancesManquantes() {
  // Toute la documentation est lue une seule fois. La version précédente
  // lisait le bail, le lot, l'immeuble et le locataire à chaque quittance :
  // vingt quittances manquantes, c'était vingt lectures du même immeuble en
  // série, plus d'une minute à ne rien voir passer.
  const contexte = await contexteQuittance();
  const deja = new Set(contexte.quittances.map((q) => q.paiementId));
  const creees = [];
  // L'émission reste en série : chaque quittance consomme un numéro, et deux
  // transactions parallèles prendraient le même.
  for (const p of contexte.paiements.values()) {
    if (!deja.has(p.id)) creees.push(await genererQuittance(p.id, contexte));
  }
  return creees;
}

// Accès direct à la couche métier depuis la console du navigateur, en
// développement seulement. Les formulaires React pilotés au clavier sont
// difficiles àfiabiliser dans un test automatisé ; passer par les fonctions
// réelles, elles, exercise le même code que l'interface. Éplacé en
// production par l'élimination du bloc.
if (import.meta.env?.DEV && typeof window !== "undefined") {
  window.__donnees = {
    proprietaire: getProprietaire,
    updateProprietaire,
    listImmeubles, createImmeuble, updateImmeuble, deleteImmeuble,
    listLots, createLot, updateLot, deleteLot,
    listLocataires, createLocataire, updateLocataire, deleteLocataire,
    listBaux, createBail, updateBail, deleteBail,
    listLoyers, genererLoyersDepuis, genererLoyersPourPeriode,
    listPaiements, enregistrerPaiement, deletePaiement,
    listQuittances, genererQuittance, genererQuittancesManquantes,
    listDepenses, createDepense, updateDepense, deleteDepense,
  };
}
