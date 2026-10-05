import { useParams, Link } from "react-router-dom";
import { useApp } from "../../context/AppContext";
import { formatMoney, formatDate } from "../../utils/format";
import { FileText, Download, Inbox } from "lucide-react";

export default function TenantReceipts() {
  const { id } = useParams();
  const { tenants, payments } = useApp();

  const tenant = tenants.find((t) => t.id === Number(id));
  if (!tenant) return null;

  const tenantPayments = payments
    .filter((p) => p.tenantId === tenant.id)
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div>
      <h1 className="tenant-page-title">Mes quittances</h1>
      <p className="tenant-page-subtitle">{tenantPayments.length} quittance{tenantPayments.length > 1 ? "s" : ""}</p>

      {tenantPayments.length === 0 ? (
        <div className="tenant-card">
          <div className="empty-state">
            <Inbox className="empty-icon" size={24} />
            <p>Aucune quittance disponible.</p>
          </div>
        </div>
      ) : (
        <div className="tenant-receipt-list">
          {tenantPayments.map((p) => (
            <Link to={`/quittances/${p.id}`} key={p.id} className="tenant-receipt-item">
              <div className="tenant-receipt-icon">
                <FileText size={20} />
              </div>
              <div className="tenant-receipt-info">
                <div className="tenant-receipt-period">{p.periode}</div>
                <div className="tenant-receipt-date">{formatDate(p.date)}</div>
              </div>
              <div className="tenant-receipt-right">
                <div className="tenant-receipt-amount">{formatMoney(p.montantPaye)}</div>
                <Download size={14} className="tenant-receipt-download" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
