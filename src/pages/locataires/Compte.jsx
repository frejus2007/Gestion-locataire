// Compte d'un locataire : le relevé de ce qui a été facturé et de ce qui a
// été payé, mois par mois.
//
// Les colonnes suivent le relevé papier : la période, les sept lignes du mois,
// leur total, ce qui a été versé, et le solde cumulé. C'est ce qui permet de
// répondre à « il me doit quoi, et depuis quand ? ».
//
//   ▸ Cette page     src/pages/locataires/Compte.jsx
//   ▸ Encaissement   src/pages/paiements/Encaissement.jsx

import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Wallet,
  Printer,
  Users,
  FileText,
  AlertTriangle,
  Check,
  Landmark,
  Plus,
  Trash2,
} from "lucide-react";
import { useApp, estEchuPour } from "../../context/AppContext";
import { useToast } from "../../context/ToastContext";
import { Card, EmptyState, Badge, ConfirmDialog } from "../../components/ui";
import { lignesPostesPour } from "../../data/db.firebase";
import { formatMoney, formatDate, periodeToLabel, periodeToCourt } from "../../utils/format";
import Encaissement from "../paiements/Encaissement";

/**
 * Un loyer est-il soldé : plus rien à encaisser sur ce mois ?
 *
 * Le seuil est le loyer seul. Une charge — ordures ménagères, eau — ne crée
 * pas une dette si elle n'a pas été facturée, or elle est justement ce que le
 * propriétaire saisit à l'encaissement et pas avant.
 */
function estSolde(loyer, paye) {
  return loyerSeul(loyer) > 0 && paye >= loyerSeul(loyer);
}

/** Le loyer seul d'un mois, hors charges. */
function loyerSeul(loyer) {
  return Number(loyer?.loyer) || Number(loyer?.montantDu) || 0;
}

function montantPoste(loyer, poste) {
  if (loyer[poste] !== undefined) return Number(loyer[poste]) || 0;
  return poste === "loyer" ? Number(loyer.montantDu) || 0 : 0;
}

/**
 * La part d'une affectation qui couvre le loyer, et non une charge.
 *
 * Même règle que la liste des locataires : une charge réglée ne solde pas un
 * loyer. Sans détail — anciens encaissements — on retombe sur le montant
 * entier, plafonné au loyer du mois.
 */
function couvertParLoyer(affectation, loyer) {
  const detail = affectation?.detail;
  if (detail && typeof detail.loyer === "number") {
    return Math.max(0, Math.min(Number(affectation.montant) || 0, detail.loyer));
  }
  return Math.max(0, Math.min(Number(affectation?.montant) || 0, loyer));
}

