// Service de données — implémentation mock en mémoire.
//
// L'API de ce module est volontairement calquée sur celle qu'exposera la couche
// Firebase (Firestore + Storage) : mêmes noms de fonctions, mêmes signatures,
// mêmes valeurs de retour. Le remplacement se fera fichier par fichier, sans
// toucher aux pages ni aux composants.
//
// Sémantique des montants : ce sont toujours des entiers en FCFA.

import { periodeCourante, periodeDecalee, comparePeriode } from "../utils/format.js";

// --- Compteur d'identifiants ---

let sequence = 0;
export function nextId(prefix) {
  sequence += 1;
  return `${prefix}_${String(sequence).padStart(4, "0")}`;
}

const dupliquer = (obj) => JSON.parse(JSON.stringify(obj));

// --- Données de démonstration ---

function jeuDeDemo() {
  const proprietaire = {
    id: "proprietaire",
    nom: "KOUASSI",
    prenoms: "Jean-Marc",
    telephone: "+229 97 12 34 56",
    adresse: "Rue des Pêches, Fidjrossè",
    ville: "Cotonou",
    ifu: "3202100123456",
    banque: "Ecobank Benin — 0100 4500 1234 56",
    signatureUrl: null,
  };

  const immeubles = [
    { id: "imm_1", nom: "Résidence Les Palmiers", adresse: "Fidjrossè", quartier: "Fidjrossè", ville: "Cotonou", notes: "Immeuble R+2, 4 appartements, générateur commun.", dateAcquisition: "2019-06-01", statut: "actif" },
    { id: "imm_2", nom: "Villa Gbèto", adresse: "Carrefour Gbèto", quartier: "Gbèto", ville: "Cotonou", notes: "Villa avec jardin clôturé.", dateAcquisition: "2022-03-15", statut: "actif" },
    { id: "imm_3", nom: "Résidence Albarika", adresse: "Fidjrossè", quartier: "Fidjrossè", ville: "Cotonou", notes: "En cours de rénovation, 2 lots seuls livrés.", dateAcquisition: "2025-11-20", statut: "travaux" },
  ];

  const lots = [
    { id: "lot_1", immeubleId: "imm_1", designation: "Appartement 1 — RDC gauche", etage: "RDC", nbPieces: 3, loyerReference: 60000, notes: "Avec garden." },
    { id: "lot_2", immeubleId: "imm_1", designation: "Appartement 2 — RDC droit", etage: "RDC", nbPieces: 3, loyerReference: 60000, notes: "" },
    { id: "lot_3", immeubleId: "imm_1", designation: "Appartement 3 — 1er étage", etage: "1er", nbPieces: 4, loyerReference: 75000, notes: "Balcon." },
    { id: "lot_4", immeubleId: "imm_1", designation: "Appartement 4 — 1er étage", etage: "1er", nbPieces: 4, loyerReference: 75000, notes: "" },
    { id: "lot_5", immeubleId: "imm_2", designation: "Villa complète", etage: "RDC + étage", nbPieces: 5, loyerReference: 250000, notes: "Louée en bloc à une famille." },
    { id: "lot_6", immeubleId: "imm_3", designation: "Studio 5", etage: "RDC", nbPieces: 1, loyerReference: 35000, notes: "" },
  ];

  const locataires = [
    { id: "loc_1", nom: "ADJOVI", prenoms: "Marie", telephone: "+229 96 11 22 33", ifu: "202400000001", pieceNature: "CNI", pieceNumero: "CNI0012345", email: "marie.adjovi@example.bj", notes: "" },
    { id: "loc_2", nom: "HOUNNOU", prenoms: "Kofi", telephone: "+229 95 44 55 66", ifu: "202400000002", pieceNature: "Passeport", pieceNumero: "B0881234", email: "", notes: "Agent de santé, paye par virement." },
    { id: "loc_3", nom: "SOSSENOU", prenoms: "Déborah", telephone: "+229 66 77 88 99", ifu: "202400000003", pieceNature: "CNI", pieceNumero: "CNI0098765", email: "", notes: "" },
    { id: "loc_4", nom: "GBAGBO", prenoms: "Serge", telephone: "+229 97 21 33 44", ifu: "202400000004", pieceNature: "Permis", pieceNumero: "PJ889123", email: "", notes: "Ancien locataire de l'immeuble, revenu en 2024." },
  ];

  // Un bail qui démarre dans le passé (cas de mise en service) et un autre ancien,
  // pour que la génération rétroactive ait quelque chose à produire.
  const baux = [
    { id: "bail_1", lotId: "lot_1", locataireId: "loc_1", dateDebut: "2026-02-01", dateFin: null, loyerMensuel: 60000, cautionVersee: 100000, cautionStatut: "restituee", notes: "" },
    { id: "bail_2", lotId: "lot_2", locataireId: "loc_2", dateDebut: "2025-09-01", dateFin: null, loyerMensuel: 60000, cautionVersee: 120000, cautionStatut: "restituee", notes: "Augmentation de 5 000 à la révision annuelle." },
    { id: "bail_3", lotId: "lot_3", locataireId: "loc_3", dateDebut: "2026-06-01", dateFin: null, loyerMensuel: 75000, cautionVersee: 150000, cautionStatut: "restituee", notes: "" },
    { id: "bail_4", lotId: "lot_5", locataireId: "loc_4", dateDebut: "2026-09-01", dateFin: null, loyerMensuel: 250000, cautionVersee: 500000, cautionStatut: "deposee", notes: "" },
  ];

  return { proprietaire, immeubles, lots, locataires, baux, loyers: [], paiements: [], depenses: [], quittances: [] };
}

