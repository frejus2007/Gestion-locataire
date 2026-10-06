// Liste des locataires : qui occupe quoi, et qui doit quoi.

import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Plus,
  Users,
  Search,
  Phone,
  Wallet,
  Home,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import { Card, EmptyState, Badge, Avatar, Select } from "../../components/ui";
import { formatMoney, formatDate, pluriel } from "../../utils/format";

export default function LocataireList() {
  const {
    locataires,
    bauxDuLocataire,
    bailCourantDuLocataire,
    bailEstActif,
    lotsParId,
    immeublesParId,
    soldesParBail,
    impayesDe,
  } = useApp();

  const [recherche, setRecherche] = useState("");
  const [filtre, setFiltre] = useState("tous");

  const lignes = locataires
    .map((loc) => {
      const bail = bailCourantDuLocataire(loc.id);
      const lot = bail ? lotsParId.get(bail.lotId) : null;
      const immeuble = lot ? immeublesParId.get(lot.immeubleId) : null;
      const dette = bail ? soldesParBail.get(bail.id) || 0 : 0;
      return {
        loc,
        bail,
        lot,
        immeuble,
        dette,
        mois: bail ? impayesDe(bail.id).length : 0,
        ancien: bauxDuLocataire(loc.id).length > 0 && !bailEstActif(bail),
      };
    });

  const filtrees = lignes.filter((x) => {
    const texte = `${x.loc.nom} ${x.loc.prenoms} ${x.loc.telephone} ${x.loc.ifu}`.toLowerCase();
    if (recherche && !texte.includes(recherche.toLowerCase())) return false;
    if (filtre === "impayes") return x.dette > 0;
    if (filtre === "ajour") return x.bail && x.dette <= 0;
    if (filtre === "sans-bail") return !x.bail;
    return true;
  });

  const nbImpayes = lignes.filter((x) => x.dette > 0).length;
  const nbSansBail = lignes.filter((x) => !x.bail).length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Locataires</h1>
          <p className="page-subtitle">
            {pluriel(locataires.length, "locataire")}
            {nbImpayes > 0 && ` · ${nbImpayes} en impayé`}
            {nbSansBail > 0 && ` · ${nbSansBail} sans bail`}
          </p>
        </div>
        <Link to="/locataires/nouveau" className="btn btn-primary">
          <Plus size={16} /> Nouveau locataire
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
              placeholder="Rechercher par nom, téléphone, IFU…"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
            />
          </div>

          <div style={{ minWidth: 180 }}>
            <Select
              value={filtre}
              onChange={(e) => setFiltre(e.target.value)}
              options={[
                { id: "tous", label: "Tous" },
                { id: "impayes", label: `En impayé (${nbImpayes})` },
                { id: "ajour", label: "À jour" },
                { id: "sans-bail", label: `Sans bail (${nbSansBail})` },
              ]}
            />
          </div>
        </div>
      </Card>

      {filtrees.length === 0 ? (
        <Card>
          <EmptyState
            icon={locataires.length === 0 ? Users : Search}
            message={
              locataires.length === 0
                ? "Aucun locataire. Créez sa fiche, puis un bail sur un lot pour le loger."
                : "Aucun locataire ne correspond à ce filtre."
            }
            action={
              locataires.length === 0 && (
                <Link to="/locataires/nouveau" className="btn btn-primary" style={{ marginTop: "0.75rem" }}>
                  <Plus size={16} /> Créer un locataire
                </Link>
              )
            }
          />
        </Card>
      ) : (
        <div className="entity-grid">
          {filtrees.map(({ loc, bail, lot, immeuble, dette, mois, ancien }) => (
            <div key={loc.id} className="entity-card">
              <div className="entity-head">
                <Avatar nom={loc.nom} prenoms={loc.prenoms} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Link to={`/locataires/${loc.id}`} className="entity-title" title={`Voir la fiche de ${loc.nom} ${loc.prenoms}`}>
                    {loc.nom} {loc.prenoms}
                  </Link>
                  <div className="entity-sub row" style={{ gap: "0.25rem" }}>
                    <Phone size={11} /> {loc.telephone || "—"}
                  </div>
                </div>
                {!bail ? (
                  <Badge classe="badge-neutral">Sans bail</Badge>
                ) : ancien ? (
                  <Badge classe="badge-neutral">Parti</Badge>
                ) : dette > 0 ? (
                  <Badge classe="badge-red">Impayé</Badge>
                ) : (
                  <Badge classe="badge-green">À jour</Badge>
                )}
              </div>

              <div className="entity-meta">
                <div style={{ flex: 1 }}>
                  <span className="k">Logement</span>
                  <span className="v" style={{ fontSize: "0.85rem" }}>
                    {lot ? lot.designation : "—"}
                  </span>
                </div>
                {bail && (
                  <div>
                    <span className="k">Loyer</span>
                    <span className="v">{formatMoney(bail.loyerMensuel)}</span>
                  </div>
                )}
              </div>

              {immeuble && (
                <div className="row" style={{ gap: "0.3rem", fontSize: "0.78rem", color: "var(--text-muted)" }}>
                  <Home size={12} /> {immeuble.nom}
                </div>
              )}

              {bail && (
                <div className="row" style={{ justifyContent: "space-between", fontSize: "0.85rem" }}>
                  <span className="text-muted">
                    {dette > 0 ? `${mois} mois impayé${mois > 1 ? "s" : ""}` : `Depuis le ${formatDate(bail.dateDebut)}`}
                  </span>
                  {dette > 0 && (
                    <strong style={{ color: "var(--danger)" }}>{formatMoney(dette)}</strong>
                  )}
                </div>
              )}

              <div className="entity-actions">
                <Link to={`/locataires/${loc.id}`} className="btn btn-small btn-secondary">
                  Fiche
                </Link>
                {bail && (
                  <Link to={`/locataires/${loc.id}/paiement`} className="btn btn-small btn-primary">
                    <Wallet size={13} /> Encaisser
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}