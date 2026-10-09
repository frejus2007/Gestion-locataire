// Compte du locataire : le relevé ligne à ligne des loyers et des règlements.
// C'est l'écran que le propriétaire consulte à la place de son cahier.
//
// Le relevé est en lecture seule. Les frais de chaque mois sont saisis au
// moment de l'encaissement, et le loyer de l'échéance porte alors la facture
// réellement appliquée. Ici on ne fait que montrer ce qui a été facturé.

import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Receipt, ArrowRight } from "lucide-react";
import {
  formatMoney,
  formatDate,
  periodeToLabel,
  periodeToCourt,
  pluriel,
  accorde,
} from "../utils/format";
import { Card, EmptyState } from "./ui";
import { lignesPostesPour } from "../data/db.firebase";

function montantPoste(loyer, poste) {
  if (loyer[poste] !== undefined) return Number(loyer[poste]) || 0;
  return poste === "loyer" ? Number(loyer.montantDu) || 0 : 0;
}

export default function CompteLocataire({
  bailId,
  bail,
  loyersDe,
  paiementsDe,
  quittancesParPaiement,
  compact = false,
}) {
  // Les postes viennent du bail : les libellés renommables (« Frais de
  // porte ») sont ainsi appliqués au tableau comme à la saisie.
  const postes = useMemo(
    () => lignesPostesPour(bail).map(({ key, label }) => ({ id: key, label })),
    [bail]
  );
  const loyers = useMemo(() => loyersDe(bailId), [loyersDe, bailId]);
  const paiements = useMemo(() => paiementsDe(bailId), [paiementsDe, bailId]);

  // Solde cumulé, mois après mois : c'est la colonne qui sert à retrouver
  // « depuis quand il me doit de l'argent ». On le porte dans chaque ligne via
  // reduce, sans variable partagée entre deux rendus.
  const lignes = useMemo(() => {
    const payeParLoyer = new Map();
    for (const p of paiements) {
      for (const a of p.allocations || []) {
        payeParLoyer.set(a.loyerId, (payeParLoyer.get(a.loyerId) || 0) + a.montant);
      }
    }
    return loyers.reduce(
      (acc, l) => {
        const paye = payeParLoyer.get(l.id) || 0;
        const precedent = acc.length ? acc[acc.length - 1].solde : 0;
        acc.push({ loyer: l, paye, solde: precedent + l.montantDu - paye });
        return acc;
      },
      []
    );
  }, [loyers, paiements]);

  const affichees = compact ? lignes.slice(-6) : lignes;
  const masquees = lignes.length - affichees.length;

  const totauxPostes = Object.fromEntries(
    postes.map(({ id }) => [
      id,
      loyers.reduce((total, l) => total + montantPoste(l, id), 0),
    ])
  );
  const totalDu = loyers.reduce((s, l) => s + l.montantDu, 0);
  const totalPaye = paiements.reduce((s, p) => s + p.montant, 0);
  const soldeFinal = totalDu - totalPaye;

  // Les derniers versements, pour la colonne de droite du détail locataire.
  const derniersPaiements = paiements.slice(0, 4);

  return (
    <div className="stack">
      <Card
        title="Compte du locataire — détail mensuel"
        className="tenant-account-card"
        action={
          compact && masquees > 0 ? (
            <span className="text-muted" style={{ fontSize: "0.8rem" }}>
              {`${pluriel(masquees, "période")} antérieure${accorde(masquees)}`}
            </span>
          ) : null
        }
      >
        <p className="text-muted" style={{ margin: "0 0 0.85rem", fontSize: "0.84rem" }}>
          « Total dû » additionne le loyer et les charges du mois, tels qu’ils ont été
          saisis lors de l’encaissement. « Payé » indique ce qui a été versé pour le mois ;
          le « Solde cumulé » montre ce qu’il reste à payer depuis le début du bail.
          Tous les montants sont en FCFA.
        </p>

        {loyers.length === 0 ? (
          <EmptyState
            message="Aucun loyer généré pour ce bail. Utilisez « Générer les loyers » pour reconstituer l'historique."
          />
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Mois</th>
                  {postes.map(({ id, label }) => (
                    <th key={id} className="num">
                      {label}
                    </th>
                  ))}
                  <th className="num" title="Somme des frais du mois">
                    Total dû
                  </th>
                  <th className="num" title="Paiements imputés à ce mois">
                    Payé
                  </th>
                  <th className="num" title="Montant restant dû depuis le début du bail">
                    Solde cumulé
                  </th>
                </tr>
              </thead>
              <tbody>
                {affichees.map(({ loyer, paye, solde }) => (
                  <tr key={loyer.id}>
                    <td title={periodeToLabel(loyer.periode)}>
                      <span>{periodeToCourt(loyer.periode)}</span>
                    </td>
                    {postes.map(({ id }) => (
                      <td key={id} className="num">
                        {montantPoste(loyer, id) > 0 ? formatMoney(montantPoste(loyer, id)) : "—"}
                      </td>
                    ))}
                    <td className="num" style={{ fontWeight: 600 }}>
                      {formatMoney(loyer.montantDu)}
                    </td>
                    <td className="num">{paye > 0 ? formatMoney(paye) : "—"}</td>
                    <td className="num">
                      <span
                        style={{ color: solde > 0 ? "var(--danger)" : "var(--success)", fontWeight: 600 }}
                      >
                        {solde === 0
                          ? "À jour"
                          : `${formatMoney(Math.abs(solde))} ${solde > 0 ? "à payer" : "de crédit"}`}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--border)" }}>
                  <th>Total</th>
                  {postes.map(({ id }) => (
                    <th key={id} className="num">
                      {totauxPostes[id] > 0 ? formatMoney(totauxPostes[id]) : "—"}
                    </th>
                  ))}
                  <th className="num">{formatMoney(totalDu)}</th>
                  <th className="num">{formatMoney(totalPaye)}</th>
                  <th className="num">
                    <span
                      style={{ color: soldeFinal > 0 ? "var(--danger)" : "var(--success)", fontSize: "1rem" }}
                    >
                      {soldeFinal === 0
                        ? "À jour"
                        : `${formatMoney(Math.abs(soldeFinal))} ${soldeFinal > 0 ? "à payer" : "de crédit"}`}
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