const db = jeuDeDemo();

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
  { id: "frais_notaire", label: "Frais de notaire et papiers" },
];

// --- Lecture ---

export function getProprietaire() {
  return dupliquer(db.proprietaire);
}

export function updateProprietaire(champs) {
  db.proprietaire = { ...db.proprietaire, ...champs };
  return getProprietaire();
}

export function listImmeubles() {
  return dupliquer(db.immeubles);
}

export function getImmeuble(id) {
  const found = db.immeubles.find((i) => i.id === id);
  return found ? dupliquer(found) : null;
}

export function listLots(immeubleId = null) {
  const items = immeubleId ? db.lots.filter((l) => l.immeubleId === immeubleId) : db.lots;
  return dupliquer(items);
}

export function getLot(id) {
  const found = db.lots.find((l) => l.id === id);
  return found ? dupliquer(found) : null;
}

export function listLocataires() {
  return dupliquer(db.locataires);
}

export function getLocataire(id) {
  const found = db.locataires.find((l) => l.id === id);
  return found ? dupliquer(found) : null;
}

export function listBaux() {
  return dupliquer(db.baux);
}

export function getBail(id) {
  const found = db.baux.find((b) => b.id === id);
  return found ? dupliquer(found) : null;
}

export function listLoyers() {
  return dupliquer(db.loyers);
}

export function listPaiements() {
  return dupliquer(db.paiements);
}

export function listDepenses() {
  return dupliquer(db.depenses);
}

export function listQuittances() {
  return dupliquer(db.quittances);
}

export function getQuittance(id) {
  const found = db.quittances.find((q) => q.id === id);
  return found ? dupliquer(found) : null;
}

// --- Écriture ---

export function createImmeuble(data) {
  const immeuble = { id: nextId("imm"), statut: "actif", notes: "", ...data };
  db.immeubles.push(immeuble);
  return dupliquer(immeuble);
}

export function updateImmeuble(id, data) {
  const idx = db.immeubles.findIndex((i) => i.id === id);
  if (idx < 0) return null;
  db.immeubles[idx] = { ...db.immeubles[idx], ...data };
  return dupliquer(db.immeubles[idx]);
}

export function deleteImmeuble(id) {
  const lotIds = db.lots.filter((l) => l.immeubleId === id).map((l) => l.id);
  const bailIds = db.baux.filter((b) => lotIds.includes(b.lotId)).map((b) => b.id);
  const loyerIds = db.loyers.filter((l) => bailIds.includes(l.bailId)).map((l) => l.id);
  db.immeubles = db.immeubles.filter((i) => i.id !== id);
  db.lots = db.lots.filter((l) => !lotIds.includes(l.id));
  deleteBaux(bailIds);
  db.loyers = db.loyers.filter((l) => !loyerIds.includes(l.id));
  return true;
}

