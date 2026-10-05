// Compte du locataire : le relevé ligne à ligne des loyers et des règlements.
// C'est l'écran que le propriétaire consulte à la place de son cahier.

import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  formatMoney,
  formatDate,
  periodeToLabel,
  periodeToCourt,
  LIBELLE_STATUT_LOYER,
  pluriel,
  accorde,
} from "../utils/format";
import { Badge, EmptyState, Card } from "./ui";
import { Receipt, ArrowRight } from "lucide-react";

/**
 * @param {object} props
 * @param {string} props.bailId
 * @param {boolean} props.compact  limite le nombre de lignes affichées
 */
export default function CompteLocataire({ bailId, loyersDe, paiementsDe, quittancesParPaiement, compact = false }) {
  const loyers = useMemo(() => loyersDe(bailId), [loyersDe, bailId]);
  const paiements = useMemo(() => paiementsDe(bailId), [paiementsDe, bailId]);

  // Solde cumulé, mois après mois : c'est la colonne qui sert à retrouver
  // « depuis quand il me doit de l'argent ». On repart des allocations réelles.
  const lignes = useMemo(() => {
    const payeParLoyer = new Map();
    for (const p of paiements) {
      for (const a of p.allocations || []) {
        payeParLoyer.set(a.loyerId, (payeParLoyer.get(a.loyerId) || 0) + a.montant);
      }
    }
    // Solde cumulé : on le porte dans chaque ligne via reduce, sans variable
    // partagée entre deux rendus.
    return loyers.reduce(
      (acc, l) => {
        const paye = payeParLoyer.get(l.id) || 0;
        const precedent = acc.length ? acc[acc.length - 1].solde : 0;
        const solde = precedent + l.montantDu - paye;
        acc.push({ loyer: l, paye, solde });
        return acc;
      },
      []
    );
  }, [loyers, paiements]);

  const affichees = compact ? lignes.slice(-6) : lignes;
  const masquees = lignes.length - affichees.length;

  const totalDu = loyers.reduce((s, l) => s + l.montantDu, 0);
  const totalPaye = paiements.reduce((s, p) => s + p.montant, 0);
  const soldeFinal = totalDu - totalPaye;

  // Les derniers versements, pour la colonne de droite du détail locataire.
  const derniersPaiements = paiements.slice(0, 4);

  return (
    <div className="grid grid-2" style={{ alignItems: "start" }}>
      <Card
        title="Compte — historique des loyers"
        action={
          compact && masquees > 0 ? (
            <span className="text-muted" style={{ fontSize: "0.8rem" }}>
              {`${pluriel(masquees, "période")} antérieure${accorde(masquees)}`}
            </span>
          ) : null
        }
      >
        {loyers.length === 0 ? (
          <EmptyState
            message="Aucun loyer généré pour ce bail. Utilisez « Générer les loyers » pour reconstituer l'historique."
          />
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Période</th>
                  <th className="num">Dû</th>
                  <th className="num">Payé</th>
                  <th className="num">Statut</th>
                  <th className="num">Solde</th>
                </tr>
              </thead>
              <tbody>
                {affichees.map(({ loyer, paye, solde }) => {
                  const st = LIBELLE_STATUT_LOYER[loyer.statut] || LIBELLE_STATUT_LOYER.impaye;
                  return (
                    <tr key={loyer.id}>
                      <td title={periodeToLabel(loyer.periode)}>{periodeToCourt(loyer.periode)}</td>
                      <td className="num">{formatMoney(loyer.montantDu)}</td>
                      <td className="num">{paye > 0 ? formatMoney(paye) : "—"}</td>
                      <td>
                        <Badge classe={st.classe}>{st.label}</Badge>
                      </td>
                      <td className="num">
                        <span style={{ color: solde > 0 ? "var(--danger)" : "var(--success)", fontWeight: 600 }}>
                          {formatMoney(Math.abs(solde))}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--border)" }}>
                  <th>Total</th>
                  <th className="num">{formatMoney(totalDu)}</th>
                  <th className="num">{formatMoney(totalPaye)}</th>
                  <th />
                  <th className="num">
                    <span style={{ color: soldeFinal > 0 ? "var(--danger)" : "var(--success)", fontSize: "1rem" }}>
                      {formatMoney(Math.abs(soldeFinal))}
                    </span>
                  </th>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      <Card title="Derniers versements">
        {derniersPaiements.length === 0 ? (
          <EmptyState message="Aucun versement enregistré." />
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th className="num">Montant</th>
                  <th>Quittance</th>
                </tr>
              </thead>
              <tbody>
                {derniersPaiements.map((p) => {
                  const q = quittancesParPaiement.get(p.id);
                  return (
                    <tr key={p.id}>
                      <td>
                        {formatDate(p.date)}
                        {p.note && (
                          <div className="text-muted" style={{ fontSize: "0.76rem" }}>
                            {p.note}
                          </div>
                        )}
                      </td>
                      <td className="num">{formatMoney(p.montant)}</td>
                      <td>
                        {q ? (
                          <Link to={`/quittances/${q.id}`} className="btn btn-small btn-ghost" title={q.numero}>
                            <Receipt size={14} />
                          </Link>
                        ) : (
                          <span className="text-muted" style={{ fontSize: "0.78rem" }}>
                            —
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!compact && (
          <Link to="/paiements" className="btn btn-small btn-secondary" style={{ marginTop: "0.9rem" }}>
            Voir tous les versements <ArrowRight size={14} />
          </Link>
        )}
      </Card>
    </div>
  );
}