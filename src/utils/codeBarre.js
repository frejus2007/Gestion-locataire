// Générateur de code-barres Code 128 (sous-ensemble B), en JavaScript pur.
//
// jsPDF 4 n'embarque plus son ancien module de code-barres, et le fichier
// est généré dans le navigateur, sans accès à une bibliothèque externe. On
// dessine donc les barres nous-mêmes : `doc.rect()` suffit, et le résultat
// est un vrai code-barres lisible par un scanner, pas une image décorative.
//
// Référence normative : ISO/IEC 15417. Un code-barres lisible doit être
// vérifiable ; `zbarimg` sert de contrôle sur le rendu produit ici.

/**
 * Les 107 motifs de Code 128, exprimés en largeurs de modules (1 = étroite,
 * 2 = large), dans l'ordre des valeurs 0 à 106.
 *
 * Chaque motif fait 11 modules de large (6 barres et 5 espaces, sauf le motif
 * d'arrêt qui en compte 13) : c'est ce qui rend le motif auto-synchronisant.
 */
const MOTIFS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];

/** Motif de départ du sous-ensemble B, qui codes les caractères ASCII 32 à 126. */
const DEPART_B = 104;

/** Valeur de caractère pour le sous-ensemble B. Hors ASCII 32–126 : -1. */
function valeurB(caractere) {
  const code = caractere.charCodeAt(0);
  return code >= 32 && code <= 126 ? code - 32 : -1;
}

/**
 * Encode un texte en Code 128 sous-ensemble B.
 *
 * @param {string} texte
 * @returns {{motifs: number[], texte: string, invalide: string[]}|null}
 *   `motifs` : valeurs 0..106 à dessiner dans l'ordre (la vérification de
 *   parité s'y trouve déjà). `invalide` liste les caractères non encodables.
 *   Renvoie null si la chaîne est vide.
 */
export function encoderCode128(texte) {
  const source = String(texte ?? "");
  if (!source) return null;

  const valeurs = [];
  const invalide = [];
  for (const caractere of source) {
    const v = valeurB(caractere);
    if (v < 0) invalide.push(caractere);
    else valeurs.push(v);
  }
  // Un caractère hors alphabet ne peut pas être codé en sous-ensemble B : on
  // le signale plutôt que de produire une barre muette que le scanner lirait
  // comme une erreur.
  if (invalide.length || !valeurs.length) return { motifs: null, texte: source, invalide };

  // Clé de vérification : somme pondérée 1..n, modulo 103.
  let somme = DEPART_B;
  valeurs.forEach((v, i) => {
    somme += v * (i + 1);
  });
  const verification = somme % 103;

  return {
    motifs: [DEPART_B, ...valeurs, verification, 106],
    texte: source,
    invalide: [],
  };
}

/**
 * Largeur totale d'un encodage, en modules. Un module est la plus petite
 * barre ; toutes les largeurs s'expriment en multiples de celui-ci.
 */
export function largeurModules(motifs) {
  return motifs.reduce((total, valeur) => {
    if (valeur === 106) return total + 13; // motif d'arrêt : 13 modules
    const motif = MOTIFS[valeur];
    if (!motif) return total;
    let somme = 0;
    for (const chiffre of motif) somme += Number(chiffre);
    return total + somme;
  }, 0);
}

/**
 * Trace le code-barres dans un document jsPDF.
 *
 * @param {object} doc        instance jsPDF
 * @param {number} x          bord gauche
 * @param {number} y          bord haut
 * @param {number} largeur     largeur totale disponible
 * @param {number} hauteur     hauteur des barres
 * @param {string} texte       contenu encodé
 * @param {object} [options]
 * @param {number} [options.moduleRatio=2] largeur d'un module en points
 * @returns {object|null} informations de tracé, ou null si rien n'a été dessiné
 */
export function tracerCodeBarre(doc, x, y, largeur, hauteur, texte, options = {}) {
  const moduleRatio = options.moduleRatio || 2;
  const encode = encoderCode128(texte);
  if (!encode || !encode.motifs) return null;

  const modules = largeurModules(encode.motifs);
  // Module le plus large qui tient dans l'espace imparti : on ne déforme
  // jamais la largeur, un code-barres étiré n'est plus décodable.
  const module = Math.max(1, Math.floor(largeur / modules));
  const largeurReelle = module * modules;

  doc.setFillColor("#000000");
  let position = x;
  for (const valeur of encode.motifs) {
    const motif = MOTIFS[valeur];
    if (!motif) continue;
    // Le motif alterne barre, espace, barre… On parcourt tous les éléments
    // pour cumuler les largeurs, et on ne dessine que les barres.
    for (let i = 0; i < motif.length; i++) {
      const largeurElement = Number(motif[i]) * module;
      if (i % 2 === 0) doc.rect(position, y, largeurElement, hauteur, "F");
      position += largeurElement;
    }
  }

  return {
    largeur: largeurReelle,
    module,
    hauteur,
    modules,
    invalide: encode.invalide,
  };
}

/**
 * Retourne la liste des segments (position, largeur) des barres, en modules.
 *
 * Sert aux tests : on peut reconstruire le motif independently de jsPDF et le
 * contrôler avec un décodeur réel, au lieu de se fier à l'image produite.
 */
export function segmentsBarres(texte) {
  const encode = encoderCode128(texte);
  if (!encode || !encode.motifs) return [];
  const segments = [];
  let position = 0;
  for (const valeur of encode.motifs) {
    const motif = MOTIFS[valeur];
    if (!motif) continue;
    // Le motif est une suite alternée barre, espace, barre, espace… On parcourt
    // tous les éléments pour cumuler les largeurs, mais on ne dessine que les
    // barres : les positions réutilisées sont donc celles des barres.
    for (let i = 0; i < motif.length; i++) {
      const largeur = Number(motif[i]);
      if (i % 2 === 0) segments.push({ position, largeur });
      position += largeur;
    }
  }
  return segments;
}