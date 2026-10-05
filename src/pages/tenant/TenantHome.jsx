import { useParams, Link } from "react-router-dom";
import { useApp } from "../../context/AppContext";
import { formatMoney } from "../../utils/format";
import { AlertTriangle, CheckCircle, FileText, TrendingUp } from "lucide-react";

export default function TenantHome() {
  const { id } = useParams();
  const { tenants, payments, getBalance } = useApp();

  const tenant = tenants.find((t) => t.id === Number(id));
  if (!tenant) return null;

  const balance = getBalance(tenant.id);
  const tenantPayments = payments
    .filter((p) => p.tenantId === tenant.id)
    .sort((a, b) => b.date.localeCompare(a.date));

  const totalPaye = tenantPayments.reduce((s, p) => s + p.montantPaye, 0);
  const dernierPaiement = tenantPayments[0];

  return (
    <div>
      {/* Solde principal */}
      <div className={`tenant-balance-card ${balance > 0 ? "negative" : "positive"}`}>
        <div className="tenant-balance-label">Votre solde actuel</div>
        <div className="tenant-balance-amount">
          {balance > 0 ? formatMoney(balance) : "À jour"}
        </div>
        <div className="tenant-balance-sub">
          {balance > 0 ? (
            <><AlertTriangle size={14} /> Montant restant à payer</>
          ) : (
            <><CheckCircle size={14} /> Aucun impayé</>
          )}
        </div>
      </div>

      {/* Stats rapides */}
      <div className="tenant-stats">
        <div className="tenant-stat-card">
          <div className="tenant-stat-icon" style={{ background: "#eef2ff", color: "#6366f1" }}>
            <TrendingUp size={18} />
          </div>
          <div className="tenant-stat-value">{formatMoney(totalPaye)}</div>
          <div className="tenant-stat-label">Total payé</div>
        </div>
        <div className="tenant-stat-card">
          <div className="tenant-stat-icon" style={{ background: "#ecfdf5", color: "#10b981" }}>
            <FileText size={18} />
          </div>
          <div className="tenant-stat-value">{tenantPayments.length}</div>
          <div className="tenant-stat-label">Paiements</div>
        </div>
      </div>

      {/* Dernier paiement */}
      {dernierPaiement && (
        <div className="tenant-card">
          <div className="tenant-card-title">Dernier paiement</div>
          <div className="tenant-payment-item">
            <div>
              <div className="tenant-payment-period">{dernierPaiement.periode}</div>
              <div className="tenant-payment-date">{dernierPaiement.date}</div>
            </div>
            <div className="tenant-payment-amount">{formatMoney(dernierPaiement.montantPaye)}</div>
          </div>
        </div>
      )}

      {/* Lien quittances */}
      <Link to={`/espace-locataire/${id}/quittances`} className="tenant-quick-link">
        <FileText size={18} />
        <span>Voir toutes mes quittances</span>
      </Link>
    </div>
  );
}
