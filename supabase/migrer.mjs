// Migration des données Firestore vers Supabase.
//
// Usage :
//   SUPABASE_URL=https://<projet>.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<clé service_role> \
//   node supabase/migrer.mjs sauvegardes/cagloca_AAAA-MM-JJ_HHhMM [--a-blanc]
//
// - `--a-blanc` vérifie les données et compte les lignes, sans rien écrire.
// - Sans cette option, les lignes sont écrites avec upsert : relancer le script
//   ne duplique rien.
// - La clé service_role contourne les règles de sécurité : elle ne doit jamais
//   être commitée ni placée dans le code de l'application.
//
// Les snapshots viennent de scripts/snapshot-firestore.sh (format REST Firestore).

import fs from "node:fs";
import path from "node:path";

const URL_PROJET = process.env.SUPABASE_URL;
const CLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dossier = process.argv[2];
const aBlanc = process.argv.includes("--a-blanc");

if (!URL_PROJET || !CLE || !dossier) {
  console.error("Il faut SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY et le dossier du snapshot.");
  process.exit(1);
}

// --- Décodage du format REST Firestore ---

function valeur(v) {
  if ("nullValue" in v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("mapValue" in v) return champs(v.mapValue.fields || {});
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(valeur);
  if ("referenceValue" in v) return v.referenceValue;
  throw new Error("type Firestore inconnu : " + JSON.stringify(v));
}

function champs(fields) {
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, valeur(v)]));
}

function lireCollection(nom) {
  const json = JSON.parse(fs.readFileSync(path.join(dossier, `${nom}.json`), "utf8"));
  return (json.documents || []).map((d) => ({ id: d.name.split("/").pop(), ...champs(d.fields || {}) }));
}

// --- Correspondance Firestore → colonnes ---
//
// Chaque table : la clé primaire, puis ses colonnes, chacune tirée d'un champ
// Firestore (nom du champ) ou calculée (fonction).

const TABLES = {
  proprietaire: {
    source: "proprietaire",
    pk: ["id"],
    colonnes: {
      id: "id", nom: "nom", prenoms: "prenoms", telephone: "telephone", adresse: "adresse",
      ville: "ville", ifu: "ifu", banque: "banque", signature_url: "signatureUrl",
      reception: "reception", updated_at: "updatedAt",
    },
  },
  immeubles: {
    source: "immeubles",
    pk: ["id"],
    colonnes: {
      id: "id", nom: "nom", adresse: "adresse", ville: "ville", quartier: "quartier",
      notes: "notes", date_acquisition: "dateAcquisition", statut: "statut", updated_at: "updatedAt",
    },
  },
  lots: {
    source: "lots",
    pk: ["id"],
    colonnes: {
      id: "id", immeuble_id: "immeubleId", designation: "designation", numero: "numero",
      etage: "etage", nb_pieces: "nbPieces", loyer_reference: "loyerReference", notes: "notes",
      updated_at: "updatedAt",
    },
  },
  locataires: {
    source: "locataires",
    pk: ["id"],
    colonnes: {
      id: "id", nom: "nom", prenoms: "prenoms", telephone: "telephone", email: "email",
      ifu: "ifu", piece_nature: "pieceNature", piece_numero: "pieceNumero", notes: "notes",
      actif: "actif", updated_at: "updatedAt",
    },
  },
  baux: {
    source: "baux",
    pk: ["id"],
    colonnes: {
      id: "id", lot_id: "lotId", locataire_id: "locataireId", date_debut: "dateDebut",
      date_fin: "dateFin", loyer_mensuel: "loyerMensuel", frais_defaut: "fraisDefaut",
      caution_statut: "cautionStatut", caution_versee: "cautionVersee", caution_sur: "cautionSur",
      notes: "notes", updated_at: "updatedAt",
    },
  },
  loyers: {
    source: "loyers",
    pk: ["id"],
    colonnes: {
      id: "id", bail_id: "bailId", periode: "periode", loyer: "loyer", eau: "eau",
      electricite: "electricite", ordures: "ordures", degats: "degats", autre1: "autre1",
      autre2: "autre2", montant_du: "montantDu", statut: "statut",
    },
  },
  paiements: {
    source: "paiements",
    pk: ["id"],
    colonnes: {
      id: "id", bail_id: "bailId", locataire_id: "locataireId", date: "date", montant: "montant",
      mode: "mode", reference: "reference", note: "note", detail: "detail", libelles: "libelles",
      created_at: "createdAt",
    },
  },
  quittances: {
    source: "quittances",
    pk: ["id"],
    colonnes: {
      id: "id", numero: "numero", sequence: "sequence", annee: "annee", paiement_id: "paiementId",
      bail_id: "bailId", locataire_id: "locataireId", periode: "periode", montant: "montant",
      date_paiement: "datePaiement", date_emission: "dateEmission", mode: "mode", detail: "detail",
      libelles: "libelles", allocations: "allocations", caution_sur: "cautionSur",
      nom_locataire: "nomLocataire", prenoms_locataire: "prenomsLocataire",
      ifu_locataire: "ifuLocataire", telephone_locataire: "telephoneLocataire",
      designation_lot: "designationLot", numero_lot: "numeroLot",
      adresse_immeuble: "adresseImmeuble", nom_proprietaire: "nomProprietaire",
      prenoms_proprietaire: "prenomsProprietaire", ifu_proprietaire: "ifuProprietaire",
      telephone_proprietaire: "telephoneProprietaire", adresse_proprietaire: "adresseProprietaire",
      ville_proprietaire: "villeProprietaire", created_at: "createdAt",
    },
  },
  depenses: {
    source: "depenses",
    pk: ["id"],
    colonnes: {
      id: "id", immeuble_id: "immeubleId", categorie: "categorie", libelle: "libelle",
      montant: "montant", date: "date", notes: "notes", updated_at: "updatedAt",
    },
    // Les champs non listés restent dans `donnees`.
    reste: true,
  },
  counters: {
    source: "counters",
    pk: ["name"],
    colonnes: { name: "id", value: "value" },
  },
};

