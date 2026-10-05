import { useParams, Link } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { formatMoney, formatDate, amountToWords, receiptNumber } from "../utils/format";
import { ArrowLeft, Printer } from "lucide-react";

// Génère un code-barres visuel à partir du numéro de référence
function Barcode({ value }) {
  const pattern = value.split("").map((ch) => {
    const code = ch.charCodeAt(0);
    return Array.from({ length: 7 }, (_, i) => ((code >> i) & 1) ? 3 : 1);
  }).flat();

  return (
    <div className="barcode" aria-label={`Code-barres : ${value}`}>
      {pattern.map((w, i) => (
        <span key={i} style={{ width: w, marginRight: 1 }} />
      ))}
    </div>
  );
}

export default function ReceiptView() {
  const { id } = useParams();
  const { payments, tenants, owner } = useApp();

  const payment = payments.find((p) => p.id === Number(id));
  if (!payment) {
    return (
      <div className="card">
        <p className="empty-state">Quittance introuvable.</p>
        <Link to="/quittances" className="btn btn-primary">Retour</Link>
      </div>
    );
  }

  const tenant = tenants.find((t) => t.id === payment.tenantId);
  const ref = receiptNumber(payment.id);

  return (
    <div>
      <div className="page-header no-print">
        <h1 className="page-title">Quittance</h1>
        <div className="btn-group">
          <Link to={`/locataires/${tenant?.id}`} className="btn btn-secondary">
            <ArrowLeft size={16} /> Retour
          </Link>
          <button className="btn btn-primary" onClick={() => window.print()}>
            <Printer size={16} /> Imprimer / PDF
          </button>
        </div>
      </div>

      <div className="receipt">
        {/* En-tête */}
        <div className="receipt-header">
          <div className="receipt-owner">
            <strong>{owner?.nom} {owner?.prenoms}</strong>
            <br />{owner?.adresse}
            <br />Tél : {owner?.telephone}
            <br />IFU : {owner?.ifu}
          </div>
          <div className="receipt-meta">
            <div className="receipt-title">QUITTANCE DE LOYER</div>
            <div className="receipt-ref">N° {ref}</div>
          </div>
        </div>

        <hr className="receipt-divider" />

        {/* Corps */}
        <div className="receipt-body">
          <p>
            Reçu de <strong>{tenant?.nom} {tenant?.prenoms}</strong> la somme de{" "}
            <strong>{formatMoney(payment.montantPaye)}</strong>
            <span className="receipt-words"> ({amountToWords(payment.montantPaye)})</span>
          </p>
          <p>
            Pour le loyer de la période <strong>{payment.periode}</strong>,
            payé le <strong>{formatDate(payment.date)}</strong>.
          </p>
        </div>

        <hr className="receipt-divider" />

        {/* Pied : signature + code-barres */}
        <div className="receipt-footer">
          <div className="receipt-signature">
            <div className="signature-label">Signature du propriétaire :</div>
            {owner?.signatureImage ? (
              <img src={owner.signatureImage} alt="Signature" className="signature-img" />
            ) : (
              <div className="signature-space" />
            )}
          </div>
          <div className="receipt-barcode">
            <Barcode value={ref} />
            <div className="barcode-text">{ref}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
