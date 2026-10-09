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
import { MOIS_ENCAISSEMENT_AVANCE } from "../../config/horizons";
import {
  formatMoney,
  periodeToLabel,
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
 * Les sept lignes à l'ouverture d'un bail : seul le loyer est rempli, il est
 * fixé par le contrat et n'est donc pas saisissable.
 *
 * Les charges restent à zéro. Eau, électricité, ordures changent d'un mois à
 * l'autre et c'est au propriétaire de les saisir ; une charge non due n'est pas
 * une erreur, elle reste à zéro et n'apparaît pas sur la quittance.
 */
function lignesPourBail(bail) {
  return Object.fromEntries(
    POSTES_FRAIS.map((poste) => [
      poste,
      poste === "loyer" ? Number(bail?.loyerMensuel) || 0 : 0,
    ])
  );
}

/**
 * Les mois proposés dans la liste « Période ».
 *
 * On part du début du bail et on va jusqu'à dix-huit mois après le mois
 * courant : au-delà, un encaissement n'a plus de sens, et la liste resterait
 * inutilement longue. Les mois déjà entièrement réglés sont quand même
 * proposés, avec leur mention, pour que le propriétaire voie l'historique.
 */
function moisProposes(bail) {
  // `dateDebut` est une date complète (« 2026-02-01 ») : on n'en garde que la
  // partie année-mois. La concaténer à « -01 » produirait une date invalide et
  // la liste resterait vide.
  // On part du premier mois du bail, sans borne basse : si un loyer a été
  // encaissé avant (rattrapage, arriérés), la liste descend jusqu'à lui.
  const brut = bail?.dateDebut || "";
  const m = String(brut).match(/^(\d{4})-(\d{2})/);
  const premier = m ? `${m[1]}-${m[2]}` : periodeCourante();
  // La borne haute est paramétrée dans src/config/horizons.js : elle a déjà
  // été allongée une fois (18 → 60 mois) et se corrige en un seul endroit.
  const fin = periodeDecalee(periodeCourante(), MOIS_ENCAISSEMENT_AVANCE);
  const liste = [];
  let cur = premier;
  let garde = 0;
  while (cur <= fin && garde++ < 480) {
    liste.push(cur);
    cur = periodeDecalee(cur, 1);
  }
  return liste;
}

export default function Encaissement({ bail: bailInitial, onClose, onEncaisser }) {
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

  // La période saisie est mémorisée avec l'identifiant du bail : changer de
  // locataire repart sur le premier mois dû de celui-ci.
  const [periodeSaisie, setPeriodeSaisie] = useState(null);
  const debut = periodeSaisie && periodeSaisie.bailId === bail?.id ? periodeSaisie.valeur : periodeParDefaut;
  const fin = debut;

  const moisDisponibles = useMemo(() => moisProposes(bail), [bail]);
  const majPeriode = (valeur) => setPeriodeSaisie({ bailId: bail?.id || "", valeur });

  // Deux listes plutôt qu'une période unique : le mois d'un côté, l'année de
  // l'autre. On ne propose que les mois réellement disponibles pour l'année
  // choisie — choisir « Février » sur une année où le bail n'a pas commencé
  // n'aurait pas de loyer auquel imputer le paiement.
  const anneesPossibles = useMemo(
    () => [...new Set(moisDisponibles.map((m) => m.slice(0, 4)))],
    [moisDisponibles]
  );
  const anneeCourante = (debut || periodeCourante()).slice(0, 4);
  const moisDeLAnnee = useMemo(
    () =>
      moisDisponibles
        .filter((m) => m.startsWith(anneeCourante))
        .map((m) => Number(m.slice(5, 7))),
    [moisDisponibles, anneeCourante]
  );

  // Changer l'année emmène sur le premier mois disponible de cette année, et
  // changer le mois le fait dans l'année courante : sans cela, la combinaison
  // pourrait ne plus figurer dans la liste et le payer resterait muet.
  const choisirAnnee = (annee) => {
    const premier = moisDisponibles.find((m) => m.startsWith(annee));
    majPeriode(premier || periodeParDefaut);
  };
  const choisirMois = (mois) => majPeriode(`${anneeCourante}-${String(mois).padStart(2, "0")}`);

  const [date, setDate] = useState(AUJOURDHUI);
  const [mode, setMode] = useState("mtn");
  const [note, setNote] = useState("");

  // Les frais par défaut du bail pré-remplissent les lignes dès qu'un locataire
  // est choisi : le propriétaire n'a plus qu'à corriger ce qui a changé.
  //
  // Les valeurs saisies sont mémorisées avec l'identifiant du bail : changer de
  // locataire repart donc des frais par défaut de celui-ci, sans avoir à
  // surveiller le changement dans un effet.
  const [detailSaisi, setDetailSaisi] = useState(null);
  const [libellesSaisis, setLibellesSaisis] = useState(null);

  const detail = useMemo(() => {
    if (detailSaisi && detailSaisi.bailId === bail?.id) return detailSaisi.valeurs;
    return lignesPourBail(bail);
  }, [bail, detailSaisi]);

  const libelles = useMemo(() => {
    if (libellesSaisis && libellesSaisis.bailId === bail?.id) return libellesSaisis.valeurs;
    return {
      autre1: bail?.fraisDefaut?.libelle1 || "Autre 1",
      autre2: bail?.fraisDefaut?.libelle2 || "Autre 2",
    };
  }, [bail, libellesSaisis]);

  const majLigne = (cle, valeur) => {
    // Le loyer est celui du bail : il n'est pas modifiable à la saisie.
    if (!bail || cle === "loyer") return;
    setDetailSaisi({ bailId: bail.id, valeurs: { ...detail, [cle]: valeur } });
  };

  const majEtiquette = (cle, valeur) =>
    setLibellesSaisis({ bailId: bail.id, valeurs: { ...libelles, [cle]: valeur } });

  const poster = useMemo(() => (bail ? lignesPostesPour(bail) : []), [bail]);
  const totalLignes = POSTES_FRAIS.reduce((s, k) => s + (Number(detail[k]) || 0), 0);
  // Une période = un mois : le reste à payer et le total portent donc sur ce
  // seul mois.
  const restePeriode = useMemo(() => {
    if (!bail) return 0;
    const loyer = Number(bail.loyerMensuel) || 0;
    const reste = resteParMois.get(debut);
    return reste === undefined ? loyer : reste;
  }, [bail, debut, resteParMois]);
  // Le refus de la couche de données est annoncé avant le clic : sans cela, le
  // propriétaire ne comprend pas pourquoi l'encaissement est rejeté.
  const depasse = Boolean(bail) && restePeriode > 0 && totalLignes > restePeriode;

  const enregistrer = async () => {
    if (!bail) {
      addToast("Choisissez un locataire", "error");
      return;
    }
    if (totalLignes <= 0) {
      addToast("Le total doit être supérieur à zéro", "error");
      return;
    }

    // Les loyers des mois couverts doivent exister avant d'imputer le paiement :
    // ils sont créés à la volée, ce qui évite une manipulation à part.
    // On passe par le contexte, et non par la couche de données en direct : en
    // mode Firebase, un accès direct porterait sur la mémoire locale et les
    // loyers seraient recréés à chaque encaissement.
    const gen = await genererDepuis(bail.id, debut);
    if (!gen.ok) {
      addToast(gen.erreur || "Impossible de préparer les loyers", "error");
      return;
    }
    // `run` recharge la base : les loyers créés sont donc disponibles dans
    // `gen.donnees`, pas dans `loyers` (qui date du rendu précédent).
    const loyer = gen.donnees?.loyers.find((l) => l.bailId === bail.id && l.periode === debut);
    if (!loyer) {
      addToast("Aucun loyer ne correspond à cette période", "error");
      return;
    }
    const allocations = [{ loyerId: loyer.id, montant: totalLignes }];

    try {
      const res = await enregistrerPaiement({
        bailId: bail.id,
        locataireId: bail.locataireId,
        date,
        mode,
        note: note.trim(),
        montant: totalLignes,
        detail: { ...detail },
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
          `Paiement de ${formatMoney(totalLignes)} encaissé — quittance émise`,
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
          <span>Mois *</span>
          <select
            className="select"
            value={Number(debut.slice(5, 7))}
            onChange={(e) => choisirMois(Number(e.target.value))}
          >
            {moisDeLAnnee.map((mois) => {
              // Un mois déjà soldé reste sélectionnable : il faut pouvoir le
              // consulter, et rectifier un encaissement mal saisi.
              const periode = `${anneeCourante}-${String(mois).padStart(2, "0")}`;
              const reste = resteParMois.get(periode);
              const marque = reste === 0 ? " — soldé" : reste !== undefined ? ` — reste ${formatMoney(reste)}` : "";
              return (
                <option key={mois} value={mois}>
                  {MOIS_LONGS[mois - 1]}
                  {marque}
                </option>
              );
            })}
          </select>
        </label>
        <label className="form-group">
          <span>Année *</span>
          <select
            className="select"
            value={anneeCourante}
            onChange={(e) => choisirAnnee(e.target.value)}
          >
            {anneesPossibles.map((annee) => (
              <option key={annee} value={annee}>
                {annee}
              </option>
            ))}
          </select>
        </label>
      </div>

      {bail ? (
        <p className="cag-reste">
          Reste à payer sur {periodeToLabel(debut)} :{" "}
          <strong>{formatMoney(restePeriode)}</strong>
        </p>
      ) : null}

      <p className="cag-soustitre">
        <Info size={13} /> Détail du paiement
      </p>
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
                  value={detail[l.key] ?? 0}
                  onChange={(e) => majLigne(l.key, Math.max(0, Number(e.target.value) || 0))}
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
                  value={detail[ligne.key] ?? 0}
                  onChange={(e) => majLigne(ligne.key, Math.max(0, Number(e.target.value) || 0))}
                  aria-label={ligne.label}
                />
              </div>
            ))}
      </div>

      <div className="cag-total">
        <span>Total à payer</span>
        <strong>{formatMoney(totalLignes)}</strong>
      </div>

      {depasse ? (
        <p className="cag-refus">
          <AlertTriangle size={15} /> Dépasse le reste à payer de{" "}
          {formatMoney(totalLignes - restePeriode)}. Choisissez un autre mois, ou
          retirez les charges de ce mois-ci.
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

