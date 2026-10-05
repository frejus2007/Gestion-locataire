// Formatage des montants, dates et périodes.
// Le montant en toutes lettres figure sur une quittance imprimée : la fonction
// est donc écrite pour être exacte, et non approximative.

export function formatMoney(amount) {
  const n = Math.round(Number(amount) || 0);
  return new Intl.NumberFormat("fr-FR").format(n) + " FCFA";
}

// Montant sans la devise, pour les cellules de tableau et les graphiques.
export function formatNumber(amount) {
  return new Intl.NumberFormat("fr-FR").format(Math.round(Number(amount) || 0));
}

export function formatDate(dateStr) {
  if (!dateStr) return "—";
  // "2026-07-05" sans fuseau : on ancre à midi pour éviter tout décalage.
  const d = new Date(dateStr.length === 10 ? dateStr + "T12:00:00" : dateStr);
  if (isNaN(d)) return "—";
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function formatDateLongue(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr.length === 10 ? dateStr + "T12:00:00" : dateStr);
  if (isNaN(d)) return "—";
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

// --- Périodes : "2026-07" <-> "Juillet 2026" ---

export const MOIS_COURTS = [
  "Jan", "Fév", "Mar", "Avr", "Mai", "Juin",
  "Juil", "Août", "Sep", "Oct", "Nov", "Déc",
];

export const MOIS_LONGS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

// Accepte "2026-07", "2026-7" ou un mois déjà nommé ("Juillet 2026").
export function periodeToLabel(periode) {
  if (!periode) return "—";
  const m = String(periode).match(/^(\d{4})[-/](\d{1,2})$/);
  if (m) {
    const idx = Number(m[2]) - 1;
    if (idx < 0 || idx > 11) return periode;
    return `${MOIS_LONGS[idx]} ${m[1]}`;
  }
  return periode;
}

export function periodeToCourt(periode) {
  const label = periodeToLabel(periode);
  const m = label.match(/^(\S+) (\d{4})$/);
  if (!m) return label;
  const idx = MOIS_LONGS.indexOf(m[1]);
  return idx < 0 ? label : `${MOIS_COURTS[idx]} ${m[2]}`;
}

// Période du mois courant au format "2026-10".
export function periodeCourante(ref = new Date()) {
  return `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, "0")}`;
}

// Décale une période de n mois (n peut être négatif).
export function periodeDecalee(periode, n) {
  const m = String(periode).match(/^(\d{4})-(\d{2})$/);
  if (!m) return periode;
  const d = new Date(Number(m[1]), Number(m[2]) - 1 + n, 1);
  return periodeCourante(d);
}

export function comparePeriode(a, b) {
  return String(a).localeCompare(String(b));
}

// Liste des périodes entre deux bornes incluses, du plus ancien au plus récent.
export function periodesEntre(debut, fin) {
  const out = [];
  let cur = debut;
  let guard = 0;
  while (comparePeriode(cur, fin) <= 0 && guard++ < 600) {
    out.push(cur);
    cur = periodeDecalee(cur, 1);
  }
  return out;
}

// --- Montant en toutes lettres (français) ---

const UNITES = [
  "", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf",
  "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize",
  "dix-sept", "dix-huit", "dix-neuf",
];

// Les dizaines qui prennent "et un" : 21, 31, 41, 51, 61, 71.
function dizaines(n) {
  if (n < 20) return UNITES[n];
  const d = Math.floor(n / 10);
  const u = n % 10;
  if (n < 70) {
    const base = ["", "dix", "vingt", "trente", "quarante", "cinquante", "soixante"][d];
    if (u === 0) return base;
    if (u === 1) return `${base} et un`;
    return `${base}-${UNITES[u]}`;
  }
  if (n < 80) {
    // 70-79 : soixante-dix … soixante-dix-neuf
    if (n === 71) return "soixante et onze";
    return `soixante-${UNITES[n - 60]}`;
  }
  // 80-99 : quatre-vingt … quatre-vingt-dix-neuf
  if (n === 80) return "quatre-vingts";
  return `quatre-vingt-${UNITES[n - 80]}`;
}

/**
 * Écrit un nombre de 0 à 999.
 * @param {boolean} centPlural le groupe se termine ici : "cent" prend alors un s.
 */
function sousMille(n, centPlural) {
  if (n === 0) return "";
  const c = Math.floor(n / 100);
  const r = n % 100;

  if (c === 0) return dizaines(r);

  // "cent" prend un s s'il est multiplié et termine le groupe (deux cents).
  // Sinon il reste invariable : deux cent un, cent quatre-vingt-dix.
  const centSigne = c === 1 ? "cent" : `${UNITES[c]} cent${r === 0 && centPlural ? "s" : ""}`;
  if (r === 0) return centSigne;

  return `${centSigne} ${dizaines(r)}`;
}

const ECHELLES = [
  { seuil: 1e9, mot: "milliard", pluriel: "milliards" },
  { seuil: 1e6, mot: "million", pluriel: "millions" },
  { seuil: 1e3, mot: "mille", invariable: true },
];

/**
 * Convertit un entier en toutes lettres.
 * Gère les accords de cent / vingt / mille et les cas 70-99.
 */
export function numberToWords(n) {
  n = Math.floor(Number(n));
  if (!Number.isFinite(n)) return "";
  if (n === 0) return "zéro";
  if (n < 0) return `moins ${numberToWords(-n)}`;

  // Découpe en groupes de trois chiffres, du plus fort au plus faible.
  const parts = [];
  let reste = n;
  for (const echelle of ECHELLES) {
    const chunk = Math.floor(reste / echelle.seuil);
    reste %= echelle.seuil;
    if (chunk > 0) parts.push({ chunk, echelle });
  }
  if (reste > 0) parts.push({ chunk: reste, echelle: null });

  const mots = parts.map(({ chunk, echelle }, i) => {
    // "cent" ne prend un s que s'il termine le nombre entier.
    const centPlural = echelle === null && i === parts.length - 1;
    if (echelle === null) return sousMille(chunk, centPlural);
    if (echelle.invariable) {
      // "mille" est invariable et ne se préface pas de "un".
      return chunk === 1 ? "mille" : `${sousMille(chunk, false)} mille`;
    }
    return chunk === 1
      ? `un ${echelle.mot}`
      : `${sousMille(chunk, false)} ${echelle.pluriel}`;
  });

  return mots.join(" ");
}

export function amountToWords(amount) {
  const n = Math.round(Number(amount) || 0);
  return `${numberToWords(n)} francs CFA`;
}

// --- Numérotation des quittances ---

/**
 * Construit une référence séquentielle à partir d'un compteur.
 * @param {string} annee  ex. "2026"
 * @param {number} numero ex. 42
 */
export function buildReceiptNumber(annee, numero) {
  return `Q-${annee}-${String(numero).padStart(6, "0")}`;
}

// --- Divers ---

/**
 * Nombre accordé : `pluriel(3, "versement")` → « 3 versements ».
 * Le pluriel est par défaut le singulier suivi d'un s ; on peut le donner
 * explicitement pour les irregularités (« anticipé », « moistur »).
 * À utiliser plutôt que `{n} mot{n > 1 ? "s" : ""}`, qui insère des espaces
 * parasites en JSX multi-ligne.
 */
export function pluriel(n, singulier, formePlurielle = singulier + "s") {
  return `${n} ${n > 1 ? formePlurielle : singulier}`;
}

/**
 * Accord d'un mot placé après un nombre. À utiliser plutôt que
 * `{n} mot{n > 1 ? "s" : ""}` : le JSX multi-ligne insère des espaces
 * parasites entre les expressions et affiche « 3 periode s ».
 */
export function accordMot(n, singulier, plurielMot = singulier + "s") {
  return n > 1 ? plurielMot : singulier;
}

/** Suffixe d'accord seul : renvoie « s » ou une chaîne vide. */
export function accorde(n) {
  return n > 1 ? "s" : "";
}

/** Initiales pour les avatars, tolérantes aux champs vides. */
export function initiales(...noms) {
  const lettres = noms
    .filter(Boolean)
    .map((n) => String(n).trim().charAt(0))
    .filter(Boolean)
    .join("");
  return (lettres || "?").toUpperCase().slice(0, 2);
}

/** Libellé d'un statut de loyer. */
export const LIBELLE_STATUT_LOYER = {
  paye: { label: "Payé", classe: "badge-green" },
  partiel: { label: "Partiel", classe: "badge-amber" },
  impaye: { label: "Impayé", classe: "badge-red" },
};

/** Libellé du statut de caution. */
export const LIBELLE_CAUTION = {
  "non-versee": { label: "Non versée", classe: "badge-neutral" },
  deposee: { label: "Déposée", classe: "badge-green" },
  restituee: { label: "Restituée", classe: "badge-blue" },
  retenue: { label: "Retenue", classe: "badge-red" },
};

/** Palette d'avatars, en couleurs hexadécimales (le projet n'utilise pas Tailwind). */
export const COULEURS_AVATAR = [
  "#1D4ED8", "#047857", "#B45309", "#BE123C",
  "#0E7490", "#6D28D9", "#BE185D", "#0F766E",
];

export function couleurAvatar(nom) {
  const cle = String(nom || "");
  let hash = 0;
  for (let i = 0; i < cle.length; i++) {
    hash = cle.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COULEURS_AVATAR[Math.abs(hash) % COULEURS_AVATAR.length];
}