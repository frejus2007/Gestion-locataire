// Liste des immeubles : l'inventaire du parc et son état financier.

import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Building2, Search } from "lucide-react";
import { useApp } from "../../context/AppContext";
import { Card, EmptyState, Badge, ProgressBar } from "../../components/ui";
import { formatMoney, formatNumber, pluriel } from "../../utils/format";

const STATUTS = {
  actif: { label: "Actif", classe: "badge-green" },
  travaux: { label: "Travaux", classe: "badge-amber" },
  vendu: { label: "Vendu", classe: "badge-neutral" },
};

export default function ImmeubleList() {
  const { immeubles, bilanImmeuble } = useApp();
  const [recherche, setRecherche] = useState("");

  const filtres = immeubles.filter((i) =>
    `${i.nom} ${i.adresse} ${i.quartier}`.toLowerCase().includes(recherche.toLowerCase())
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Immeubles</h1>
          <p className="page-subtitle">
            {pluriel(immeubles.length, "immeuble")} · {pluriel(filtres.length, "affiché")}
          </p>
        </div>
        <Link to="/immeubles/nouveau" className="btn btn-primary">
          <Plus size={16} /> Nouvel immeuble
        </Link>
      </div>

      {immeubles.length > 3 && (
        <div className="card" style={{ marginBottom: "1rem" }}>
          <div style={{ position: "relative", maxWidth: 420 }}>
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
              placeholder="Rechercher un immeuble, un quartier…"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
            />
          </div>
        </div>
      )}

      {filtres.length === 0 ? (
        <Card>
          <EmptyState
            icon={immeubles.length === 0 ? Building2 : Search}
            message={
              immeubles.length === 0
                ? "Aucun immeuble enregistré. Commencez par en créer un, puis ajoutez ses lots."
                : "Aucun immeuble ne correspond à cette recherche."
            }
            action={
              immeubles.length === 0 && (
                <Link to="/immeubles/nouveau" className="btn btn-primary" style={{ marginTop: "0.75rem" }}>
                  <Plus size={16} /> Créer mon premier immeuble
                </Link>
              )
            }
          />
        </Card>
      ) : (
        <div className="entity-grid">
          {filtres.map((i) => {
            const b = bilanImmeuble(i.id);
            const st = STATUTS[i.statut] || STATUTS.actif;
            const taux = b.nbLots > 0 ? (b.nbLotsOccupes / b.nbLots) * 100 : 0;
            return (
              <Link
                key={i.id}
                to={`/immeubles/${i.id}`}
                className="entity-card"
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <div className="entity-head">
                  <div
                    style={{
                      display: "grid",
                      placeItems: "center",
                      width: 42,
                      height: 42,
                      borderRadius: "var(--radius-sm)",
                      background: "var(--primary-bg)",
                      color: "var(--primary)",
                      flexShrink: 0,
                    }}
                  >
                    <Building2 size={20} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="entity-title">{i.nom}</div>
                    <div className="entity-sub">
                      {i.quartier}
                      {i.ville ? `, ${i.ville}` : ""}
                    </div>
                  </div>
                  <Badge classe={st.classe}>{st.label}</Badge>
                </div>

                <div className="entity-meta">
                  <div>
                    <span className="k">Lots</span>
                    <span className="v">
                      {b.nbLotsOccupes}/{b.nbLots}
                    </span>
                  </div>
                  <div>
                    <span className="k">Locataires</span>
                    <span className="v">{b.nbLocataires}</span>
                  </div>
                  <div>
                    <span className="k">Dette</span>
                    <span className="v" style={{ color: b.dette > 0 ? "var(--danger)" : "var(--success)" }}>
                      {b.dette > 0 ? formatNumber(b.dette) : "—"}
                    </span>
                  </div>
                </div>

                <div>
                  <div className="row" style={{ justifyContent: "space-between", fontSize: "0.82rem" }}>
                    <span className="text-muted">Résultat</span>
                    <strong style={{ color: b.resultat >= 0 ? "var(--success)" : "var(--danger)" }}>
                      {formatMoney(b.resultat)}
                    </strong>
                  </div>
                  <div style={{ marginTop: "0.5rem" }}>
                    <ProgressBar valeur={taux} label="Occupation" couleur="var(--primary)" />
                  </div>
                </div>

                {i.notes && (
                  <div className="text-muted" style={{ fontSize: "0.79rem" }}>
                    {i.notes}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}