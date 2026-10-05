import { useParams, Link } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { formatMoney, formatDate } from "../utils/format";
import { LogOut, Download, Inbox, User, Phone, MapPin } from "lucide-react";

export default function TenantSpace() {
  const { id } = useParams();
  const { tenants, payments, owner, getBalance } = useApp();

  const tenant = tenants.find((t) => t.id === Number(id));
  if (!tenant) {
    return (
      <div className="card">
        <p className="empty-state">Session expirée ou introuvable.</p>
        <Link to="/espace-locataire" className="btn btn-primary">Se reconnecter</Link>
      </div>
    );
  }

  const balance = getBalance(tenant.id);
  const tenantPayments = payments
    .filter((p) => p.tenantId === tenant.id)
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="tenant-space">
      <div className="page-header">
        <div>
          <h1 className="page-title">Bonjour {tenant.prenoms}</h1>
          <p className="text-muted">Voici votre compte locataire</p>
        </div>
        <Link to="/espace-locataire" className="btn btn-secondary">
          <LogOut size={16} /> Déconnexion
        </Link>
      </div>

      {/* Solde */}
      <div className={`balance-card ${balance > 0 ? "negative" : "positive"}`}>
        <div className="balance-card-label">Votre solde actuel</div>
        <div className="balance-card-amount">
          {balance > 0 ? `${formatMoney(balance)} dû` : "À jour"}
        </div>
      </div>

      {/* Coordonnées propriétaire */}
      <section className="card">
        <h2 className="card-title">Votre propriétaire</h2>
        <dl className="info-list">
          <div>
            <dt><User size={14} style={{ verticalAlign: "middle", marginRight: "0.35rem" }} />Nom</dt>
            <dd>{owner?.nom} {owner?.prenoms}</dd>
          </div>
          <div>
            <dt><Phone size={14} style={{ verticalAlign: "middle", marginRight: "0.35rem" }} />Téléphone</dt>
            <dd>{owner?.telephone}</dd>
          </div>
          <div>
            <dt><MapPin size={14} style={{ verticalAlign: "middle", marginRight: "0.35rem" }} />Adresse</dt>
            <dd>{owner?.adresse}</dd>
          </div>
        </dl>
      </section>

      {/* Historique */}
      <section className="card">
        <h2 className="card-title">Historique mois par mois</h2>
        {tenantPayments.length === 0 ? (
          <div className="empty-state">
            <Inbox className="empty-icon" size={24} />
            <p>Aucun paiement enregistré.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Période</th>
                  <th>Date</th>
                  <th className="text-right">Payé</th>
                  <th className="text-right">Quittance</th>
                </tr>
              </thead>
              <tbody>
                {tenantPayments.map((p) => (
                  <tr key={p.id}>
                    <td>{p.periode}</td>
                    <td>{formatDate(p.date)}</td>
                    <td className="text-right">{formatMoney(p.montantPaye)}</td>
                    <td className="text-right">
                      <Link to={`/quittances/${p.id}`} className="btn btn-small btn-secondary">
                        <Download size={14} />
                      </Link>
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
