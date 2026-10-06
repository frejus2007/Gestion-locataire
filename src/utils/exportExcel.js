// Utilitaire d'exportation Excel (.xlsx) pour la gestion locative CAG.
// Génère des classeurs multi-feuilles professionnels compatibles avec Microsoft Excel,
// Apple Numbers, LibreOffice et Google Sheets.

import * as XLSX from "xlsx";
import { formatDate, formatDateLongue, periodeToLabel, MOIS_LONGS } from "./format.js";

/**
 * Télécharge un classeur XLSX dans le navigateur avec gestion de repli (Blob).
 */
export function telechargerWorkbook(workbook, filename) {
  try {
    const wbout = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const blob = new Blob([wbout], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 150);
  } catch (err) {
    console.warn("Téléchargement via URL.createObjectURL échoué, essai XLSX.writeFile", err);
    XLSX.writeFile(workbook, filename);
  }
}

/**
 * Exporte la liste des opérations par maison (immeuble) et par mois (période).
 *
 * @param {Object} options
 * @param {string} options.periode Période au format "YYYY-MM" (ex: "2026-10")
 * @param {Object|null} options.immeuble Objet Immeuble sélectionné, ou null pour "Toutes les maisons"
 * @param {Array} options.recettes Liste des paiements/versements filtrés
 * @param {Array} options.depenses Liste des dépenses filtrées
 * @param {Object} [options.proprietaire] Informations sur le bailleur
 * @param {Array} [options.modes] Libellés des modes de paiement
 * @param {Array} [options.categories] Libellés des catégories de dépenses
 * @param {Map} [options.loyersParId] Map des loyers pour identifier la période allouée
 * @returns {string} Le nom du fichier téléchargé
 */
