// Génération de la quittance de loyer en PDF, au format officiel CAGOUNOU.
//
// Le tout est fait dans le navigateur : aucune donnée ne sort de l'appareil.
// jsPDF écrit un vrai fichier .pdf, que l'on peut télécharger ou ouvrir dans
// un nouvel onglet.
//
// Mise en page (A4, marges 2,2 cm) :
//   • En-tête : propriétaire (nom, IFU, tél, n° de réception) | QUITTANCE DE LOYER
//               (n°, date, mois de, caution sur)
//   • Tableau : LOCATAIRE (n° appartement, nom, IFU, tél, adresse)
//   • Détail  : les sept lignes de l'encaissement
//   • « La somme de : » / « Montant en lettre » / « Payé par : »
//   • Signature du propriétaire
//
//   ▸ Quittance PDF           src/utils/quittancePdf.js
//   ▸ Export du relevé Excel  src/utils/exportExcel.js

import { jsPDF } from "jspdf";
import { amountToWords, formatMoneyPlain, cautionSurLibelle, periodeToLabel } from "./format.js";
import { tracerCodeBarre } from "./codeBarre.js";

// Les sept lignes de la quittance sont une donnée de présentation, pas de
// gestion : les dupliquer ici évite au générateur de PDF de tirer la couche
// Firestore, donc de l'ouvrir même pour simplement imprimer un reçu. La
// couche de données continue d'être la seule à définir les postes.
const LIGNES_FRAIS = [
  { key: "loyer", label: "Loyer", defaut: true },
  { key: "eau", label: "Eau" },
  { key: "electricite", label: "Électricité" },
  { key: "ordures", label: "Ordures ménagères" },
  { key: "degats", label: "Dégâts" },
  { key: "autre1", label: "Autre 1", libre: "libelle1" },
  { key: "autre2", label: "Autre 2", libre: "libelle2" },
];

const POSTES_FRAIS = LIGNES_FRAIS.map((l) => l.key);

const L = 62; // marge gauche
const R = 533; // bord droit (595 - 62)
const W = R - L; // largeur utile
const COL = L + W * 0.54; // début de la colonne de droite
const NOIR = "#000000";
const GRIS = "#8b95a5";

// Libellés lisibles des modes : la donnée de base est un identifiant court.
const LIBELLES_MODE = {
  especes: "Espèces",
  mtn: "MTN MoMo",
  moov: "Moov Money",
  celtis: "Celtis",
  virement: "Virement bancaire",
  cheque: "Chèque",
  mobile: "Mobile Money",
};
const libelleMode = (mode) => LIBELLES_MODE[mode] || mode || "—";

/** Date au format JJ/MM/AAAA. */
function frDate(iso) {
  if (!iso) return "—";
  const p = String(iso).slice(0, 10).split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : String(iso);
}

/** Libellé d'une ligne, en tenant compte des renommages (Autre 1, Autre 2). */
function libelleLigne(ligne, libelles) {
  if (libelles && libelles[ligne.key]) return libelles[ligne.key];
  return ligne.label;
}

/**
 * Dimensions d'un PNG encodé en base64, lues dans son en-tête IHDR.
 * jsPDF n'insère rien si on lui passe seulement une largeur : il lui faut
 * aussi la hauteur, sinon l'image sort du cadre et n'est pas tracée.
 */
/**
 * Dimensions d'un PNG, lues depuis son en-tête.
 *
 * ⚠️ Ne pas utiliser `Buffer` ici : c'est une API Node, absente du navigateur.
 * La première version lisait l'en-tête avec `Buffer.readUInt32BE`, le logo
 * n'était donc *jamais* inséré côté navigateur — la quittance sortait sans
 * logo sans la moindre erreur visible. `getImageProperties` de jsPDF lit le
 * même en-tête et, lui, fonctionne partout.
 */
function dimensionsPng(dataUrl, doc) {
  try {
    const props = doc.getImageProperties(String(dataUrl));
    if (!props || !props.width) return null;
    return { largeur: props.width, hauteur: props.height };
  } catch {
    return null;
  }
}

