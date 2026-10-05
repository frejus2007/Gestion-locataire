// Quittance de loyer imprimable.
//
// Ce document a une valeur juridique : tout ce qui y figure est figé au moment
// de l'émission (instantané stocké dans le document de quittance), et non lu
// depuis les fiches actuelles. Une fiche modifiée plus tard ne doit pas
// changer une quittance déjà remise.

import { useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Printer, FileText, Download } from "lucide-react";
import { useApp } from "../../context/AppContext";
import { Card, EmptyState } from "../../components/ui";
import {
  formatMoney,
  formatDateLongue,
  formatDate,
  amountToWords,
  periodeToLabel,
} from "../../utils/format";

/**
 * Code-barres visuel : une vraie lecture optique n'est pas nécessaire ici,
 * c'est un repère visuel et une référence imprimée.
 */
function CodeBarres({ valeur }) {
  const motif = valeur
    .split("")
    .map((c) => {
      const code = c.charCodeAt(0);
      return Array.from({ length: 7 }, (_, i) => ((code >> i) & 1) ? 3 : 1);
    })
    .flat();

  return (
    <div className="barcode" aria-label={`Référence : ${valeur}`}>
      {motif.map((l, i) => (
        <span key={i} style={{ width: l, marginRight: 1 }} />
      ))}
    </div>
  );
}

export default function QuittanceView() {
  const { id } = useParams();
  const { quittances, loyers, proprietaire } = useApp();

  const quittance = useMemo(() => quittances.find((q) => q.id === id), [quittances, id]);

  if (!quittance) {
    return (
      <Card>
        <EmptyState
          icon={FileText}
          message="Quittance introuvable. Elle a peut-être été supprimée avec son versement."
          action={
            <Link to="/quittances" className="btn btn-primary" style={{ marginTop: "0.75rem" }}>
              Retour aux quittances
            </Link>
          }
        />
      </Card>
    );
  }

  // Les périodes sont lues pour leur libellé ; le reste vient de l'instantané.
  const periodes = (quittance.allocations || [])
    .map((a) => {
      const l = loyers.find((x) => x.id === a.loyerId);
      return { label: l ? periodeToLabel(l.periode) : "Période inconnue", montant: a.montant };
    });

  const multiPeriode = periodes.length > 1;

  return (
    <div>
      <div className="page-header no-print">
        <div>
          <Link to="/quittances" className="btn btn-small btn-secondary" style={{ marginBottom: "0.5rem" }}>
            <ArrowLeft size={14} /> Quittances
          </Link>
          <h1 className="page-title">Quittance {quittance.numero}</h1>
          <p className="page-subtitle">
            Émise le {formatDate(quittance.emission)} · {quittance.anneeNumero}
          </p>
        </div>
        <div className="btn-group">
          <button type="button" className="btn btn-secondary" onClick={() => window.print()}>
            <Download size={15} /> Enregistrer en PDF
          </button>
          <button type="button" className="btn btn-primary" onClick={() => window.print()}>
            <Printer size={15} /> Imprimer
          </button>
        </div>
      </div>

      <div className="receipt">
        <div className="receipt-header">
          <div className="receipt-owner">
            <strong style={{ fontSize: "1rem" }}>
              {quittance.nomProprietaire} {quittance.prenomsProprietaire}
            </strong>
            <br />
            {quittance.adresseProprietaire}
            {quittance.villeProprietaire ? `, ${quittance.villeProprietaire}` : ""}
            <br />
            Tél : {quittance.telephoneProprietaire}
            {quittance.ifuProprietaire && (
              <>
                <br />
                IFU : {quittance.ifuProprietaire}
              </>
            )}
            {proprietaire?.banque && (
              <>
                <br />
                {proprietaire.banque}
              </>
            )}
          </div>

          <div className="receipt-meta">
            <img src="/logo-cag.png" alt="CAG" style={{ height: 34, marginBottom: "0.5rem" }} />
            <div className="receipt-title">QUITTANCE DE LOYER</div>
            <div className="receipt-ref">N° {quittance.numero}</div>
            <div className="receipt-ref">
              Le {formatDateLongue(quittance.emission)}
            </div>
          </div>
        </div>

        <hr className="receipt-divider" />

        <div className="receipt-body">
          <p>
            Je soussigné(e) <strong>{quittance.nomProprietaire} {quittance.prenomsProprietaire}</strong>,
            propriétaire, déclare avoir reçu de{" "}
            <strong>{quittance.nomLocataire}</strong>, résidant à{" "}
            {quittance.adresseImmeuble || "—"}
            {quittance.designationLot ? ` (${quittance.designationLot})` : ""},
            la somme de <strong>{formatMoney(quittance.montant)}</strong>
            <span className="receipt-words"> ({amountToWords(quittance.montant)})</span>.
          </p>

          {multiPeriode ? (
            <p>
              Cette somme couvre les loyers des périodes suivantes :
            </p>
          ) : (
            <p>
              Pour le loyer de la période <strong>{periodes[0]?.label || "—"}</strong>,
            </p>
          )}

          {multiPeriode && (
            <ul className="receipt-periods">
              {periodes.map((p, i) => (
                <li key={i}>
                  {p.label} : {formatMoney(p.montant)}
                </li>
              ))}
            </ul>
          )}

          <p>
            Payé le <strong>{formatDate(quittance.datePaiement)}</strong>
            {quittance.mode && <> en {MODE_LIBELLE[quittance.mode] || quittance.mode}</>}
            {quittance.reference && (
              <>
                {" "}
                (réf. <span className="mono">{quittance.reference}</span>)
              </>
            )}
            .
          </p>
        </div>

        <hr className="receipt-divider" />

        <div className="receipt-footer">
          <div>
            <div className="signature-label">Signature du propriétaire :</div>
            {proprietaire?.signatureUrl ? (
              <img src={proprietaire.signatureUrl} alt="Signature" className="signature-img" />
            ) : (
              <div className="signature-space" />
            )}
          </div>

          <div className="receipt-barcode">
            <CodeBarres valeur={quittance.numero} />
            <div className="barcode-text">{quittance.numero}</div>
          </div>
        </div>
      </div>

      <p className="text-muted no-print" style={{ fontSize: "0.8rem", marginTop: "1rem", textAlign: "center" }}>
        Cette quittance est un document officiel. Pour l'archiver au format PDF, utilisez
        « Imprimer » puis choisissez « Enregistrer au format PDF » comme destination.
      </p>
    </div>
  );
}

// Libellés lisibles des modes de paiement, pour le document.
const MODE_LIBELLE = {
  especes: "espèces",
  virement: "virement bancaire",
  mobile: "Mobile Money",
  cheque: "chèque",
};
