// Tableau de bord : l'état de la gestion en un coup d'œil.

import { Link } from "react-router-dom";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  Building2,
  AlertTriangle,
  Wallet,
  ArrowRight,
  Inbox,
  Plus,
  CheckCircle2,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { Card, EmptyState, ProgressBar } from "../components/ui";
import {
  formatMoney,
  formatNumber,
  formatDate,
  periodeToLabel,
  periodeCourante,
} from "../utils/format";

const TOOLTIP = {
  background: "var(--card-bg)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: "0.82rem",
};

export default function Dashboard() {
  const {
    paiements,
    impayesGlobaux,
    cautionTotale,
    tauxOccupation,
    serieMensuelle,
    bilanImmeuble,
    solvable,
    locatairesParId,
    immeubles,
  } = useApp();

  const serie = serieMensuelle(12).map((s) => ({
    ...s,
    mois: periodeToLabel(s.periode).replace(" 20", " "),
  }));

  const moisCourant = periodeCourante();
  const recettesMois = paiements
    .filter((p) => p.date.slice(0, 7) === moisCourant)
    .reduce((s, p) => s + p.montant, 0);

  const impayes = impayesGlobaux();
  const detteTotale = impayes.reduce((s, x) => s + x.solde, 0);
  const taux = tauxOccupation();

  // Répartition des comptes : à jour contre endettés.
  const repartition = [
    { name: "À jour", value: Math.max(0, solvable().length) },
    { name: "Endettés", value: impayes.length },
  ].filter((r) => r.value > 0);
  const COULEURS = ["#10B981", "#EF4444"];

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
      label: "Cautions held",
      valeur: formatMoney(cautionTotale()),
      hint: "dépôt de garantie",
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
            Vue d'ensemble de votre gestion locative — {periodeToLabel(moisCourant)}
          </p>
        </div>
        <Link to="/paiements/nouveau" className="btn btn-primary">
          <Plus size={16} /> Encaisser un versement
        </Link>
      </div>

      <div className="grid grid-4" style={{ marginBottom: "1rem" }}>
        {stats.map((s) => {
          return (
            <div key={s.label} className={`stat-card stat-${s.couleur}`}>
              <div className="stat-label">{s.label}</div>
              <div className="stat-value">{s.valeur}</div>
              <div className="stat-hint">{s.hint}</div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-2" style={{ marginBottom: "1rem" }}>
        <Card title="Recettes et dépenses sur 12 mois">
          {serie.every((s) => s.recettes === 0 && s.depenses === 0) ? (
            <EmptyState message="Pas encore d'historique." />
          ) : (
            <div className="chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={serie}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="mois" tick={{ fontSize: 11 }} stroke="var(--text-muted)" interval={0} angle={-35} textAnchor="end" height={52} />
                  <YAxis tick={{ fontSize: 11 }} stroke="var(--text-muted)" tickFormatter={formatNumber} width={62} />
                  <Tooltip contentStyle={TOOLTIP} formatter={(v) => formatMoney(v)} />
                  <Legend wrapperStyle={{ fontSize: "0.8rem" }} />
                  <Bar dataKey="recettes" name="Recettes" fill="#0152BD" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="depenses" name="Dépenses" fill="#B91C1C" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card title="Situation des comptes">
          {repartition.length === 0 ? (
            <EmptyState message="Aucun locataire enregistré." />
          ) : (
            <div style={{ display: "grid", gap: "1rem" }}>
              <div className="chart-container" style={{ height: 190 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={repartition}
                      dataKey="value"
                      innerRadius={52}
                      outerRadius={78}
                      paddingAngle={4}
                      label={({ name, value }) => `${name} : ${value}`}
                      fontSize={12}
                    >
                      {repartition.map((entry, i) => (
                        <Cell key={i} fill={COULEURS[i % COULEURS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={TOOLTIP} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ProgressBar
                valeur={taux * 100}
                label="Taux d'occupation des lots"
                couleur="var(--success)"
              />
            </div>
          )}
        </Card>
      </div>

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
                        <Link to={`/locataires/${x.bail.locataireId}`} style={{ fontWeight: 600 }}>
                          {x.locataire ? `${x.locataire.nom} ${x.locataire.prenoms}` : "—"}
                        </Link>
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
                          className="btn btn-small btn-primary"
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
                        <td>{loc ? `${loc.nom} ${loc.prenoms}` : "—"}</td>
                        <td className="num" style={{ fontWeight: 600 }}>
                          {formatMoney(p.montant)}
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

      {bilans.length > 0 && (
        <Card title="Résultat par immeuble" style={{ marginTop: "1rem" }}>
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
        </Card>
      )}
    </div>
  );
}