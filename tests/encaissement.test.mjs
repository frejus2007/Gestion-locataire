// Tests de la logique d'encaissement et des mises à jour optimistes.
//
// Ces tests ne touchent ni à la base ni au réseau : ils travaillent sur un état
// fabriqué ici. Lancement : node --test tests/

import { test } from "node:test";
import assert from "node:assert/strict";
import { preparerEncaissement } from "../src/data/db.supabase.js";
import { fusionner, supprimerLocataire, supprimerImmeuble, supprimerPaiement } from "../src/context/optimiste.js";

const CHARGES_ZERO = { loyer: 15000, eau: 0, electricite: 0, ordures: 0, degats: 0, autre1: 0, autre2: 0 };

// Un bail de 15 000 par mois, un loyer d'octobre impayé.
function etatDeBase(surcharge = {}) {
  return {
    baux: [
      {
        id: "bail1", lotId: "lot1", locataireId: "loc1", dateDebut: "2026-10-01", dateFin: null,
        loyerMensuel: 15000, fraisDefaut: {}, cautionSur: "",
      },
    ],
    loyers: [
      {
        id: "loy1", bailId: "bail1", periode: "2026-10", loyer: 15000,
        eau: 0, electricite: 0, ordures: 0, degats: 0, autre1: 0, autre2: 0,
        montantDu: 15000, statut: "impaye",
      },
    ],
    paiements: [],
    quittances: [],
    locataires: [{ id: "loc1", nom: "DUPONT", prenoms: "Paul", actif: true }],
    lots: [{ id: "lot1", immeubleId: "imm1", designation: "Chambre 1", numero: "R1" }],
    immeubles: [{ id: "imm1", nom: "Immeuble A", adresse: "Rue 1", ville: "Cotonou" }],
    proprietaire: { id: "proprietaire", nom: "KOUASSI" },
    ...surcharge,
  };
}

const versement = (montant, allocations, extra = {}) => ({
  bailId: "bail1", date: "2026-10-24", mode: "especes", note: "", montant,
  allocations, detail: null, details: null, libelles: null, ...extra,
});

// --- Encaissement -----------------------------------------------------------

test("un versement partiel laisse le loyer partiel", () => {
  const plan = preparerEncaissement(versement(5000, [{ loyerId: "loy1", montant: 5000 }]), etatDeBase());
  assert.equal(plan.paiement.montant, 5000);
  assert.equal(plan.paiement.allocations.length, 1);
  const loyer = plan.loyers.find((l) => l.id === "loy1");
  assert.equal(loyer.statut, "partiel");
});

test("un versement complet passe le loyer à payé", () => {
  const plan = preparerEncaissement(versement(15000, [{ loyerId: "loy1", montant: 15000 }]), etatDeBase());
  assert.equal(plan.loyers.find((l) => l.id === "loy1").statut, "paye");
});

test("un dépassement est refusé avec le reste dû, avant toute écriture", () => {
  assert.throws(
    () => preparerEncaissement(versement(20000, [{ loyerId: "loy1", montant: 20000 }]), etatDeBase()),
    /Montant trop élevé pour 2026-10 : il reste 15000 FCFA à payer/
  );
});

test("le reste dû tient compte des paiements déjà imputés", () => {
  const avecPaiement = etatDeBase({
    paiements: [
      {
        id: "pay0", bailId: "bail1", date: "2026-10-05", montant: 10000,
        allocations: [{ loyerId: "loy1", montant: 10000 }],
      },
    ],
  });
  assert.throws(
    () => preparerEncaissement(versement(6000, [{ loyerId: "loy1", montant: 6000 }]), avecPaiement),
    /il reste 5000 FCFA/
  );
  const plan = preparerEncaissement(versement(5000, [{ loyerId: "loy1", montant: 5000 }]), avecPaiement);
  assert.equal(plan.loyers.find((l) => l.id === "loy1").statut, "paye");
});

test("un mois sans loyer encore créé est créé avec le paiement", () => {
  const plan = preparerEncaissement(
    versement(15000, [{ periode: "2026-11", montant: 15000 }]),
    etatDeBase()
  );
  const nouveau = plan.loyers.find((l) => l.periode === "2026-11");
  assert.ok(nouveau, "le mois de novembre doit être créé");
  assert.equal(nouveau.montantDu, 15000);
  assert.equal(nouveau.statut, "paye");
  assert.ok(plan.aEcrire.some((l) => l.id === nouveau.id), "le nouveau loyer doit être écrit");
});

