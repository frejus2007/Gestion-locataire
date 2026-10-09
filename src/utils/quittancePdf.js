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
import { LIGNES_FRAIS } from "../data/db.firebase.js";
import { amountToWords, formatMoneyPlain } from "./format.js";
import { tracerCodeBarre } from "./codeBarre.js";

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

export function construireQuittance(q, options = {}) {
  const proprietaire = options.proprietaire || {};
  const { periode = "", cautionSur = "" } = options;
  // `compress` évite qu'une image de 500 ko fasse gonfler le fichier : sans
  // lui, jsPDF recopie le logo pixel par pixel et la quittance dépasse 1 Mo.
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait", compress: true });

  const montant = Number(q.montant) || 0;
  const detail = detailQuittance(q);
  const libelles = q.libelles || null;
  const nomComplet = [q.prenomsProprietaire, q.nomProprietaire].filter(Boolean).join(" ").trim();

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
        const largeurLogo = 118;
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
  doc.text(`MOIS DE : ${periode || "—"}`, COL, 84, { maxWidth: R - COL });
  if (cautionSur) {
    const largeur = doc.getTextWidth("CAUTION SUR : ");
    doc.text("CAUTION SUR : ", COL, 97);
    doc.setFontSize(7).text(`(${cautionSur})`, COL + largeur + 2, 96.5);
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
  const lignesLocataire = [
    ["NUMERO APPART.", q.designationLot],
    ["NOM & PRENOMS", q.nomLocataire],
    ["IFU", q.ifuLocataire],
    ["TEL", q.telephoneLocataire],
    ["ADRESSE LOCATIVE", q.adresseImmeuble],
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
  const detailW = W * 0.62;
  doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(NOIR);
  doc.text("DETAIL DU PAIEMENT", L, y2, { maxWidth: detailW });
  y2 += 6;
  doc.setDrawColor("#999999").setLineWidth(0.7);
  doc.line(L, y2, L + detailW, y2);

  LIGNES_FRAIS.forEach((ligne) => {
    y2 += 13;
    const valeur = Number(detail[ligne.key]) || 0;
    const texte = valeur > 0 ? formatMoneyPlain(valeur) : "—";
    doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(valeur > 0 ? NOIR : GRIS);
    doc.text(libelleLigne(ligne, libelles), L + 5, y2, { maxWidth: detailW - 110 });
    // Aligné à droite par sa position : `align` n'est pas fiable avec maxWidth.
    doc.text(texte, L + detailW - 8 - doc.getTextWidth(texte), y2);
  });
  y2 += 5;
  doc.setDrawColor(NOIR).setLineWidth(1);
  doc.line(L, y2, L + detailW, y2);

  /* ============ LA SOMME DE / PAYÉ PAR / LETTRES / SIGNATURE ============ */
  // Un seul curseur descend : chaque bloc est empilé sous le précédent, ce qui
  // évite tout chevauchement quel que soit le nombre de lignes.
  y2 += 26;

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
  y2 += 20;

  // Montant en lettres, souligné : le trait est dessiné à la largeur du texte.
  doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(NOIR);
  const enLettres = amountToWords(montant);
  doc.text(enLettres, L, y2, { maxWidth: W });
  doc.setDrawColor(NOIR).setLineWidth(0.6);
  doc.line(L, y2 + 4, L + doc.getTextWidth(enLettres), y2 + 4);
  y2 += 24;

  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(NOIR);
  doc.text(`Fait à ${q.villeProprietaire || "—"} le ${frDate(q.datePaiement)}`, L, y2);
  y2 += 22;

  // Signature : cadre à droite, à hauteur des mentions.
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(NOIR);
  doc.text("Signature", COL, y2 - 22, { maxWidth: R - COL });
  const boxW = 170;
  const boxH = 58;
  const boxY = y2 - 14;
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
    } catch {
      console.warn("Signature illisible, cadre laissé vide :", e && e.message);
    }
  }
  doc.setFontSize(8).setTextColor("#666666");
  doc.text("Cachet et signature du propriétaire", COL, boxY + boxH + 5, {
    maxWidth: R - COL,
  });

  /* ============ PIED DE PAGE ============ */
  const piedY = doc.internal.pageSize.getHeight() - 40;
  doc.setDrawColor("#cccccc").setLineWidth(0.5);
  doc.line(L, piedY, R, piedY);
  doc.setFont("helvetica", "normal").setFontSize(7).setTextColor("#777777");
  // Aligné à gauche : le centrage horizontal décale le texte hors de la page
  // dès que la chaîne contient des caractères accentués.
  doc.text(
    "Quittance générée le " + new Date().toLocaleString("fr-FR") + " — à conserver par le locataire.",
    L,
    piedY + 12,
    { maxWidth: W * 0.6 }
  );

  /* ============ SÉQUENCE ET CODE-BARRES ============ */
  // La quittance porte son propre identifiant, lisible par un scanner : le
  // numéro de séquence suffit à retrouver la ligne correspondante dans
  // « Paiements & Quittances ». Le code est tracé à gauche du pied de page et
  // le numéro écrit en dessous, comme sur un document de banque.
  const numero = q.numero || q.reference || "";
  if (numero) {
    const largeurCode = 190;
    const xCode = R - largeurCode;
    const hautCode = piedY - 44;
    const trace = tracerCodeBarre(doc, xCode, hautCode, largeurCode, 22, numero, { moduleRatio: 2 });
    if (trace) {
      // Le libellé passe au-dessus du code : posé entre les barres et le
      // numéro, il était imprimé sur les traits noirs et devenait illisible.
      doc.setFont("helvetica", "normal").setFontSize(6).setTextColor("#888888");
      doc.text("N° DE SÉQUENCE", xCode + trace.largeur / 2, hautCode - 5, { align: "center" });
      doc.setFontSize(7).setTextColor("#000000");
      doc.text(numero, xCode + trace.largeur / 2, hautCode + 32, { align: "center" });
    }
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