// Mises à jour optimistes : calculs purs sur l'état connu de l'application.
//
// L'interface change tout de suite, avant la confirmation du serveur. Ces calculs
// reproduisent les règles de suppression de la base (voir supabase/fonctions.sql).
// En cas d'échec, la relecture de l'application ramène l'état réel : ces
// fonctions n'ont donc pas à être exactes au centime, seulement fidèles.

import { statutPour, payeSur } from "../data/db.supabase.js";

const sansIds = (liste, ids) => liste.filter((x) => !ids.has(x.id));

/** Ajoute les lignes absentes, et remplace celles qui existent déjà. */
export function fusionner(liste, lignes) {
  const parId = new Map(lignes.map((l) => [l.id, l]));
  const existantes = liste.map((x) => (parId.has(x.id) ? { ...x, ...parId.get(x.id) } : x));
  const absentes = lignes.filter((l) => !liste.some((x) => x.id === l.id));
  return [...existantes, ...absentes];
}

/** Retire des baux, avec leurs loyers, paiements et quittances. */
function retirerBaux(d, bailIds, locataireIds = new Set()) {
  const paiementsRetires = d.paiements.filter(
    (p) => bailIds.has(p.bailId) || locataireIds.has(p.locataireId)
  );
  const paiementIds = new Set(paiementsRetires.map((p) => p.id));
  return {
    baux: sansIds(d.baux, bailIds),
    loyers: d.loyers.filter((l) => !bailIds.has(l.bailId)),
    paiements: sansIds(d.paiements, paiementIds),
    quittances: d.quittances.filter(
      (q) => !(bailIds.has(q.bailId) || paiementIds.has(q.paiementId) || locataireIds.has(q.locataireId))
    ),
  };
}

export function supprimerLocataire(d, id) {
  const bailIds = new Set(d.baux.filter((b) => b.locataireId === id).map((b) => b.id));
  return {
    locataires: sansIds(d.locataires, new Set([id])),
    ...retirerBaux(d, bailIds, new Set([id])),
  };
}

export function supprimerBail(d, id) {
  return retirerBaux(d, new Set([id]));
}

export function supprimerImmeuble(d, id) {
  const loues = new Set(d.baux.map((b) => b.lotId));
  const libres = new Set(d.lots.filter((l) => l.immeubleId === id && !loues.has(l.id)).map((l) => l.id));
  return {
    immeubles: sansIds(d.immeubles, new Set([id])),
    // Un lot loué reste, détaché de son immeuble.
    lots: sansIds(d.lots, libres).map((l) => (l.immeubleId === id ? { ...l, immeubleId: null } : l)),
  };
}

/** Retire un paiement et sa quittance ; les loyers qu'il couvrait sont recalculés. */
export function supprimerPaiement(d, id) {
  const paiement = d.paiements.find((p) => p.id === id);
  const loyerIds = new Set((paiement?.allocations || []).map((a) => a.loyerId));
  const restants = d.paiements.filter((p) => p.id !== id);
  return {
    paiements: restants,
    quittances: d.quittances.filter((q) => q.paiementId !== id),
    loyers: d.loyers.map((l) =>
      loyerIds.has(l.id) ? { ...l, statut: statutPour(payeSur(restants, l.id), l.montantDu) } : l
    ),
  };
}
