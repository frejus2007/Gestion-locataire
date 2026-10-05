import { useParams, Link, useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { formatMoney, formatDate } from "../utils/format";
import { Edit, Plus, ArrowLeft, Inbox } from "lucide-react";

export default function TenantDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { tenants, payments, getBalance } = useApp();

  const tenant = tenants.find((t) => t.id === Number(id));
  if (!tenant) {
    return (
      <div className="card">
        <p className="empty-state">Locataire introuvable.</p>
        <Link to="/locataires" className="btn btn-primary">Retour à la liste</Link>
      </div>
    );
  }

  const tenantPayments = payments
    .filter((p) => p.tenantId === tenant.id)
    .sort((a, b) => a.date.localeCompare(b.date));

  const balance = getBalance(tenant.id);

  // Calcule le solde ligne par ligne
  let running = 0;
  const rows = tenantPayments.map((p) => {
    running += p.montantDu - p.montantPaye;
    return { ...p, solde: running };
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <Link to="/locataires" className="btn btn-small btn-secondary" style={{ marginBottom: "0.5rem" }}>
            <ArrowLeft size={14} /> Retour
          </Link>
          <h1 className="page-title">{tenant.nom} {tenant.prenoms}</h1>
          <p className="text-muted">Fiche locataire</p>
        </div>
        <div className="btn-group">
          <Link to={`/locataires/${tenant.id}/modifier`} className="btn btn-secondary">
            <Edit size={16} /> Modifier
          </Link>
          <Link to={`/locataires/${tenant.id}/paiement`} className="btn btn-primary">
            <Plus size={16} /> Enregistrer un paiement
          </Link>
        </div>
      </div>

      <div className="detail-grid">
        {/* Informations */}
        <section className="card">
          <h2 className="card-title">Informations</h2>
          <dl className="info-list">
            <div><dt>Téléphone</dt><dd>{tenant.telephone}</dd></div>
            <div><dt>IFU</dt><dd>{tenant.ifu || "—"}</dd></div>
            <div><dt>Pièce d'identité</dt><dd>{tenant.pieceNature} n° {tenant.pieceNumero || "—"}</dd></div>
            <div><dt>Date d'entrée</dt><dd>{formatDate(tenant.dateEntree)}</dd></div>
            <div><dt>Date de sortie</dt><dd>{tenant.dateSortie ? formatDate(tenant.dateSortie) : "—"}</dd></div>
            <div><dt>Loyer mensuel</dt><dd>{formatMoney(tenant.loyerMensuel)}</dd></div>
            <div><dt>Code d'accès</dt><dd><code>{tenant.codeAcces}</code></dd></div>
          </dl>
        </section>

        {/* Solde */}
        <section className="card">
          <h2 className="card-title">Solde</h2>
          <div className={`balance-display ${balance > 0 ? "negative" : "positive"}`}>
            <span className="balance-amount">{formatMoney(Math.abs(balance))}</span>
            <span className="balance-label">
              {balance > 0 ? "Dû par le locataire" : balance < 0 ? "Crédit du locataire" : "Compte à jour"}
            </span>
          </div>
        </section>
      </div>

      {/* Tableau des comptes */}
      <section className="card">
        <h2 className="card-title">Compte — historique des paiements</h2>
        {rows.length === 0 ? (
          <div className="empty-state">
            <Inbox className="empty-icon" size={24} />
            <p>Aucun paiement enregistré pour ce locataire.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Date de paiement</th>
                  <th>Période</th>
                  <th className="text-right">Loyer à payer</th>
                  <th className="text-right">Montant payé</th>
                  <th className="text-right">Solde</th>
                  <th className="text-right">Quittance</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td>{formatDate(p.date)}</td>
                    <td>{p.periode}</td>
                    <td className="text-right">{formatMoney(p.montantDu)}</td>
                    <td className="text-right">{formatMoney(p.montantPaye)}</td>
                    <td className="text-right">
                      <span className={p.solde > 0 ? "badge badge-red" : "badge badge-green"}>
                        {formatMoney(p.solde)}
                      </span>
                    </td>
                    <td className="text-right">
                      <Link to={`/quittances/${p.id}`} className="btn btn-small">Voir</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