export function createLot(data) {
  // L'id est généré ici et non fourni par l'appelant : un lot sans identifiant
  // ne pourrait pas être rattaché à un bail ni affiché.
  const lot = { id: nextId("lot"), notes: "", ...data };
  db.lots.push(lot);
  return dupliquer(lot);
}

export function updateLot(id, data) {
  const idx = db.lots.findIndex((l) => l.id === id);
  if (idx < 0) return null;
  db.lots[idx] = { ...db.lots[idx], ...data };
  return dupliquer(db.lots[idx]);
}

export function deleteLot(id) {
  db.lots = db.lots.filter((l) => l.id !== id);
  const bailIds = db.baux.filter((b) => b.lotId === id).map((b) => b.id);
  deleteBaux(bailIds);
  return true;
}

export function createLocataire(data) {
  // Même raison que pour les lots : l'identifiant est attribué à la création.
  const locataire = { id: nextId("loc"), notes: "", ...data };
  db.locataires.push(locataire);
  return dupliquer(locataire);
}

export function updateLocataire(id, data) {
  const idx = db.locataires.findIndex((l) => l.id === id);
  if (idx < 0) return null;
  db.locataires[idx] = { ...db.locataires[idx], ...data };
  return dupliquer(db.locataires[idx]);
}

export function deleteLocataire(id) {
  db.locataires = db.locataires.filter((l) => l.id !== id);
  const bailIds = db.baux.filter((b) => b.locataireId === id).map((b) => b.id);
  deleteBaux(bailIds);
  return true;
}

export function createBail(data) {
  const bail = {
    id: nextId("bail"),
    dateFin: null,
    cautionVersee: 0,
    cautionStatut: "non-versee",
    notes: "",
    ...data,
  };
  db.baux.push(bail);
  return dupliquer(bail);
}

export function updateBail(id, data) {
  const idx = db.baux.findIndex((b) => b.id === id);
  if (idx < 0) return null;
  db.baux[idx] = { ...db.baux[idx], ...data };
  return dupliquer(db.baux[idx]);
}

// Supprime un bail et tout ce qui en dépend (loyers, paiements, quittances).
function deleteBaux(bailIds) {
  if (!bailIds.length) return;
  const loyerIds = db.loyers.filter((l) => bailIds.includes(l.bailId)).map((l) => l.id);
  const paiementIds = db.paiements
    .filter((p) => (p.allocations || []).some((a) => loyerIds.includes(a.loyerId)))
    .map((p) => p.id);
  db.baux = db.baux.filter((b) => !bailIds.includes(b.id));
  db.loyers = db.loyers.filter((l) => !bailIds.includes(l.bailId));
  db.paiements = db.paiements.filter((p) => !paiementIds.includes(p.id));
  db.quittances = db.quittances.filter((q) => !paiementIds.includes(q.paiementId));
}

export function deleteBail(id) {
  deleteBaux([id]);
  return true;
}

export function createDepense(data) {
  const depense = { id: nextId("dep"), note: "", ...data };
  db.depenses.push(depense);
  return dupliquer(depense);
}

export function updateDepense(id, data) {
  const idx = db.depenses.findIndex((d) => d.id === id);
  if (idx < 0) return null;
  db.depenses[idx] = { ...db.depenses[idx], ...data };
  return dupliquer(db.depenses[idx]);
}

export function deleteDepense(id) {
  db.depenses = db.depenses.filter((d) => d.id !== id);
  return true;
}

// --- Génération des loyers ---

/** Première période couverte par un bail, au format "2026-02". */
export function periodeDebutBail(bail) {
  return bail.dateDebut.slice(0, 7);
}

/**
 * Dernière période couverte, date de fin incluse.
 * Un bail sans date de fin n'a pas de borne haute naturelle : on passe alors
 * `periodeMax` (par défaut la période courante).
 */
export function periodeFinBail(bail, periodeMax = periodeCourante()) {
  if (!bail.dateFin) return periodeMax;
  return bail.dateFin.slice(0, 7);
}

