// Tableau de bord : l'état de la gestion en un coup d'œil.
// Conçu pour un pilotage financier clair, épuré et moderne.

import { useState } from "react";
import { Link } from "react-router-dom";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Building2,
  AlertTriangle,
  Wallet,
  ArrowRight,
  Inbox,
  Plus,
  CheckCircle2,
  TrendingUp,
  RotateCw,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { Card, EmptyState, Avatar, LocataireLink } from "../components/ui";
import {
  formatMoney,
  formatDate,
  periodeToLabel,
  periodeCourante,
  MOIS_COURTS,
  pluriel,
} from "../utils/format";

// Tooltip sur-mesure pour la courbe financière
function CustomChartTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0].payload;
  return (
    <div className="chart-custom-tooltip">
      <div className="tooltip-header">{data.moisComplet}</div>
      <div className="tooltip-row">
        <span className="tooltip-dot" style={{ background: "#0152BD" }} />
        <span className="tooltip-label">Recettes</span>
        <span className="tooltip-val">{formatMoney(data.recettes)}</span>
      </div>
      <div className="tooltip-row">
        <span className="tooltip-dot" style={{ background: "#EF4444" }} />
        <span className="tooltip-label">Dépenses</span>
        <span className="tooltip-val">{formatMoney(data.depenses)}</span>
      </div>
      <div className="tooltip-divider" />
      <div className="tooltip-row">
        <span
          className="tooltip-dot"
          style={{ background: data.solde >= 0 ? "#10B981" : "#EF4444" }}
        />
        <span className="tooltip-label" style={{ fontWeight: 600 }}>
          Trésorerie nette
        </span>
        <span
          className="tooltip-val"
          style={{
            fontWeight: 700,
            color: data.solde >= 0 ? "var(--success)" : "var(--danger)",
          }}
        >
          {formatMoney(data.solde)}
        </span>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const {
    paiements,
    impayesGlobaux,
    cautionTotale,
    tauxOccupation,
    serieMensuelle,
    bilanImmeuble,
    locatairesParId,
    immeubles,
  } = useApp();

  const [onglet, setOnglet] = useState("vue");
  const [vueCourbe, setVueCourbe] = useState("recettes"); // "recettes" | "flux" | "solde"
  const [chartKey, setChartKey] = useState(0);

  const serie12 = serieMensuelle(12);
  const serie = serie12.map((s) => {
    const m = String(s.periode).match(/^(\d{4})-(\d{2})$/);
    const monthIdx = m ? Number(m[2]) - 1 : 0;
    const yearShort = m ? m[1].slice(2) : "";
    const court = MOIS_COURTS[monthIdx] || s.periode;
    return {
      ...s,
      moisCourt: `${court} '${yearShort}`,
      moisComplet: periodeToLabel(s.periode),
    };
  });

  const totalRecettes12 = serie.reduce((sum, s) => sum + s.recettes, 0);
  const moyenneMensuelle = Math.round(totalRecettes12 / (serie.length || 1));

  const moisRecord = [...serie].sort((a, b) => b.recettes - a.recettes)[0];
  const moisActifs = serie.filter((s) => s.recettes > 0).length;
  const regularite = Math.round((moisActifs / (serie.length || 1)) * 100);

  const moisCourant = periodeCourante();
  const recettesMois = paiements
    .filter((p) => p.date.slice(0, 7) === moisCourant)
    .reduce((s, p) => s + p.montant, 0);

  const impayes = impayesGlobaux();
  const detteTotale = impayes.reduce((s, x) => s + x.solde, 0);
  const taux = tauxOccupation();

  const derniersPaiements = [...paiements]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 6);

  const bilans = immeubles.map((i) => ({ ...i, bilan: bilanImmeuble(i.id) }));

  const stats = [
    {
      label: "Ce mois-ci",
      valeur: formatMoney(recettesMois),
      hint: periodeToLabel(moisCourant),
      icon: Wallet,
      couleur: "blue",
    },
    {
      label: "Dette totale",
      valeur: formatMoney(detteTotale),
      hint: `${impayes.length} locataire${impayes.length > 1 ? "s" : ""} en impayé`,
      icon: AlertTriangle,
      couleur: "red",
    },
    {
      label: "Occupation",
      valeur: `${Math.round(taux * 100)} %`,
      hint: "des lots sont loués",
      icon: Building2,
      couleur: "cyan",
    },
    {
      label: "Dépôts de garantie",
      valeur: formatMoney(cautionTotale()),
      hint: "cautions en réserve",
      icon: CheckCircle2,
      couleur: "green",
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Tableau de bord</h1>
          <p className="page-subtitle">
            Synthèse de votre gestion locative · {periodeToLabel(moisCourant)}
          </p>
        </div>
        <Link to="/paiements/nouveau" className="btn btn-primary">
          <Plus size={16} /> Encaisser un versement
        </Link>
      </div>

      <div className="grid grid-4" style={{ marginBottom: "1.5rem" }}>
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className={`stat-card stat-${s.couleur}`}>
              <div className="stat-header">
                <span className="stat-label">{s.label}</span>
                <div className="stat-icon-wrapper">
                  <Icon size={18} />
                </div>
              </div>
              <div className="stat-value">{s.valeur}</div>
              <div className="stat-hint">{s.hint}</div>
            </div>
          );
        })}
      </div>

      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", flexWrap: "wrap", gap: "0.75rem" }}>
        <div className="tab-pills">
          <button
            type="button"
            className={`tab-pill ${onglet === "vue" ? "active" : ""}`}
            onClick={() => setOnglet("vue")}
          >
            Vue générale
          </button>
          <button
            type="button"
            className={`tab-pill ${onglet === "bilan" ? "active" : ""}`}
            onClick={() => setOnglet("bilan")}
          >
            Bilan par immeuble ({immeubles.length})
          </button>
        </div>
        <div className="text-muted" style={{ fontSize: "0.82rem" }}>
          {pluriel(immeubles.length, "immeuble")} · {Math.round(taux * 100)} % d'occupation
        </div>
      </div>

      {onglet === "vue" && (
        <div key="vue" className="tab-pane-transition">
          {/* Courbe financière experte sur 12 mois */}
          <Card className="chart-card" style={{ marginBottom: "1.5rem" }}>
            <div className="chart-header-container">
              <div>
                <h2 className="card-title" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <TrendingUp size={18} color="var(--primary)" />
                  Évolution des flux de trésorerie sur 12 mois
                </h2>
                <p className="text-muted" style={{ fontSize: "0.8rem", margin: "0.15rem 0 0" }}>
                  Suivi mensuel des encaissements et rentabilité locative
                </p>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <div className="chart-segmented-control">
                  <button
                    type="button"
                    className={`chart-segmented-pill ${vueCourbe === "recettes" ? "active" : ""}`}
                    onClick={() => setVueCourbe("recettes")}
                  >
                    Recettes
                  </button>
                  <button
                    type="button"
                    className={`chart-segmented-pill ${vueCourbe === "flux" ? "active" : ""}`}
                    onClick={() => setVueCourbe("flux")}
                  >
                    Recettes vs Dépenses
                  </button>
                  <button
                    type="button"
                    className={`chart-segmented-pill ${vueCourbe === "solde" ? "active" : ""}`}
                    onClick={() => setVueCourbe("solde")}
                  >
                    Trésorerie nette
                  </button>
                </div>
                <button
                  type="button"
                  className="btn-icon-subtle chart-refresh-btn"
                  onClick={() => setChartKey((k) => k + 1)}
                  title="Rejouer l'animation de la courbe"
                  aria-label="Rejouer l'animation"
                >
                  <RotateCw size={14} />
                </button>
              </div>
            </div>

            {serie.every((s) => s.recettes === 0 && s.depenses === 0) ? (
              <EmptyState message="Pas encore d'historique de versement." />
            ) : (
              <>
                <div className="chart-kpi-strip">
                  <div className="chart-kpi-item">
                    <span className="chart-kpi-label">Total 12 mois</span>
                    <span className="chart-kpi-value">{formatMoney(totalRecettes12)}</span>
                    <span className="chart-kpi-hint">sur 12 périodes</span>
                  </div>
                  <div className="chart-kpi-item">
                    <span className="chart-kpi-label">Moyenne</span>
                    <span className="chart-kpi-value">{formatMoney(moyenneMensuelle)}</span>
                    <span className="chart-kpi-hint">par mois actif</span>
                  </div>
                  <div className="chart-kpi-item">
                    <span className="chart-kpi-label">Mois record</span>
                    <span className="chart-kpi-value">{moisRecord ? formatMoney(moisRecord.recettes) : "—"}</span>
                    <span className="chart-kpi-hint">{moisRecord?.moisComplet || "—"}</span>
                  </div>
                  <div className="chart-kpi-item">
                    <span className="chart-kpi-label">Régularité</span>
                    <span className="chart-kpi-value" style={{ color: "var(--primary)" }}>
                      {regularite} %
                    </span>
                    <span className="chart-kpi-hint">{moisActifs} mois avec rentrées</span>
                  </div>
                </div>

                <div style={{ width: "100%", height: 280 }}>
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart
                      key={`${vueCourbe}-${chartKey}`}
                      data={serie}
                      margin={{ top: 12, right: 12, left: -6, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="gradRecettes" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#0152BD" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#0152BD" stopOpacity={0.01} />
                        </linearGradient>
                        <linearGradient id="gradSolde" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#10B981" stopOpacity={0.22} />
                          <stop offset="95%" stopColor="#10B981" stopOpacity={0.01} />
                        </linearGradient>
                        <linearGradient id="gradDepenses" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#EF4444" stopOpacity={0.18} />
                          <stop offset="95%" stopColor="#EF4444" stopOpacity={0.01} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} opacity={0.6} />
                      <XAxis
                        dataKey="moisCourt"
                        tickLine={false}
                        axisLine={{ stroke: "var(--border)" }}
                        tick={{ fontSize: 11, fill: "var(--text-muted)" }}
                        dy={8}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 11, fill: "var(--text-muted)" }}
                        tickFormatter={(v) => (v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${Math.round(v / 1000)}k` : v)}
                        width={46}
                      />
                      <Tooltip content={<CustomChartTooltip />} />

                      {vueCourbe === "recettes" && (
                        <Area
                          isAnimationActive={true}
                          animationDuration={1200}
                          animationEasing="ease-out"
                          animationBegin={100}
                          type="monotone"
                          dataKey="recettes"
                          name="Recettes"
                          stroke="#0152BD"
                          strokeWidth={3}
                          fill="url(#gradRecettes)"
                          dot={{ r: 3.5, fill: "#0152BD", strokeWidth: 2, stroke: "#FFFFFF" }}
                          activeDot={{ r: 6, stroke: "#FFFFFF", strokeWidth: 3, fill: "#0152BD" }}
                        />
                      )}

                      {vueCourbe === "flux" && (
                        <>
                          <Area
                            isAnimationActive={true}
                            animationDuration={1200}
                            animationEasing="ease-out"
                            animationBegin={100}
                            type="monotone"
                            dataKey="recettes"
                            name="Recettes"
                            stroke="#0152BD"
                            strokeWidth={2.5}
                            fill="url(#gradRecettes)"
                            dot={{ r: 3, fill: "#0152BD", strokeWidth: 1.5, stroke: "#FFFFFF" }}
                            activeDot={{ r: 6, stroke: "#FFFFFF", strokeWidth: 3, fill: "#0152BD" }}
                          />
                          <Area
                            isAnimationActive={true}
                            animationDuration={1200}
                            animationEasing="ease-out"
                            animationBegin={350}
                            type="monotone"
                            dataKey="depenses"
                            name="Dépenses"
                            stroke="#EF4444"
                            strokeWidth={2}
                            strokeDasharray="4 4"
                            fill="url(#gradDepenses)"
                            dot={{ r: 3, fill: "#EF4444", strokeWidth: 1.5, stroke: "#FFFFFF" }}
                            activeDot={{ r: 5, stroke: "#FFFFFF", strokeWidth: 2, fill: "#EF4444" }}
                          />
                        </>
                      )}

                      {vueCourbe === "solde" && (
                        <Area
                          isAnimationActive={true}
                          animationDuration={1200}
                          animationEasing="ease-out"
                          animationBegin={100}
                          type="monotone"
                          dataKey="solde"
                          name="Trésorerie nette"
                          stroke="#10B981"
                          strokeWidth={3}
                          fill="url(#gradSolde)"
                          dot={{ r: 3.5, fill: "#10B981", strokeWidth: 2, stroke: "#FFFFFF" }}
                          activeDot={{ r: 6, stroke: "#FFFFFF", strokeWidth: 3, fill: "#10B981" }}
                        />
                      )}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </Card>

          <div className="grid grid-2">
            <Card
              title="Impayés à relancer"
              action={
                impayes.length > 0 ? (
                  <Link to="/locataires" className="btn btn-small btn-secondary">
                    Tout voir <ArrowRight size={13} />
                  </Link>
                ) : null
              }
            >
              {impayes.length === 0 ? (
                <EmptyState icon={CheckCircle2} message="Tous les locataires sont à jour." />
              ) : (
                <div className="table-wrapper">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Locataire</th>
                        <th>Immeuble</th>
                        <th className="num">Mois</th>
                        <th className="num">Dette</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {impayes.slice(0, 6).map((x) => (
                        <tr key={x.bail.id}>
                          <td>
                            <LocataireLink
                              locataire={x.locataire}
                              id={x.bail.locataireId}
                              avatar
                              avatarSize={28}
                            />
                          </td>
                          <td className="text-muted" style={{ fontSize: "0.83rem" }}>
                            {x.immeuble ? x.immeuble.nom : "—"}
                          </td>
                          <td className="num">{x.mois}</td>
                          <td className="num" style={{ color: "var(--danger)", fontWeight: 700 }}>
                            {formatMoney(x.solde)}
                          </td>
                          <td className="actions">
                            <Link
                              to={`/locataires/${x.bail.locataireId}/paiement`}
                              className="btn btn-small btn-secondary"
                            >
                              Encaisser
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card
              title="Derniers versements"
              action={
                <Link to="/paiements" className="btn btn-small btn-secondary">
                  Tout voir <ArrowRight size={13} />
                </Link>
              }
            >
              {derniersPaiements.length === 0 ? (
                <EmptyState icon={Inbox} message="Aucun versement enregistré." />
              ) : (
                <div className="table-wrapper">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Locataire</th>
                        <th className="num">Montant</th>
                      </tr>
                    </thead>
                    <tbody>
                      {derniersPaiements.map((p) => {
                        const loc = locatairesParId.get(p.locataireId);
                        return (
                          <tr key={p.id}>
                            <td>{formatDate(p.date)}</td>
                            <td>
                              <LocataireLink
                                locataire={loc}
                                id={p.locataireId}
                                avatar
                                avatarSize={28}
                              />
                            </td>
                            <td className="num" style={{ fontWeight: 700, color: "var(--success)" }}>
                              +{formatMoney(p.montant)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {onglet === "bilan" && (
        <div key="bilan" className="tab-pane-transition">
          <Card title="Résultat financier par immeuble">
            {bilans.length === 0 ? (
              <EmptyState icon={Building2} message="Aucun immeuble enregistré." />
            ) : (
              <div className="table-wrapper">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Immeuble</th>
                      <th className="num">Recettes</th>
                      <th className="num">Dépenses</th>
                      <th className="num">Résultat</th>
                      <th className="num">Occupation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bilans.map((b) => (
                      <tr key={b.id}>
                        <td>
                          <Link to={`/immeubles/${b.id}`} style={{ fontWeight: 600 }}>
                            {b.nom}
                          </Link>
                        </td>
                        <td className="num">{formatMoney(b.bilan.recettes)}</td>
                        <td className="num">{formatMoney(b.bilan.depenses)}</td>
                        <td
                          className="num"
                          style={{ fontWeight: 700, color: b.bilan.resultat >= 0 ? "var(--success)" : "var(--danger)" }}
                        >
                          {formatMoney(b.bilan.resultat)}
                        </td>
                        <td className="num">
                          {b.bilan.nbLotsOccupes}/{b.bilan.nbLots}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}