// Journal mensuel : ce qui est entré et sorti chaque mois.
//
// C'est l'écran qui remplace le cahier de recettes. On y retrouve les versements
// et les dépenses d'une période, avec le solde correspondant.

import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Wallet,
  TrendingDown,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Info,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { useToast } from "../context/ToastContext";
import { Card, EmptyState, Badge, Select } from "../components/ui";
import {
  formatMoney,
  formatDate,
  periodeToLabel,
  periodeCourante,
  periodeDecalee,
  pluriel,
} from "../utils/format";

export default function Journal() {
  const {
    journalPeriode,
    bauxParId,
    lotsParId,
    immeublesParId,
    locatairesParId,
    CATEGORIES,
    MODES,
    serieMensuelle,
    genererPeriode,
  } = useApp();
  const { addToast } = useToast();

  const [periode, setPeriode] = useState(periodeCourante);

  const journal = useMemo(() => journalPeriode(periode), [journalPeriode, periode]);
  // Deux ans d'historique pour le sélecteur de période, et six mois pour
  // le tableau de tendance. Les séries se recalculent à chaque écriture.
  const periodes = useMemo(
    () => serieMensuelle(24).map((s) => s.periode).reverse(),
    [serieMensuelle]
  );
  const serie = useMemo(() => serieMensuelle(6).reverse(), [serieMensuelle]);

  // Versements de la période, enrichis du nom du locataire et de l'immeuble.
  const recettes = useMemo(
    () =>
      journal.recettes
        .map((p) => {
          const bail = bauxParId.get(p.bailId);
          const lot = bail ? lotsParId.get(bail.lotId) : null;
          return {
            ...p,
            locataire: locatairesParId.get(p.locataireId),
            immeuble: lot ? immeublesParId.get(lot.immeubleId) : null,
          };
        })
        .sort((a, b) => b.date.localeCompare(a.date)),
    [journal.recettes, bauxParId, lotsParId, immeublesParId, locatairesParId]
  );

  const couts = useMemo(
    () =>
      journal.depenses
        .map((d) => ({ ...d, immeuble: immeublesParId.get(d.immeubleId) }))
        .sort((a, b) => b.date.localeCompare(a.date)),
    [journal.depenses, immeublesParId]
  );

  // Génération des loyers du mois : l'action mensuelle du propriétaire.
  const generer = () => {
    const res = genererPeriode(periode);
    if (!res.ok) return;
    addToast(
      res.resultat > 0
        ? `${res.resultat} loyer${res.resultat > 1 ? "s" : ""} créé${res.resultat > 1 ? "s" : ""} pour ${periodeToLabel(periode)}`
        : `Tout est déjà facturé pour ${periodeToLabel(periode)}`
    );
  };

  const navigation = (delta) => setPeriode((p) => periodeDecalee(p, delta));

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Journal mensuel</h1>
          <p className="page-subtitle">Ce que vous avez encaissé et dépensé, mois par mois.</p>
        </div>
        <div className="row">
          <button type="button" className="btn btn-secondary" onClick={() => navigation(-1)} aria-label="Mois précédent">
            <ChevronLeft size={16} />
          </button>
          <Select
            value={periode}
            onChange={(e) => setPeriode(e.target.value)}
            options={periodes.map((p) => ({ id: p, label: periodeToLabel(p) }))}
          />
          <button type="button" className="btn btn-secondary" onClick={() => navigation(1)} aria-label="Mois suivant">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="grid grid-4" style={{ marginBottom: "1rem" }}>
        <div className="stat-card stat-green">
          <div className="stat-label">Encaissé</div>
          <div className="stat-value" style={{ color: "var(--success)" }}>
            {formatMoney(journal.totalRecettes)}
          </div>
          <div className="stat-hint">
            {pluriel(recettes.length, "versement")}
          </div>
        </div>

        <div className="stat-card stat-red">
          <div className="stat-label">Dépensé</div>
          <div className="stat-value" style={{ color: "var(--danger)" }}>
            {formatMoney(journal.totalCouts)}
          </div>
          <div className="stat-hint">
            {pluriel(couts.length, "dépense")}
          </div>
        </div>

        <div className="stat-card stat-blue">
          <div className="stat-label">Solde du mois</div>
          <div
            className="stat-value"
            style={{ color: journal.solde >= 0 ? "var(--success)" : "var(--danger)" }}
          >
            {formatMoney(journal.solde)}
          </div>
          <div className="stat-hint">{journal.solde >= 0 ? "excédent" : "déficit"}</div>
        </div>

        <div className="stat-card stat-amber">
          <div className="stat-label">Période</div>
          <div className="stat-value" style={{ fontSize: "0.95rem", paddingTop: "0.6rem" }}>
            {periodeToLabel(periode)}
          </div>
          <div className="stat-hint">évolution sur 6 mois</div>
        </div>
      </div>

      {/* Génération des loyers du mois : l'action à faire chaque mois. */}
      <Card
        title="Facturation du mois"
        action={
          <button type="button" className="btn btn-secondary" onClick={generer}>
            <Sparkles size={14} /> Générer les loyers
          </button>
        }
        style={{ marginBottom: "1rem" }}
      >
        <p className="text-muted" style={{ margin: 0, fontSize: "0.88rem" }}>
          <Info size={14} style={{ verticalAlign: -2, marginRight: 5 }} />
          Cette action crée une échéance pour chaque bail en cours, au montant de son loyer
          mensuel. Vous pouvez la relancer sans risque : les périodes déjà présentes ne sont pas
          dupliquées. Faites-la en début de mois, avant d'enregistrer les versements.
        </p>
      </Card>

      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <Card title={`Versements encaissés — ${periodeToLabel(periode)}`}>
          {recettes.length === 0 ? (
            <EmptyState
              icon={Wallet}
              message="Aucun versement ce mois-ci."
              action={
                <Link to="/paiements/nouveau" className="btn btn-primary" style={{ marginTop: "0.75rem" }}>
                  Enregistrer un versement
                </Link>
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
                    <th>Mode</th>
                    <th className="num">Montant</th>
                  </tr>
                </thead>
                <tbody>
                  {recettes.map((p) => (
                    <tr key={p.id}>
                      <td style={{ whiteSpace: "nowrap" }}>{formatDate(p.date)}</td>
                      <td>
                        <Link to={`/locataires/${p.locataireId}`} style={{ fontWeight: 500 }}>
                          {p.locataire ? `${p.locataire.nom} ${p.locataire.prenoms}` : "—"}
                        </Link>
                      </td>
                      <td className="text-muted" style={{ fontSize: "0.83rem" }}>
                        {p.immeuble ? p.immeuble.nom : "—"}
                      </td>
                      <td>
                        <Badge classe="badge-neutral">
                          {MODES.find((m) => m.id === p.mode)?.label || p.mode}
                        </Badge>
                      </td>
                      <td className="num" style={{ fontWeight: 700, color: "var(--success)" }}>
                        + {formatMoney(p.montant)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: "2px solid var(--border)" }}>
                    <th colSpan={4}>Total encaissé</th>
                    <th className="num" style={{ color: "var(--success)" }}>
                      {formatMoney(journal.totalRecettes)}
                    </th>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Card>

        <div className="stack">
          <Card title={`Dépenses — ${periodeToLabel(periode)}`}>
            {couts.length === 0 ? (
              <EmptyState icon={TrendingDown} message="Aucune dépense ce mois-ci." />
            ) : (
              <div className="table-wrapper">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Libellé</th>
                      <th className="num">Montant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {couts.map((d) => (
                      <tr key={d.id}>
                        <td style={{ whiteSpace: "nowrap" }}>{formatDate(d.date)}</td>
                        <td>
                          <div style={{ fontWeight: 500 }}>{d.note || "—"}</div>
                          <div className="text-muted" style={{ fontSize: "0.78rem" }}>
                            {CATEGORIES.find((c) => c.id === d.categorie)?.label || d.categorie}
                            {d.immeuble ? ` · ${d.immeuble.nom}` : ""}
                          </div>
                        </td>
                        <td className="num" style={{ fontWeight: 700, color: "var(--danger)" }}>
                          − {formatMoney(d.montant)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: "2px solid var(--border)" }}>
                      <th colSpan={2}>Total dépensé</th>
                      <th className="num" style={{ color: "var(--danger)" }}>
                        {formatMoney(journal.totalCouts)}
                      </th>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Card>

          {/* Évolution sur six mois : la tendance plutôt que le détail. */}
          <Card title="Six derniers mois">
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Mois</th>
                    <th className="num">Encaissé</th>
                    <th className="num">Dépensé</th>
                    <th className="num">Solde</th>
                  </tr>
                </thead>
                <tbody>
                  {serie.map((s) => (
                    <tr key={s.periode}>
                      <td>
                        <button
                          type="button"
                          className="btn btn-ghost btn-small"
                          onClick={() => setPeriode(s.periode)}
                          style={{ padding: 0, fontWeight: s.periode === periode ? 700 : 400 }}
                        >
                          {periodeToLabel(s.periode)}
                        </button>
                      </td>
                      <td className="num" style={{ color: "var(--success)" }}>
                        {s.recettes ? formatMoney(s.recettes) : "—"}
                      </td>
                      <td className="num" style={{ color: "var(--danger)" }}>
                        {s.depenses ? formatMoney(s.depenses) : "—"}
                      </td>
                      <td
                        className="num"
                        style={{ fontWeight: 700, color: s.solde >= 0 ? "var(--success)" : "var(--danger)" }}
                      >
                        {formatMoney(s.solde)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}