/**
 * Construit la quittance PDF.
 *
 * @param {object} q          la quittance (figée à l'émission par db.genererQuittance)
 * @param {object} [options]
 * @param {object} [options.proprietaire]  pour la signature
 * @param {string} [options.periode]        période facturée, ex. « septembre 2026 »
 * @param {string} [options.cautionSur]     ligne « CAUTION SUR : »
 * @returns {jsPDF}
 */
let logoBase64 = null;
let logoPromesse = null;

/**
 * Charge le logo une fois pour toutes, sous forme de data URL.
 *
 * Le logo complet — la marque et les deux lignes « Chabi Arnaud GOUNOU /
 * GESTION LOCATIVE » — ouvre chaque quittance : c'est ce qui identifie le
 * document. La version allégée (900 px de large) suffit à l'impression en A4
 * tout en gardant chaque quittance légère. À appeler au démarrage de
 * l'application ; sans cela, les quittances sont produites sans logo — elles
 * restent valables.
 */
export function preparerLogo(url = "/logo-cag-complet-pdf.png") {
  if (logoBase64) return Promise.resolve(logoBase64);
  if (!logoPromesse) {
    logoPromesse = chargerDataURL(url)
      .then((data) => {
        // Échec : on relâche la promesse pour qu'une fabrication suivante
        // retente, au lieu de mémoriser un échec pour toute la session.
        if (!data) logoPromesse = null;
        logoBase64 = data;
        return data;
      })
      .catch(() => {
        logoPromesse = null;
        return null;
      });
  }
  return logoPromesse;
}