// Lignes à partir d'un document : les colonnes listées, plus `donnees` si demandé.
const CONNUS = {
  depenses: new Set(["id", "immeubleId", "categorie", "libelle", "montant", "date", "notes", "updatedAt"]),
};

function lignesDe(nomTable, documents) {
  const spec = TABLES[nomTable];
  return documents.map((doc) => {
    const ligne = {};
    for (const [colonne, champ] of Object.entries(spec.colonnes)) {
      ligne[colonne] = doc[champ] === undefined ? null : doc[champ];
    }
    if (spec.reste) {
      ligne.donnees = Object.fromEntries(Object.entries(doc).filter(([k]) => !CONNUS[nomTable].has(k)));
    }
    return ligne;
  });
}

// --- Préparation et contrôle ---

const lignes = {};
for (const [nomTable, spec] of Object.entries(TABLES)) {
  const documents = lireCollection(spec.source);
  lignes[nomTable] = lignesDe(nomTable, documents);
}

// Allocations : un paiement porte la liste de ses mois réglés. Une ligne par mois.
lignes.paiement_allocations = [];
for (const p of lireCollection("paiements")) {
  for (const a of p.allocations || []) {
    lignes.paiement_allocations.push({
      paiement_id: p.id,
      loyer_id: a.loyerId,
      montant: a.montant,
      detail: a.detail ?? null,
    });
  }
}

// Clés étrangères : chaque référence doit pointer vers une ligne existante.
const RELATIONS = [
  ["lots", "immeuble_id", "immeubles", "id"],
  ["baux", "lot_id", "lots", "id"],
  ["baux", "locataire_id", "locataires", "id"],
  ["loyers", "bail_id", "baux", "id"],
  ["paiements", "bail_id", "baux", "id"],
  ["paiements", "locataire_id", "locataires", "id"],
  ["paiement_allocations", "paiement_id", "paiements", "id"],
  ["paiement_allocations", "loyer_id", "loyers", "id"],
  ["quittances", "paiement_id", "paiements", "id"],
  ["quittances", "bail_id", "baux", "id"],
  ["quittances", "locataire_id", "locataires", "id"],
  ["depenses", "immeuble_id", "immeubles", "id"],
];

let orphelins = 0;
for (const [table, colonne, cible, cibleColonne] of RELATIONS) {
  const existants = new Set(lignes[cible].map((l) => l[cibleColonne]));
  const manquants = lignes[table].filter((l) => l[colonne] != null && !existants.has(l[colonne]));
  if (manquants.length) {
    orphelins += manquants.length;
    const exemples = [...new Set(manquants.map((l) => l[colonne]))].slice(0, 5);
    console.log(`ORPHELINS ${table}.${colonne} → ${cible}: ${manquants.length} ligne(s), ex. ${exemples.join(", ")}`);
  }
}