export default function Compte() {
  const { id } = useParams();
  const {
    bauxParId,
    lotsParId,
    immeublesParId,
    locatairesParId,
    baux,
    loyersDe,
    paiementsDe,
    soldesParBail,
  } = useApp();
  // Le mois que le propriétaire a choisi de régler : la modale d'encaissement
  // s'ouvre directement dessus. Sans cela, on ne pouvait régler que « le
  // premier mois dû », et cliquer sur août dans le relevé finissait par
  // facturer octobre.
const [moisARegler, setMoisARegler] = useState(null);
  const [aSupprimer, setASupprimer] = useState(null);
  const [occupe, setOccupe] = useState(false);
  const { addToast } = useToast();
  const { ajouterMois, removeLoyer } = useApp();

  // La route « /locataires/:id » est appelée avec deux sortes d'identifiants :
  // le bail depuis la liste des locataires (le compte est la carte du bail) et
  // le locataire depuis le formulaire et le bail, qui naviguent avec l'identifiant
  // du locataire. On accepte les deux plutôt que de laisser ces liens_ci
  // afficher « fiche inexistante ».
  const bailParId = bauxParId.get(id);
  const bail = bailParId || baux.find((b) => b.locataireId === id) || null;
  const locataire = bail ? locatairesParId.get(bail.locataireId) || null : null;
  const lot = bail ? lotsParId.get(bail.lotId) || null : null;
  const immeuble = lot ? immeublesParId.get(lot.immeubleId) || null : null;
  const postes = useMemo(() => (bail ? lignesPostesPour(bail) : []), [bail]);

  // Solde cumulé : on additionne chaque mois au précédent, dans l'ordre
  // chronologique. Pas de variable partagée entre deux rendus.
  //
  // Deux règles, identiques à la liste des locataires :
  //  - le cumul porte sur le **loyer seul**, jamais sur les charges ;
  //  - un mois **non échu** n'ajoute rien au cumul. Il reste visible dans le
  //    relevé, mais il n'est pas dû : le 1er du mois, il commence à compter.
  const lignes = useMemo(() => {
    if (!bail) return [];
const payeParLoyer = new Map();
    for (const p of paiementsDe(bail.id)) {
      for (const a of p.allocations || []) {
        payeParLoyer.set(
          a.loyerId,
          (payeParLoyer.get(a.loyerId) || 0) + Number(a.montant || 0)
        );
      }
    }
    // Le détail de chaque affectation est conservé : il dit quelle part du
    // versement a couvert le loyer, et quelle part des charges.
    const detailParLoyer = new Map();
    for (const p of paiementsDe(bail.id)) {
      for (const a of p.allocations || []) {
        if (a.detail) detailParLoyer.set(a.loyerId, a.detail);
      }
    }
    return loyersDe(bail.id).reduce((acc, l) => {
      const paye = payeParLoyer.get(l.id) || 0;
      const precedent = acc.length ? acc[acc.length - 1].solde : 0;
      const echu = estEchuPour(l, bail);
      const loyer = loyerSeul(l);
      // Une charge réglée ce mois-là ne solde pas ce loyer : seules les lignes
      // « Loyer » du détail y contribuent.
      const couvert = Math.min(couvertParLoyer({ ...detailParLoyer.get(l.id), montant: paye }, loyer), loyer);
      acc.push({
        loyer: l,
        paye,
        echu,
        // Une charge a été réglée en plus du loyer : c'est ce qui distingue
        // « à jour » d'« à jour (charges comprises) ».
        avecCharges: paye > loyer,
        // Ce que le versement a réellement couvert du loyer de ce mois.
        couvert,
        // Un mois non échu ne pèse pas encore sur le cumul : le 1er novembre,
        // novembre commence à compter.
        solde: precedent + (echu ? loyer - couvert : 0),
      });
      return acc;
    }, []);
  }, [bail, loyersDe, paiementsDe]);

  const totaux = useMemo(() => {
    const out = {};
    postes.forEach((p) => {
      out[p.key] = lignes.reduce((s, l) => s + montantPoste(l.loyer, p.key), 0);
    });
    return out;
  }, [postes, lignes]);

  // Le bouton « Encaisser » se positionne sur le premier mois non soldé.
  const premierMoisDu = useMemo(() => {
    const impaye = lignes.find(({ loyer, paye }) => !estSolde(loyer, paye));
    return impaye?.loyer.periode || lignes.at(-1)?.loyer.periode || null;
  }, [lignes]);

  /**
   * Le mois suivant à ouvrir.
   *
   * Les mois ne sont plus générés jusqu'à la fin du bail : le propriétaire
   * ouvre lui-même ceux qu'il encaisse. Sans cela, novembre et décembre
   * apparaissaient comme dus dès le 1er octobre, et le locataire le payait
   * deux fois.
   */
  const moisSuivant = useMemo(() => {
    if (lignes.length === 0) return bail?.dateDebut ? bail.dateDebut.slice(0, 7) : null;
    const dernier = lignes.at(-1).loyer.periode;
    const annee = Number(dernier.slice(0, 4));
    const mois = Number(dernier.slice(5, 7));
    return `${mois === 12 ? annee + 1 : annee}-${String(mois === 12 ? 1 : mois + 1).padStart(2, "0")}`;
  }, [lignes, bail]);

  const ajouter = async () => {
    if (!bail || !moisSuivant) return;
    setOccupe(true);
    const res = await ajouterMois(bail.id, moisSuivant);
    setOccupe(false);
    addToast(
      res?.ok === false ? res.erreur || "Le mois n'a pas pu être ajouté" : `${periodeToLabel(moisSuivant)} ajouté`,
      res?.ok === false ? "error" : "success"
    );
  };

  const supprimer = async () => {
    const cible = aSupprimer;
    setASupprimer(null);
    if (!cible) return;
    const res = await removeLoyer(cible.id);
    addToast(
      res?.ok === false ? res.erreur || "Le mois n'a pas pu être supprimé" : `${periodeToLabel(cible.periode)} supprimé`,
      res?.ok === false ? "error" : "success"
    );
  };

  // Le solde affiché vient du contexte : c'est lui qui ne retient que les mois
  // **échus**, et lui que la liste des locataires affiche. Le recalculer ici
  // sur tous les mois donnait un chiffre différent — un locataire payé jusqu'en
  // octobre avec novembre et décembre ouverts valait 110 000 dans la liste et
  // 330 000 dans son compte. Deux écrans, deux réponses, pour la même personne.
  //
  // Le tableau ligne à ligne, lui, garde tous les mois : un relevé doit montrer
  // l'horizon, pas seulement ce qui est exigible aujourd'hui.
  const soldeAffiche = bail ? soldesParBail.get(bail.id) ?? 0 : 0;

  // Totaux du relevé.
  //
  // `totalDu` : les loyers des mois **échus** — sinon la ligne TOTAL
  // contredirait la colonne Solde juste au-dessus.
  // `totalCouvert` : ce que les versements couvrent réellement de ces loyers,
  //   chaque versement étant plafonné au loyer de son mois. C'est cette valeur
  //   qui entre dans le solde ; les charges réglées ne réduisent pas le dû.
  // `totalPaye` : les versements bruts, charges comprises — c'est la colonne
  //   « Paiement » du relevé, elle dit ce qui est entré en caisse.
  const totalDu = lignes.reduce((s, l) => s + (l.echu ? loyerSeul(l.loyer) : 0), 0);
  const totalCouvert = lignes.reduce(
    (s, l) => s + (l.echu ? Math.min(l.couvert, loyerSeul(l.loyer)) : 0),
    0
  );
  const totalPaye = lignes.reduce((s, l) => s + l.paye, 0);
  // Jamais négatif : payer plus que son loyer laisse le locataire à jour.
  const soldeReleve = Math.max(0, totalDu - totalCouvert);

  if (!bail) {
    return (
      <div>
        <header className="cag-page-head">
          <div>
            <h1>Compte du locataire</h1>
            <p>Cette fiche n&apos;existe pas</p>
          </div>
        </header>
        <EmptyState message="Bail introuvable." />
      </div>
    );
  }

  const nomLocataire = [locataire?.prenoms, locataire?.nom].filter(Boolean).join(" ");

  return (
    <div>
      <header className="cag-page-head">
        <div>
          <h1>Compte du locataire</h1>
          <p>Suivi du compte, loyers et soldes cumulés</p>
        </div>
        <div className="cag-page-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={ajouter}
            disabled={occupe || !moisSuivant}
            title={
              bail?.dateFin && moisSuivant > bail.dateFin.slice(0, 7)
                ? "Au-delà de la fin du bail"
                : `Ajouter ${moisSuivant ? periodeToLabel(moisSuivant) : ""}`
            }
          >
            <Plus size={16} /> {moisSuivant ? periodeToLabel(moisSuivant) : "Mois suivant"}
          </button>
          <button
            type="button"
            className="btn btn-success"
            onClick={() => setMoisARegler(premierMoisDu)}
          >
            <Wallet size={16} /> Encaisser
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => window.print()}>
            <Printer size={15} /> Imprimer
          </button>
          <Link to="/locataires" className="btn btn-ghost">
            <ArrowLeft size={15} /> Retour
          </Link>
        </div>
      </header>

      {moisARegler ? (
        <Encaissement
          bail={bail}
          periodeInitiale={moisARegler}
          onClose={() => setMoisARegler(null)}
          onEncaisser={() => setMoisARegler(null)}
        />
      ) : null}

      <div className="owner-header">
        <div>
          <div className="owner-name">{nomLocataire}</div>
          <div className="owner-sub">
            <span>{[immeuble?.nom, lot?.designation].filter(Boolean).join(" — ")}</span>
            <span>
              {[immeuble?.adresse, immeuble?.ville].filter(Boolean).join(", ")}
              {locataire?.telephone ? ` · Tél ${locataire.telephone}` : ""}
            </span>
          </div>
        </div>
        <Badge classe={soldeAffiche > 0 ? "badge-red" : "badge-green"}>
          {soldeAffiche > 0 ? "Impayé" : "À jour"}
        </Badge>
      </div>

      <div className="cag-stats">
        <div className="cag-stat">
          <div className="cag-stat-label">
            <Users size={14} /> Locataire
          </div>
          <div className="cag-stat-value" style={{ fontSize: "1.1rem" }}>
            {nomLocataire}
          </div>
        </div>
        <div className="cag-stat">
          <div className="cag-stat-label">
            <Landmark size={14} /> Loyer mensuel
          </div>
          <div className="cag-stat-value">{formatMoney(bail.loyerMensuel)}</div>
        </div>
        <div className={`cag-stat ${soldeAffiche > 0 ? "warn" : "ok"}`}>
          <div className="cag-stat-label">
            {soldeAffiche > 0 ? <AlertTriangle size={14} /> : <Check size={14} />}
            Solde {soldeAffiche > 0 ? "(dette)" : "(à jour)"}
          </div>
          <div className="cag-stat-value">
            {soldeAffiche > 0 ? formatMoney(soldeAffiche) : "—"}
          </div>
        </div>
        <div className="cag-stat">
          <div className="cag-stat-label">
            <FileText size={14} /> Période courante
          </div>
          <div className="cag-stat-value" style={{ fontSize: "1.1rem" }}>
            {periodeToLabel(bail.dateDebut)}
          </div>
        </div>
      </div>

      <Card className="cag-card">
        <div className="panel-head">
          <h2>
            <FileText size={17} /> Relevé mensuel
          </h2>
          <span className="text-muted" style={{ fontSize: "0.8rem" }}>
            Cliquez sur un mois impayé pour l'encaisser directement
          </span>
        </div>

        {lignes.length === 0 ? (
          <EmptyState message="Aucun loyer n'a encore été généré pour ce bail." />
        ) : (
          <div className="cag-table-wrap">
            <table className="cag-table cag-releve">
              <thead>
                <tr>
                  <th className="grand">Date</th>
                  <th>Période</th>
                  {postes.map((p) => (
                    <th key={p.key} className="num">
                      {p.label}
                    </th>
                  ))}
                  <th className="num">Total</th>
                  <th className="num">Paiement</th>
                  <th className="num">Solde</th>
                  <th className="actions" />
                </tr>
              </thead>
              <tbody>
                {lignes.map(({ loyer, paye, solde, echu, avecCharges }) => (
                  <tr
                    key={loyer.id}
                    className={estSolde(loyer, paye) ? "" : "cag-ligne-cliquable"}
                    onClick={() => !estSolde(loyer, paye) && setMoisARegler(loyer.periode)}
                    title={
                      estSolde(loyer, paye)
                        ? undefined
                        : `Encaisser ${periodeToLabel(loyer.periode)}`
                    }
                  >
                    <td className="cag-muted">{loyer.dateDebut ? formatDate(loyer.dateDebut) : "—"}</td>
                    <td title={periodeToLabel(loyer.periode)}>{periodeToCourt(loyer.periode)}</td>
                    {postes.map((p) => (
                      <td key={p.key} className={`num ${montantPoste(loyer, p.key) ? "" : "vide"}`}>
                        {montantPoste(loyer, p.key) > 0
                          ? formatMoney(montantPoste(loyer, p.key))
                          : "—"}
                      </td>
                    ))}
                    <td className="num cag-strong">{formatMoney(loyer.montantDu)}</td>
                    <td className={`num ${paye ? "" : "vide"}`}>{paye ? formatMoney(paye) : "—"}</td>
                    <td className="num">
                      {solde > 0 ? (
                        <span className="cag-pill money">{formatMoney(solde)}</span>
                      ) : !echu ? (
                        // Facturé, pas encore dû : le relevé le montre, la dette
                        // ne le compte pas.
                        <span className="cag-muted">non échu</span>
                      ) : avecCharges ? (
                        // Le mois a été réglé, charges comprises. À jour, mais
                        // pas seulement pour son loyer.
                        //
                        // Le libellé doit tenir sur une ligne : en impression la
                        // colonne fait 62 px de large, et « à jour (charges
                        // comprises) » se coupait en trois lignes. « + charges »
                        // dit la même chose — le loyer est soldé et des charges
                        // sont venues s'y ajouter.
                        <span className="cag-pill ok long">à jour + charges</span>
                      ) : (
                        <span className="cag-pill ok">à jour</span>
                      )}
                    </td>
                    <td className="actions">
                      <button
                        type="button"
                        className="btn btn-small btn-danger"
                        onClick={(e) => {
                          e.stopPropagation();
                          setASupprimer(loyer);
                        }}
                        title={`Retirer ${periodeToLabel(loyer.periode)} du relevé`}
                        aria-label={`Retirer ${periodeToLabel(loyer.periode)} du relevé`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}>TOTAL</td>
                  {postes.map((p) => (
                    <td key={p.key} className={`num ${totaux[p.key] ? "" : "vide"}`}>
                      {totaux[p.key] > 0 ? formatMoney(totaux[p.key]) : "—"}
                    </td>
                  ))}
                  <td className="num">{formatMoney(totalDu)}</td>
                  <td className="num">{formatMoney(totalPaye)}</td>
<td className="num">
                    {soldeReleve === 0 ? "à jour" : `${formatMoney(soldeReleve)} dû`}
                  </td>
                  <td className="actions" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      {bail.cautionVersee > 0 ? (
        <Card className="cag-card">
          <h2>
            <Landmark size={17} /> Caution
          </h2>
          <div className="cag-caution">
            <Landmark size={18} />
            <div>
              <strong>{formatMoney(bail.cautionVersee)}</strong> — caution{" "}
              {bail.cautionStatut === "deposee"
                ? "conservée"
                : bail.cautionStatut === "restituee"
                ? "restituée"
                : "non versée"}
              {bail.cautionSur ? ` · couvre : ${bail.cautionSur}` : ""}
            </div>
          </div>
        </Card>
      ) : null}

      {bail.dateFin ? (
        <Card className="cag-card">
          <div className="cag-caution">
            <AlertTriangle size={18} />
            <div>
              Le bail se termine le <strong>{formatDate(bail.dateFin)}</strong>.
            </div>
          </div>
        </Card>
      ) : null}

      {aSupprimer ? (
        <ConfirmDialog
          title="Retirer ce mois"
          message={`${periodeToLabel(aSupprimer.periode)} sera retiré du relevé. Si un encaissement porte déjà ce mois, la suppression sera refusée.`}
          confirmLabel="Retirer"
          danger
          onConfirm={supprimer}
          onCancel={() => setASupprimer(null)}
        />
      ) : null}
    </div>
  );
}