/** Télécharge une ressource statique et la convertit en data URL. */
async function chargerDataURL(url) {
  try {
    const rep = await fetch(url);
    if (!rep.ok) return null;
    const blob = await rep.blob();
    return await new Promise((resoudre, rejeter) => {
      const lecteur = new FileReader();
      lecteur.onload = () => resoudre(lecteur.result);
      lecteur.onerror = rejeter;
      lecteur.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

let signatureBase64 = null;
let signaturePromesse = null;

/**
 * Charge la signature par défaut du propriétaire, en data URL.
 *
 * La signature est ce qui rend une quittance opposable : un cadre vide passe
 * pour un document incomplet. Plutôt que d'attendre qu'un utilisateur aille
 * la charger une fois dans les Paramètres, l'application embarque la
 * signature fournie et la pose sur toutes les quittances. Une signature
 * importée depuis les Paramètres (proprietaire.signatureUrl) la remplace.
 *
 * Mémorisée derrière une promesse : appeler cette fonction avant chaque
 * fabrication garantit que la signature est présente, y compris si la
 * première requête est encore en vol.
 *
 * @param {string} [url]
 * @returns {Promise<string|null>} data URL, ou null si indisponible
 */
export function preparerSignature(url = "/signature.png") {
  if (signatureBase64) return Promise.resolve(signatureBase64);
  if (!signaturePromesse) {
    signaturePromesse = chargerDataURL(url)
      .then((data) => {
        // Échec : on relâche la promesse pour que la prochaine fabrication
        // retente, au lieu de mémoriser un échec pour toute la session.
        if (!data) signaturePromesse = null;
        signatureBase64 = data;
        return data;
      })
      .catch(() => {
        signaturePromesse = null;
        return null;
      });
  }
  return signaturePromesse;
}

/**
 * Les sept lignes telles qu'elles doivent être imprimées.
 *
 * `POSTES_FRAIS` est une liste de clés, pas d'objets : le détail se lit en
 * l'indexant par ces clés. Les traiter comme des objets donnait `undefined`,
 * le test « au moins un poste non nul » échouait toujours, et le montant total
 * se retrouvait sur la ligne Loyer à la place du loyer.
 *
 * Seul un encaissement réellement dépourvu de détail — enregistré avant
 * l'existence des sept lignes — est intégralement du loyer.
 *
 * @param {object} q        quittance
 * @returns {object}        détail affiché, une valeur par poste
 */
export function detailQuittance(q) {
  const montant = Number(q?.montant) || 0;
  const brut = q?.detail || null;
  if (brut && POSTES_FRAIS.some((cle) => Number(brut[cle]) > 0)) return brut;
  const repli = Object.fromEntries(POSTES_FRAIS.map((cle) => [cle, 0]));
  repli.loyer = montant;
  return repli;
}

/**
 * Le texte de la ligne « MOIS DE ».
 *
 * Un paiement portant un seul mois indique ce mois. Un paiement de plusieurs
 * mois — le trimestriel — indique la plage : c'est ce que le locataire a
 * réellement réglé, et c'est ce qu'un « mois de octobre » tronqué ferait
 * manquer.
 *
 * @param {object} q          quittance
 * @param {string[]} [periodes]  mois couverts, au format « 2026-10 »
 * @returns {string}          « octobre 2026 » ou « octobre 2026 à décembre 2026 »
 */
export function libellePeriodeFacturee(q, periodes) {
  const liste = [...new Set((periodes || []).filter(Boolean))].sort();
  if (liste.length === 0) return String(q.periode || "");
  if (liste.length === 1) return periodeToLabel(liste[0]);
  return `${periodeToLabel(liste[0])} à ${periodeToLabel(liste.at(-1))}`;
}

export function construireQuittance(q, options = {}) {
  const proprietaire = options.proprietaire || {};
  const { cautionSur = "" } = options;
  // `compress` évite qu'une image de 500 ko fasse gonfler le fichier : sans
  // lui, jsPDF recopie le logo pixel par pixel et la quittance dépasse 1 Mo.
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait", compress: true });

  const montant = Number(q.montant) || 0;
  const detail = detailQuittance(q);
  const libelles = q.libelles || null;
  const nomComplet = [q.prenomsProprietaire, q.nomProprietaire].filter(Boolean).join(" ").trim();
  // La période est déduite des mois réellement couverts par le paiement. Les
  // paiements anciens ne stockent pas de période : le texte vient alors de
  // l'appelant, qui a les loyers sous la main.
  const libellePeriode = libellePeriodeFacturee(q, options.periodes);

  /* ============ EN-TÊTE ============ */
  // Le logo ouvre la quittance en haut à gauche ; le bloc propriétaire
  // commence en dessous, le titre reste à droite sur la même hauteur.
  // Sans logo, la mise en page est celle du modèle officiel.
  let y0 = 34;
  const logo = options.logo || logoBase64;
  if (logo) {
    try {
      const d = dimensionsPng(logo, doc);
      if (d && d.largeur > 0) {
        // Un paiement trimestriel doit tenir sur une seule feuille. Le logo occupe en
  // haut une place qui compte : on le ramène à 96 points de large, ce qui
  // reste parfaitement lisible à l'impression et libère la hauteur qui
  // manquait. C'est le levier le plus simple : toucher au texte, ce serait
  // dégrader le reçu.
  const largeurLogo = 96;
        const hauteurLogo = (largeurLogo * d.hauteur) / d.largeur;
        doc.addImage(logo, "PNG", L, y0, largeurLogo, hauteurLogo);
        y0 += hauteurLogo + 16;
      }
    } catch (erreur) {
      console.warn("Logo non inséré dans la quittance :", erreur.message);
      y0 = 34;
    }
  }

  // Colonne gauche : propriétaire
  doc.setFont("helvetica", "bold").setFontSize(14).setTextColor(NOIR);
  doc.text(nomComplet || "PROPRIÉTAIRE", L, y0, { maxWidth: W * 0.5 });

  doc.setFont("helvetica", "normal").setFontSize(10);
  let y = y0 + 20;
  if (q.ifuProprietaire) {
    doc.text(`IFU : ${q.ifuProprietaire}`, L, y, { maxWidth: W * 0.5 });
    y += 13;
  }
  if (q.telephoneProprietaire) {
    doc.text(`TEL : ${q.telephoneProprietaire}`, L, y, { maxWidth: W * 0.5 });
    y += 13;
  }
  if (q.adresseProprietaire) {
    doc.text(q.adresseProprietaire, L, y, { maxWidth: W * 0.5 });
    y += 13;
  }
  // Numéros de réception : MTN MoMo, Moov Money, Celtis…
  const reception = Array.isArray(proprietaire.reception)
    ? proprietaire.reception.filter((r) => r && r.numero)
    : [];
  if (reception.length === 0 && Array.isArray(q.reception)) {
    // Quittance émise avant l'enregistrement dans les paramètres.
    reception.push(...q.reception.filter((r) => r && r.numero));
  }
  reception.forEach((r, i) => {
    doc.text(`${i === 0 ? "     " : "                      "}${r.numero}`, L, y, { maxWidth: W * 0.5 });
    y += 13;
  });

  // Colonne de droite : titre + n° / date / mois / caution sur
  doc.setFont("helvetica", "bold").setFontSize(16).setTextColor(NOIR);
  doc.text("QUITTANCE DE LOYER", COL, 36, { maxWidth: R - COL });
  doc.setFont("helvetica", "normal").setFontSize(10);
  const numeroQuittance = q.numero || q.reference || "";
  // « N° de séquence » plutôt que « N° » : le numéro est un compteur annuel
  // (Q-2026-000042), ce que le libellé rend explicite au premier coup d'œil.
  doc.text(`N° de séquence : ${numeroQuittance}`, COL, 58, { maxWidth: R - COL });
  doc.text(`DATE : ${frDate(q.datePaiement)}`, COL, 71, { maxWidth: R - COL });
  doc.text(`MOIS DE : ${libellePeriode || "—"}`, COL, 84, { maxWidth: R - COL });
  // La caution vient désormais d'une liste de cases cochées ; elle est rendue
  // en texte lisible. Les baux saisis avant ce changement portent une chaîne,
  // que `cautionSurLibelle` sait aussi traduire.
  const libelleCaution = cautionSurLibelle(cautionSur);
  if (libelleCaution) {
    const largeur = doc.getTextWidth("CAUTION SUR : ");
    doc.text("CAUTION SUR : ", COL, 97);
    doc.setFontSize(7).text(`(${libelleCaution})`, COL + largeur + 2, 96.5);
    doc.setFontSize(10);
  }

  /* ============ TABLEAU LOCATAIRE ============ */
  const rowH = 15;
  let y2 = Math.max(y + 16, 124);

  doc.setFillColor("#D0CECE");
  doc.rect(L, y2, W, 18, "F");
  doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(NOIR);
  doc.text("LOCATAIRE", L + 5, y2 + 12);
  y2 += 18;

  const labelW = 150;
  // Les mentions figées à l'émission priment ; quand elles manquent — sur les
  // quittances émises avant leur mise en place — on lit la donnée vivante.
  // C'est ce qui évite de réécrire l'historique : une vieille quittance se
  // complete à l'affichage au lieu d'être corrigée dans la base.
  const vivant = options.vivant || {};
  const texte = (fige, deSecours) =>
    String(fige || "").trim() || String(deSecours || "").trim();

  const nomAffiche = texte(q.nomLocataire, vivant.nomLocataire);
  // Les quittances anciennes ne stockaient que le nom : on le complète par les
  // prénoms lorsqu'ils sont connus par ailleurs.
  const avecPrenoms =
    q.prenomsLocataire && !nomAffiche.toLowerCase().includes(String(q.prenomsLocataire).toLowerCase())
      ? `${String(q.prenomsLocataire).trim()} ${nomAffiche}`.trim()
      : nomAffiche;

  const lignesLocataire = [
    ["NUMERO APPART.", texte(q.designationLot, vivant.designationLot)],
    ["NOM & PRENOMS", texte(avecPrenoms, vivant.nomLocataire)],
    ["IFU", texte(q.ifuLocataire, vivant.ifuLocataire)],
    ["TEL", texte(q.telephoneLocataire, vivant.telephoneLocataire)],
    ["ADRESSE LOCATIVE", texte(q.adresseImmeuble, vivant.adresseImmeuble)],
  ];
  doc.setFont("helvetica", "normal").setFontSize(10);
  lignesLocataire.forEach(([label, valeur]) => {
    doc.setDrawColor("#9a9a9a").setLineWidth(0.6);
    doc.rect(L, y2, W, rowH);
    doc.setTextColor(NOIR);
    doc.text(label, L + 5, y2 + 10.5, { maxWidth: labelW });
    doc.text(valeur || "", L + labelW, y2 + 10.5, { maxWidth: W - labelW - 8 });
    y2 += rowH;
  });
  doc.setDrawColor("#9a9a9a").rect(L, y2, W, rowH);
  y2 += rowH + 18;

  /* ============ DÉTAIL DES SEPT LIGNES ============ */
  // Un paiement de plusieurs mois porte un bloc par mois : le propriétaire
  // règle un trimestre d'un geste, mais le locataire doit pouvoir vérifier
  // ce que chaque mois a couvert. Un détail unique, additionné, ne le
  // permettrait pas — c'était la source des incohérences signalées.
  //
  // `blocs` est établi ici, avant tout usage : une `const` lue avant sa
  // déclaration lève une erreur qui vide toute la quittance.
  const blocs = Array.isArray(options.blocs) && options.blocs.length > 0
    ? options.blocs
    : [{ titre: "DETAIL DU PAIEMENT", detail, montant }];

  const detailW = W * 0.62;
  // Un paiement couvrant plusieurs mois doit tenir sur une seule feuille. Le
  // logo de tête, les blocs de détail et la signature en bas se disputent la
  // place : au-delà d'un mois, les sept lignes se resserrent pour que le reçu
  // reste imprimable en un seul exemplaire.
  const serré = blocs.length > 1;
  // Marge de sécurité : cinq points de battement suffisaient à faire basculer le
  // trimestriel sur une deuxième page. On tient donc largement en dessous.
  const interligne = serré ? 9.5 : 12;
  const tailleLigne = serré ? 9 : 10;

  /** Écrit les sept lignes d'un bloc et rend le curseur juste en dessous. */
  const ecrireBloc = (titre, detailBloc, montantBloc) => {
    doc.setFont("helvetica", "bold").setFontSize(tailleLigne + 1).setTextColor(NOIR);
    doc.text(titre, L, y2, { maxWidth: detailW });
    if (montantBloc !== undefined) {
      const somme = formatMoneyPlain(montantBloc);
      doc.text(somme, L + detailW - doc.getTextWidth(somme), y2);
    }
    y2 += serré ? 5 : 6;
    doc.setDrawColor("#999999").setLineWidth(0.7);
    doc.line(L, y2, L + detailW, y2);

    LIGNES_FRAIS.forEach((ligne) => {
      y2 += interligne;
      const valeur = Number(detailBloc[ligne.key]) || 0;
      const montant = valeur > 0 ? formatMoneyPlain(valeur) : "—";
      doc.setFont("helvetica", "normal").setFontSize(tailleLigne).setTextColor(valeur > 0 ? NOIR : GRIS);
      doc.text(libelleLigne(ligne, libelles), L + 5, y2, { maxWidth: detailW - 110 });
      // Aligné à droite par sa position : `align` n'est pas fiable avec maxWidth.
      doc.text(montant, L + detailW - 8 - doc.getTextWidth(montant), y2);
    });
    y2 += serré ? 4 : 5;
    doc.setDrawColor(NOIR).setLineWidth(1);
    doc.line(L, y2, L + detailW, y2);
    return montantBloc;
  };

  // L'appelant fournit le détail de chaque mois quand le paiement en porte
  // plusieurs ; à défaut, un seul bloc reprend le détail global. `blocs` est
  // établi plus haut, avant la mise en page.
  if (blocs.length <= 3) {
    blocs.forEach((bloc, i) => {
      if (i > 0) y2 += 9;
      ecrireBloc(bloc.titre, bloc.detail, bloc.montant);
    });
  } else {
    doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(NOIR);
    doc.text("DETAIL DU PAIEMENT PAR MOIS", L, y2);
    y2 += 8;

    const colonneMois = 108;
    const largeurUtile = W - colonneMois - 66;
    const largeurPoste = largeurUtile / POSTES_FRAIS.length;

    // En-têtes de colonnes
    doc.setFontSize(7).setTextColor("#555555");
    POSTES_FRAIS.forEach((poste, i) => {
      const nom = libelleLigne({ key: poste, label: poste }, libelles);
      doc.text(
        nom.length > 12 ? nom.slice(0, 11) + "." : nom,
        L + colonneMois + i * largeurPoste,
        y2,
        { align: "center", maxWidth: largeurPoste }
      );
    });
    doc.text("Total", R - 60, y2, { align: "right" });
    y2 += 3;
    doc.setDrawColor("#999999").setLineWidth(0.7);
    doc.line(L, y2, R, y2);

    blocs.forEach((bloc) => {
      y2 += 12;
      doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(NOIR);
      doc.text(bloc.titre.replace(/^D[ÉE]TAIL\s*[—-]\s*/i, ""), L + 2, y2, {
        maxWidth: colonneMois - 6,
      });
      POSTES_FRAIS.forEach((poste, i) => {
        const valeur = Number(bloc.detail[poste]) || 0;
        doc.setTextColor(valeur > 0 ? NOIR : GRIS);
        doc.text(
          valeur > 0 ? formatMoneyPlain(valeur) : "—",
          L + colonneMois + i * largeurPoste,
          y2,
          { align: "center", maxWidth: largeurPoste }
        );
      });
      doc.setFont("helvetica", "bold").setTextColor(NOIR);
      doc.text(formatMoneyPlain(bloc.montant ?? 0), R - 4, y2, { align: "right" });
    });
    y2 += 4;
    doc.setDrawColor(NOIR).setLineWidth(1);
    doc.line(L, y2, R, y2);
  }

  /* ============ LA SOMME DE / PAYÉ PAR / LETTRES / SIGNATURE ============ */
  // Le bas de page est réservé : le code-barres et le numéro de séquence
  // occupent une bande fixe. La signature s'y empile, et si elle n'y tient
  // plus elle change de page — sinon elle chevauche le numéro de séquence.
  const PIED_Y = doc.internal.pageSize.getHeight() - 40;
  const HAUT_CODE_BARRE = PIED_Y - 44;
  const BAS_ZONE_SIGNATURE = HAUT_CODE_BARRE - 10;

  // Un seul curseur descend : chaque bloc est empilé sous le précédent, ce qui
  // évite tout chevauchement quel que soit le nombre de lignes. L'écart est
  // serré pour qu'un paiement trimestriel tienne sur une seule feuille.
  y2 += serré ? 14 : 20;

  // Sur la même ligne : « La somme de : » à gauche, « Payé par : » à droite,
  // comme sur le modèle officiel.
  doc.setFont("helvetica", "normal").setFontSize(11).setTextColor(NOIR);
  doc.text("La somme de :", L, y2);
  const sommeLabel = doc.getTextWidth("La somme de : ");
  doc.setFont("helvetica", "bold");
  doc.text(`${formatMoneyPlain(montant)} FCFA`, L + sommeLabel, y2);

  const payeLabel = "Payé par :";
  doc.setFont("helvetica", "normal");
  doc.text(payeLabel, COL, y2);
  doc.setFont("helvetica", "bold");
  doc.text(libelleMode(q.mode), COL + doc.getTextWidth(payeLabel) + 4, y2);
  y2 += serré ? 16 : 20;

  // Montant en lettres, souligné : le trait est dessiné à la largeur du texte.
  doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(NOIR);
  const enLettres = amountToWords(montant);
  doc.text(enLettres, L, y2, { maxWidth: W });
  doc.setDrawColor(NOIR).setLineWidth(0.6);
  doc.line(L, y2 + 4, L + doc.getTextWidth(enLettres), y2 + 4);
  y2 += serré ? 18 : 24;

  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(NOIR);
  doc.text(`Fait à ${q.villeProprietaire || "—"} le ${frDate(q.datePaiement)}`, L, y2);
  y2 += serré ? 10 : 22;

  // La signature est ancrée en bas à droite, juste au-dessus du pied de page.
  // Elle ne dépend plus de la position du texte : quelle que soit la longueur
  // du détail, elle occupe toujours le même coin, et le reçu reste sur une
  // seule feuille.
  const boxW = 170;
  const boxH = 58;
  const boxY = BAS_ZONE_SIGNATURE - boxH - 16;

  // Le texte ne descend jamais dans le coin de la signature : au-delà, il
  // change de page.
  if (y2 > boxY - 8) {
    doc.addPage();
    y2 = 60;
  }

  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(NOIR);
  doc.text("Cachet et signature du propriétaire", COL, boxY - 6, {
    maxWidth: R - COL,
  });
  doc.setDrawColor("#4a4a4a").setLineWidth(0.7);
  doc.rect(COL, boxY, boxW, boxH);
  const signature = proprietaire.signatureUrl || signatureBase64;
  if (signature && /^data:image\//.test(signature)) {
    try {
      // On lit les dimensions réelles plutôt que de gonfler l'image jusqu'aux
      // bords du cadre : étirer une signature sur 154×42 la déforme, et une
      // signature déformée ne prouve plus rien. jsPDF déduit aussi le format
      // (PNG/JPEG) du data URL ; forcer "PNG" sur une photo au format JPEG
      // donnait une décompression ratée.
      const props = doc.getImageProperties(signature);
      const ratio = (props.width || 1) / (props.height || 1) || 1;
      let largeur = boxW - 16;
      let hauteur = largeur / ratio;
      const maxH = boxH - 16;
      if (hauteur > maxH) {
        hauteur = maxH;
        largeur = hauteur * ratio;
      }
      doc.addImage(
        signature,
        props.format || "PNG",
        COL + 8 + ((boxW - 16) - largeur) / 2,
        boxY + 8 + (maxH - hauteur) / 2,
        largeur,
        hauteur,
        undefined,
        "FAST"
      );
    } catch (erreur) {
      // La signature est un enrichissement : si elle est illisible, la
      // quittance reste valable, cadre vide.
      console.warn("Signature illisible, cadre laissé vide :", erreur?.message);
    }
  }

  /* ============ PIED DE PAGE ET CODE-BARRES, SUR CHAQUE PAGE ============ */
  // Dessinés en dernier, page par page : une quittance qui déborde sur une
  // seconde page doit porter son pied et son code-barres elle aussi.
  const numero = q.numero || q.reference || "";
  for (let page = 1; page <= doc.internal.getNumberOfPages(); page++) {
    doc.setPage(page);

    doc.setDrawColor("#cccccc").setLineWidth(0.5);
    doc.line(L, PIED_Y, R, PIED_Y);
    doc.setFont("helvetica", "normal").setFontSize(7).setTextColor("#777777");

    // La quittance porte son propre identifiant, lisible par un scanner : le
    // numéro de séquence suffit à retrouver la ligne correspondante dans
    // « Paiements & Quittances ». Le code est tracé **en bas à gauche**, le
    // numéro écrit en dessous, comme sur un document de banque.
    if (numero) {
      const largeurCode = 190;
      const xCode = L;
      const trace = tracerCodeBarre(doc, xCode, HAUT_CODE_BARRE, largeurCode, 22, numero);
      if (trace) {
        // Le libellé passe au-dessus du code : posé entre les barres et le
        // numéro, il était imprimé sur les traits noirs et devenait illisible.
        doc.setFont("helvetica", "normal").setFontSize(6).setTextColor("#888888");
        doc.text("N° DE SÉQUENCE", xCode + trace.largeur / 2, HAUT_CODE_BARRE - 5, {
          align: "center",
        });
        doc.setFontSize(7).setTextColor(NOIR);
        doc.text(numero, xCode + trace.largeur / 2, HAUT_CODE_BARRE + 32, { align: "center" });
      }
    }

    // La mention de conservation se range à droite : le coin gauche est pris
    // par le code-barres.
    doc.setFont("helvetica", "normal").setFontSize(7).setTextColor("#777777");
    doc.text(
      "Quittance générée le " + new Date().toLocaleString("fr-FR") + " — à conserver par le locataire.",
      R,
      PIED_Y + 12,
      { align: "right", maxWidth: W * 0.55 }
    );
  }

  return doc;
}

/** Déclenche le téléchargement du fichier. */
export function telecharger(doc, nomFichier) {
  doc.save(nomFichier || "quittance.pdf");
}

/** Ouvre le PDF dans un nouvel onglet. */
export function ouvrir(doc) {
  const url = doc.output("bloburl");
  window.open(url, "_blank");
}