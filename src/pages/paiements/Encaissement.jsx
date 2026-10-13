// Modale d'encaissement : le propriétaire déclare ce qu'il a reçu.
//
// L'écran reprend les sept lignes du relevé (loyer, eau, électricité, ordures,
// dégâts, autre 1, autre 2). Le total se calcule pendant la saisie et n'est pas
// modifiable : ce qui est encaissé est la somme des lignes.
//
// La période se choisit dans une seule liste (mois et année), un mois à la
// fois : c'est le geste réel du propriétaire, qui règle un mois. Un paiement
// en avance se fait en répétant l'opération mois par mois.
//
// Ouverte sans bail — depuis « Paiements & Quittances » — le locataire se
// choisit en haut de la modale.
//
//   ▸ Encaissement              ce fichier
//   ▸ Liste des encaissements   src/pages/PaiementsQuittances.jsx

import { useMemo, useState } from "react";
import { AlertTriangle, Check, Info } from "lucide-react";
import { Modal } from "../../components/ui";
import { useApp } from "../../context/AppContext";
import { useToast } from "../../context/ToastContext";
import { LIGNES_FRAIS, lignesPostesPour, POSTES_FRAIS } from "../../data/db.firebase";
import {
  formatMoney,
  periodeToLabel,
  formatDate,
  periodeCourante,
  periodeDecalee,
  MOIS_LONGS,
} from "../../utils/format";

const LIBELLES_MODES = {
  especes: "Espèces",
  mtn: "MTN MoMo",
  moov: "Moov Money",
  celtis: "Celtis",
  virement: "Virement bancaire",
  cheque: "Chèque",
  mobile: "Mobile Money",
};

const MODES = Object.keys(LIBELLES_MODES).filter((m) => m !== "mobile");

const AUJOURDHUI = new Date().toISOString().slice(0, 10);

/**
 * Les mois proposés dans les deux listes de période.
 *
 * La liste démarre au **1er janvier** de l'année du bail, pas au mois de son
 * début : un locataire entré en mars peut avoir des arriérés de janvier et de
 * février — un relevé réel commence rarement au début du bail. En engrossissant
 * la liste de deux mois, le propriétaire les retrouve sans avoir à le deviner.
 *
 * On avance jusqu'à la **fin du bail**. Un bail sans terme se règle par
 * anticipation aussi longtemps que le propriétaire le souhaite : la liste n'a
 * donc pas de borne écrite.
 *
 * Les mois antérieurs au début du bail restent sélectionnables — voir leur
 * reste à payer — mais ne sont pas imputables : le bail n'existait pas encore.
 */
function moisProposes(bail) {
  // `dateDebut` est une date complète (« 2026-02-15 ») : on n'en garde que
  // l'année. La concaténer à « -01 » produirait une date invalide.
  const brut = bail?.dateDebut || "";
  const annee = String(brut).match(/^(\d{4})/);
  const premier = annee ? `${annee[1]}-01` : periodeCourante();

  const liste = [];
  let cur = premier;
  let garde = 0;
  while (garde++ < 480) {
    // Un bail a une fin ou n'en a pas. Avec une fin, la liste s'arrête là :
    // proposer des mois au-delà serait cocher des mois qui n'existent pas.
    if (bail?.dateFin) {
      const f = String(bail.dateFin).match(/^(\d{4})-(\d{2})/);
      if (f && cur > `${f[1]}-${f[2]}`) break;
    }
    liste.push(cur);
    cur = periodeDecalee(cur, 1);
  }
  return liste;
}

