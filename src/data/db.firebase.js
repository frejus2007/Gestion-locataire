// Service de données — implémentation Firestore
//
// API calquée sur src/data/db.js pour permettre un basculement transparent
// entre mode mock et mode Firebase.
//
// Tout est asynchrone : les fonctions renvoient des Promises.

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  runTransaction,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase/config";
import { periodeCourante, periodeDecalee, comparePeriode } from "../utils/format.js";

export function nextId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const dupliquer = (obj) => JSON.parse(JSON.stringify(obj));

// Collections
const C_PROPRIETAIRE = "proprietaire";
const C_IMMEUBLES = "immeubles";
const C_LOTS = "lots";
const C_LOCATAIRES = "locataires";
const C_BAUX = "baux";
const C_LOYERS = "loyers";
const C_PAIEMENTS = "paiements";
const C_QUITTANCES = "quittances";
const C_DEPENSES = "depenses";
const C_COUNTERS = "counters";

// --- Helpers
async function getCollection(name) {
  const snap = await getDocs(collection(db, name));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function getById(name, id) {
  const ref = doc(db, name, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

async function setById(name, id, data) {
  const ref = doc(db, name, id);
  await setDoc(ref, { ...data, updatedAt: serverTimestamp() }, { merge: true });
  return id;
}

// --- Données de référence (mêmes exports)
export const MOIS_DE_PAYEMENT = [
  { id: "especes", label: "Espèces" },
  { id: "virement", label: "Virement bancaire" },
  { id: "mobile", label: "Mobile Money" },
  { id: "cheque", label: "Chèque" },
];

export const CATEGORIES_DEPENSE = [
  "Entretien & réparations",
  "Charges communes",
  "Assurance",
  "Taxes foncières",
  "Main d'œuvre",
  "Autre",
];

export const POSTES_FRAIS = ["loyer", "eau", "electricite", "ordures", "degats", "autre1", "autre2"];

export const LIGNES_FRAIS = [
  { cle: "loyer", label: "Loyer" },
  { cle: "eau", label: "Eau" },
  { cle: "electricite", label: "Électricité" },
  { cle: "ordures", label: "Ordures" },
  { cle: "degats", label: "Dégâts" },
  { cle: "autre1", label: "Autre 1" },
  { cle: "autre2", label: "Autre 2" },
];

// --- Propriétaire
export async function getProprietaire() {
  const snap = await getDoc(doc(db, C_PROPRIETAIRE, "proprietaire"));
  if (snap.exists()) return { id: snap.id, ...snap.data() };
  const def = {
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
  await setDoc(doc(db, C_PROPRIETAIRE, "proprietaire"), def);
  return def;
}

export async function updateProprietaire(champs) {
  const ref = doc(db, C_PROPRIETAIRE, "proprietaire");
  await updateDoc(ref, { ...champs, updatedAt: serverTimestamp() });
  const s = await getDoc(ref);
  return { id: s.id, ...s.data() };
}

// --- Immeubles
export async function listImmeubles() {
  return getCollection(C_IMMEUBLES);
}
export async function getImmeuble(id) {
  return getById(C_IMMEUBLES, id);
}
export async function createImmeuble(data) {
  const ref = await addDoc(collection(db, C_IMMEUBLES), { ...data, createdAt: serverTimestamp() });
  return ref.id;
}
export async function updateImmeuble(id, data) {
  await updateDoc(doc(db, C_IMMEUBLES, id), { ...data, updatedAt: serverTimestamp() });
  return id;
}
export async function deleteImmeuble(id) {
  await deleteDoc(doc(db, C_IMMEUBLES, id));
}

// --- Lots
export async function listLots() {
  return getCollection(C_LOTS);
}
export async function getLot(id) {
  return getById(C_LOTS, id);
}
export async function createLot(data) {
  const ref = await addDoc(collection(db, C_LOTS), { ...data, createdAt: serverTimestamp() });
  return ref.id;
}
export async function updateLot(id, data) {
  await updateDoc(doc(db, C_LOTS, id), { ...data, updatedAt: serverTimestamp() });
  return id;
}
export async function deleteLot(id) {
  await deleteDoc(doc(db, C_LOTS, id));
}

// --- Locataires
export async function listLocataires() {
  return getCollection(C_LOCATAIRES);
}
export async function getLocataire(id) {
  return getById(C_LOCATAIRES, id);
}
export async function createLocataire(data) {
  const ref = await addDoc(collection(db, C_LOCATAIRES), { ...data, createdAt: serverTimestamp() });
  return ref.id;
}
export async function updateLocataire(id, data) {
  await updateDoc(doc(db, C_LOCATAIRES, id), { ...data, updatedAt: serverTimestamp() });
  return id;
}
export async function deleteLocataire(id) {
  await deleteDoc(doc(db, C_LOCATAIRES, id));
}

// --- Baux
export async function listBaux() {
  return getCollection(C_BAUX);
}
export async function getBail(id) {
  return getById(C_BAUX, id);
}
export async function createBail(data) {
  const ref = await addDoc(collection(db, C_BAUX), { ...data, createdAt: serverTimestamp() });
  return ref.id;
}
export async function updateBail(id, data) {
  await updateDoc(doc(db, C_BAUX, id), { ...data, updatedAt: serverTimestamp() });
  return id;
}
export async function deleteBail(id) {
  await deleteDoc(doc(db, C_BAUX, id));
}

// --- Loyers
export async function listLoyers() {
  return getCollection(C_LOYERS);
}

export async function getLoyer(id) {
  return getById(C_LOYERS, id);
}

export async function saveLoyer(data, id = null) {
  if (id) {
    await updateDoc(doc(db, C_LOYERS, id), { ...data, updatedAt: serverTimestamp() });
    return id;
  }
  const ref = await addDoc(collection(db, C_LOYERS), { ...data, createdAt: serverTimestamp() });
  return ref.id;
}

export async function deleteLoyer(id) {
  await deleteDoc(doc(db, C_LOYERS, id));
}

// --- Dépenses
export async function listDepenses() {
  return getCollection(C_DEPENSES);
}
export async function createDepense(data) {
  const ref = await addDoc(collection(db, C_DEPENSES), { ...data, createdAt: serverTimestamp() });
  return ref.id;
}
export async function updateDepense(id, data) {
  await updateDoc(doc(db, C_DEPENSES, id), { ...data, updatedAt: serverTimestamp() });
  return id;
}
export async function deleteDepense(id) {
  await deleteDoc(doc(db, C_DEPENSES, id));
}

// --- Paiements & Quittances (minimal helpers)
export async function listPaiements() {
  return getCollection(C_PAIEMENTS);
}
export async function listQuittances() {
  return getCollection(C_QUITTANCES);
}

async function nextNumeroQuittance() {
  return runTransaction(db, async (tx) => {
    const ref = doc(db, C_COUNTERS, "quittances");
    const snap = await tx.get(ref);
    let n = 1;
    if (snap.exists()) n = (snap.data().value || 0) + 1;
    tx.set(ref, { value: n, updatedAt: serverTimestamp() }, { merge: true });
    const annee = new Date().getFullYear();
    return `Q-${annee}-${String(n).padStart(6, "0")}`;
  });
}

export async function enregistrerPaiement(data) {
  const ref = await addDoc(collection(db, C_PAIEMENTS), { ...data, createdAt: serverTimestamp() });
  return ref.id;
}

export async function genererQuittance(paiementId) {
  const p = await getById(C_PAIEMENTS, paiementId);
  if (!p) throw new Error("Paiement introuvable");
  const numero = await nextNumeroQuittance();
  const q = {
    id: nextId("quittance"),
    paiementId,
    bailId: p.bailId,
    locataireId: p.locataireId,
    periode: p.periode,
    montant: p.montant,
    datePaiement: p.date,
    dateEmission: new Date().toISOString().slice(0, 10),
    numero,
    nomLocataire: p.nomLocataire || p.prenomsLocataire || "",
    prenomsLocataire: p.prenomsLocataire || "",
    nomProprietaire: p.nomProprietaire || "",
    prenomsProprietaire: p.prenomsProprietaire || "",
    ifuProprietaire: p.ifuProprietaire || "",
    villeProprietaire: p.villeProprietaire || "Cotonou",
  };
  await setDoc(doc(db, C_QUITTANCES, q.id), { ...q, createdAt: serverTimestamp() });
  return q;
}

export async function genererQuittancesManquantes() {
  const paiements = await listPaiements();
  const quittances = await listQuittances();
  const deja = new Set(quittances.map((q) => q.paiementId));
  for (const p of paiements) {
    if (!deja.has(p.id)) {
      await genererQuittance(p.id);
    }
  }
}
export { genererLoyersDepuis, genererLoyersPourPeriode } from "./db";
export { lignesPostesPour } from "./db";
