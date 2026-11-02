// Service de données — implémentation Supabase.
//
// L'API reste celle de l'ancienne couche Firestore : les pages et le contexte
// n'ont pas à changer. Les opérations qui doivent être atomiques (encaissement,
// quittance, suppressions) sont exécutées par des fonctions SQL, en une seule
// transaction côté base : voir supabase/fonctions.sql.

import { supabase } from "../supabase/client.js";
import { adresseLocativeImmeuble, comparePeriode, periodeCourante, periodeDecalee } from "../utils/format.js";


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

/**
 * Identifiant d'une nouvelle ligne. Le compteur seul ne suffit pas : deux onglets
 * (ou deux appareils) qui écrivent dans la même milliseconde partiraient du même
 * numéro et se heurteraient à la clé primaire. La part aléatoire les départage.
 */
export function nextId(prefix) {
  compteur += 1;
  const aleatoire = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}${String(compteur).padStart(3, "0")}${aleatoire}`;
}



// --- Règles de métier (portées de db.js) ---

const totalPostes = (l) =>
  POSTES_FRAIS.reduce((s, cle) => s + (Number(l[cle]) || 0), 0);

/**
 * Les frais par défaut d'un bail (eau, électricité, ordures, dégâts, autres).
 * Ils pré-remplissent l'encaissement ; l'utilisateur peut les modifier chaque
 * mois. Le loyer n'y figure jamais : il vient toujours du bail.
 */
export function fraisDefautBail(bail) {
  const f = bail?.fraisDefaut || {};
  return Object.fromEntries(
    POSTES_FRAIS.filter((cle) => cle !== "loyer").map((cle) => [cle, Number(f[cle]) || 0])
  );
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
 *   2. Les **charges** sont celles saisies à l'encaissement : la dernière saisie
 *      fait foi, à la hausse comme à la baisse. Une charge baissée est donc
 *      bien reportée sur le loyer du mois.
 *
 * Le montant dû ne passe jamais sous ce qui est déjà encaissé pour le mois :
 * c'est corrigé par l'appelant (`preparerEncaissement`), qui connaît les
 * versements existants.
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
    if ((Number(loyer[cle]) || 0) === montants[cle]) continue;
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



// --- Conversion entre la base (snake_case) et l'application (camelCase) ---
//
// Seules les clés de premier niveau sont converties. Le contenu des colonnes jsonb
// (détails des charges, frais par défaut…) garde les clés qu'il a déjà.

const versAppli = (nom) => nom.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
const versBase = (nom) => nom.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

function depuisBase(ligne) {
  return Object.fromEntries(Object.entries(ligne).map(([k, v]) => [versAppli(k), v]));
}

function versBaseLigne(objet) {
  const sortie = {};
  for (const [k, v] of Object.entries(objet)) {
    if (v !== undefined) sortie[versBase(k)] = v;
  }
  return sortie;
}

function verifier({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

const maintenant = () => new Date().toISOString();

// La base renvoie au plus 1000 lignes par requête : on lit par pages.
const PAGE = 1000;

async function toutes(table, { ordre = "id" } = {}) {
  const lignes = [];
  for (let debut = 0; ; debut += PAGE) {
    const data = verifier(
      await supabase.from(table).select("*").order(ordre).range(debut, debut + PAGE - 1)
    );
    lignes.push(...data);
    if (data.length < PAGE) break;
  }
  return lignes.map(depuisBase);
}

async function unique(table, id) {
  const data = verifier(await supabase.from(table).select("*").eq("id", id).maybeSingle());
  return data ? depuisBase(data) : null;
}

const appeler = async (fonction, args) => verifier(await supabase.rpc(fonction, args));

// --- Lectures ---

// Un paiement porte ses mois réglés, comme dans l'ancien modèle.
async function lirePaiements() {
  const [paiements, allocations] = await Promise.all([
    toutes("paiements"),
    toutes("paiement_allocations", { ordre: "paiement_id" }),
  ]);
  const parPaiement = new Map();
  for (const a of allocations) {
    if (!parPaiement.has(a.paiementId)) parPaiement.set(a.paiementId, []);
    parPaiement.get(a.paiementId).push({ loyerId: a.loyerId, montant: a.montant, detail: a.detail ?? null });
  }
  return paiements.map((p) => ({ ...p, allocations: parPaiement.get(p.id) || [] }));
}

async function loyersDuBail(bailId) {
  const data = verifier(await supabase.from("loyers").select("*").eq("bail_id", bailId));
  return new Map(data.map((l) => [l.periode, depuisBase(l)]));
}

async function loyersDuBailParId(bailId) {
  const data = verifier(await supabase.from("loyers").select("*").eq("bail_id", bailId));
  return new Map(data.map((l) => [l.id, depuisBase(l)]));
}

export const listImmeubles = () => toutes("immeubles");
export const getImmeuble = (id) => unique("immeubles", id);
export const listLots = () => toutes("lots");
export const getLot = (id) => unique("lots", id);
export const listLocataires = () => toutes("locataires");
export const getLocataire = (id) => unique("locataires", id);
export const listBaux = () => toutes("baux");
export const getBail = (id) => unique("baux", id);
export const listDepenses = () => toutes("depenses");
export const listLoyers = () => toutes("loyers");
export const listQuittances = () => toutes("quittances");
export const listPaiements = () => lirePaiements();

export async function getPaiement(id) {
  const paiement = await unique("paiements", id);
  if (!paiement) return null;
  const allocations = verifier(
    await supabase.from("paiement_allocations").select("*").eq("paiement_id", id)
  ).map(depuisBase);
  return {
    ...paiement,
    allocations: allocations.map((a) => ({ loyerId: a.loyerId, montant: a.montant, detail: a.detail ?? null })),
  };
}

// --- Écritures génériques ---

async function creer(table, prefixe, data) {
  const ligne = { ...data, id: data.id || nextId(prefixe) };
  verifier(await supabase.from(table).insert(versBaseLigne(ligne)));
  return ligne;
}

async function modifier(table, id, data) {
  verifier(
    await supabase.from(table).update(versBaseLigne({ ...data, updatedAt: maintenant() })).eq("id", id)
  );
  return { id, ...data };
}

// --- Propriétaire ---

export async function getProprietaire() {
  const existant = await unique("proprietaire", "proprietaire");
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
  verifier(await supabase.from("proprietaire").insert(versBaseLigne(defaut)));
  return defaut;
}

export async function updateProprietaire(champs) {
  verifier(
    await supabase
      .from("proprietaire")
      .update(versBaseLigne({ ...champs, updatedAt: maintenant() }))
      .eq("id", "proprietaire")
  );
  return unique("proprietaire", "proprietaire");
}

// --- Immeubles ---

export const createImmeuble = (data) => creer("immeubles", "imm", data);
export const updateImmeuble = (id, data) => modifier("immeubles", id, data);

/** Supprime un immeuble : ses lots libres partent, les lots loués restent. */
export async function deleteImmeuble(id) {
  await appeler("supprimer_immeuble", { p_id: id });
}

// --- Lots ---

export const createLot = (data) => creer("lots", "lot", data);
export const updateLot = (id, data) => modifier("lots", id, data);

/** Supprime un lot, s'il est libre. Refusé sinon, par la base. */
export async function deleteLot(id) {
  await appeler("supprimer_lot", { p_id: id });
}

// --- Locataires ---

export const createLocataire = (data) => creer("locataires", "loc", data);
export const updateLocataire = (id, data) => modifier("locataires", id, data);

/** Supprime un locataire, ses baux, loyers, paiements et quittances, en une transaction. */
export async function deleteLocataire(id) {
  await appeler("supprimer_locataire", { p_id: id });
}

// --- Baux ---

/**
 * Un bail occupe un logement. Le contrôle se fait ici, avant l'écriture ; la base
 * ne l'impose pas encore (un lot peut porter plusieurs baux successifs).
 */
export async function createBail(data) {
  const baux = await listBaux();
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
  return creer("baux", "bail", data);
}

/**
 * Modifie un bail. Si ses frais par défaut changent, les mois qui n'ont encore
 * aucun paiement reprennent les nouveaux montants : la ligne affiche ce qui est
 * prévu. Un mois encaissé garde ce qui a été réellement saisi.
 */
export async function updateBail(id, data) {
  const resultat = await modifier("baux", id, data);
  if (data.fraisDefaut) {
    await synchroniserFraisNonEncaisses({ id, fraisDefaut: data.fraisDefaut });
  }
  return resultat;
}

async function synchroniserFraisNonEncaisses(bail) {
  const loyers = [...(await loyersDuBailParId(bail.id)).values()];
  if (loyers.length === 0) return;
  const ids = loyers.map((l) => l.id);
  const allocations = verifier(
    await supabase.from("paiement_allocations").select("loyer_id").in("loyer_id", ids)
  );
  const encaisses = new Set(allocations.map((a) => a.loyer_id));

  const frais = fraisDefautBail(bail);
  const total = totalPostes(frais);
  for (const loyer of loyers) {
    if (encaisses.has(loyer.id)) continue;
    const champs = { ...frais, montantDu: (Number(loyer.loyer) || 0) + total };
    verifier(await supabase.from("loyers").update(versBaseLigne(champs)).eq("id", loyer.id));
  }
}

/** Supprime un bail avec ses loyers, paiements et quittances, en une transaction. */
export async function deleteBail(id) {
  await appeler("supprimer_bail", { p_id: id });
}

// --- Dépenses ---

export const createDepense = (data) => creer("depenses", "dep", data);
export const updateDepense = (id, data) => modifier("depenses", id, data);

export async function deleteDepense(id) {
  verifier(await supabase.from("depenses").delete().eq("id", id));
}

// --- Loyers ---

function loyerNeuf(bail, periode) {
  // Le mois porte les frais par défaut du bail, comme le loyer : ils s'affichent
  // sur la ligne et se modifient à l'encaissement. Ils ne comptent jamais dans la
  // dette, qui ne porte que sur le loyer.
  const postes = fraisDefautBail(bail);
  return {
    id: nextId("loy"),
    bailId: bail.id,
    periode,
    ...postes,
    loyer: bail.loyerMensuel,
    montantDu: bail.loyerMensuel + totalPostes(postes),
    statut: "impaye",
  };
}

/**
 * Insère des loyers. Un mois déjà présent pour le bail est ignoré : la base porte
 * une unicité sur (bail, période), ce qui protège aussi d'une génération concurrente.
 */
async function insererLoyers(lignes) {
  for (let i = 0; i < lignes.length; i += 500) {
    verifier(
      await supabase
        .from("loyers")
        .upsert(lignes.slice(i, i + 500).map(versBaseLigne), {
          onConflict: "bail_id,periode",
          ignoreDuplicates: true,
        })
    );
  }
}

/**
 * Crée les loyers manquants de tous les baux, du mois d'entrée au mois courant.
 * Même fonction que la tâche quotidienne côté base : sans effet si tout est à jour.
 */
export const genererLoyersEchus = () => appeler("generer_loyers_echus", {});

/** Crée les loyers manquants pour une période. Idempotent. */
export async function genererLoyersPourPeriode(periode, bailIds = null, { jusquA = true } = {}) {
  const baux = bailIds
    ? await Promise.all(bailIds.map((id) => getBail(id)))
    : await listBaux();
  const existants = await listLoyers();

  const aEcrire = [];
  for (const bail of baux.filter(Boolean)) {
    const couvert = jusquA ? bailActifCouvre(bail, periode) : bailCouvre(bail, periode, Infinity);
    if (!couvert) continue;
    if (existants.some((l) => l.bailId === bail.id && l.periode === periode)) continue;
    aEcrire.push(loyerNeuf(bail, periode));
  }
  await insererLoyers(aEcrire);
  return aEcrire.length;
}

/**
 * Génère les loyers dus depuis une période donnée, jusqu'à la fin du bail ou à la
 * période du jour.
 *
 * @returns {Promise<number>} nombre de loyers créés
 */
export async function genererLoyersDepuis(bailId, periodeDebut, periodeFin = null) {
  const bail = await getBail(bailId);
  if (!bail) return 0;
  const debut = (periodeDebut || periodeDebutBail(bail)).slice(0, 7);
  const borne = periodeFin ? periodeFin.slice(0, 7) : periodeFinBail(bail, periodeCourante());

  const dejaLa = new Set((await loyersDuBail(bailId)).keys());

  const aEcrire = [];
  let cur = debut;
  // Garde-fou : dix ans de bail. Au-delà la boucle ne s'arrêterait pas d'elle-même.
  for (let garde = 0; garde < 120; garde += 1) {
    if (comparePeriode(cur, borne) > 0) break;
    if (!dejaLa.has(cur) && bailCouvre(bail, cur, Infinity)) {
      aEcrire.push(loyerNeuf(bail, cur));
    }
    cur = periodeDecalee(cur, 1);
  }
  await insererLoyers(aEcrire);
  return aEcrire.length;
}

/**
 * Supprime un loyer seul. Refusé par la base si un paiement le porte déjà : le
 * mois appartient alors à l'historique.
 */
export async function deleteLoyer(id) {
  await appeler("supprimer_loyer", { p_id: id });
  return { ok: true };
}

// --- Encaissement ---

/** Un loyer est soldé, partiel ou impayé, d'après ce qui lui est imputé. */
export function statutPour(paye, montantDu) {
  return paye <= 0 ? "impaye" : paye >= montantDu ? "paye" : "partiel";
}

/** Total imputé à un loyer, sur une liste de paiements. */
export function payeSur(paiements, loyerId) {
  return paiements.reduce((s, p) => {
    const alloc = (p.allocations || []).find((a) => a.loyerId === loyerId);
    return s + (alloc ? alloc.montant : 0);
  }, 0);
}

/**
 * Prépare un encaissement à partir de l'état déjà connu. Aucun aller-retour :
 * l'interface peut afficher le résultat avant la confirmation du serveur.
 *
 * Les contrôles sont ceux de l'ancien flux, sur le même état. La base refait le
 * contrôle décisif, sous verrou, dans `ecrireEncaissement`.
 *
 * @param {object} data  { bailId, date, montant, mode, reference, note, allocations, detail, details, libelles }
 *   Une allocation porte `loyerId`, ou `periode` : le loyer manquant est alors créé.
 * @param {object} etat  { baux, loyers, paiements } tels que connus de l'application
 * @returns {{paiement: object, loyers: object[], aEcrire: object[]}}
 *   `paiement` porte ses allocations ; `loyers` sont les loyers touchés, avec leur
 *   statut final ; `aEcrire` ne contient que ceux que la base doit recevoir.
 * @throws {Error} si l'encaissement n'est pas valable
 */
export function preparerEncaissement(data, etat) {
  const bail = etat.baux.find((b) => b.id === data.bailId);
  if (!bail) throw new Error("Bail introuvable");

  const loyersDuBail = etat.loyers.filter((l) => l.bailId === bail.id);
  const loyersParPeriode = new Map(loyersDuBail.map((l) => [l.periode, l]));
  const loyersParId = new Map(loyersDuBail.map((l) => [l.id, l]));
  const paiements = etat.paiements;

  const allocationsBrutes = (data.allocations || []).filter((a) => a.montant > 0);
  if (allocationsBrutes.length === 0) throw new Error("Sélectionnez au moins un mois à régler");
  if (allocationsBrutes.some((a) => !Number.isSafeInteger(a.montant))) {
    throw new Error("Les montants affectés doivent être des nombres entiers");
  }

  // Un mois sans loyer encore créé est créé ici, dans la même transaction.
  const nouveaux = new Map();
  const allocations = allocationsBrutes.map((a) => {
    if (a.loyerId) return a;
    if (!a.periode || !bailCouvre(bail, a.periode, Infinity)) {
      throw new Error(`Le bail ne couvre pas le mois ${a.periode || ""}`.trim());
    }
    let loyer = loyersParPeriode.get(a.periode);
    if (!loyer) {
      loyer = loyerNeuf(bail, a.periode);
      loyersParPeriode.set(a.periode, loyer);
      loyersParId.set(loyer.id, loyer);
      nouveaux.set(loyer.id, loyer);
    }
    return { ...a, loyerId: loyer.id };
  });
  if (new Set(allocations.map((a) => a.loyerId)).size !== allocations.length) {
    throw new Error("Un mois ne peut être sélectionné qu'une seule fois");
  }

  const detail = data.detail
    ? Object.fromEntries(
        POSTES_FRAIS.map((cle) => [cle, Math.max(0, Math.round(Number(data.detail[cle]) || 0))])
      )
    : null;
  if (detail && detail.loyer <= 0) throw new Error("Le loyer doit être supérieur à zéro");

  // Une charge appartient à un mois : le détail de chaque affectation est le sien.
  const detailParMois =
    Array.isArray(data.details) && data.details.length === allocations.length
      ? data.details
      : allocations.map((_, i) => (i === allocations.length - 1 ? detail : null));

  // Supplément de caution : il s'ajoute à la caution déjà versée du bail, et
  // ne se répartit sur aucun mois. Il entre dans le montant reçu, pas dans les
  // affectations.
  const supplementCaution = Math.max(0, Math.round(Number(data.supplementCaution) || 0));

  let montant = Math.round(Number(data.montant) || 0);

  // Charges du versement, par loyer. Une charge ne se retire jamais : elle ne fait que monter.
  const champsParLoyer = new Map();
  if (detail) {
    for (const [i, alloc] of allocations.entries()) {
      const detailDuMois = detailParMois[i];
      if (!detailDuMois) continue;
      const loyer = loyersParId.get(alloc.loyerId);
      if (!loyer) continue;
      const champs = appliquerDetailLoyer(loyer, detailDuMois);
      if (Object.keys(champs).length > 0) champsParLoyer.set(loyer.id, champs);
    }
    montant = allocations.reduce((s, a) => s + a.montant, 0) + supplementCaution;

    // Une charge baissée réduit le dû du mois, mais jamais sous ce qui est
    // déjà encaissé pour ce mois : sinon le versement paraîtrait en trop.
    for (const [loyerId, champs] of champsParLoyer) {
      if (champs.montantDu === undefined) continue;
      champs.montantDu = Math.max(champs.montantDu, payeSur(paiements, loyerId));
    }
  }
  if (!Number.isSafeInteger(montant) || montant <= 0) {
    throw new Error("Le montant doit être un entier supérieur à zéro");
  }

  const totalAlloue = allocations.reduce((s, a) => s + a.montant, 0);
  if (totalAlloue + supplementCaution > montant) throw new Error("Les mois sélectionnés dépassent le montant reçu");

  // Le dû d'un mois inclut les charges de ce versement.
  const periodesChoisies = [];
  for (const alloc of allocations) {
    const loyer = loyersParId.get(alloc.loyerId);
    if (!loyer) throw new Error("Loyer introuvable dans l'allocation");
    const du = champsParLoyer.get(loyer.id)?.montantDu ?? loyer.montantDu;
    const reste = du - payeSur(paiements, loyer.id);
    if (alloc.montant > reste) {
      throw new Error(`Montant trop élevé pour ${loyer.periode} : il reste ${reste} FCFA à payer`);
    }
    periodesChoisies.push(loyer.periode || periodeDebutBail(bail));
  }

  // Avance sur les mois suivants : chaque mois prend son reste dû.
  let avance = montant - totalAlloue - supplementCaution;
  let periode = periodesChoisies.sort().at(-1) || periodeDebutBail(bail);
  const periodesAvance = [];
  for (let garde = 0; avance > 0 && garde < 600; garde += 1) {
    periode = periodeDecalee(periode, 1);
    if (!bailCouvre(bail, periode, Infinity)) {
      throw new Error("La date de fin du bail ne permet pas d'affecter toute l'avance aux mois suivants");
    }
    const loyerExistant = loyersParPeriode.get(periode);
    const montantDu =
      (loyerExistant && (champsParLoyer.get(loyerExistant.id)?.montantDu ?? loyerExistant.montantDu)) ??
      Number(bail.loyerMensuel);
    const dejaPaye = loyerExistant ? payeSur(paiements, loyerExistant.id) : 0;
    const reste = montantDu - dejaPaye;
    if (reste <= 0) continue;
    if (!Number.isSafeInteger(reste) || reste < 0) throw new Error("Montant du mois suivant invalide");
    const montantAffecte = Math.min(avance, reste);
    periodesAvance.push({ periode, montant: montantAffecte });
    avance -= montantAffecte;
  }
  if (avance > 0) throw new Error("Impossible d'affecter toute l'avance sur la durée restante du bail");

  for (const a of periodesAvance) {
    if (loyersParPeriode.has(a.periode)) continue;
    const loyer = loyerNeuf(bail, a.periode);
    nouveaux.set(loyer.id, loyer);
    loyersParPeriode.set(a.periode, loyer);
    loyersParId.set(loyer.id, loyer);
  }
  const allocationsFinales = [
    ...allocations,
    ...periodesAvance.map((a) => ({ loyerId: loyersParPeriode.get(a.periode).id, montant: a.montant })),
  ];

  const paiement = {
    id: nextId("pay"),
    bailId: bail.id,
    locataireId: bail.locataireId,
    date: data.date,
    montant,
    supplementCaution,
    mode: data.mode || "especes",
    reference: data.reference || "",
    note: data.note || "",
    detail: detail ? dupliquer(detail) : null,
    libelles: data.libelles ? dupliquer(data.libelles) : null,
    createdAt: maintenant(),
    allocations: allocationsFinales.map((a, i) => ({
      loyerId: a.loyerId,
      montant: Math.round(a.montant),
      detail: detailParMois[i] ? dupliquer(detailParMois[i]) : null,
    })),
  };

  // Loyers touchés : leur statut final est calculé ici, pour l'affichage. La base
  // le recalcule aussi, au moment de l'écriture.
  const paiementsApres = [...paiements, paiement];
  const loyers = [];
  const aEcrire = [];
  for (const id of new Set(allocationsFinales.map((a) => a.loyerId))) {
    const base = loyersParId.get(id) || nouveaux.get(id);
    const champs = champsParLoyer.get(id) || {};
    const montantDuFinal = champs.montantDu ?? base.montantDu;
    const fini = { ...base, ...champs, statut: statutPour(payeSur(paiementsApres, id), montantDuFinal) };
    loyers.push(fini);
    if (nouveaux.has(id) || Object.keys(champs).length > 0) aEcrire.push(fini);
  }

  return { paiement, loyers, aEcrire };
}

/**
 * Écrit un encaissement préparé par `preparerEncaissement`, en une transaction côté base.
 *
 * @returns {Promise<{paiement: object, quittance: null}>}
 */
export async function ecrireEncaissement(plan) {
  const { allocations, ...sansAllocations } = plan.paiement;
  await appeler("ecrire_encaissement", {
    p: {
      paiement: versBaseLigne(sansAllocations),
      allocations: allocations.map((a) => ({ loyer_id: a.loyerId, montant: a.montant, detail: a.detail })),
      loyers: plan.aEcrire.map(versBaseLigne),
    },
  });
  return { paiement: plan.paiement, quittance: null };
}

/**
 * Supprime un paiement et la quittance qui l'atteste. Les loyers concernés
 * redeviennent dus, ou partiellement réglés. Une seule transaction, côté base.
 *
 * @returns {Promise<{paiement: string, quittances: string[]}>}
 */
export async function deletePaiement(id) {
  const res = await appeler("supprimer_paiement", { p_id: id });
  return { paiement: id, quittances: res.quittances || [] };
}

// --- Quittances ---

/**
 * Contexte d'émission construit depuis l'état déjà connu : aucune lecture.
 * L'application détient déjà toutes ces données ; les relire ajoutait une dizaine
 * d'allers-retours à chaque encaissement.
 */
export function contexteQuittanceDepuis(etat) {
  const parId = (liste) => new Map(liste.map((d) => [d.id, d]));
  return {
    paiements: parId(etat.paiements),
    quittances: etat.quittances,
    baux: parId(etat.baux),
    lots: parId(etat.lots),
    immeubles: parId(etat.immeubles),
    locataires: parId(etat.locataires),
    proprietaire: etat.proprietaire,
  };
}

async function contexteQuittance() {
  const [paiements, quittances, baux, lots, immeubles, locataires, proprietaire] = await Promise.all([
    lirePaiements(),
    listQuittances(),
    listBaux(),
    listLots(),
    listImmeubles(),
    listLocataires(),
    getProprietaire(),
  ]);
  return contexteQuittanceDepuis({ paiements, quittances, baux, lots, immeubles, locataires, proprietaire });
}

/**
 * Émet la quittance d'un paiement, ou renvoie celle qui existe déjà.
 *
 * Les mentions sont figées ici, à partir des données lues. La numérotation est
 * faite par la base, dans la même transaction que l'insertion.
 *
 * @param {string} paiementId
 * @param {object} [contexte]  contexte partagé, pour émettre plusieurs quittances
 */
export async function genererQuittance(paiementId, contexte = null) {
  const ctx = contexte ?? (await contexteQuittance());
  const paiement = ctx.paiements.get(paiementId);
  if (!paiement) throw new Error("Paiement introuvable");

  const existante = ctx.quittances.find((q) => q.paiementId === paiementId);
  if (existante) return existante;

  const bail = ctx.baux.get(paiement.bailId);
  const lot = bail ? ctx.lots.get(bail.lotId) : null;
  const immeuble = lot ? ctx.immeubles.get(lot.immeubleId) : null;
  const locataire = bail ? ctx.locataires.get(bail.locataireId) : null;
  const { proprietaire } = ctx;

  const quittance = {
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
    nomLocataire: [locataire?.prenoms, locataire?.nom].filter(Boolean).join(" "),
    prenomsLocataire: locataire?.prenoms || "",
    ifuLocataire: locataire?.ifu || "",
    telephoneLocataire: locataire?.telephone || "",
    designationLot: lot?.designation || "",
    numeroLot: lot?.numero || "",
    adresseImmeuble: adresseLocativeImmeuble(immeuble),
    nomProprietaire: proprietaire?.nom || "",
    prenomsProprietaire: proprietaire?.prenoms || "",
    ifuProprietaire: proprietaire?.ifu || "",
    telephoneProprietaire: proprietaire?.telephone || "",
    adresseProprietaire: proprietaire?.adresse || "",
    villeProprietaire: proprietaire?.ville || "Cotonou",
    createdAt: maintenant(),
  };

  const emise = await appeler("emettre_quittance", {
    p_paiement_id: paiementId,
    q: versBaseLigne(quittance),
  });
  return depuisBase(emise);
}

/** Émet les quittances manquantes, une fois par paiement. */
export async function genererQuittancesManquantes(contexteConnu = null) {
  const contexte = contexteConnu ?? (await contexteQuittance());
  const deja = new Set(contexte.quittances.map((q) => q.paiementId));
  const creees = [];
  // En série : chaque quittance prend son numéro dans la base, sous verrou.
  for (const p of contexte.paiements.values()) {
    if (!deja.has(p.id)) creees.push(await genererQuittance(p.id, contexte));
  }
  return creees;
}

// --- Écoute en continu ---
//
// Chaque changement d'une table recharge cette seule donnée et la transmet. La
// base diffuse ces changements à toutes les sessions ouvertes, donc un second
// appareil voit les saisies du premier.

const LECTEURS_ECOUTES = {
  proprietaire: getProprietaire,
  immeubles: listImmeubles,
  lots: listLots,
  locataires: listLocataires,
  baux: listBaux,
  loyers: listLoyers,
  paiements: listPaiements,
  depenses: listDepenses,
  quittances: listQuittances,
};

// Table modifiée → donnée à recharger. Les allocations sont portées par les paiements.
const TABLE_VERS_DONNEE = {
  proprietaire: "proprietaire",
  immeubles: "immeubles",
  lots: "lots",
  locataires: "locataires",
  baux: "baux",
  loyers: "loyers",
  paiements: "paiements",
  paiement_allocations: "paiements",
  depenses: "depenses",
  quittances: "quittances",
};

/**
 * Écoute la base en continu et renvoie la fonction qui arrête l'écoute.
 *
 * `onPret` est appelé une fois que chaque donnée a été lue une première fois.
 */
export function ecouterDonnees({ onChangement, onPret, onErreur }) {
  const enAttente = new Map();

  const recharger = (cle) => {
    LECTEURS_ECOUTES[cle]()
      .then((valeur) => onChangement(cle, valeur))
      .catch((e) => onErreur(e.message));
  };

  // Plusieurs lignes changent souvent d'un coup : une seule relecture par donnée.
  const planifier = (cle) => {
    clearTimeout(enAttente.get(cle));
    enAttente.set(cle, setTimeout(() => recharger(cle), 120));
  };

  const canal = supabase.channel("cag-donnees");
  for (const table of Object.keys(TABLE_VERS_DONNEE)) {
    canal.on("postgres_changes", { event: "*", schema: "public", table }, () =>
      planifier(TABLE_VERS_DONNEE[table])
    );
  }
  canal.subscribe();

  const cles = Object.keys(LECTEURS_ECOUTES);
  Promise.all(
    cles.map((cle) =>
      LECTEURS_ECOUTES[cle]().then((valeur) => onChangement(cle, valeur))
    )
  )
    .then(() => onPret())
    .catch((e) => onErreur(e.message));

  return () => {
    for (const t of enAttente.values()) clearTimeout(t);
    supabase.removeChannel(canal);
  };
}