export default function Encaissement({
  bail: bailInitial,
  periodeInitiale,
  onClose,
  onEncaisser,
}) {
  const { bauxParId, lotsParId, immeublesParId, baux, locatairesParId, loyers, paiements,
          enregistrerPaiement, genererQuittance, genererDepuis } = useApp();
  const { addToast } = useToast();

  // Locataire déjà connu (ouverture depuis une fiche) : on bloque le sélecteur.
  const bailFixe = bailInitial || null;

  const [bailId, setBailId] = useState(bailFixe?.id || "");
  const bail = bailFixe || bauxParId.get(bailId) || null;

  // Ce qui a déjà été imputé sur chaque loyer : sert à savoir ce qu'il reste
  // à payer, et donc à proposer une période où l'encaissement aboutit.
  const alloueParLoyer = useMemo(() => {
    const map = new Map();
    paiements.forEach((p) =>
      (p.allocations || []).forEach((a) => {
        if (a?.loyerId) map.set(a.loyerId, (map.get(a.loyerId) || 0) + a.montant);
      })
    );
    return map;
  }, [paiements]);

  const resteParMois = useMemo(() => {
    const map = new Map();
    if (!bail) return map;
    loyers
      .filter((l) => l.bailId === bail.id)
      .forEach((l) => {
        map.set(l.periode, Math.max(0, (Number(l.montantDu) || 0) - (alloueParLoyer.get(l.id) || 0)));
      });
    return map;
  }, [bail, loyers, alloueParLoyer]);

  // La période proposée par défaut est le premier mois où le loyer entier tient
  // encore. Un mois déjà partiellement réglé ne peut pas être soldé une seconde
  // fois de son loyer complet : c'était la cause du refus « montant trop élevé ».
  const periodeParDefaut = useMemo(() => {
    const courante = periodeCourante();
    if (!bail) return courante;
    const loyer = Number(bail.loyerMensuel) || 0;
    // Un mois sans loyer n'a rien d'imputé : il reste dû son loyer, les charges
    // étant saisies à la main.
    const resteDe = (mois) => {
      const reste = resteParMois.get(mois);
      return reste === undefined ? loyer : reste;
    };
    const periodes = [...resteParMois.keys()].sort();
    const recevable = periodes.find((p) => resteDe(p) >= loyer);
    return recevable || (periodes.length ? periodeDecalee(periodes.at(-1), 1) : courante);
  }, [bail, resteParMois]);

  // La période se choisit par ses deux bornes : début et fin. Un loyer se
  // règle rarement mois par mois — trois mois, six mois, une année d'avance sont
  // des gestes ordinaires — et deux champs disent la même chose qu'une longue
  // liste de cases à cocher.
  // Elle est mémorisée avec l'identifiant du bail : changer de locataire
  // repart sur la période proposée pour celui-ci.
  const [periode, setPeriode] = useState(null);
  // `periode?.bailId === bail?.id` ne suffit pas : sans locataire et sans saisie
  // préalable, les deux valent `undefined`, l'égalité est donc vraie et la
  // lecture de `valeurs` porte sur `null`. La présence se teste d'abord.
  const bornes =
    periode && periode.bailId === (bail?.id || "") ? periode.valeurs : null;

  const moisDisponibles = useMemo(() => moisProposes(bail), [bail]);

  const debut = bornes?.debut || periodeInitiale || periodeParDefaut;
  const fin = bornes?.fin || debut;

  // La fin ne précède jamais le début : une période inversée serait refusée, et
  // le propriétaire ne comprendrait pas pourquoi.
  const majDebut = (valeur) => {
    setPeriode({ bailId: bail?.id || "", valeurs: { debut: valeur, fin: valeur > fin ? valeur : fin } });
  };
  const majFin = (valeur) => {
    setPeriode({ bailId: bail?.id || "", valeurs: { debut: valeur < debut ? valeur : debut, fin: valeur } });
  };

  const anneesPossibles = useMemo(
    () => [...new Set(moisDisponibles.map((m) => m.slice(0, 4)))],
    [moisDisponibles]
  );

  /** Les deux listes de l'année demandée, pour un couple début/fin. */
  const moisDe = (annee) =>
    moisDisponibles.filter((m) => m.startsWith(annee)).map((m) => Number(m.slice(5, 7)));

  const moisDeDebut = moisDe(debut.slice(0, 4));
  const moisDeFin = moisDe(fin.slice(0, 4));

  // Changer l'année déplace la borne sur le premier mois disponible : sans
  // cela, « Décembre » choisi sur une année sans décembre resterait muet.
  const choisirAnneeDebut = (annee) => {
    const premier = moisDisponibles.find((m) => m.startsWith(annee));
    if (premier) majDebut(premier);
  };
  const choisirAnneeFin = (annee) => {
    const dernier = [...moisDisponibles].reverse().find((m) => m.startsWith(annee));
    if (dernier) majFin(dernier);
  };

  /** Tous les mois de la période : c'est ce qui sera imputé au paiement. */
  const moisCouverts = useMemo(() => {
    if (!bail) return [];
    return moisDisponibles.filter((m) => m >= debut && m <= fin);
  }, [bail, moisDisponibles, debut, fin]);

  const [date, setDate] = useState(AUJOURDHUI);
  const [mode, setMode] = useState("mtn");
  const [note, setNote] = useState("");

  // Les frais par défaut du bail pré-remplissent les lignes dès qu'un locataire
  // est choisi : le propriétaire n'a plus qu'à corriger ce qui a changé.
  //
  // Les valeurs saisies sont mémorisées avec l'identifiant du bail : changer de
  // locataire repart donc des frais par défaut de celui-ci, sans avoir à
  // surveiller le changement dans un effet.
  // La saisie est mémorisée avec l'identifiant du bail : choisir un autre
  // locataire repart de ses frais. Sans locataire choisi, la clé est vide et
  // la saisie reste attachée à l'écran — c'est ce qui permet de remplir les
  // charges avant de savoir pour qui.
  const [libellesSaisis, setLibellesSaisis] = useState(null);

  const libelles = useMemo(() => {
    if (libellesSaisis && libellesSaisis.bailId === (bail?.id || "")) {
      return libellesSaisis.valeurs;
    }
    return {
      autre1: bail?.fraisDefaut?.libelle1 || "Autre 1",
      autre2: bail?.fraisDefaut?.libelle2 || "Autre 2",
    };
  }, [bail, libellesSaisis]);

  const majEtiquette = (cle, valeur) =>
    setLibellesSaisis({ bailId: bail?.id || "", valeurs: { ...libelles, [cle]: valeur } });

  const poster = useMemo(() => (bail ? lignesPostesPour(bail) : []), [bail]);
  const mensuel = Number(bail?.loyerMensuel) || 0;

  // Ce qui reste dû, mois par mois. Un mois sans loyer document porte son
  // loyer de bail : c'est le cas d'un arriéré jamais généré.
  const resteDe = (mois) => {
    const reste = resteParMois.get(mois);
    return reste === undefined ? mensuel : reste;
  };

  /* ---- Charges, une ligne par mois ---- */
  // Une charge appartient à un mois : l'eau de juin n'est pas celle de
  // décembre. Un relevé réel en porte une ligne par mois et par poste, et un
  // paiement trimestriel doit pouvoir les saisir toutes. La saisie est
  // mémorisée par bail, comme le reste de l'écran.
  const [saisie, setSaisie] = useState(null);
  const chargesDuMois = (mois) => {
    const mesValeurs =
      saisie && saisie.bailId === (bail?.id || "") ? saisie.valeurs[mois] : null;
    return mesValeurs || Object.fromEntries(POSTES_FRAIS.map((k) => [k, 0]));
  };

  const majCharge = (mois, cle, valeur) => {
    if (cle === "loyer") return;
    const cible = { ...chargesDuMois(mois), [cle]: Math.max(0, Number(valeur) || 0) };
    setSaisie({
      bailId: bail?.id || "",
      valeurs: { ...(saisie?.valeurs || {}), [mois]: cible },
    });
  };

  const totalCharges = (mois) =>
    POSTES_FRAIS.reduce(
      (s, k) => (k === "loyer" ? s : s + (Number(chargesDuMois(mois)[k]) || 0)),
      0
    );

  /** L'intitulé d'un poste, en tenant compte des libellés renommés par poste. */
  const libellePoste = (cle) => {
    if (cle === "loyer") return "Loyer";
    if (libelles[cle]) return libelles[cle];
    return LIGNES_FRAIS.find((l) => l.key === cle)?.label || cle;
  };

  /** Les sept lignes d'un mois : son loyer restant et ses charges. */
  const lignesDuMois = (mois) => ({ ...chargesDuMois(mois), loyer: resteDe(mois) });

  // Le loyer proposé est la somme des restes dus des mois de la période.
  //
  // Un mois déjà entamé ne peut pas être soldé une seconde fois de son loyer
  // complet : c'était la cause du refus « montant trop élevé ». Et un arriéré
  // de juin suivi du mois d'octobre vaut bien deux loyers, pas un seul — les
  // mois incohérents dès qu'un cumul s'y mêle.
  const loyerDuMois = useMemo(
    () => moisCouverts.reduce((s, mois) => s + resteDe(mois), 0),
    [moisCouverts, resteParMois, mensuel]
  );

  const chargesTotales = useMemo(
    () => moisCouverts.reduce((s, mois) => s + totalCharges(mois), 0),
    [moisCouverts]
  );

  // Le reste à payer borne l'encaissement : c'est lui, et non le loyer du
  // bail, qui dit ce qu'on peut recevoir.
  const resteTotal = useMemo(
    () => moisCouverts.reduce((s, mois) => s + resteDe(mois), 0),
    [moisCouverts, resteParMois, mensuel]
  );

  const totalLignes = loyerDuMois + chargesTotales;
  const nbMois = moisCouverts.length;

  // Le refus de la couche de données est annoncé avant le clic : sans cela, le
  // propriétaire ne comprend pas pourquoi l'encaissement est rejeté.
  const depasse = Boolean(bail) && resteTotal > 0 && loyerDuMois > resteTotal;

  const enregistrer = async () => {
    if (!bail) {
      addToast("Choisissez un locataire", "error");
      return;
    }
    if (totalLignes <= 0) {
      addToast("Le total doit être supérieur à zéro", "error");
      return;
    }
    if (nbMois === 0) {
      addToast("Aucun mois dans cette période", "error");
      return;
    }
    if (totalLignes <= 0) {
      addToast("Le total doit être supérieur à zéro", "error");
      return;
    }
    if (nbMois === 0) {
      addToast("Cochez au moins un mois", "error");
      return;
    }

    // Les loyers des mois couverts doivent exister avant d'imputer le paiement :
    // ils sont créés à la volée, ce qui évite une manipulation à part.
    // On passe par le contexte, et non par la couche de données en direct : en
    // mode Firebase, un accès direct porterait sur la mémoire locale et les
    // loyers seraient recréés à chaque encaissement.
const gen = await genererDepuis(bail.id, debut, fin);
    if (!gen.ok) {
      addToast(gen.erreur || "Impossible de préparer les loyers", "error");
      return;
    }
    // `run` recharge la base : les loyers créés sont donc disponibles dans
    // `gen.donnees`, pas dans `loyers` (qui date du rendu précédent).
    const loyersFrais = gen.donnees?.loyers || [];
    // Un mois antérieur au bail n'a pas de loyer : la liste démarre en janvier
    // pour retrouver les arriérés, mais le locataire n occupait pas encore le
    // logement. Le dire vaut mieux qu'un « aucun loyer » énigmatique.
    const avantBail = moisCouverts.find(
      (mois) => String(bail.dateDebut || "").slice(0, 7) > mois
    );
    if (avantBail) {
      addToast(
        `Le bail commence le ${formatDate(bail.dateDebut)} : ` +
          `${periodeToLabel(avantBail)} ne peut pas être réglé.`,
        "error"
      );
      return;
    }

    // Chaque mois reçoit son propre reste dû **et ses propres charges** : c'est
    // ce qui permet de solder un arriéré de juin sans lui mettre l'eau de
    // décembre. Le détail de chaque mois part avec son affectation, la
    // quittance les relit bloc par bloc.
    const allocations = [];
    const details = [];
    for (const mois of moisCouverts) {
      const loyer = loyersFrais.find((l) => l.bailId === bail.id && l.periode === mois);
      if (!loyer) {
        addToast(`Aucun loyer ne correspond à ${periodeToLabel(mois)}`, "error");
        return;
      }
      const lignes = lignesDuMois(mois);
      allocations.push({
        loyerId: loyer.id,
        montant: resteDe(mois) + totalCharges(mois),
      });
      details.push(lignes);
    }

      try {
        const res = await enregistrerPaiement({
          bailId: bail.id,
          locataireId: bail.locataireId,
          date,
          mode,
          note: note.trim(),
montant: totalLignes,
        detail: lignesDuMois(fin),
        details,
        libelles,
        allocations,
      });
      // La couche de données renvoie { paiement, quittance } : c'est le
      // paiement créé qu'il faut utiliser pour émettre la quittance.
      const paiement = res?.resultat?.paiement;
      if (res?.ok && paiement?.id) {
        // La quittance est émise avant le message : sur Firestore l'écriture
        // est réseau, afficher « quittance émise » puis échouer en silence
        // laisserait croire à un reçu que le locataire n'a pas.
        const emise = await genererQuittance(paiement.id);
        if (!emise.ok) {
          addToast("Paiement enregistré, mais la quittance n'a pas pu être émise", "error");
          return;
        }
        addToast(
          `Paiement de ${formatMoney(totalLignes)} encaissé` +
            (nbMois > 1 ? ` sur ${nbMois} mois` : "") +
            " — quittance émise",
          "success"
        );
        onEncaisser?.(paiement);
      } else {
        // `run` signale l'échec avec `erreur` : la masquer rendrait un refus
        // d'écriture incompréhensible pour le propriétaire.
        addToast(res?.erreur || "Encaissement impossible", "error");
      }
    } catch (erreur) {
      addToast(erreur.message || "Encaissement impossible", "error");
    }
  };

  // Le locataire est désigné par son nom ; le logement aide à le distinguer.
  const nomLocataire = (b) => {
    const loc = b ? locatairesParId.get(b.locataireId) : null;
    return loc ? `${loc.prenoms} ${loc.nom}`.trim() : "Locataire";
  };

  return (
    <Modal
      title="Encaisser un paiement / Établir une quittance"
      onClose={onClose}
      width="660px"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Annuler
          </button>
          <button type="button" className="btn btn-success" onClick={enregistrer}>
            <Check size={15} /> Encaisser &amp; générer la quittance
          </button>
        </>
      }
    >
      <label className="form-group">
        <span>Locataire</span>
        {bailFixe ? (
          <input className="input" value={nomLocataire(bailFixe)} readOnly />
        ) : (
          <select className="select" value={bailId} onChange={(e) => setBailId(e.target.value)}>
            <option value="">— Choisir —</option>
            {baux.map((b) => {
              const lot = lotsParId.get(b.lotId);
              const imm = lot ? immeublesParId.get(lot.immeubleId) : null;
              return (
                <option key={b.id} value={b.id}>
                  {nomLocataire(b)}
                  {imm ? ` — ${imm.nom}` : ""}
                </option>
              );
            })}
          </select>
        )}
      </label>

      <div className="grid grid-2">
        <label className="form-group">
          <span>Début *</span>
          <div className="cag-periode">
            <select
              className="select"
              value={debut.slice(5, 7)}
              onChange={(e) => majDebut(`${debut.slice(0, 4)}-${e.target.value}`)}
            >
              {moisDeDebut.map((mois) => (
                <option key={mois} value={String(mois).padStart(2, "0")}>
                  {MOIS_LONGS[mois - 1]}
                </option>
              ))}
            </select>
            <select
              className="select"
              value={debut.slice(0, 4)}
              onChange={(e) => choisirAnneeDebut(e.target.value)}
              aria-label="Année de début"
            >
              {anneesPossibles.map((annee) => (
                <option key={annee} value={annee}>
                  {annee}
                </option>
              ))}
            </select>
          </div>
        </label>
        <label className="form-group">
          <span>Fin</span>
          <div className="cag-periode">
            <select
              className="select"
              value={fin.slice(5, 7)}
              onChange={(e) => majFin(`${fin.slice(0, 4)}-${e.target.value}`)}
            >
              {moisDeFin.map((mois) => (
                <option key={mois} value={String(mois).padStart(2, "0")}>
                  {MOIS_LONGS[mois - 1]}
                </option>
              ))}
            </select>
            <select
              className="select"
              value={fin.slice(0, 4)}
              onChange={(e) => choisirAnneeFin(e.target.value)}
              aria-label="Année de fin"
            >
              {anneesPossibles.map((annee) => (
                <option key={annee} value={annee}>
                  {annee}
                </option>
              ))}
            </select>
          </div>
        </label>
      </div>

      <p className="text-muted" style={{ margin: "0 0 0.9rem", fontSize: "0.8rem" }}>
        {nbMois === 1
          ? "Période d'un seul mois."
          : `${nbMois} mois à régler, du ${periodeToLabel(debut)} au ${periodeToLabel(fin)}.`}
      </p>

      {bail && nbMois > 0 ? (
        <p className="cag-reste">
          Reste à payer
          {nbMois > 1 ? ` sur ${nbMois} mois` : ` sur ${periodeToLabel(debut)}`} :{" "}
          <strong>{formatMoney(resteTotal)}</strong>
        </p>
      ) : null}

      <p className="cag-soustitre">
        <Info size={13} /> Détail du paiement
      </p>
      {/* Un seul mois : les sept lignes, comme sur le modèle. */}
      {nbMois <= 1 ? (
        <div className="cag-lignes">
          {poster.length === 0
            ? LIGNES_FRAIS.map((l) => (
                <div key={l.key} className={`cag-ligne ${l.key === "loyer" ? "loyer" : ""}`}>
                  <span className="cag-ligne-label">{l.label}</span>
                  <input
                    type="number"
                    className={`input montant ${l.key === "loyer" ? "montant-fixe" : ""}`}
                    min="0"
                    step="1"
                    readOnly={l.key === "loyer"}
                    value={(nbMois === 1 ? lignesDuMois(debut) : lignesDuMois(fin))[l.key] ?? 0}
                    onChange={(e) => majCharge(nbMois === 1 ? debut : fin, l.key, e.target.value)}
                    aria-label={l.label}
                  />
                </div>
              ))
            : poster.map((ligne) => (
                <div key={ligne.key} className={`cag-ligne ${ligne.key === "loyer" ? "loyer" : ""}`}>
                  <span className="cag-ligne-label">
                    {ligne.libre ? (
                      // Poste libre : l'intitulé est saisi, il remplace le libellé.
                      <input
                        type="text"
                        className="libelle"
                        value={libelles[ligne.key] ?? ligne.label}
                        onChange={(e) => majEtiquette(ligne.key, e.target.value)}
                        aria-label={`Intitulé de ${ligne.label}`}
                      />
                    ) : ligne.key === "loyer" ? (
                      "Loyer"
                    ) : (
                      ligne.label
                    )}
                  </span>
                  <input
                    type="number"
                    className={`input montant ${ligne.key === "loyer" ? "montant-fixe" : ""}`}
                    min="0"
                    step="1"
                    readOnly={ligne.key === "loyer"}
                    value={(nbMois === 1 ? lignesDuMois(debut) : lignesDuMois(fin))[ligne.key] ?? 0}
                    onChange={(e) => majCharge(nbMois === 1 ? debut : fin, ligne.key, e.target.value)}
                    aria-label={ligne.label}
                  />
                </div>
              ))}
        </div>
      ) : (
        /* Plusieurs mois : une ligne de charges par mois. L'eau de juin n'est
           pas celle de décembre, et un relevé réel les distingue. */
        <div className="cag-table-wrap">
          <table className="cag-table">
            <thead>
              <tr>
                <th>Mois</th>
                <th className="num">Loyer dû</th>
                {POSTES_FRAIS.filter((k) => k !== "loyer").map((k) => (
                  <th key={k} className="num">
                    {libellePoste(k)}
                  </th>
                ))}
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {moisCouverts.map((mois) => (
                <tr key={mois}>
                  <td>{periodeToLabel(mois)}</td>
                  <td className="num cag-muted">{formatMoney(resteDe(mois))}</td>
                  {POSTES_FRAIS.filter((k) => k !== "loyer").map((k) => (
                    <td key={k} className="num">
                      <input
                        type="number"
                        className="input montant"
                        min="0"
                        step="100"
                        value={chargesDuMois(mois)[k] || 0}
                        onChange={(e) => majCharge(mois, k, e.target.value)}
                        aria-label={`${libellePoste(k)} — ${periodeToLabel(mois)}`}
                      />
                    </td>
                  ))}
                  <td className="num cag-strong">
                    {formatMoney(resteDe(mois) + totalCharges(mois))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="cag-total">
        <span>Total à payer{nbMois > 1 ? ` — ${nbMois} mois` : ""}</span>
        <strong>{formatMoney(totalLignes)}</strong>
      </div>

      {nbMois > 1 ? (
        <p className="cag-reste">
          {formatMoney(loyerDuMois)} de loyers ({nbMois} mois) +{" "}
          {formatMoney(chargesTotales)} de charges
        </p>
      ) : null}

      {depasse ? (
        <p className="cag-refus">
          <AlertTriangle size={15} /> Les loyers cochés totalisent{" "}
          {formatMoney(resteTotal)} à payer, or vous proposez{" "}
          {formatMoney(loyerDuMois)}. Décochez un mois.
        </p>
      ) : null}

      <div className="grid grid-2" style={{ marginTop: "1.1rem" }}>
        <label className="form-group">
          <span>Date de paiement</span>
          <input
            type="date"
            className="input"
            value={date}
            max={AUJOURDHUI}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label className="form-group">
          <span>Mode de paiement</span>
          <select className="select" value={mode} onChange={(e) => setMode(e.target.value)}>
            {MODES.map((m) => (
              <option key={m} value={m}>
                {LIBELLES_MODES[m]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="form-group" style={{ marginTop: "0.8rem" }}>
        <span>Note</span>
        <input
          type="text"
          className="input"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Facultatif"
        />
      </label>

      <p className="cag-avertissement">
        <Info size={15} /> La quittance reprend ces sept lignes et vos numéros de
        réception, au format officiel CAGOUNOU.
      </p>
    </Modal>
  );
}

