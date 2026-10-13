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
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import { Card, EmptyState, Badge } from "../../components/ui";
import { lignesPostesPour } from "../../data/db.firebase";
import { formatMoney, formatDate, periodeToLabel, periodeToCourt } from "../../utils/format";
import Encaissement from "../paiements/Encaissement";

/** Un loyer est-il soldé : plus rien à encaisser sur ce mois ? */
function estSolde(loyer, paye) {
  return (Number(loyer.montantDu) || 0) > 0 && paye >= loyer.montantDu;
}

function montantPoste(loyer, poste) {
  if (loyer[poste] !== undefined) return Number(loyer[poste]) || 0;
  return poste === "loyer" ? Number(loyer.montantDu) || 0 : 0;
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
  } = useApp();
  // Le mois que le propriétaire a choisi de régler : la modale d'encaissement
  // s'ouvre directement dessus. Sans cela, on ne pouvait régler que « le
  // premier mois dû », et cliquer sur août dans le relevé finissait par
  // facturer octobre.
const [moisARegler, setMoisARegler] = useState(null);

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
  const lignes = useMemo(() => {
    if (!bail) return [];
    const payeParLoyer = new Map();
    for (const p of paiementsDe(bail.id)) {
      for (const a of p.allocations || []) {
        payeParLoyer.set(a.loyerId, (payeParLoyer.get(a.loyerId) || 0) + a.montant);
      }
    }
    return loyersDe(bail.id).reduce((acc, l) => {
      const paye = payeParLoyer.get(l.id) || 0;
      const precedent = acc.length ? acc[acc.length - 1].solde : 0;
      acc.push({
        loyer: l,
        paye,
        solde: precedent + (l.montantDu || 0) - paye,
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

  const totalDu = lignes.reduce((s, l) => s + (l.loyer.montantDu || 0), 0);
  const totalPaye = lignes.reduce((s, l) => s + l.paye, 0);
  const soldeFinal = totalDu - totalPaye;

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
        <Badge classe={soldeFinal > 0 ? "badge-red" : "badge-green"}>
          {soldeFinal > 0 ? "Impayé" : "À jour"}
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
        <div className={`cag-stat ${soldeFinal > 0 ? "warn" : "ok"}`}>
          <div className="cag-stat-label">
            {soldeFinal > 0 ? <AlertTriangle size={14} /> : <Check size={14} />}
            Solde {soldeFinal > 0 ? "(dette)" : "(crédit)"}
          </div>
          <div className="cag-stat-value">{formatMoney(Math.abs(soldeFinal))}</div>
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
                </tr>
              </thead>
              <tbody>
                {lignes.map(({ loyer, paye, solde }) => (
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
                      {solde === 0 ? (
                        <span className="cag-pill ok">à jour</span>
                      ) : solde > 0 ? (
                        <span className="cag-pill money">{formatMoney(solde)}</span>
                      ) : (
                        <span className="cag-pill credit">avance {formatMoney(-solde)}</span>
                      )}
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
                    {soldeFinal === 0
                      ? "à jour"
                      : formatMoney(Math.abs(soldeFinal)) + (soldeFinal > 0 ? " dû" : " d'avance")}
                  </td>
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
    </div>
  );
}