// Liste des versements encaissés.

import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Plus, Wallet, Search, Receipt, Inbox, FileText } from "lucide-react";
import { useApp } from "../../context/AppContext";
import { useToast } from "../../context/ToastContext";
import { Card, EmptyState, Badge, Select, ConfirmDialog, Avatar, LocataireLink } from "../../components/ui";
import { formatMoney, formatDate, periodeToLabel, pluriel } from "../../utils/format";

export default function PaiementList() {
  const {
    paiements,
    loyers,
    bauxParId,
    lotsParId,
    immeublesParId,
    locatairesParId,
    quittancesParPaiement,
    removePaiement,
    MODES,
  } = useApp();
  const { addToast } = useToast();

  const [recherche, setRecherche] = useState("");
  const [mode, setMode] = useState("tous");
  const [aSupprimer, setASupprimer] = useState(null);

  const lignes = useMemo(
    () =>
      paiements
        .map((p) => {
          const bail = bauxParId.get(p.bailId);
          const lot = bail ? lotsParId.get(bail.lotId) : null;
          const immeuble = lot ? immeublesParId.get(lot.immeubleId) : null;
          return {
            p,
            bail,
            lot,
            immeuble,
            locataire: locatairesParId.get(p.locataireId),
            quittance: quittancesParPaiement.get(p.id),
          };
        })
        .sort((a, b) => b.p.date.localeCompare(a.p.date)),
    [paiements, bauxParId, lotsParId, immeublesParId, locatairesParId, quittancesParPaiement]
  );

  const filtrees = lignes.filter(({ p, locataire, immeuble }) => {
    if (mode !== "tous" && p.mode !== mode) return false;
    const texte = `${locataire?.nom} ${locataire?.prenoms} ${immeuble?.nom} ${p.reference || ""}`.toLowerCase();
    return !recherche || texte.includes(recherche.toLowerCase());
  });

  const total = filtrees.reduce((s, x) => s + x.p.montant, 0);
  const sansQuittance = lignes.filter((x) => !x.quittance).length;

  const supprimer = () => {
    const res = removePaiement(aSupprimer);
    if (res.ok) {
      addToast("Versement supprimé — les loyers concernés sont à nouveau impayés");
      setASupprimer(null);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Versements</h1>
          <p className="page-subtitle">
            {pluriel(lignes.length, "versement")} · {formatMoney(total)}
            {sansQuittance > 0 && ` · ${sansQuittance} sans quittance`}
          </p>
        </div>
        <Link to="/paiements/nouveau" className="btn btn-primary">
          <Plus size={16} /> Encaisser
        </Link>
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
              placeholder="Rechercher un locataire, une référence…"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
            />
          </div>
          <div style={{ minWidth: 170 }}>
            <Select
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              options={[{ id: "tous", label: "Tous les modes" }].concat(
                MODES.map((m) => ({ id: m.id, label: m.label }))
              )}
            />
          </div>
        </div>
      </Card>

      <Card>
        {filtrees.length === 0 ? (
          <EmptyState
            icon={lignes.length === 0 ? Wallet : Inbox}
            message={
              lignes.length === 0
                ? "Aucun versement enregistré."
                : "Aucun versement ne correspond à cette recherche."
            }
            action={
              lignes.length === 0 && (
                <Link to="/paiements/nouveau" className="btn btn-primary" style={{ marginTop: "0.75rem" }}>
                  <Plus size={16} /> Encaisser un versement
                </Link>
              )
            }
          />
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Locataire</th>
                  <th>Immeuble</th>
                  <th>Périodes couvertes</th>
                  <th>Mode</th>
                  <th className="num">Montant</th>
                  <th>Quittance</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtrees.map(({ p, locataire, immeuble, quittance }) => {
                  // Le libellé de chaque période est figé dans l'allocation :
                  // le loyer peut être supprimé depuis, la quittance, elle, reste.
                  const periodes = (p.allocations || [])
                    .map((a) => {
                      const l = loyers.find((x) => x.id === a.loyerId);
                      return l ? periodeToLabel(l.periode) : null;
                    })
                    .filter(Boolean);
                  return (
                    <tr key={p.id}>
                      <td style={{ whiteSpace: "nowrap" }}>{formatDate(p.date)}</td>
                      <td>
                        <LocataireLink
                          locataire={locataire}
                          id={p.locataireId}
                          avatar
                          avatarSize={26}
                        />
                      </td>
                      <td className="text-muted" style={{ fontSize: "0.83rem" }}>
                        {immeuble ? immeuble.nom : "—"}
                      </td>
                      <td style={{ fontSize: "0.8rem", maxWidth: 170 }}>
                        {periodes.length === 0 ? (
                          <span className="text-muted">—</span>
                        ) : periodes.length === 1 ? (
                          periodes[0]
                        ) : (
                          <span title={periodes.join(", ")}>
                            {periodes[0]} <span className="text-muted">+{periodes.length - 1}</span>
                          </span>
                        )}
                      </td>
                      <td>
                        <Badge classe="badge-neutral">{MODES.find((m) => m.id === p.mode)?.label || p.mode}</Badge>
                      </td>
                      <td className="num" style={{ fontWeight: 700 }}>
                        {formatMoney(p.montant)}
                      </td>
                      <td>
                        {quittance ? (
                          <Link to={`/quittances/${quittance.id}`} className="btn btn-small btn-ghost" title={quittance.numero}>
                            <Receipt size={14} /> Voir
                          </Link>
                        ) : (
                          <span className="text-muted" style={{ fontSize: "0.78rem" }}>
                            —
                          </span>
                        )}
                      </td>
                      <td className="actions">
                        <button
                          type="button"
                          className="btn btn-small btn-danger"
                          onClick={() => setASupprimer(p.id)}
                          aria-label="Supprimer ce versement"
                          title="Supprimer le versement"
                        >
                          <FileText size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {aSupprimer && (
        <ConfirmDialog
          title="Supprimer le versement"
          message="Le versement et sa quittance seront supprimés. Les loyers concernés redeviendront impayés, et la dette sera à nouveau Due. Action irréversible."
          confirmLabel="Supprimer"
          onConfirm={supprimer}
          onCancel={() => setASupprimer(null)}
        />
      )}
    </div>
  );
}