export function exporterOperationsExcel({
  periode,
  immeuble = null,
  recettes = [],
  depenses = [],
  proprietaire = null,
  modes = [],
  categories = [],
  loyersParId = new Map(),
}) {
  const wb = XLSX.utils.book_new();

  const nomImmeuble = immeuble ? immeuble.nom : "Toutes les maisons";
  const libellePeriode = periodeToLabel(periode);
  const bailleurNom = proprietaire
    ? `${proprietaire.prenoms || ""} ${proprietaire.nom || ""}`.trim() || "Jean-Marc KOUASSI"
    : "Jean-Marc KOUASSI";
  const telephoneBailleur = proprietaire?.telephone || "+229 97 12 34 56";

  const totalRecettes = recettes.reduce((s, r) => s + (Number(r.montant) || 0), 0);
  const totalDepenses = depenses.reduce((s, d) => s + (Number(d.montant) || 0), 0);
  const soldeNet = totalRecettes - totalDepenses;

  const modeLabel = (modeId) => modes.find((m) => m.id === modeId)?.label || modeId || "Espèces";
  const catLabel = (catId) => categories.find((c) => c.id === catId)?.label || catId || "Général";

  const now = new Date();
  const dateExport = `${formatDate(now.toISOString().slice(0, 10))} à ${now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;

  // --- 1. Préparation de toutes les opérations consolidées ---
  const operations = [];

  for (const r of recettes) {
    let detailsLoyer = "";
    if (r.allocations && r.allocations.length > 0) {
      const periodesAllouees = r.allocations
        .map((a) => {
          const l = loyersParId.get(a.loyerId);
          return l ? periodeToLabel(l.periode) : null;
        })
        .filter(Boolean);
      if (periodesAllouees.length > 0) {
        detailsLoyer = `Loyer ${periodesAllouees.join(", ")}`;
      }
    }
    const notePaiement = [detailsLoyer, r.note].filter(Boolean).join(" · ") || "Versement loyer";

    operations.push({
      date: r.date,
      type: "Recette",
      ref: r.reference || r.id,
      immeuble: r.immeuble ? r.immeuble.nom : "Non spécifié",
      lot: r.lot ? r.lot.designation : "—",
      tiers: r.locataire ? `${r.locataire.nom} ${r.locataire.prenoms}`.trim() : "Locataire inconnu",
      telephone: r.locataire?.telephone || "—",
      motif: notePaiement,
      mode: modeLabel(r.mode),
      entree: Number(r.montant) || 0,
      sortie: 0,
      soldeOp: Number(r.montant) || 0,
    });
  }

  for (const d of depenses) {
    operations.push({
      date: d.date,
      type: "Dépense",
      ref: d.id,
      immeuble: d.immeuble ? d.immeuble.nom : "Général / Non affecté",
      lot: "Parties communes",
      tiers: catLabel(d.categorie),
      telephone: "—",
      motif: d.note || `Dépense : ${catLabel(d.categorie)}`,
      mode: "Sortie de caisse / Virement",
      entree: 0,
      sortie: Number(d.montant) || 0,
      soldeOp: -(Number(d.montant) || 0),
    });
  }

  // Tri chronologique des opérations
  operations.sort((a, b) => a.date.localeCompare(b.date));

  // --- 2. FEUILLE 1 : Journal des Opérations (Consolidé) ---
  const enteteDoc = [
    ["CABINET ALBERT & GILLES — GESTION LOCATIVE"],
    [`Bailleur : ${bailleurNom} | Contact : ${telephoneBailleur}`],
    ["JOURNAL FINANCIER DES OPÉRATIONS"],
    [`Maison / Immeuble : ${nomImmeuble}`],
    [`Mois / Période : ${libellePeriode}`],
    [`Exporté le : ${dateExport}`],
    [], // ligne vide
  ];

  const entetesColonnesJournal = [
    "Date (JJ/MM/AAAA)",
    "Nature",
    "Référence",
    "Maison / Immeuble",
    "Lot / Local",
    "Locataire / Tiers",
    "Libellé / Motif",
    "Mode de paiement",
    "Entrée (FCFA)",
    "Sortie (FCFA)",
    "Solde opération (FCFA)",
  ];

  const lignesJournal = operations.map((op) => [
    formatDate(op.date),
    op.type,
    op.ref,
    op.immeuble,
    op.lot,
    op.tiers,
    op.motif,
    op.mode,
    op.entree,
    op.sortie,
    op.soldeOp,
  ]);

  const lignesTotauxJournal = [
    [],
    [
      "RÉCAPITULATIF DU MOIS",
      "",
      "",
      "",
      "",
      "",
      "",
      "TOTAL ENCAISSÉ :",
      totalRecettes,
      "",
      "",
    ],
    [
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "TOTAL DÉPENSÉ :",
      "",
      totalDepenses,
      "",
    ],
    [
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "SOLDE NET DU MOIS :",
      "",
      "",
      soldeNet,
    ],
  ];

  const wsJournal = XLSX.utils.aoa_to_sheet([
    ...enteteDoc,
    entetesColonnesJournal,
    ...lignesJournal,
    ...lignesTotauxJournal,
  ]);

  wsJournal["!cols"] = [
    { wch: 13 }, // Date
    { wch: 12 }, // Nature
    { wch: 15 }, // Référence
    { wch: 25 }, // Immeuble
    { wch: 22 }, // Lot
    { wch: 25 }, // Locataire / Tiers
    { wch: 32 }, // Motif
    { wch: 20 }, // Mode
    { wch: 16 }, // Entrée
    { wch: 16 }, // Sortie
    { wch: 20 }, // Solde
  ];

  XLSX.utils.book_append_sheet(wb, wsJournal, "Journal des Opérations");

  // --- 3. FEUILLE 2 : Recettes (Versements) ---
  const entetesColonnesRecettes = [
    "Date (JJ/MM/AAAA)",
    "Réf. Reçu / Id",
    "Maison / Immeuble",
    "Lot / Appartement",
    "Locataire",
    "Téléphone",
    "Détail du paiement",
    "Mode de règlement",
    "Montant encaissé (FCFA)",
  ];

  const lignesRecettes = operations
    .filter((op) => op.type === "Recette")
    .map((op) => [
      formatDate(op.date),
      op.ref,
      op.immeuble,
      op.lot,
      op.tiers,
      op.telephone,
      op.motif,
      op.mode,
      op.entree,
    ]);

  const lignesTotauxRecettes = [
    [],
    ["TOTAL ENCAISSÉ SUR LA PÉRIODE :", "", "", "", "", "", "", "", totalRecettes],
  ];

  const wsRecettes = XLSX.utils.aoa_to_sheet([
    [`VERSEMENTS ENCAISSÉS — ${nomImmeuble.toUpperCase()} (${libellePeriode})`],
    [`Bailleur : ${bailleurNom} | Date d'export : ${dateExport}`],
    [],
    entetesColonnesRecettes,
    ...lignesRecettes,
    ...lignesTotauxRecettes,
  ]);

  wsRecettes["!cols"] = [
    { wch: 13 },
    { wch: 16 },
    { wch: 25 },
    { wch: 22 },
    { wch: 25 },
    { wch: 18 },
    { wch: 30 },
    { wch: 20 },
    { wch: 22 },
  ];

  XLSX.utils.book_append_sheet(wb, wsRecettes, "Recettes");

  // --- 4. FEUILLE 3 : Dépenses (Charges & Travaux) ---
  const entetesColonnesDepenses = [
    "Date (JJ/MM/AAAA)",
    "Réf. Dépense",
    "Maison / Immeuble",
    "Catégorie",
    "Libellé / Note",
    "Mode",
    "Montant dépensé (FCFA)",
  ];

  const lignesDepenses = operations
    .filter((op) => op.type === "Dépense")
    .map((op) => [
      formatDate(op.date),
      op.ref,
      op.immeuble,
      op.tiers,
      op.motif,
      op.mode,
      op.sortie,
    ]);

  const lignesTotauxDepenses = [
    [],
    ["TOTAL DES DÉPENSES SUR LA PÉRIODE :", "", "", "", "", "", totalDepenses],
  ];

  const wsDepenses = XLSX.utils.aoa_to_sheet([
    [`DÉPENSES & CHARGES — ${nomImmeuble.toUpperCase()} (${libellePeriode})`],
    [`Bailleur : ${bailleurNom} | Date d'export : ${dateExport}`],
    [],
    entetesColonnesDepenses,
    ...lignesDepenses,
    ...lignesTotauxDepenses,
  ]);

  wsDepenses["!cols"] = [
    { wch: 13 },
    { wch: 15 },
    { wch: 25 },
    { wch: 22 },
    { wch: 32 },
    { wch: 22 },
    { wch: 22 },
  ];

  XLSX.utils.book_append_sheet(wb, wsDepenses, "Dépenses");

  // --- 5. FEUILLE 4 : Synthèse & Bilan Financier ---
  const wsSynthese = XLSX.utils.aoa_to_sheet([
    ["CABINET ALBERT & GILLES — GESTION LOCATIVE"],
    ["SYNTHÈSE DU COMPTE D'EXPLOITATION MENSUEL"],
    [],
    ["Paramètre", "Valeur"],
    ["Maison / Immeuble", nomImmeuble],
    ["Période comptable", libellePeriode],
    ["Bailleur gérant", bailleurNom],
    ["Date de génération", dateExport],
    [],
    ["Poste financier", "Montant (FCFA)"],
    ["Recettes totales encaissées", totalRecettes],
    ["Nombre de versements", lignesRecettes.length],
    ["Dépenses totales payées", totalDepenses],
    ["Nombre de dépenses", lignesDepenses.length],
    [],
    ["RÉSULTAT NET DE GESTION", soldeNet],
    ["Situation financière", soldeNet >= 0 ? "Excédentaire (Bénéfice)" : "Déficitaire"],
  ]);

  wsSynthese["!cols"] = [{ wch: 30 }, { wch: 26 }];
  XLSX.utils.book_append_sheet(wb, wsSynthese, "Synthèse");

  // --- 6. Génération et téléchargement du fichier ---
  const slugImmeuble = nomImmeuble
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  const nomFichier = `Operations_${slugImmeuble}_${periode}.xlsx`;
  telechargerWorkbook(wb, nomFichier);

  return nomFichier;
}

