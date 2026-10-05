// Dépenses et charges, par immeuble et par catégorie.

import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Plus, Wrench, Trash2, Search, Building2, TrendingDown, Inbox } from "lucide-react";
import { useApp } from "../../context/AppContext";
import { useToast } from "../../context/ToastContext";
import {
  Card,
  EmptyState,
  Badge,
  Field,
  TextInput,
  Select,
  Modal,
  ConfirmDialog,
  ErrorBanner,
} from "../../components/ui";
import { formatMoney, formatDate, pluriel } from "../../utils/format";

const VIDE = { immeubleId: "", categorie: "entretien", montant: "", date: "", note: "" };

export default function DepenseList() {
  const { depenses, immeubles, CATEGORIES, saveDepense, removeDepense } = useApp();
  const { addToast } = useToast();

  const [form, setForm] = useState(VIDE);
  const [modale, setModale] = useState(false);
  const [erreurs, setErreurs] = useState({});
  const [erreurGlobale, setErreurGlobale] = useState(null);
  const [aSupprimer, setASupprimer] = useState(null);
  const [recherche, setRecherche] = useState("");
  const [filtreImmeuble, setFiltreImmeuble] = useState("tous");
  const [filtreCategorie, setFiltreCategorie] = useState("toutes");

  const lignes = useMemo(
    () =>
      depenses
        .filter((d) => {
          if (filtreImmeuble !== "tous" && d.immeubleId !== filtreImmeuble) return false;
          if (filtreCategorie !== "toutes" && d.categorie !== filtreCategorie) return false;
          if (recherche && !`${d.note}`.toLowerCase().includes(recherche.toLowerCase())) return false;
          return true;
        })
        .sort((a, b) => b.date.localeCompare(a.date)),
    [depenses, filtreImmeuble, filtreCategorie, recherche]
  );

  const total = lignes.reduce((s, d) => s + d.montant, 0);

  // Total par catégorie, pour le tableau récapitulatif.
  const parCategorie = useMemo(() => {
    const map = new Map();
    for (const d of lignes) {
      map.set(d.categorie, (map.get(d.categorie) || 0) + d.montant);
    }
    return [...map.entries()]
      .map(([id, montant]) => ({
        id,
        label: CATEGORIES.find((c) => c.id === id)?.label || id,
        montant,
      }))
      .sort((a, b) => b.montant - a.montant);
  }, [lignes, CATEGORIES]);

  const set = (champ) => (e) => setForm((f) => ({ ...f, [champ]: e.target.value }));

  const valider = () => {
    const e = {};
    if (!form.immeubleId) e.immeubleId = "Choisissez l'immeuble";
    if (!form.date) e.date = "La date est requise";
    if (!form.montant || Number(form.montant) <= 0) e.montant = "Le montant est requis";
    setErreurs(e);
    return Object.keys(e).length === 0;
  };

  const enregistrer = (e) => {
    e.preventDefault();
    if (!valider()) return;
    const res = saveDepense(
      {
        ...form,
        montant: Number(form.montant),
        note: form.note.trim(),
      },
      null
    );
    if (!res.ok) {
      setErreurGlobale(res.erreur);
      return;
    }
    addToast("Dépense enregistrée");
    setForm({ ...VIDE, immeubleId: form.immeubleId, categorie: form.categorie, date: form.date });
    setModale(false);
    setErreurGlobale(null);
  };

  const supprimer = () => {
    const res = removeDepense(aSupprimer);
    if (res.ok) addToast("Dépense supprimée");
    setASupprimer(null);
  };

  if (immeubles.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Building2}
          message="Créez d'abord un immeuble : les dépenses se rattachent toujours à un bien."
          action={
            <Link to="/immeubles/nouveau" className="btn btn-primary" style={{ marginTop: "0.75rem" }}>
              <Plus size={16} /> Créer un immeuble
            </Link>
          }
        />
      </Card>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dépenses</h1>
          <p className="page-subtitle">
            {pluriel(depenses.length, "dépense")} · {formatMoney(total)} sur la sélection
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setModale(true)}>
          <Plus size={16} /> Nouvelle dépense
        </button>
      </div>

      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <div className="stack">
          <Card style={{ padding: "0.85rem 1.25rem" }}>
            <div className="row">
              <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
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
                  placeholder="Rechercher une note…"
                  value={recherche}
                  onChange={(e) => setRecherche(e.target.value)}
                />
              </div>
              <div style={{ minWidth: 160 }}>
                <Select
                  value={filtreImmeuble}
                  onChange={(e) => setFiltreImmeuble(e.target.value)}
                  options={[{ id: "tous", label: "Tous les immeubles" }].concat(
                    immeubles.map((i) => ({ id: i.id, label: i.nom }))
                  )}
                />
              </div>
              <div style={{ minWidth: 170 }}>
                <Select
                  value={filtreCategorie}
                  onChange={(e) => setFiltreCategorie(e.target.value)}
                  options={[{ id: "toutes", label: "Toutes catégories" }].concat(
                    CATEGORIES.map((c) => ({ id: c.id, label: c.label }))
                  )}
                />
              </div>
            </div>
          </Card>

          <Card title="Détail">
            {lignes.length === 0 ? (
              <EmptyState
                icon={depenses.length === 0 ? Wrench : Inbox}
                message={
                  depenses.length === 0
                    ? "Aucune dépense enregistrée. Entretien, réparations, charges : tout ce que coûte un immeuble."
                    : "Aucune dépense ne correspond à ces filtres."
                }
              />
            ) : (
              <div className="table-wrapper">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Immeuble</th>
                      <th>Catégorie</th>
                      <th>Note</th>
                      <th className="num">Montant</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {lignes.map((d) => {
                      const im = immeubles.find((i) => i.id === d.immeubleId);
                      return (
                        <tr key={d.id}>
                          <td style={{ whiteSpace: "nowrap" }}>{formatDate(d.date)}</td>
                          <td>
                            <Link to={`/immeubles/${d.immeubleId}`} style={{ fontWeight: 500 }}>
                              {im ? im.nom : "—"}
                            </Link>
                          </td>
                          <td>
                            <Badge classe="badge-neutral">
                              {CATEGORIES.find((c) => c.id === d.categorie)?.label || d.categorie}
                            </Badge>
                          </td>
                          <td className="text-muted" style={{ fontSize: "0.83rem" }}>
                            {d.note || "—"}
                          </td>
                          <td className="num" style={{ fontWeight: 600 }}>
                            {formatMoney(d.montant)}
                          </td>
                          <td className="actions">
                            <button
                              type="button"
                              className="btn btn-small btn-danger"
                              onClick={() => setASupprimer(d.id)}
                              aria-label="Supprimer la dépense"
                            >
                              <Trash2 size={13} />
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
        </div>

        <Card title="Répartition par catégorie">
          {parCategorie.length === 0 ? (
            <EmptyState icon={TrendingDown} message="Aucune dépense à répartir." />
          ) : (
            <div className="stack" style={{ gap: "0.7rem" }}>
              {parCategorie.map((c) => {
                const pct = total > 0 ? (c.montant / total) * 100 : 0;
                return (
                  <div key={c.id}>
                    <div className="row" style={{ justifyContent: "space-between", fontSize: "0.85rem" }}>
                      <span>{c.label}</span>
                      <span>
                        <strong>{formatMoney(c.montant)}</strong>{" "}
                        <span className="text-muted">({Math.round(pct)} %)</span>
                      </span>
                    </div>
                    <div style={{ height: 6, marginTop: "0.25rem", background: "var(--border)", borderRadius: 999, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: "var(--warning)" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {modale && (
        <Modal
          title="Nouvelle dépense"
          onClose={() => setModale(false)}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setModale(false)}>
                Annuler
              </button>
              <button type="button" className="btn btn-primary" onClick={enregistrer}>
                Enregistrer
              </button>
            </>
          }
        >
          <ErrorBanner message={erreurGlobale} />
          <form onSubmit={enregistrer}>
            <div className="form-grid">
              <Field label="Immeuble" required error={erreurs.immeubleId} className="span-2">
                <Select value={form.immeubleId} onChange={set("immeubleId")} error={erreurs.immeubleId} options={immeubles.map((i) => ({ id: i.id, label: i.nom }))} />
              </Field>

              <Field label="Catégorie" required>
                <Select value={form.categorie} onChange={set("categorie")} options={CATEGORIES} />
              </Field>

              <Field label="Date" required error={erreurs.date}>
                <TextInput type="date" value={form.date} onChange={set("date")} error={erreurs.date} />
              </Field>

              <Field label="Montant" required error={erreurs.montant} className="span-2">
                <TextInput
                  type="number"
                  min="0"
                  value={form.montant}
                  onChange={set("montant")}
                  error={erreurs.montant}
                  placeholder="15000"
                />
              </Field>

              <Field label="Note" className="span-2" hint=" ce que c'était, pour quoi">
                <textarea
                  className="input"
                  value={form.note}
                  onChange={set("note")}
                  placeholder="Plomberie de l'appartement 4"
                  style={{ minHeight: 55 }}
                />
              </Field>
            </div>
          </form>
        </Modal>
      )}

      {aSupprimer && (
        <ConfirmDialog
          message="Supprimer cette dépense ? Le compte de résultat de l'immeuble sera recalculé."
          onConfirm={supprimer}
          onCancel={() => setASupprimer(null)}
        />
      )}
    </div>
  );
}