/**
 * Le bail couvre-t-il cette période ? La date d'entrée et la sortie sont incluses.
 * `periodeMax` borne les baux sans date de fin ; passe Infinity pour accepter
 * une période future (avance sur le mois suivant).
 */
export function bailCouvre(bail, periode, periodeMax = periodeCourante()) {
  return comparePeriode(periodeDebutBail(bail), periode) <= 0
    && comparePeriode(periode, periodeFinBail(bail, periodeMax)) <= 0;
}

/** Un bail est-il en cours aujourd'hui (borné au présent) ? */
export function bailActifCouvre(bail, periode, periodeMax = periodeCourante()) {
  return comparePeriode(periode, periodeMax) <= 0 && bailCouvre(bail, periode, periodeMax);
}

/**
 * Crée les loyers manquants pour une période donnée. Idempotent : un loyer déjà
 * présent pour ce bail et cette période n'est pas dupliqué.
 * @param {string} periode    ex. "2026-11"
 * @param {boolean} jusquA    true pour ne pas dépasser la période courante
 * @returns {number} nombre de loyers créés
 */
export function genererLoyersPourPeriode(periode, bailIds = null, { jusquA = true } = {}) {
  const cibles = bailIds
    ? db.baux.filter((b) => bailIds.includes(b.id))
    : db.baux;
  let crees = 0;
  for (const bail of cibles) {
    const couvert = jusquA
      ? bailActifCouvre(bail, periode)
      : bailCouvre(bail, periode, Infinity);
    if (!couvert) continue;
    const existe = db.loyers.some((l) => l.bailId === bail.id && l.periode === periode);
    if (existe) continue;
    db.loyers.push({
      id: nextId("loy"),
      bailId: bail.id,
      periode,
      montantDu: bail.loyerMensuel,
      // Le statut est dérivé, mais on le stocke pour éviter de recalculer
      // à chaque rendu ; il est réécrit par recomputeStatutLoyers().
      statut: "impaye",
    });
    crees += 1;
  }
  return crees;
}

/**
 * Génère tous les loyers dus depuis une date jusqu'à la période courante.
 * Utilisé à la création d'un bail pour reconstituer l'historique.
 */
export function genererLoyersDepuis(bailId, periodeDebut, periodeFin = periodeCourante()) {
  const bail = db.baux.find((b) => b.id === bailId);
  if (!bail) return 0;
  let periodes = [];
  let cur = periodeDebut.slice(0, 7);
  let garde = 0;
  while (comparePeriode(cur, periodeFin) <= 0 && garde++ < 600) {
    periodes.push(cur);
    cur = periodeDecalee(cur, 1);
  }
  let crees = 0;
  for (const periode of periodes) {
    // Ici on dépasse volontairement la période courante : un bail créé avec
    // une date de fin future doit voir ses loyers générés jusqu'à cette date.
    crees += genererLoyersPourPeriode(periode, [bailId], { jusquA: false });
  }
  return crees;
}

/** Total déjà imputé sur un loyer, tous paiements confondus. */
function totalAllouePourLoyer(loyerId, ignorerPaiementId = null) {
  return db.paiements
    .filter((p) => p.id !== ignorerPaiementId)
    .reduce((s, p) => {
      const alloc = (p.allocations || []).find((a) => a.loyerId === loyerId);
      return s + (alloc ? alloc.montant : 0);
    }, 0);
}

/** Recalcule le statut d'un loyer d'après les paiements qui lui sont alloués. */
export function recomputeStatutLoyers(loyerIds) {
  for (const loyerId of loyerIds) {
    const loyer = db.loyers.find((l) => l.id === loyerId);
    if (!loyer) continue;
    const paye = db.paiements
      .filter((p) => (p.allocations || []).some((a) => a.loyerId === loyerId))
      .reduce((s, p) => {
        const alloc = p.allocations.find((a) => a.loyerId === loyerId);
        return s + alloc.montant;
      }, 0);
    loyer.statut = paye <= 0 ? "impaye" : paye >= loyer.montantDu ? "paye" : "partiel";
  }
}

// --- Encaissement ---

/**
 * Enregistre un paiement et l'alloue aux loyers indiqués.
 * @param {object} data { bailId, date, montant, mode, reference, allocations:[{loyerId,montant}], note }
 * @returns {{paiement, quittance|null}}
 */
