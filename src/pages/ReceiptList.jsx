import { Link } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { formatMoney, formatDate, receiptNumber } from "../utils/format";
import { FileText, Eye, Inbox } from "lucide-react";

export default function ReceiptList() {
  const { payments, tenants } = useApp();

  const sorted = [...payments].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div>
      <h1 className="page-title">Quittances</h1>
      <p className="text-muted" style={{ marginBottom: "1.5rem" }}>
        {sorted.length} quittance{sorted.length > 1 ? "s" : ""} générée{sorted.length > 1 ? "s" : ""}
      </p>

      <div className="card">
        {sorted.length === 0 ? (
          <div className="empty-state">
            <Inbox className="empty-icon" size={24} />
            <p>Aucune quittance générée.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>N° Quittance</th>
                  <th>Date</th>
                  <th>Locataire</th>
                  <th>Période</th>
                  <th className="text-right">Montant</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((p) => {
                  const tenant = tenants.find((t) => t.id === p.tenantId);
                  return (
                    <tr key={p.id}>
                      <td><code>{receiptNumber(p.id)}</code></td>
                      <td>{formatDate(p.date)}</td>
                      <td>{tenant ? `${tenant.nom} ${tenant.prenoms}` : "—"}</td>
                      <td>{p.periode}</td>
                      <td className="text-right">{formatMoney(p.montantPaye)}</td>
                      <td className="text-right">
                        <Link to={`/quittances/${p.id}`} className="btn btn-small btn-secondary">
                          <Eye size={14} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