test("un versement en avance affecte les mois suivants", () => {
  const plan = preparerEncaissement(
    versement(30000, [{ loyerId: "loy1", montant: 15000 }]),
    etatDeBase()
  );
  assert.equal(plan.paiement.allocations.length, 2, "octobre et novembre");
  const novembre = plan.loyers.find((l) => l.periode === "2026-11");
  assert.equal(novembre.statut, "paye");
});

test("les charges du versement entrent dans le dû : elles ne bloquent plus le paiement", () => {
  const plan = preparerEncaissement(
    versement(17000, [{ loyerId: "loy1", montant: 17000 }], {
      detail: { ...CHARGES_ZERO, eau: 2000 },
    }),
    etatDeBase()
  );
  const loyer = plan.loyers.find((l) => l.id === "loy1");
  assert.equal(loyer.eau, 2000);
  assert.equal(loyer.montantDu, 17000);
  assert.equal(loyer.statut, "paye");
  assert.ok(plan.aEcrire.some((l) => l.id === "loy1"), "le loyer modifié doit être écrit");
});

test("deux mêmes mois dans un versement sont refusés", () => {
  assert.throws(
    () =>
      preparerEncaissement(
        versement(10000, [
          { loyerId: "loy1", montant: 5000 },
          { loyerId: "loy1", montant: 5000 },
        ]),
        etatDeBase()
      ),
    /Un mois ne peut être sélectionné qu'une seule fois/
  );
});

test("un bail inconnu est refusé", () => {
  assert.throws(
    () => preparerEncaissement({ ...versement(5000, [{ loyerId: "loy1", montant: 5000 }]), bailId: "absent" }, etatDeBase()),
    /Bail introuvable/
  );
});

test("un montant nul ou absent est refusé", () => {
  assert.throws(
    () => preparerEncaissement(versement(0, [{ loyerId: "loy1", montant: 0 }]), etatDeBase()),
    /Sélectionnez au moins un mois/
  );
});

// --- Mises à jour optimistes ------------------------------------------------

test("supprimer un paiement retire sa quittance et recalcule le statut du loyer", () => {
  const etat = etatDeBase({
    loyers: [{ id: "loy1", bailId: "bail1", periode: "2026-10", montantDu: 15000, statut: "paye" }],
    paiements: [{ id: "pay1", bailId: "bail1", montant: 15000, allocations: [{ loyerId: "loy1", montant: 15000 }] }],
    quittances: [{ id: "q1", paiementId: "pay1", numero: "Q-2026-000001" }],
  });
  const apres = supprimerPaiement(etat, "pay1");
  assert.equal(apres.paiements.length, 0);
  assert.equal(apres.quittances.length, 0);
  assert.equal(apres.loyers[0].statut, "impaye");
});

test("supprimer un locataire emporte ses baux, loyers, paiements et quittances", () => {
  const etat = etatDeBase({
    paiements: [{ id: "pay1", bailId: "bail1", locataireId: "loc1", allocations: [] }],
    quittances: [{ id: "q1", paiementId: "pay1", locataireId: "loc1" }],
  });
  const apres = supprimerLocataire(etat, "loc1");
  assert.equal(apres.locataires.length, 0);
  assert.equal(apres.baux.length, 0);
  assert.equal(apres.loyers.length, 0);
  assert.equal(apres.paiements.length, 0);
  assert.equal(apres.quittances.length, 0);
});

test("supprimer un immeuble retire les lots libres et détache le lot loué", () => {
  const etat = etatDeBase({
    lots: [
      { id: "lot1", immeubleId: "imm1" },
      { id: "lot2", immeubleId: "imm1" },
    ],
  });
  const apres = supprimerImmeuble(etat, "imm1");
  assert.equal(apres.immeubles.length, 0);
  assert.deepEqual(
    apres.lots.map((l) => [l.id, l.immeubleId]),
    [["lot1", null]],
    "lot1 est loué : il reste, sans immeuble ; lot2 est libre : il part"
  );
});

test("fusionner remplace les lignes connues et ajoute les nouvelles", () => {
  const avant = [{ id: "a", v: 1 }, { id: "b", v: 1 }];
  const apres = fusionner(avant, [{ id: "b", v: 2 }, { id: "c", v: 2 }]);
  assert.deepEqual(apres, [{ id: "a", v: 1 }, { id: "b", v: 2 }, { id: "c", v: 2 }]);
});
