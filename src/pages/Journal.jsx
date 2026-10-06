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
  Building2,
  FileSpreadsheet,
  Download,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { useToast } from "../context/ToastContext";
import { Card, EmptyState, Badge, Select, Modal, LocataireLink } from "../components/ui";
import {
  formatMoney,
  formatDate,
  periodeToLabel,
  periodeCourante,
  periodeDecalee,
  pluriel,
} from "../utils/format";
import {
  exporterOperationsExcel,
  exporterOperationsAnnuellesExcel,
} from "../utils/exportExcel.js";

export default function Journal() {
  const {
    journalPeriode,
    bauxParId,
    lotsParId,
    immeubles,
    immeublesParId,
    locatairesParId,
    loyersParId,
    proprietaire,
    paiements,
    depenses,
    CATEGORIES,
    MODES,
    serieMensuelle,
    genererPeriode,
  } = useApp();
  const { addToast } = useToast();

  const [periode, setPeriode] = useState(periodeCourante);
  const [immeubleId, setImmeubleId] = useState("tous");
  const [modaleExport, setModaleExport] = useState(false);
  const [exportPeriodeType, setExportPeriodeType] = useState("mois");
  const [exportImmeubleId, setExportImmeubleId] = useState("tous");
  const [exportMois, setExportMois] = useState(periodeCourante);
  const [exportAnnee, setExportAnnee] = useState(() => periodeCourante().slice(0, 4));

  const journal = useMemo(() => journalPeriode(periode), [journalPeriode, periode]);
  // Deux ans d'historique pour le sélecteur de période, et six mois pour
  // le tableau de tendance. Les séries se recalculent à chaque écriture.
  const periodes = useMemo(
    () => serieMensuelle(24).map((s) => s.periode).reverse(),
    [serieMensuelle]
  );
  const serie = useMemo(() => serieMensuelle(6).reverse(), [serieMensuelle]);

  // Options pour le filtre de maison / immeuble
  const optionsImmeubles = useMemo(
    () => [
      { id: "tous", label: "Toutes les maisons" },
      ...immeubles.map((i) => ({ id: i.id, label: i.nom })),
    ],
    [immeubles]
  );

  const immeubleActif = useMemo(
    () => (immeubleId !== "tous" ? immeublesParId.get(immeubleId) || null : null),
    [immeubleId, immeublesParId]
  );

  // Versements de la période, enrichis du nom du locataire et de l'immeuble.
  const toutesRecettes = useMemo(
    () =>
      journal.recettes
        .map((p) => {
          const bail = bauxParId.get(p.bailId);
          const lot = bail ? lotsParId.get(bail.lotId) : null;
          return {
            ...p,
            lot,
            locataire: locatairesParId.get(p.locataireId),
            immeuble: lot ? immeublesParId.get(lot.immeubleId) : null,
          };
        })
        .sort((a, b) => b.date.localeCompare(a.date)),
    [journal.recettes, bauxParId, lotsParId, immeublesParId, locatairesParId]
  );

  // Dépenses de la période, enrichies de l'immeuble.
  const toutesDepenses = useMemo(
    () =>
      journal.depenses
        .map((d) => ({ ...d, immeuble: immeublesParId.get(d.immeubleId) }))
        .sort((a, b) => b.date.localeCompare(a.date)),
    [journal.depenses, immeublesParId]
  );

  // Recettes et dépenses filtrées selon la maison / immeuble sélectionné
  const recettes = useMemo(() => {
    if (immeubleId === "tous") return toutesRecettes;
    return toutesRecettes.filter((r) => r.immeuble?.id === immeubleId);
  }, [toutesRecettes, immeubleId]);

  const couts = useMemo(() => {
    if (immeubleId === "tous") return toutesDepenses;
    return toutesDepenses.filter((d) => d.immeubleId === immeubleId);
  }, [toutesDepenses, immeubleId]);

  const totalRecettesFiltrees = useMemo(
    () => recettes.reduce((s, r) => s + (Number(r.montant) || 0), 0),
    [recettes]
  );

  const totalCoutsFiltres = useMemo(
    () => couts.reduce((s, d) => s + (Number(d.montant) || 0), 0),
    [couts]
  );

  const soldeFiltre = totalRecettesFiltrees - totalCoutsFiltres;

  // Téléchargement direct en Excel selon les filtres affichés
  const telechargerExcelVueActuelle = () => {
    try {
      const nomFichier = exporterOperationsExcel({
        periode,
        immeuble: immeubleActif,
        recettes,
        depenses: couts,
        proprietaire,
        modes: MODES,
        categories: CATEGORIES,
        loyersParId,
      });
      addToast(`Fichier Excel téléchargé : ${nomFichier}`);
    } catch (e) {
      console.error(e);
      addToast("Erreur lors de la génération du fichier Excel.", "danger");
    }
  };

  // Téléchargement personnalisé depuis la modale
  const executerExportModale = () => {
    try {
      const immObj = exportImmeubleId !== "tous" ? immeublesParId.get(exportImmeubleId) : null;

      if (exportPeriodeType === "annee") {
        const nomFichier = exporterOperationsAnnuellesExcel({
          annee: exportAnnee,
          immeuble: immObj,
          tousPaiements: paiements,
          toutesDepenses: depenses,
          lotsParId,
          bauxParId,
          locatairesParId,
          immeublesParId,
          loyersParId,
          proprietaire,
          modes: MODES,
          categories: CATEGORIES,
        });
        addToast(`Bilan annuel Excel téléchargé : ${nomFichier}`);
      } else {
        const periodeCible = exportMois || periode;
        const j = journalPeriode(periodeCible);
        const rec = j.recettes
          .map((p) => {
            const bail = bauxParId.get(p.bailId);
            const lot = bail ? lotsParId.get(bail.lotId) : null;
            return {
              ...p,
              lot,
              locataire: locatairesParId.get(p.locataireId),
              immeuble: lot ? immeublesParId.get(lot.immeubleId) : null,
            };
          })
          .filter((r) => (exportImmeubleId === "tous" ? true : r.immeuble?.id === exportImmeubleId))
          .sort((a, b) => b.date.localeCompare(a.date));

        const dep = j.depenses
          .map((d) => ({ ...d, immeuble: immeublesParId.get(d.immeubleId) }))
          .filter((d) => (exportImmeubleId === "tous" ? true : d.immeubleId === exportImmeubleId))
          .sort((a, b) => b.date.localeCompare(a.date));

        const nomFichier = exporterOperationsExcel({
          periode: periodeCible,
          immeuble: immObj,
          recettes: rec,
          depenses: dep,
          proprietaire,
          modes: MODES,
          categories: CATEGORIES,
          loyersParId,
        });
        addToast(`Fichier Excel téléchargé : ${nomFichier}`);
      }
      setModaleExport(false);
    } catch (e) {
      console.error(e);
      addToast("Erreur lors de la génération du fichier Excel.", "danger");
    }
  };

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
      <div className="page-header" style={{ alignItems: "flex-start", gap: "1rem" }}>
        <div>
          <h1 className="page-title">Journal mensuel</h1>
          <p className="page-subtitle">Ce que vous avez encaissé et dépensé, mois par mois et par maison.</p>
        </div>
        <div className="row" style={{ gap: "0.55rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
          {/* Sélecteur de période / mois */}
          <div className="row" style={{ flexWrap: "nowrap" }}>
            <button type="button" className="btn btn-secondary" onClick={() => navigation(-1)} aria-label="Mois précédent">
              <ChevronLeft size={16} />
            </button>
            <Select
              value={periode}
              onChange={(e) => setPeriode(e.target.value)}
              options={periodes.map((p) => ({ id: p, label: periodeToLabel(p) }))}
              style={{ width: "auto", minWidth: 160 }}
            />
            <button type="button" className="btn btn-secondary" onClick={() => navigation(1)} aria-label="Mois suivant">
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Sélecteur de maison / immeuble */}
          <Select
            value={immeubleId}
            onChange={(e) => setImmeubleId(e.target.value)}
            options={optionsImmeubles}
            style={{ width: "auto", minWidth: 175 }}
          />

          {/* Bouton Téléchargement Excel */}
          <div className="btn-group">
            <button
              type="button"
              className="btn btn-primary"
              onClick={telechargerExcelVueActuelle}
              title={`Télécharger les opérations en Excel (.xlsx) pour ${immeubleActif ? immeubleActif.nom : "Toutes les maisons"} (${periodeToLabel(periode)})`}
              style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem", whiteSpace: "nowrap" }}
            >
              <FileSpreadsheet size={16} />
              <span>Télécharger Excel</span>
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setExportImmeubleId(immeubleId);
                setExportMois(periode);
                setModaleExport(true);
              }}
              title="Options d'exportation avancées"
              style={{ padding: "0 0.6rem" }}
              aria-label="Plus d'options d'export"
            >
              ▾
            </button>
          </div>
        </div>
      </div>

      {/* Bannière active si filtre par maison */}
      {immeubleActif && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0.55rem 0.95rem",
            background: "var(--primary-bg)",
            border: "1px solid var(--primary-border)",
            borderRadius: "var(--radius-sm)",
            marginBottom: "1rem",
            fontSize: "0.86rem",
            color: "var(--primary)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Building2 size={16} />
            <span>
              Filtré sur la maison : <strong>{immeubleActif.nom}</strong> ({periodeToLabel(periode)})
            </span>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-small"
            onClick={() => setImmeubleId("tous")}
            style={{ color: "var(--primary)", textDecoration: "underline", padding: "0 0.4rem" }}
          >
            Afficher toutes les maisons
          </button>
        </div>
      )}

      <div className="grid grid-4" style={{ marginBottom: "1.25rem" }}>
        <div className="stat-card stat-green">
          <div className="stat-header">
            <span className="stat-label">Encaissé</span>
            <div className="stat-icon-wrapper">
              <Wallet size={18} />
            </div>
          </div>
          <div className="stat-value" style={{ color: "var(--success)" }}>
            {formatMoney(totalRecettesFiltrees)}
          </div>
          <div className="stat-hint">
            {pluriel(recettes.length, "versement")}
          </div>
        </div>

        <div className="stat-card stat-red">
          <div className="stat-header">
            <span className="stat-label">Dépensé</span>
            <div className="stat-icon-wrapper">
              <TrendingDown size={18} />
            </div>
          </div>
          <div className="stat-value" style={{ color: "var(--danger)" }}>
            {formatMoney(totalCoutsFiltres)}
          </div>
          <div className="stat-hint">
            {pluriel(couts.length, "dépense")}
          </div>
        </div>

        <div className="stat-card stat-blue">
          <div className="stat-header">
            <span className="stat-label">Solde net</span>
            <div className="stat-icon-wrapper">
              <Sparkles size={18} />
            </div>
          </div>
          <div
            className="stat-value"
            style={{ color: soldeFiltre >= 0 ? "var(--success)" : "var(--danger)" }}
          >
            {formatMoney(soldeFiltre)}
          </div>
          <div className="stat-hint">{soldeFiltre >= 0 ? "excédent" : "déficit"}</div>
        </div>

        <div className="stat-card stat-amber">
          <div className="stat-header">
            <span className="stat-label">Périmètre</span>
            <div className="stat-icon-wrapper">
              <Building2 size={18} />
            </div>
          </div>
          <div className="stat-value" style={{ fontSize: "1.05rem", paddingTop: "0.2rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={immeubleActif ? immeubleActif.nom : "Toutes les maisons"}>
            {immeubleActif ? immeubleActif.nom : "Toutes les maisons"}
          </div>
          <div className="stat-hint">{periodeToLabel(periode)}</div>
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
        <Card
          title={`Versements encaissés — ${immeubleActif ? immeubleActif.nom : "Toutes les maisons"} (${periodeToLabel(periode)})`}
          action={
            recettes.length > 0 && (
              <button
                type="button"
                className="btn btn-ghost btn-small"
                onClick={telechargerExcelVueActuelle}
                title="Exporter ces versements en Excel"
              >
                <FileSpreadsheet size={14} /> Excel
              </button>
            )
          }
        >
          {recettes.length === 0 ? (
            <EmptyState
              icon={Wallet}
              message={
                immeubleActif
                  ? `Aucun versement ce mois-ci pour ${immeubleActif.nom}.`
                  : "Aucun versement ce mois-ci."
              }
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
                        <LocataireLink
                          locataire={p.locataire}
                          id={p.locataireId}
                          avatar
                          avatarSize={26}
                        />
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
                      {formatMoney(totalRecettesFiltrees)}
                    </th>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Card>

        <div className="stack">
          <Card
            title={`Dépenses — ${immeubleActif ? immeubleActif.nom : "Toutes les maisons"} (${periodeToLabel(periode)})`}
            action={
              couts.length > 0 && (
                <button
                  type="button"
                  className="btn btn-ghost btn-small"
                  onClick={telechargerExcelVueActuelle}
                  title="Exporter ces dépenses en Excel"
                >
                  <FileSpreadsheet size={14} /> Excel
                </button>
              )
            }
          >
            {couts.length === 0 ? (
              <EmptyState
                icon={TrendingDown}
                message={
                  immeubleActif
                    ? `Aucune dépense ce mois-ci pour ${immeubleActif.nom}.`
                    : "Aucune dépense ce mois-ci."
                }
              />
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
                        {formatMoney(totalCoutsFiltres)}
                      </th>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Card>

          {/* Évolution sur six mois */}
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

      {/* Modale d'exportation Excel avancée */}
      {modaleExport && (
        <Modal
          title="Télécharger le fichier Excel (.xlsx)"
          onClose={() => setModaleExport(false)}
          width={540}
          footer={
            <div className="row" style={{ justifyContent: "flex-end", gap: "0.5rem" }}>
              <button type="button" className="btn btn-secondary" onClick={() => setModaleExport(false)}>
                Annuler
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={executerExportModale}
                style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem" }}
              >
                <Download size={15} /> Télécharger (.xlsx)
              </button>
            </div>
          }
        >
          <div className="stack" style={{ gap: "1rem" }}>
            <p className="text-muted" style={{ margin: 0, fontSize: "0.88rem" }}>
              Choisissez le périmètre et la période d'exportation. Le fichier comportera 4 onglets :
              <strong> Journal consolidé</strong>, <strong>Recettes</strong>, <strong>Dépenses</strong> et <strong>Synthèse</strong>.
            </p>

            <div>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                Maison / Immeuble concerné :
              </label>
              <Select
                value={exportImmeubleId}
                onChange={(e) => setExportImmeubleId(e.target.value)}
                options={optionsImmeubles}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                Période à exporter :
              </label>
              <div className="row" style={{ gap: "1rem", marginBottom: "0.5rem" }}>
                <label className="row" style={{ gap: "0.4rem", cursor: "pointer", fontSize: "0.88rem" }}>
                  <input
                    type="radio"
                    name="exportType"
                    checked={exportPeriodeType === "mois"}
                    onChange={() => setExportPeriodeType("mois")}
                  />
                  Par mois
                </label>
                <label className="row" style={{ gap: "0.4rem", cursor: "pointer", fontSize: "0.88rem" }}>
                  <input
                    type="radio"
                    name="exportType"
                    checked={exportPeriodeType === "annee"}
                    onChange={() => setExportPeriodeType("annee")}
                  />
                  Année complète ({exportAnnee})
                </label>
              </div>

              {exportPeriodeType === "mois" && (
                <div style={{ marginTop: "0.5rem" }}>
                  <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>
                    Mois :
                  </label>
                  <Select
                    value={exportMois}
                    onChange={(e) => setExportMois(e.target.value)}
                    options={periodes.map((p) => ({ id: p, label: periodeToLabel(p) }))}
                    style={{ width: "100%" }}
                  />
                </div>
              )}

              {exportPeriodeType === "annee" && (
                <div style={{ marginTop: "0.5rem" }}>
                  <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>
                    Année :
                  </label>
                  <Select
                    value={exportAnnee}
                    onChange={(e) => setExportAnnee(e.target.value)}
                    options={[
                      { id: "2026", label: "2026 (Année courante)" },
                      { id: "2025", label: "2025" },
                      { id: "2024", label: "2024" },
                    ]}
                    style={{ width: "100%" }}
                  />
                </div>
              )}
            </div>

            <div
              style={{
                background: "var(--bg-subtle)",
                padding: "0.75rem",
                borderRadius: "var(--radius-sm)",
                fontSize: "0.82rem",
                color: "var(--text-muted)",
              }}
            >
              Fichier généré : format natif <strong>Microsoft Excel (.xlsx)</strong> avec calculs,
              colonnes ajustées et en-tête institutionnel CAG.
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}