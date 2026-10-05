import { Link } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { formatMoney } from "../utils/format";
import {
  Users,
  TrendingUp,
  AlertTriangle,
  UserCheck,
  ArrowRight,
  Inbox,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

export default function Dashboard() {
  const { tenants, payments, getBalance } = useApp();

  const totalDette = tenants.reduce((s, t) => s + Math.max(0, getBalance(t.id)), 0);
  const totalEncaisse = payments.reduce((s, p) => s + p.montantPaye, 0);
  const locatairesEndettes = tenants.filter((t) => getBalance(t.id) > 0).length;
  const locatairesAJour = tenants.length - locatairesEndettes;

  const derniersPaiements = [...payments].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);

  // Données pour le graphique d'évolution des paiements
  const paymentsByMonth = payments.reduce((acc, p) => {
    const month = p.date.slice(0, 7);
    acc[month] = (acc[month] || 0) + p.montantPaye;
    return acc;
  }, {});
  const chartData = Object.entries(paymentsByMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, total]) => ({ month, total }));

  // Données pour le pie chart
  const pieData = [
    { name: "À jour", value: locatairesAJour },
    { name: "Endettés", value: locatairesEndettes },
  ];
  const COLORS = ["#10b981", "#ef4444"];

  const stats = [
    { label: "Locataires", value: tenants.length, icon: Users, color: "blue" },
    { label: "Total encaissé", value: formatMoney(totalEncaisse), icon: TrendingUp, color: "green" },
    { label: "Dette totale", value: formatMoney(totalDette), icon: AlertTriangle, color: "red" },
    { label: "Comptes à jour", value: locatairesAJour, icon: UserCheck, color: "orange" },
  ];

  return (
    <div>
      <h1 className="page-title">Tableau de bord</h1>
      <p className="text-muted" style={{ marginBottom: "1.5rem" }}>
        Vue d'ensemble de votre gestion locative
      </p>

      <div className="stats-grid">
        {stats.map((s) => (
          <div key={s.label} className={`stat-card stat-${s.color}`}>
            <div className="stat-icon">
              <s.icon size={20} />
            </div>
            <div className="stat-value">{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="dashboard-sections">
        {/* Graphique d'évolution */}
        <section className="card">
          <div className="card-header">
            <h2 className="card-title" style={{ margin: 0 }}>Évolution des paiements</h2>
          </div>
          {chartData.length === 0 ? (
            <div className="empty-state">
              <Inbox className="empty-icon" size={24} />
              <p>Aucune donnée à afficher</p>
            </div>
          ) : (
            <div className="chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="var(--text-muted)" />
                  <YAxis tick={{ fontSize: 12 }} stroke="var(--text-muted)" />
                  <Tooltip
                    contentStyle={{
                      background: "var(--card-bg)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      color: "var(--text)",
                    }}
                    formatter={(value) => formatMoney(value)}
                  />
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke="#6366f1"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorTotal)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        {/* Pie chart */}
        <section className="card">
          <div className="card-header">
            <h2 className="card-title" style={{ margin: 0 }}>Répartition des comptes</h2>
          </div>
          {tenants.length === 0 ? (
            <div className="empty-state">
              <Inbox className="empty-icon" size={24} />
              <p>Aucun locataire enregistré</p>
            </div>
          ) : (
            <div className="chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={4}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "var(--card-bg)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      color: "var(--text)",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      </div>

      {/* Derniers paiements */}
      <section className="card">
        <div className="card-header">
          <h2 className="card-title" style={{ margin: 0 }}>Derniers paiements</h2>
          <Link to="/quittances" className="btn btn-small btn-secondary">
            Voir tout <ArrowRight size={14} />
          </Link>
        </div>
        {derniersPaiements.length === 0 ? (
          <div className="empty-state">
            <Inbox className="empty-icon" size={24} />
            <p>Aucun paiement enregistré</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Locataire</th>
                  <th>Période</th>
                  <th className="text-right">Montant</th>
                </tr>
              </thead>
              <tbody>
                {derniersPaiements.map((p) => {
                  const tenant = tenants.find((t) => t.id === p.tenantId);
                  return (
                    <tr key={p.id}>
                      <td>{p.date}</td>
                      <td>{tenant ? `${tenant.nom} ${tenant.prenoms}` : "—"}</td>
                      <td>{p.periode}</td>
                      <td className="text-right">{formatMoney(p.montantPaye)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
