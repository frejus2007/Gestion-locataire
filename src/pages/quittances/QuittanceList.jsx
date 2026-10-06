// Liste des quittances émises.

import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { FileText, Search, Eye, Printer } from "lucide-react";
import { useApp } from "../../context/AppContext";
import { Card, EmptyState, Select, LocataireLink } from "../../components/ui";
import { formatMoney, formatDate, periodeToLabel, periodeCourante, pluriel, accorde } from "../../utils/format";

export default function QuittanceList() {
  const { quittances, loyers } = useApp();
  const [recherche, setRecherche] = useState("");
  const [annee, setAnnee] = useState("toutes");

  const lignes = useMemo(
    () =>
      [...quittances]
        .sort((a, b) => b.numero.localeCompare(a.numero))
        .map((q) => ({
          ...q,
          periodes: (q.allocations || [])
            .map((a) => {
              const l = loyers.find((x) => x.id === a.loyerId);
              return l ? periodeToLabel(l.periode) : null;
            })
            .filter(Boolean),
        })),
    [quittances, loyers]
  );

  const annees = [...new Set(quittances.map((q) => q.annee))].sort().reverse();

  const filtrees = lignes.filter((q) => {
    if (annee !== "toutes" && q.annee !== annee) return false;
    const texte = `${q.numero} ${q.nomLocataire}`.toLowerCase();
    return !recherche || texte.includes(recherche.toLowerCase());
  });

  const total = filtrees.reduce((s, q) => s + q.montant, 0);

  // Quittances de l'année courante, pour l'impression d'un lot.
  const lotAnnee = lignes.filter((q) => q.annee === periodeCourante().slice(0, 4));

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Quittances</h1>
          <p className="page-subtitle">
            {`${pluriel(lignes.length, "quittance")} émise${accorde(lignes.length)}`}
            {filtrees.length !== lignes.length && ` · ${pluriel(filtrees.length, "affichée")}`} ·{" "}
            {formatMoney(total)}
          </p>
        </div>
        {lotAnnee.length > 0 && (
          <button type="button" className="btn btn-secondary" onClick={() => window.print()}>
            <Printer size={15} /> Imprimer les quittances
          </button>
        )}
      </div>

      <Card style={{ marginBottom: "1rem", padding: "0.85rem 1.25rem" }}>
        <div className="row">
          <div style={{ position: "relative", flex: 1, minWidth: 200, maxWidth: 380 }}>
            <Search
              size={16}
              style={{
                position: "absolute",
                left: "0.75rem",
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-muted)",
                pointerEvents: "none",
              }}
            />
            <input
              type="search"
              className="input"
              style={{ paddingLeft: "2.3rem" }}
              placeholder="Rechercher un numéro, un locataire…"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
            />
          </div>
          <div style={{ minWidth: 150 }}>
            <Select
              value={annee}
              onChange={(e) => setAnnee(e.target.value)}
              options={[{ id: "toutes", label: "Toutes les années" }].concat(
                annees.map((a) => ({ id: a, label: `Année ${a}` }))
              )}
            />
          </div>
        </div>
      </Card>

      <Card>
        {filtrees.length === 0 ? (
          <EmptyState
            icon={FileText}
            message={
              quittances.length === 0
                ? "Aucune quittance. Une quittance est générée automatiquement à chaque versement."
                : "Aucune quittance ne correspond à cette recherche."
            }
          />
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>N° Quittance</th>
                  <th>Date paiement</th>
                  <th>Locataire</th>
                  <th>Période(s)</th>
                  <th className="num">Montant</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtrees.map((q) => (
                  <tr key={q.id}>
                    <td>
                      <span className="mono" style={{ fontWeight: 600 }}>
                        {q.numero}
                      </span>
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>{formatDate(q.datePaiement)}</td>
                    <td>
                      <LocataireLink
                        nom={q.nomLocataire}
                        id={q.locataireId}
                        avatar
                        avatarSize={26}
                      />
                    </td>
                    <td style={{ fontSize: "0.8rem", maxWidth: 190 }}>
                      {q.periodes.length === 0 ? (
                        <span className="text-muted">—</span>
                      ) : q.periodes.length === 1 ? (
                        q.periodes[0]
                      ) : (
                        <span title={q.periodes.join(", ")}>
                          {q.periodes[0]} <span className="text-muted">+{q.periodes.length - 1}</span>
                        </span>
                      )}
                    </td>
                    <td className="num" style={{ fontWeight: 700 }}>
                      {formatMoney(q.montant)}
                    </td>
                    <td className="actions">
                      <Link to={`/quittances/${q.id}`} className="btn btn-small btn-secondary">
                        <Eye size={13} /> Ouvrir
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="text-muted no-print" style={{ fontSize: "0.8rem", marginTop: "0.75rem" }}>
        Les numéros sont définitifs et séquentiels par année. Supprimer un versement supprime sa
        quittance, mais ne renumérote pas les suivantes.
      </p>
    </div>
  );
}