export function enregistrerPaiement(data) {
  const bail = db.baux.find((b) => b.id === data.bailId);
  if (!bail) throw new Error("Bail introuvable");

  const allocations = (data.allocations || []).filter((a) => a.montant > 0);
  const totalAlloue = allocations.reduce((s, a) => s + a.montant, 0);
  const montant = Math.round(Number(data.montant) || 0);
  if (montant <= 0) throw new Error("Le montant doit être supérieur à zéro");
  if (totalAlloue > montant) {
    throw new Error("Le total alloué dépasse le montant encaissé");
  }
  if (montant - totalAlloue > 0) {
    throw new Error("La totalité du montant doit être allouée à un loyer");
  }

  // Un loyer ne peut pas recevoir plus que ce qui lui reste dû : c'est ce qui
  // empêche de payer deux fois la même période.
  for (const alloc of allocations) {
    const loyer = db.loyers.find((l) => l.id === alloc.loyerId);
    if (!loyer) throw new Error("Loyer introuvable dans l'allocation");
    if (loyer.bailId !== bail.id) {
      throw new Error("Un loyer ne peut pas être imputé à un autre bail");
    }
    const dejaPaye = totalAllouePourLoyer(loyer.id, data.paiementIdExistant);
    const reste = loyer.montantDu - dejaPaye;
    if (alloc.montant > reste) {
      throw new Error(
        `Montant trop élevé pour ${loyer.periode} : il reste ${reste} FCFA à payer`
      );
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
    allocations: allocations.map((a) => ({ loyerId: a.loyerId, montant: Math.round(a.montant) })),
  };
  db.paiements.push(paiement);
  recomputeStatutLoyers(allocations.map((a) => a.loyerId));

  return { paiement: dupliquer(paiement), quittance: null };
}

/**
 * Modifier un paiement. Les allocations sont revalidées comme à la création :
 * le paiement lui-même est exclu du calcul du reste à payer.
 */
export function updatePaiement(id, data) {
  const idx = db.paiements.findIndex((p) => p.id === id);
  if (idx < 0) return null;
  const anciens = db.paiements[idx].allocations.map((a) => a.loyerId);

  const montant = Math.round(Number(data.montant ?? db.paiements[idx].montant) || 0);
  const allocations = (data.allocations ?? db.paiements[idx].allocations)
    .filter((a) => a.montant > 0);
  const totalAlloue = allocations.reduce((s, a) => s + a.montant, 0);

  if (montant <= 0) throw new Error("Le montant doit être supérieur à zéro");
  if (Math.abs(totalAlloue - montant) > 0.5) {
    throw new Error("Le total alloué doit correspondre au montant encaissé");
  }
  const bail = db.baux.find((b) => b.id === db.paiements[idx].bailId);
  for (const alloc of allocations) {
    const loyer = db.loyers.find((l) => l.id === alloc.loyerId);
    if (!loyer) throw new Error("Loyer introuvable dans l'allocation");
    if (bail && loyer.bailId !== bail.id) {
      throw new Error("Un loyer ne peut pas être imputé à un autre bail");
    }
    const reste = loyer.montantDu - totalAllouePourLoyer(loyer.id, id);
    if (alloc.montant > reste) {
      throw new Error(
        `Montant trop élevé pour ${loyer.periode} : il reste ${reste} FCFA à payer`
      );
    }
  }

  db.paiements[idx] = {
    ...db.paiements[idx],
    ...data,
    montant,
    allocations: allocations.map((a) => ({ loyerId: a.loyerId, montant: Math.round(a.montant) })),
  };
  recomputeStatutLoyers([...anciens, ...allocations.map((a) => a.loyerId)]);
  return dupliquer(db.paiements[idx]);
}

export function deletePaiement(id) {
  const paiement = db.paiements.find((p) => p.id === id);
  if (!paiement) return false;
  db.paiements = db.paiements.filter((p) => p.id !== id);
  db.quittances = db.quittances.filter((q) => q.paiementId !== id);
  recomputeStatutLoyers(paiement.allocations.map((a) => a.loyerId));
  return true;
}

// --- Quittances ---

/** Numéro suivant pour une année, à partir des quittances déjà émises. */
export function prochainNumeroQuittance(annee) {
  let max = 0;
  for (const q of db.quittances) {
    const m = q.numero.match(new RegExp(`^Q-${annee}-(\\d+)$`));
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

/**
 * Génère la quittance d'un paiement et lui attribue un numéro séquentiel.
 * Le numéro est définitif : il ne dépend pas de l'identifiant du paiement.
 */
export function genererQuittance(paiementId) {
  const existant = db.quittances.find((q) => q.paiementId === paiementId);
  if (existant) return dupliquer(existant);

  const paiement = db.paiements.find((p) => p.id === paiementId);
  if (!paiement) throw new Error("Paiement introuvable");

  const annee = paiement.date.slice(0, 4);
  const numero = prochainNumeroQuittance(annee);

  // On fige les informations telles qu'elles étaient à l'émission.
  const bail = db.baux.find((b) => b.id === paiement.bailId);
  const lot = bail ? db.lots.find((l) => l.id === bail.lotId) : null;
  const immeuble = lot ? db.immeubles.find((i) => i.id === lot.immeubleId) : null;
  const locataire = db.locataires.find((l) => l.id === paiement.locataireId);
  const annees = db.quittances.filter((q) => q.annee === annee).length + 1;

  const quittance = {
    id: nextId("qui"),
    numero: `Q-${annee}-${String(numero).padStart(6, "0")}`,
    annee: String(annee),
    rang: numero,
    emission: new Date().toISOString().slice(0, 10),
    paiementId: paiement.id,
    bailId: paiement.bailId,
    locataireId: paiement.locataireId,
    anneeNumero: `${annees}/${nombreLoyersAnnee(paiement.bailId, annee)}`,
    // Instantané imprimable
    nomProprietaire: db.proprietaire.nom,
    prenomsProprietaire: db.proprietaire.prenoms,
    adresseProprietaire: db.proprietaire.adresse,
    villeProprietaire: db.proprietaire.ville,
    telephoneProprietaire: db.proprietaire.telephone,
    ifuProprietaire: db.proprietaire.ifu,
    nomLocataire: locataire ? `${locataire.nom} ${locataire.prenoms}` : "",
    adresseImmeuble: immeuble ? `${immeuble.adresse}, ${immeuble.ville}` : "",
    designationLot: lot ? lot.designation : "",
    montant: paiement.montant,
    datePaiement: paiement.date,
    mode: paiement.mode,
    reference: paiement.reference,
    allocations: dupliquer(paiement.allocations),
  };
  db.quittances.push(quittance);
  return dupliquer(quittance);
}

function nombreLoyersAnnee(bailId, annee) {
  return db.loyers.filter((l) => l.bailId === bailId && l.periode.startsWith(annee)).length;
}

/** Émet en une fois toutes les quittances des paiements sans quittance. */
export function genererQuittancesManquantes() {
  let creees = 0;
  for (const paiement of db.paiements) {
    if (db.quittances.some((q) => q.paiementId === paiement.id)) continue;
    genererQuittance(paiement.id);
    creees += 1;
  }
  return creees;
}

// --- Génération de la base de démonstration ---

/**
 * Remplit la base de démonstration : loyers depuis le début des baux, paiements
 * (dont deux partiels et une avance), dépenses et quittances.
 * L'ordre compte : les loyers doivent exister avant d'être alloués.
 */
export function initialiserDemo() {
  db.loyers = [];
  db.paiements = [];
  db.quittances = [];
  db.depenses = [];

  const aujourdhui = periodeCourante();
  for (const bail of db.baux) {
    let cur = periodeDebutBail(bail);
    let garde = 0;
    while (comparePeriode(cur, aujourdhui) <= 0 && garde++ < 600) {
      genererLoyersPourPeriode(cur, [bail.id]);
      cur = periodeDecalee(cur, 1);
    }
  }

  // Paiements : certaines périodes sont réglées, d'autres impayées.
  // `regles` = nombre de loyers soldés du plus ancien au plus récent.
  // `partiel` = versement incomplet sur le loyer le plus récent.
  const scenarios = [
    // Marie règle six mois puis laisse courir : un partiel et deux impayés.
    { bailId: "bail_1", regles: 6, partiel: { montant: 30000 } },
    // Kofi est à jour : tous ses loyers sont réglés.
    { bailId: "bail_2", regles: 99 },
    // Déborah : 4 mois réglés, puis un versement partiel et un mois impayé.
    { bailId: "bail_3", regles: 4, partiel: { montant: 40000 } },
    // Serge vient d'arriver : un seul versement, plus une avance.
    { bailId: "bail_4", regles: 1 },
  ];

  for (const scenario of scenarios) {
    const bail = db.baux.find((b) => b.id === scenario.bailId);
    if (!bail) continue;
    const loyers = db.loyers
      .filter((l) => l.bailId === bail.id)
      .sort((a, b) => comparePeriode(a.periode, b.periode));

    const aRegler = loyers.length - (scenario.partiel ? 1 : 0);
    const nb = Math.min(scenario.regles, aRegler);

    for (let i = 0; i < nb; i++) {
      const loyer = loyers[i];
      const jour = 3 + ((i * 7) % 20);
      const date = `${loyer.periode}-${String(jour).padStart(2, "0")}`;
      enregistrerPaiement({
        bailId: bail.id,
        date,
        montant: loyer.montantDu,
        mode: bail.id === "bail_2" ? "virement" : "especes",
        reference: bail.id === "bail_2" ? `VIR-${2026000 + i}` : "",
        note: "",
        allocations: [{ loyerId: loyer.id, montant: loyer.montantDu }],
      });
    }

    // Paiement partiel sur un loyer plus récent.
    if (scenario.partiel) {
      const cible = loyers[loyers.length - 1];
      if (cible) {
        enregistrerPaiement({
          bailId: bail.id,
          date: `${cible.periode}-12`,
          montant: scenario.partiel.montant,
          mode: "especes",
          reference: "",
          note: "Versement partiel.",
          allocations: [{ loyerId: cible.id, montant: scenario.partiel.montant }],
        });
      }
    }
  }

  // Une avance : Serge paie aussi le mois suivant, non encore échu.
  const bail4 = db.baux.find((b) => b.id === "bail_4");
  if (bail4) {
    const loyers4 = db.loyers
      .filter((l) => l.bailId === "bail_4")
      .sort((a, b) => comparePeriode(a.periode, b.periode));
    if (loyers4.length > 1) {
      const suivant = loyers4[1];
      enregistrerPaiement({
        bailId: "bail_4",
        date: `${loyers4[0].periode}-10`,
        montant: suivant.montantDu,
        mode: "mobile",
        reference: "MOOV-8821",
        note: "Avance sur le mois suivant.",
        allocations: [{ loyerId: suivant.id, montant: suivant.montantDu }],
      });
    }
  }

  genererQuittancesManquantes();

  db.depenses.push(
    { id: nextId("dep"), immeubleId: "imm_1", categorie: "charges", montant: 35000, date: `${periodeDecalee(aujourdhui, -2)}-05`, note: "Syndic et eau" },
    { id: nextId("dep"), immeubleId: "imm_1", categorie: "reparation", montant: 12500, date: `${periodeDecalee(aujourdhui, -3)}-18`, note: "Plomberie appartement 4" },
    { id: nextId("dep"), immeubleId: "imm_1", categorie: "entretien", montant: 22000, date: `${periodeDecalee(aujourdhui, -1)}-22`, note: "Peinture cage d'escalier" },
    { id: nextId("dep"), immeubleId: "imm_2", categorie: "entretien", montant: 48000, date: `${periodeDecalee(aujourdhui, -1)}-09`, note: "Entretien jardin et clôture" },
    { id: nextId("dep"), immeubleId: "imm_2", categorie: "charges", montant: 18500, date: `${periodeDecalee(aujourdhui, -2)}-08`, note: "Taxe foncière" },
    { id: nextId("dep"), immeubleId: "imm_3", categorie: "travaux", montant: 320000, date: `${periodeDecalee(aujourdhui, -1)}-30`, note: "Rénovation studios" },
  );

  return db;
}

initialiserDemo();