// Doublons de clé primaire : l'upsert masquerait une perte de données.
for (const [nomTable, spec] of Object.entries(TABLES)) {
  const vues = new Set();
  for (const l of lignes[nomTable]) {
    const cle = spec.pk.map((c) => l[c]).join("|");
    if (vues.has(cle)) console.log(`DOUBLON ${nomTable}: ${cle}`);
    vues.add(cle);
  }
}
const pkAlloc = new Set();
for (const l of lignes.paiement_allocations) {
  const cle = `${l.paiement_id}|${l.loyer_id}`;
  if (pkAlloc.has(cle)) {
    console.log(`DOUBLON paiement_allocations: ${cle}`);
    orphelins += 1;
  }
  pkAlloc.add(cle);
}

console.log("\nLignes à migrer :");
for (const [nomTable, liste] of Object.entries(lignes)) {
  console.log(`  ${nomTable.padEnd(22)} ${liste.length}`);
}

if (orphelins > 0) {
  console.log(`\nArrêt : ${orphelins} incohérence(s). Rien n'a été écrit.`);
  process.exit(2);
}
if (aBlanc) {
  console.log("\nMode à blanc : aucune écriture.");
  process.exit(0);
}

// --sql=<fichier> : écrit les mêmes lignes sous forme d'INSERT, pour rejouer la
// migration sur une base locale de test, sans toucher à Supabase.
const fichierSql = process.argv.find((a) => a.startsWith("--sql="));
if (fichierSql) {
  const sortie = [];
  const colonnesJson = new Set(["reception", "frais_defaut", "caution_sur", "detail", "libelles", "allocations", "donnees"]);
  const litteral = (colonne, v) => {
    if (v === null || v === undefined) return "NULL";
    if (colonnesJson.has(colonne)) return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
    if (typeof v === "number") return String(v);
    if (typeof v === "boolean") return v ? "true" : "false";
    return `'${String(v).replace(/'/g, "''")}'`;
  };
  const ordreSql = [
    "proprietaire", "immeubles", "lots", "locataires", "baux", "loyers", "paiements",
    "paiement_allocations", "quittances", "depenses", "counters",
  ];
  for (const nomTable of ordreSql) {
    for (const ligne of lignes[nomTable]) {
      const colonnes = Object.keys(ligne);
      sortie.push(
        `insert into ${nomTable} (${colonnes.join(", ")}) values (${colonnes.map((c) => litteral(c, ligne[c])).join(", ")});`
      );
    }
  }
  fs.writeFileSync(fichierSql.slice("--sql=".length), sortie.join("\n") + "\n");
  console.log(`SQL écrit : ${sortie.length} insertions`);
  process.exit(0);
}

// --- Écriture ---

const ORDRE = [
  "proprietaire", "immeubles", "lots", "locataires", "baux", "loyers", "paiements",
  "paiement_allocations", "quittances", "depenses", "counters",
];
const TAILLE_LOT = 200;

async function ecrire(nomTable, liste) {
  const spec = TABLES[nomTable] || { pk: ["id", "paiement_id", "loyer_id"] };
  const pk = nomTable === "paiement_allocations" ? "paiement_id,loyer_id" : spec.pk.join(",");
  for (let i = 0; i < liste.length; i += TAILLE_LOT) {
    const lot = liste.slice(i, i + TAILLE_LOT);
    const reponse = await fetch(`${URL_PROJET}/rest/v1/${nomTable}?on_conflict=${pk}`, {
      method: "POST",
      headers: {
        apikey: CLE,
        Authorization: `Bearer ${CLE}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(lot),
    });
    if (!reponse.ok) {
      throw new Error(`${nomTable} (lot à ${i}) : ${reponse.status} ${await reponse.text()}`);
    }
  }
  console.log(`  ${nomTable.padEnd(22)} ${liste.length} écrite(s)`);
}

async function compter(nomTable) {
  const reponse = await fetch(`${URL_PROJET}/rest/v1/${nomTable}?select=*`, {
    method: "HEAD",
    headers: { apikey: CLE, Authorization: `Bearer ${CLE}`, Prefer: "count=exact" },
  });
  const total = reponse.headers.get("content-range")?.split("/")[1];
  return Number(total);
}

console.log("\nÉcriture :");
for (const nomTable of ORDRE) {
  await ecrire(nomTable, lignes[nomTable]);
}

console.log("\nVérification (lignes présentes dans Supabase) :");
let ecart = false;
for (const nomTable of ORDRE) {
  const attendu = lignes[nomTable].length;
  const obtenu = await compter(nomTable);
  const ok = obtenu >= attendu;
  if (!ok) ecart = true;
  console.log(`  ${nomTable.padEnd(22)} attendu ${attendu}, trouvé ${obtenu} ${ok ? "OK" : "ÉCART"}`);
}
process.exit(ecart ? 3 : 0);
