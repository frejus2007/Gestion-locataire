// Historique : pour chaque logement, la suite de ses occupants, du plus ancien
// au plus récent, avec leurs dates d'entrée et de sortie.

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search, Building2 } from "lucide-react";
import { useApp } from "../context/AppContext";
import { Card, Badge, EmptyState } from "../components/ui";
import { formatDate } from "../utils/format";

// Recherche insensible à la casse et aux accents.
const normaliser = (texte) =>
  String(texte || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function Historique() {
  const { baux, lots, immeublesParId, locatairesParId, bailEstActif } = useApp();

  const [recherche, setRecherche] = useState("");

  // Une ligne par logement, avec la suite de ses baux, du plus ancien au plus récent.
  const lignesLots = useMemo(() => {
    const q = normaliser(recherche.trim());
    return lots
      .map((lot) => {
        const immeuble = immeublesParId.get(lot.immeubleId) || null;
        const occupants = baux
          .filter((b) => b.lotId === lot.id)
          .sort((a, b) => String(a.dateDebut || "").localeCompare(String(b.dateDebut || "")))
          .map((bail) => ({
            bail,
            loc: locatairesParId.get(bail.locataireId) || null,
            actif: bailEstActif(bail),
          }));
        return { lot, immeuble, occupants };
      })
      .filter((x) => {
        if (!q) return true;
        return normaliser(`${x.immeuble?.nom || ""} ${x.lot.designation || ""} ${x.lot.numero || ""} ${x.lot.etage || ""}`).includes(q);
      })
      .sort((a, b) => normaliser(a.immeuble?.nom).localeCompare(normaliser(b.immeuble?.nom)));
  }, [lots, baux, immeublesParId, locatairesParId, bailEstActif, recherche]);

  const nomLoc = (loc) => (loc ? `${loc.nom || ""} ${loc.prenoms || loc.prenom || ""}`.trim() : "—");

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Historique</h1>
          <p className="page-subtitle">Les logements occupés, et qui les a occupés</p>
        </div>
      </div>

      <div className="row" style={{ justifyContent: "flex-end", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.75rem" }}>
        <div style={{ position: "relative", minWidth: 240 }}>
          <Search size={15} style={{ position: "absolute", left: 10, top: 11, color: "var(--text-muted)" }} />
          <input
            type="search"
            className="input"
            style={{ paddingLeft: 32 }}
            placeholder="Immeuble, logement, étage…"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            aria-label="Rechercher dans l'historique"
          />
        </div>
      </div>

      <Card title="Occupants successifs par logement">
        {lignesLots.length === 0 ? (
          <EmptyState icon={Building2} message="Aucun logement enregistré." />
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Immeuble</th>
                  <th>Logement</th>
                  <th>Étage</th>
                  <th>Occupants (du plus ancien au plus récent)</th>
                  <th>Actuellement</th>
                </tr>
              </thead>
              <tbody>
                {lignesLots.map(({ lot, immeuble, occupants }) => {
                  const occupe = occupants.some((o) => o.actif);
                  return (
                    <tr key={lot.id}>
                      <td className="text-muted">{immeuble?.nom || "—"}</td>
                      <td style={{ fontWeight: 600 }}>{lot.designation || lot.numero || "—"}</td>
                      <td className="text-muted">{lot.etage || "—"}</td>
                      <td>
                        {occupants.length === 0 ? (
                          <span className="text-muted">Jamais occupé</span>
                        ) : (
                          <ul style={{ margin: 0, paddingLeft: "1.1rem", fontSize: "0.88rem" }}>
                            {occupants.map((o) => (
                              <li key={o.bail.id}>
                                <Link to={`/locataires/${o.bail.locataireId}`}>{nomLoc(o.loc)}</Link>
                                <span className="text-muted">
                                  {" "}· du {formatDate(o.bail.dateDebut)}
                                  {o.bail.dateFin ? ` au ${formatDate(o.bail.dateFin)}` : " (en cours)"}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td>{occupe ? <Badge classe="badge-green">Occupé</Badge> : <Badge classe="badge-cyan">Libre</Badge>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