/**
 * Exporte l'ensemble des opérations d'une année pour une maison ou toutes les maisons.
 */
export function exporterOperationsAnnuellesExcel({
  annee,
  immeuble = null,
  tousPaiements = [],
  toutesDepenses = [],
  lotsParId = new Map(),
  bauxParId = new Map(),
  locatairesParId = new Map(),
  immeublesParId = new Map(),
  loyersParId = new Map(),
  proprietaire = null,
  modes = [],
  categories = [],
}) {
  const wb = XLSX.utils.book_new();

  const nomImmeuble = immeuble ? immeuble.nom : "Toutes les maisons";
  const bailleurNom = proprietaire
    ? `${proprietaire.prenoms || ""} ${proprietaire.nom || ""}`.trim() || "Jean-Marc KOUASSI"
    : "Jean-Marc KOUASSI";
  const now = new Date();
  const dateExport = `${formatDate(now.toISOString().slice(0, 10))} à ${now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;

  const modeLabel = (modeId) => modes.find((m) => m.id === modeId)?.label || modeId || "Espèces";
  const catLabel = (catId) => categories.find((c) => c.id === catId)?.label || catId || "Général";

  // Filtrer les paiements de l'année
  const paiementsAnnee = tousPaiements.filter((p) => {
    if (!p.date || !p.date.startsWith(`${annee}-`)) return false;
    if (!immeuble) return true;
    const bail = bauxParId.get(p.bailId);
    const lot = bail ? lotsParId.get(bail.lotId) : null;
    return lot && lot.immeubleId === immeuble.id;
  });

  // Filtrer les dépenses de l'année
  const depensesAnnee = toutesDepenses.filter((d) => {
    if (!d.date || !d.date.startsWith(`${annee}-`)) return false;
    if (!immeuble) return true;
    return d.immeubleId === immeuble.id;
  });

  // Bilan mois par mois (12 mois)
  const moisNoms = [
    "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
  ];

  const recapMois = moisNoms.map((nomMois, index) => {
    const moisNum = String(index + 1).padStart(2, "0");
    const prefix = `${annee}-${moisNum}`;

    const recMois = paiementsAnnee.filter((p) => p.date.startsWith(prefix));
    const depMois = depensesAnnee.filter((d) => d.date.startsWith(prefix));

    const totalRec = recMois.reduce((s, p) => s + (Number(p.montant) || 0), 0);
    const totalDep = depMois.reduce((s, d) => s + (Number(d.montant) || 0), 0);

    return {
      mois: `${nomMois} ${annee}`,
      nbRec: recMois.length,
      totalRec,
      nbDep: depMois.length,
      totalDep,
      solde: totalRec - totalDep,
    };
  });

  const totRecAnnee = recapMois.reduce((s, m) => s + m.totalRec, 0);
  const totDepAnnee = recapMois.reduce((s, m) => s + m.totalDep, 0);
  const soldeAnnee = totRecAnnee - totDepAnnee;

  // FEUILLE 1 : Tableau de bord annuel
  const wsSynthese = XLSX.utils.aoa_to_sheet([
    ["CABINET ALBERT & GILLES — GESTION LOCATIVE"],
    [`BILAN ANNUEL DES OPÉRATIONS — ANNÉE ${annee}`],
    [`Maison / Immeuble : ${nomImmeuble}`],
    [`Bailleur : ${bailleurNom} | Date d'export : ${dateExport}`],
    [],
    ["Mois", "Nb Recettes", "Total Encaissé (FCFA)", "Nb Dépenses", "Total Dépensé (FCFA)", "Solde Net (FCFA)"],
    ...recapMois.map((m) => [m.mois, m.nbRec, m.totalRec, m.nbDep, m.totalDep, m.solde]),
    [],
    ["TOTAL ANNUEL", paiementsAnnee.length, totRecAnnee, depensesAnnee.length, totDepAnnee, soldeAnnee],
  ]);

  wsSynthese["!cols"] = [{ wch: 18 }, { wch: 14 }, { wch: 22 }, { wch: 14 }, { wch: 22 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsSynthese, `Bilan Annuel ${annee}`);

  // FEUILLE 2 : Opérations détaillées
  const operations = [];

  for (const p of paiementsAnnee) {
    const bail = bauxParId.get(p.bailId);
    const lot = bail ? lotsParId.get(bail.lotId) : null;
    const imm = lot ? immeublesParId.get(lot.immeubleId) : null;
    const loc = locatairesParId.get(p.locataireId);

    let detailsLoyer = "";
    if (p.allocations && p.allocations.length > 0) {
      const periodesAllouees = p.allocations
        .map((a) => {
          const l = loyersParId.get(a.loyerId);
          return l ? periodeToLabel(l.periode) : null;
        })
        .filter(Boolean);
      if (periodesAllouees.length > 0) {
        detailsLoyer = `Loyer ${periodesAllouees.join(", ")}`;
      }
    }
    const notePaiement = [detailsLoyer, p.note].filter(Boolean).join(" · ") || "Versement loyer";

    operations.push({
      date: p.date,
      type: "Recette",
      ref: p.reference || p.id,
      immeuble: imm ? imm.nom : "—",
      lot: lot ? lot.designation : "—",
      tiers: loc ? `${loc.nom} ${loc.prenoms}`.trim() : "—",
      motif: notePaiement,
      mode: modeLabel(p.mode),
      entree: Number(p.montant) || 0,
      sortie: 0,
      soldeOp: Number(p.montant) || 0,
    });
  }

  for (const d of depensesAnnee) {
    const imm = d.immeubleId ? immeublesParId.get(d.immeubleId) : null;
    operations.push({
      date: d.date,
      type: "Dépense",
      ref: d.id,
      immeuble: imm ? imm.nom : "Général / Non affecté",
      lot: "Parties communes",
      tiers: catLabel(d.categorie),
      motif: d.note || `Dépense : ${catLabel(d.categorie)}`,
      mode: "Sortie de caisse / Virement",
      entree: 0,
      sortie: Number(d.montant) || 0,
      soldeOp: -(Number(d.montant) || 0),
    });
  }

  operations.sort((a, b) => a.date.localeCompare(b.date));

  const wsJournal = XLSX.utils.aoa_to_sheet([
    [`JOURNAL DÉTAILLÉ DE L'ANNÉE ${annee} — ${nomImmeuble.toUpperCase()}`],
    [`Bailleur : ${bailleurNom} | Date d'export : ${dateExport}`],
    [],
    ["Date (JJ/MM/AAAA)", "Nature", "Référence", "Maison / Immeuble", "Lot / Local", "Locataire / Tiers", "Libellé / Motif", "Mode", "Entrée (FCFA)", "Sortie (FCFA)", "Solde Opération (FCFA)"],
    ...operations.map((op) => [
      formatDate(op.date),
      op.type,
      op.ref,
      op.immeuble,
      op.lot,
      op.tiers,
      op.motif,
      op.mode,
      op.entree,
      op.sortie,
      op.soldeOp,
    ]),
    [],
    ["TOTAL ANNUEL", "", "", "", "", "", "", "", totRecAnnee, totDepAnnee, soldeAnnee],
  ]);

  wsJournal["!cols"] = [
    { wch: 13 }, { wch: 12 }, { wch: 15 }, { wch: 25 }, { wch: 22 }, { wch: 25 }, { wch: 32 }, { wch: 20 }, { wch: 16 }, { wch: 16 }, { wch: 20 }
  ];
  XLSX.utils.book_append_sheet(wb, wsJournal, "Journal Annuel");

  const slugImmeuble = nomImmeuble
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  const nomFichier = `Operations_Annuelles_${slugImmeuble}_${annee}.xlsx`;
  telechargerWorkbook(wb, nomFichier);

  return nomFichier;
}

