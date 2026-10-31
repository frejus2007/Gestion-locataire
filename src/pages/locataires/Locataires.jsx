// Liste des locataires : une ligne par locataire, avec son logement, son loyer,
// son solde et les raccourcis vers son compte et son encaissement.
//
//   ▸ Page Locataires          ce fichier
//   ▸ Modale d'encaissement   src/pages/paiements/Encaissement.jsx
//   ▸ Relevé du compte         src/pages/locataires/Compte.jsx

import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Plus,
  Search,
  Wallet,
  Users,
  Pencil,
  Trash2,
  Receipt,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import { useToast } from "../../context/ToastContext";
import { Card, ConfirmDialog, EmptyState, TableauDefilable } from "../../components/ui";
import { formatMoney, formatDate } from "../../utils/format";
import Encaissement from "../paiements/Encaissement";
import EnregistrerLocataire from "./EnregistrerLocataire";

const SEUIL_FIN_BAIL = 60; // jours

function joursAvant(dateFin) {
  if (!dateFin) return null;
  const cible = new Date(`${String(dateFin).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(cible.getTime())) return null;
  return Math.ceil((cible - new Date()) / 86400000);
}

export default function Locataires() {
  const {
    baux,
    lotsParId,
    immeublesParId,
    locatairesParId,
    soldesParBail,
    bailEstActif,
    removeLocataire,
  } = useApp();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const [recherche, setRecherche] = useState("");
  const [aSupprimer, setASupprimer] = useState(null);
  const [encaissement, setEncaissement] = useState(null);
  const [nouveau, setNouveau] = useState(false);

  const lignes = useMemo(
    () =>
      baux.map((bail) => {
        const locataire = locatairesParId.get(bail.locataireId) || null;
        const lot = lotsParId.get(bail.lotId) || null;
        const immeuble = lot ? immeublesParId.get(lot.immeubleId) || null : null;
        const solde = soldesParBail.get(bail.id) ?? 0;
        const fin = joursAvant(bail.dateFin);
        return {
          bail,
          locataire,
          lot,
          immeuble,
          solde,
          actif: bailEstActif(bail),
          joursFin: fin,
        };
      }),
    [baux, lotsParId, immeublesParId, locatairesParId, soldesParBail, bailEstActif]
  );

  const filtrees = lignes.filter(({ bail, locataire, immeuble, lot }) => {
    if (!recherche.trim()) return true;
    const texte = [
      locataire?.nom,
      locataire?.prenoms,
      locataire?.telephone,
      locataire?.ifu,
      immeuble?.nom,
      lot?.designation,
      bail.reference,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return texte.includes(recherche.toLowerCase().trim());
  });

  const supprimer = async () => {
    const cible = lignes.find((l) => l.bail.id === aSupprimer);
    // La fenêtre se ferme tout de suite ; si le serveur refuse, la ligne revient
    // d'elle-même avec l'écoute, et le message le dit.
    setASupprimer(null);
    const res = await removeLocataire(cible?.locataire?.id);
    if (res?.ok !== false) {
      addToast("Locataire supprimé", "success");
    } else {
      addToast(res?.error || "Suppression impossible", "error");
    }
  };

  const bailProche = (l) => l.actif && l.joursFin !== null && l.joursFin <= SEUIL_FIN_BAIL;

  return (
    <div>
      <header className="cag-page-head">
        <div>
          <h1>Locataires</h1>
          <p>Enregistrer et gérer vos locataires</p>
        </div>
        <div className="cag-page-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setNouveau(true)}
          >
            <Plus size={16} /> Nouveau locataire
          </button>
        </div>
      </header>

      {nouveau ? (
        <EnregistrerLocataire
          onClose={() => setNouveau(false)}
          onEnregistre={() => setNouveau(false)}
        />
      ) : null}

      <Card className="cag-card">
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
              aria-label="Rechercher un locataire"
            />
          </div>
        </div>
      </Card>

      <Card className="cag-card">
        {filtrees.length === 0 ? (
          <EmptyState
            icon={lignes.length === 0 ? Users : Search}
            message={
              lignes.length === 0
                ? "Aucun locataire. Commencez par créer un immeuble, un appartement, puis un locataire."
                : "Aucun locataire ne correspond à cette recherche."
            }
          />
        ) : (
          <TableauDefilable>
            <table className="cag-table">
              <thead>
                <tr>
                  <th>Locataire</th>
                  <th>Maison</th>
                  <th>Téléphone</th>
                  <th>N° pièce</th>
                  <th className="num">Loyer/mois</th>
                  <th>Entrée</th>
                  <th>Sortie</th>
                  <th className="num">Solde</th>
                  <th className="actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtrees.map(({ bail, locataire, immeuble, lot, solde, actif, joursFin }) => (
                  <tr key={bail.id}>
                    <td>
                      <span className="cag-strong">
                        {[locataire?.prenoms, locataire?.nom].filter(Boolean).join(" ")}
                      </span>
                      {locataire?.ifu ? <div className="cag-sub">IFU {locataire.ifu}</div> : null}
                    </td>
                    <td>{immeuble?.nom || lot?.designation || "—"}</td>
                    <td className="cag-muted">{locataire?.telephone || "—"}</td>
                    <td>
                      {locataire?.pieceNumero ? (
                        <>
                          {locataire.pieceNumero}
                          <div className="cag-sub">{locataire.pieceNature}</div>
                        </>
                      ) : (
                        <span className="cag-muted">—</span>
                      )}
                    </td>
                    <td className="num cag-strong">{formatMoney(bail.loyerMensuel)}</td>
                    <td className="cag-muted">{formatDate(bail.dateDebut)}</td>
                    <td>
                      {bail.dateFin ? (
                        <>
                          {formatDate(bail.dateFin)}
                          {bailProche({ actif, joursFin }) ? (
                            <span className={`cag-pill{joursFin < 0 ? "danger" : "warn"}`}>
                              {joursFin < 0 ? "échu" : `${joursFin} j`}
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <span className="cag-muted">—</span>
                      )}
                    </td>
                    <td className="num">
                      {solde > 0 ? (
                        <span className="cag-pill money">{formatMoney(solde)}</span>
                      ) : (
                        // Un solde ne descend jamais sous zéro : payer plus que
                        // son loyer laisse le locataire à jour, pas créditeur.
                        // Les charges, flexibles et saisies mois par mois, ne
                        // pèsent pas ici — le relevé du locataire les montre.
                        <span className="cag-pill ok">à jour</span>
                      )}
                    </td>
                    <td className="actions">
                      <Link
                        to={`/locataires/${bail.id}`}
                        className="btn btn-small btn-primary"
                        title="Voir le compte"
                      >
                        <Receipt size={13} /> Compte
                      </Link>
                      <button
                        type="button"
                        className="btn btn-small btn-success"
                        onClick={() => setEncaissement({ bail, locataire })}
                        title="Enregistrer un paiement"
                      >
                        <Wallet size={13} /> Encaisser
                      </button>
                      <Link
                        to={`/locataires/${bail.id}/modifier`}
                        className="btn btn-small btn-ghost"
                        title="Modifier"
                      >
                        <Pencil size={13} /> Éditer
                      </Link>
                      <button
                        type="button"
                        className="btn btn-small btn-danger"
                        onClick={() => setASupprimer(bail.id)}
                        title="Supprimer"
                        aria-label={`Supprimer ${locataire?.nom || "ce locataire"}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableauDefilable>
        )}
      </Card>

      {encaissement ? (
<Encaissement
          bail={encaissement.bail}
          onClose={() => setEncaissement(null)}
          onEncaisser={() => {
            setEncaissement(null);
            navigate("/paiements");
          }}
        />
      ) : null}

      {aSupprimer ? (
        <ConfirmDialog
          title="Supprimer le locataire"
          message="Le locataire, son bail, ses loyers et ses paiements seront supprimés. Action irréversible."
          confirmLabel="Supprimer"
          onConfirm={supprimer}
          onCancel={() => setASupprimer(null)}
        />
      ) : null}
    </div>
  );
}

