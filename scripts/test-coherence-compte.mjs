// Les deux écrans doivent dire la même chose.
//
// C'est le cas qui a été signalé : un locataire payé jusqu'en octobre, avec
// novembre et décembre ouverts, valait 110 000 dans la liste des locataires et
// 330 000 dans son compte. Deux chiffres pour une seule personne — et c'est le
// compte, le plus détaillé, qui donnait le mauvais.
//
// La règle testée est extraite du module réel, pas recopiée : un test qui
// reproduit une implémentation ne prouve rien — les deux peuvent diverger en
// silence sans qu'on le voie.
//
// Usage : node scripts/test-coherence-compte.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let reussis = 0;
let echecs = 0;

function verifier(intitule, condition, detail = "") {
  if (condition) {
    reussis++;
    console.log(`  OK    ${intitule}${detail ? " — " + detail : ""}`);
  } else {
    echecs++;
    console.log(`  ECHEC ${intitule}${detail ? " — " + detail : ""}`);
  }
}

function egal(intitule, obtenu, attendu) {
  verifier(intitule, obtenu === attendu, `obtenu ${obtenu}, attendu ${attendu}`);
}

// --- Extraire la règle réelle du contexte ---
//
// Le contexte est du JSX, que Node ne sait pas lire. On isole les deux
// fonctions pures — aucune n'utilise de JSX — et on les importe. Ce sont les
// vraies, pas des copies.

const source = fs.readFileSync(path.join(racine, "src/context/AppContext.jsx"), "utf8");
const morceaux = [
  source.match(/export function periodeMois\(ref\) \{[\s\S]*?\n\}/)?.[0],
  source.match(/export function estEchuPour\(loyer, bail, ref = new Date\(\)\) \{[\s\S]*?\n\}/)?.[0],
];

if (morceaux.some((m) => !m)) {
  console.error("Règle introuvable dans AppContext.jsx — le test ne peut pas tourner.");
  process.exit(1);
}

const temporaire = path.join(racine, "src/context/.regle-echu-test.mjs");
fs.writeFileSync(temporaire, morceaux.join("\n\n"), "utf8");

let periodeMois;
let estEchu;
try {
  ({ periodeMois, estEchuPour: estEchu } = await import(pathToFileURL(temporaire).href));
} finally {
  fs.unlinkSync(temporaire);
}

// --- Le solde du relevé, tel que Compte.jsx le calcule ---

const BAIL = { id: "b1", echeanceJour: 1 };
const LOYER = 110000;

const loyer = (periode) => ({
  id: `loy_${periode}`,
  bailId: "b1",
  periode,
  loyer: LOYER,
  montantDu: LOYER,
});

/**
 * Le cumul de `Compte.jsx` : loyer seul, un mois non échu qui ne pèse pas, et
 * seule la part du versement qui couvre le loyer.
 */
function soldeReleve(loyers, payes, bail, ref) {
  let cumul = 0;
  for (const l of loyers) {
    if (!estEchu(l, bail, ref)) continue;
    const p = payes[l.id] || { montant: 0 };
    const couvert = p.detail && typeof p.detail.loyer === "number"
      ? Math.max(0, Math.min(p.montant, p.detail.loyer))
      : Math.max(0, Math.min(p.montant, LOYER));
    cumul += LOYER - Math.min(couvert, LOYER);
  }
  return cumul;
}

const OCT = new Date(2026, 9, 1);
const OCT_31 = new Date(2026, 9, 31);
const NOV_1 = new Date(2026, 10, 1);

console.log("\nLe cas signalé : payé jusqu'en octobre, novembre et décembre ouverts");

const loyers = [loyer("2026-10"), loyer("2026-11"), loyer("2026-12")];
// Payé jusqu'en octobre : au 1er novembre, seul novembre est dû.
const payes = { "loy_2026-10": { montant: LOYER, detail: { loyer: LOYER } } };

egal("au 1er octobre, rien n'est dû — tout est payé", soldeReleve(loyers, payes, BAIL, OCT), 0);
egal("au 1er novembre, seul novembre est dû — 110 000", soldeReleve(loyers, payes, BAIL, NOV_1), LOYER);
egal("le 31 octobre, encore rien : novembre n'est pas dû", soldeReleve(loyers, payes, BAIL, OCT_31), 0);
egal("au 1er décembre, novembre et décembre sont dus — 220 000",
  soldeReleve(loyers, payes, BAIL, new Date(2026, 11, 1)), LOYER * 2);

console.log("\nUn locataire soldé jusqu'en décembre");

const soldes = {
  "loy_2026-10": { montant: LOYER, detail: { loyer: LOYER } },
  "loy_2026-11": { montant: LOYER, detail: { loyer: LOYER } },
  "loy_2026-12": { montant: LOYER, detail: { loyer: LOYER } },
};
egal("aucune dette au 1er octobre malgré trois mois ouverts", soldeReleve(loyers, soldes, BAIL, OCT), 0);
egal("et toujours aucune au 1er décembre", soldeReleve(loyers, soldes, BAIL, new Date(2026, 11, 1)), 0);
egal("puis janvier redevient dû", soldeReleve([...loyers, loyer("2027-01")], soldes, BAIL, new Date(2027, 0, 1)), LOYER);

console.log("\nUn bail dont l'échéance tombe le 5");

const BAIL_5 = { id: "b1", echeanceJour: 5 };
verifier("le 4, rien n'est dû", !estEchu(loyer("2026-10"), BAIL_5, new Date(2026, 9, 4)));
verifier("le 5, le mois est dû", estEchu(loyer("2026-10"), BAIL_5, new Date(2026, 9, 5)));

console.log("\nLa règle est stable sur tous les cas");

const cas = [
  ["2026-09", new Date(2026, 9, 1), true],
  ["2026-10", new Date(2026, 9, 1), true],
  ["2026-11", new Date(2026, 9, 1), false],
  ["2026-12", new Date(2026, 9, 1), false],
  ["2026-11", new Date(2026, 10, 1), true],
  ["2026-12", new Date(2026, 10, 1), false],
];

let ecarts = 0;
for (const [periode, ref, attendu] of cas) {
  const obtenu = estEchu(loyer(periode), BAIL, ref);
  if (obtenu !== attendu) {
    ecarts++;
    console.log(`    ${periode} au ${periodeMois(ref)} : ${obtenu}, attendu ${attendu}`);
  }
}
verifier("tous les cas concordent", ecarts === 0, `${ecarts} écart(s)`);

console.log(`\n${reussis} vérification(s) réussie(s), ${echecs} échec(s)`);
process.exitCode = echecs === 0 ? 0 : 1;