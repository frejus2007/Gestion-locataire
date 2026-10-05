// Fonctions utilitaires de formatage

export function formatMoney(amount) {
  return new Intl.NumberFormat("fr-FR").format(amount) + " FCFA";
}

export function formatDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// Convertit un montant en toutes lettres (français, francs CFA)
const units = [
  "", "un", "deux", "trois", "quatre", "cinq", "six", "huit", "neuf",
  "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize",
  "dix-sept", "dix-huit", "dix-neuf",
];
const tens = ["", "dix", "vingt", "trente", "quarante", "cinquante", "soixante", "soixante", "quatre-vingt", "quatre-vingt"];

function twoDigits(n) {
  if (n < 20) return units[n];
  const t = Math.floor(n / 10);
  const u = n % 10;
  if (t === 7 || t === 9) {
    return tens[t] + "-" + (u === 1 ? "et-onze" : units[10 + u]);
  }
  return tens[t] + (u === 1 ? "-et-un" : u > 0 ? "-" + units[u] : t === 8 ? "s" : "");
}

function threeDigits(n) {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  let res = "";
  if (h > 0) res += (h === 1 ? "" : units[h] + "-") + "cent" + (rest === 0 && h > 1 ? "s" : "");
  if (rest > 0) res += (h > 0 ? "-" : "") + twoDigits(rest);
  return res;
}

export function numberToWords(amount) {
  if (amount === 0) return "zéro";
  const scales = ["", "mille", "million", "milliard"];
  const parts = [];
  let n = Math.floor(Math.abs(amount));
  let scale = 0;
  while (n > 0 && scale < scales.length) {
    const chunk = n % 1000;
    if (chunk > 0) {
      const words = chunk === 1 && scale === 1 ? "mille" : threeDigits(chunk) + (scales[scale] ? " " + scales[scale] + (chunk > 1 && scale > 1 ? "s" : "") : "");
      parts.unshift(words);
    }
    n = Math.floor(n / 1000);
    scale++;
  }
  return parts.join("-");
}

export function amountToWords(amount) {
  return numberToWords(amount) + " francs CFA";
}

// Génère un numéro de quittance Q-ANNÉE-NUMÉRO
export function receiptNumber(paymentId) {
  const year = new Date().getFullYear();
  return `Q-${year}-${String(paymentId).padStart(6, "0")}`;
}
